"""Per-type transaction handlers and the dispatch function.

Each handler mutates a ``_TxState`` in place for one transaction. The state
is the single source of truth for running balances (cash, principal, holdings,
realized gains, warnings). Handlers never fetch prices or FX rates directly —
they read whatever is already on the transaction or on the state.

Also includes ``_compute_forward_split_factors``, a pure transactions-list
helper used by historical valuation to back out Yahoo's split-adjusted prices.
"""

from datetime import datetime
from decimal import Decimal

from app.models import Transaction, TransactionType
from app.services.portfolio_types import (
    _ISO_DATETIME_FMT,
    _ONE,
    _ZERO,
    HOLDINGS_EPSILON,
    _DividendReceived,
    _eur_from_tx,
    _Holding,
    _RealizedSale,
    _to_decimal,
    _TxState,
    _Warning,
    _WithdrawalFx,
)

# ================== Transaction handlers ==================


def _maybe_warn_fx_fallback(state: _TxState, tx: Transaction, source: str) -> None:
    """Emit a per-transaction FX-fallback warning when the EUR conversion
    silently used today's live rate for this transaction.

    Uses two warning codes so the UI can render a clean sentence regardless
    of whether the transaction has a ticker:

      * ``fxFallbackToCurrentTicker`` — ticker is present (dividend);
        ``params`` carries ``ticker`` for interpolation.
      * ``fxFallbackToCurrent``      — no ticker (deposit/withdraw);
        ``params`` is empty so the translated message does not have an
        awkward placeholder gap.

    Suppressed when the bulk ``fxRatesUnavailable`` warning is already on the
    state — that warning covers every fx-blind transaction in one summary.
    """
    if source != "fallback_current":
        return
    if state.fx_rates_unavailable:
        return
    date_str = tx.date.strftime(_ISO_DATETIME_FMT)
    if tx.ticker:
        state.warnings.append(
            _Warning(
                code="fxFallbackToCurrentTicker",
                date=date_str,
                params={"ticker": tx.ticker},
            )
        )
    else:
        state.warnings.append(
            _Warning(
                code="fxFallbackToCurrent",
                date=date_str,
                params={},
            )
        )


def _apply_deposit(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)
    state.cash += total
    state.principal += total
    eur, source = _eur_from_tx(
        tx,
        total,
        state.usd_to_eur_fallback,
        state.historical_usd_to_eur_rates,
    )
    _maybe_warn_fx_fallback(state, tx, source)
    state.principal_eur += eur
    state.principal_eur_avg += eur


def _apply_withdraw(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)  # total is negative
    state.cash += total
    eur_historical, source = _eur_from_tx(
        tx,
        total,
        state.usd_to_eur_fallback,
        state.historical_usd_to_eur_rates,
    )
    _maybe_warn_fx_fallback(state, tx, source)
    # Average cost: withdraw at weighted-average rate (before updating principal)
    if state.principal > 0:
        avg_rate = state.principal_eur_avg / state.principal
        eur_avg_cost = -total * avg_rate  # positive
        state.principal_eur_avg += total * avg_rate  # total is negative
    else:
        eur_avg_cost = -eur_historical  # positive
        state.principal_eur_avg += eur_historical
    state.realized_withdrawals.append(
        _WithdrawalFx(
            date=tx.date.strftime(_ISO_DATETIME_FMT),
            amount=float(-total),
            amount_eur_avg=float(eur_avg_cost),
            amount_eur=float(-eur_historical),
            realized_fx_gain=float(-eur_historical - eur_avg_cost),
        )
    )
    state.principal += total
    state.principal_eur += eur_historical
    if strict and state.cash < 0:
        state.warnings.append(
            _Warning(
                code="withdrawNegativeCash",
                date=tx.date.strftime(_ISO_DATETIME_FMT),
                params={"amount": str(-total), "balance": str(state.cash)},
            )
        )


def _apply_buy(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)  # total is negative
    state.cash += total
    if tx.ticker:
        quantity = _to_decimal(tx.quantity or 0)
        if tx.ticker not in state.holdings:
            state.holdings[tx.ticker] = _Holding(
                quantity=_ZERO, total_cost=_ZERO, first_buy_date=tx.date
            )
        h = state.holdings[tx.ticker]
        h.quantity += quantity
        h.total_cost += -total


def _apply_sell(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)
    ticker = tx.ticker
    quantity = _to_decimal(tx.quantity or 0)
    if not ticker:
        state.cash += total
        return
    if ticker not in state.holdings:
        if strict:
            state.warnings.append(
                _Warning(
                    code="sellNotInHoldings",
                    date=tx.date.strftime(_ISO_DATETIME_FMT),
                    params={"ticker": ticker},
                )
            )
        return
    h = state.holdings[ticker]
    if quantity > h.quantity + HOLDINGS_EPSILON:
        if strict:
            state.warnings.append(
                _Warning(
                    code="sellOversell",
                    date=tx.date.strftime(_ISO_DATETIME_FMT),
                    params={
                        "ticker": ticker,
                        "quantity": str(quantity),
                        "available": str(h.quantity),
                    },
                )
            )
        # Partial sell: sell only what is held, with proportional total
        held = h.quantity
        partial_total = total * (held / quantity) if quantity > 0 else _ZERO
        cost_basis = h.total_cost
        state.cash += partial_total
        state.realized_gains += partial_total - cost_basis
        state.realized_sales.append(
            _RealizedSale(
                ticker=ticker,
                date=tx.date.strftime(_ISO_DATETIME_FMT),
                quantity=float(held),
                quantity_before=float(held),
                proceeds=float(partial_total),
                cost_basis=float(cost_basis),
                realized_gain=float(partial_total - cost_basis),
                first_buy_date=h.first_buy_date.strftime(_ISO_DATETIME_FMT),
            )
        )
        del state.holdings[ticker]
        return
    state.cash += total
    # Proportional cost removal: avoids intermediate avg_cost rounding
    cost_basis = h.total_cost * (quantity / h.quantity) if h.quantity > 0 else _ZERO
    state.realized_gains += total - cost_basis
    state.realized_sales.append(
        _RealizedSale(
            ticker=ticker,
            date=tx.date.strftime(_ISO_DATETIME_FMT),
            quantity=float(quantity),
            quantity_before=float(h.quantity),
            proceeds=float(total),
            cost_basis=float(cost_basis),
            realized_gain=float(total - cost_basis),
            first_buy_date=h.first_buy_date.strftime(_ISO_DATETIME_FMT),
        )
    )
    h.quantity -= quantity
    h.total_cost -= cost_basis
    if h.quantity < HOLDINGS_EPSILON:
        del state.holdings[ticker]


def _apply_dividend(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)
    state.cash += total
    state.dividends += total
    eur, source = _eur_from_tx(
        tx,
        total,
        state.usd_to_eur_fallback,
        state.historical_usd_to_eur_rates,
    )
    _maybe_warn_fx_fallback(state, tx, source)
    state.dividends_eur += eur
    state.dividends_received.append(
        _DividendReceived(
            ticker=tx.ticker or "",
            date=tx.date.strftime(_ISO_DATETIME_FMT),
            amount=float(total),
            amount_eur=float(eur) if eur != _ZERO else None,
        )
    )


def _apply_fee(state: _TxState, tx: Transaction, strict: bool) -> None:
    state.cash += _to_decimal(tx.total_amount)  # total is negative


def _apply_split(state: _TxState, tx: Transaction, strict: bool) -> None:
    split_ratio = _to_decimal(tx.split_ratio) if tx.split_ratio is not None else _ONE
    if split_ratio <= 0:
        if strict:
            state.warnings.append(
                _Warning(
                    code="invalidSplitRatio",
                    date=tx.date.strftime(_ISO_DATETIME_FMT),
                    params={"ticker": tx.ticker or "", "ratio": str(split_ratio)},
                )
            )
        return
    if tx.ticker and tx.ticker in state.holdings:
        state.holdings[tx.ticker].quantity *= split_ratio


_TX_HANDLERS = {
    TransactionType.DEPOSIT: _apply_deposit,
    TransactionType.WITHDRAW: _apply_withdraw,
    TransactionType.BUY: _apply_buy,
    TransactionType.SELL: _apply_sell,
    TransactionType.DIVIDEND: _apply_dividend,
    TransactionType.FEE: _apply_fee,
    TransactionType.SPLIT: _apply_split,
}


def _apply_transaction(state: _TxState, tx: Transaction, strict: bool = False) -> None:
    """Apply a single transaction to *state* in-place."""
    handler = _TX_HANDLERS.get(tx.type)
    if handler is None:
        if strict:
            state.warnings.append(
                _Warning(
                    code="unknownType",
                    date=tx.date.strftime(_ISO_DATETIME_FMT),
                    params={"type": str(tx.type)},
                )
            )
        return
    handler(state, tx, strict)


# ================== Split factor computation ==================


def _compute_forward_split_factors(
    transactions: list[Transaction],
    cutoff_date: datetime | None = None,
) -> dict[str, Decimal]:
    """Compute the product of all future split ratios per ticker.

    Yahoo Finance close prices are split-adjusted: for dates before a split,
    the price is divided by the split ratio.  The state's quantity, however,
    only reflects splits that have been replayed so far.  To compensate, we
    track a per-ticker "forward split factor" — the product of all split
    ratios not yet applied to the state — and multiply it into the price
    lookup so that  qty_pre_split × price_adjusted × forward_factor  equals
    the correct historical value.

    Args:
        transactions: Full list of transactions (sorted chronologically).
        cutoff_date:  If given, only include splits *after* this date.
                      If None, include all splits (caller will decrement as
                      splits are replayed).
    """
    factors: dict[str, Decimal] = {}
    for tx in transactions:
        if tx.type != TransactionType.SPLIT or not tx.ticker or not tx.split_ratio:
            continue
        if cutoff_date is not None and tx.date.date() <= cutoff_date.date():
            continue
        ratio = _to_decimal(tx.split_ratio)
        if ratio <= 0:
            continue
        factors[tx.ticker] = factors.get(tx.ticker, _ONE) * ratio
    return factors
