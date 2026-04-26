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


def _maybe_warn_fx_missing(state: _TxState, tx: Transaction, source: str) -> None:
    """Emit a per-transaction "FX rate missing" warning when the EUR conversion
    could not be resolved (no historical rate, no user-supplied amount).

    Two warning codes let the UI render a clean sentence with or without a
    ticker:

      * ``fxRateMissingTicker`` — ticker is present (dividend);
        ``params`` carries ``ticker`` for interpolation.
      * ``fxRateMissing``       — no ticker (deposit/withdraw);
        ``params`` is empty so the translated message has no awkward placeholder.

    Suppressed when the bulk ``fxRatesUnavailable`` warning is already on the
    state — that warning covers every affected transaction in one summary.

    Also records the transaction id for the UI's deep-link to the
    "fix transactions" flow.
    """
    if source != "missing":
        return
    if tx.id is not None:
        state.fx_missing_tx_ids.append(tx.id)
    if state.fx_rates_unavailable:
        return
    date_str = tx.date.strftime(_ISO_DATETIME_FMT)
    if tx.ticker:
        state.warnings.append(
            _Warning(
                code="fxRateMissingTicker",
                date=date_str,
                params={"ticker": tx.ticker},
            )
        )
    else:
        state.warnings.append(
            _Warning(
                code="fxRateMissing",
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
        state.historical_usd_to_eur_rates,
    )
    _maybe_warn_fx_missing(state, tx, source)
    state.principal_eur.add(eur)
    state.principal_eur_avg.add(eur)


def _apply_withdraw(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)  # total is negative
    state.cash += total
    eur_historical, source = _eur_from_tx(
        tx,
        total,
        state.historical_usd_to_eur_rates,
    )
    _maybe_warn_fx_missing(state, tx, source)

    # Average-cost EUR withdrawal: derive avg rate from running aggregates.
    # When the avg accumulator is already incomplete, the avg rate is
    # unreliable, so we propagate "unknown" rather than divide partial totals.
    eur_avg_cost: Decimal | None
    avg_delta: Decimal | None
    if state.principal > 0 and not state.principal_eur_avg.is_incomplete:
        avg_rate = state.principal_eur_avg.total / state.principal
        eur_avg_cost = -total * avg_rate  # positive
        avg_delta = total * avg_rate  # negative (withdraw at avg rate)
    elif state.principal > 0:
        # Avg accumulator already incomplete — the avg rate would be wrong.
        eur_avg_cost = None
        avg_delta = None
    else:
        # No prior principal to derive an avg from; fall through to historical.
        # If historical is also missing, both stay None and propagate.
        eur_avg_cost = -eur_historical if eur_historical is not None else None
        avg_delta = eur_historical

    state.principal_eur_avg.add(avg_delta)

    realized_fx_gain: Decimal | None
    if eur_historical is None or eur_avg_cost is None:
        realized_fx_gain = None
    else:
        realized_fx_gain = -eur_historical - eur_avg_cost

    state.realized_withdrawals.append(
        _WithdrawalFx(
            date=tx.date.strftime(_ISO_DATETIME_FMT),
            amount=float(-total),
            amount_eur_avg=float(eur_avg_cost) if eur_avg_cost is not None else None,
            amount_eur=float(-eur_historical) if eur_historical is not None else None,
            realized_fx_gain=float(realized_fx_gain)
            if realized_fx_gain is not None
            else None,
        )
    )
    state.principal += total
    state.principal_eur.add(eur_historical)
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
        state.historical_usd_to_eur_rates,
    )
    _maybe_warn_fx_missing(state, tx, source)
    state.dividends_eur.add(eur)
    state.dividends_received.append(
        _DividendReceived(
            ticker=tx.ticker or "",
            date=tx.date.strftime(_ISO_DATETIME_FMT),
            amount=float(total),
            # An explicit zero conversion (e.g. a $0 dividend) is a known
            # value, not "missing" — only ``None`` (FX unresolved) maps to None.
            amount_eur=float(eur) if eur is not None else None,
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
