"""Per-type transaction handlers and the dispatch function.

Each handler mutates a ``_TxState`` in place for one transaction. The state
is the single source of truth for running balances (cash, principal, holdings,
realized gains, warnings). Handlers never fetch prices or FX rates directly —
they read whatever is already on the transaction or on the state.

Cost basis is tracked per FIFO lot — each ``BUY`` appends a new ``_Lot`` to
the holding's lot queue, and each ``SELL`` consumes lots from the head in
chronological order. A sell that spans multiple lots produces multiple
``_RealizedSale`` rows, each annotated with the consumed lot's acquisition
date so tax reports can report gains lot-by-lot.

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
    _Lot,
    _RealizedSale,
    _to_decimal,
    _TxState,
    _Warning,
    _WithdrawalFx,
)


def _record_realized_sale(
    state: _TxState,
    *,
    ticker: str,
    tx_date_str: str,
    quantity_before: Decimal,
    consumed_qty: Decimal,
    consumed_cost: Decimal,
    proceeds: Decimal,
    acquired_at_str: str,
) -> None:
    """Record one realized-gain row for a single FIFO lot consumption."""
    realized_gain = proceeds - consumed_cost
    state.realized_gains += realized_gain
    state.realized_sales.append(
        _RealizedSale(
            ticker=ticker,
            date=tx_date_str,
            quantity=float(consumed_qty),
            quantity_before=float(quantity_before),
            proceeds=float(proceeds),
            cost_basis=float(consumed_cost),
            realized_gain=float(realized_gain),
            first_buy_date=acquired_at_str,
        )
    )


def _consume_lots_fifo(
    state: _TxState,
    h: _Holding,
    *,
    ticker: str,
    tx_date_str: str,
    effective_qty: Decimal,
    effective_total: Decimal,
    quantity_before: Decimal,
) -> None:
    """Consume *effective_qty* shares from the head of *h.lots* in FIFO order.

    *effective_total* is the total proceeds and is split across consumed lots
    in proportion to each lot's share of *effective_qty*. Emits one
    ``_RealizedSale`` per lot touched.
    """
    if effective_qty <= 0:
        return
    remaining = effective_qty
    while remaining > HOLDINGS_EPSILON and h.lots:
        lot = h.lots[0]
        if lot.quantity <= remaining + HOLDINGS_EPSILON:
            consumed_qty = lot.quantity
            consumed_cost = lot.cost
            proceeds = effective_total * (consumed_qty / effective_qty)
            _record_realized_sale(
                state,
                ticker=ticker,
                tx_date_str=tx_date_str,
                quantity_before=quantity_before,
                consumed_qty=consumed_qty,
                consumed_cost=consumed_cost,
                proceeds=proceeds,
                acquired_at_str=lot.acquired_at.strftime(_ISO_DATETIME_FMT),
            )
            h.lots.pop(0)
            remaining -= consumed_qty
        else:
            consumed_qty = remaining
            # Proportional cost for the consumed slice of this lot — leaves the
            # remainder of the lot intact for any future sell.
            consumed_cost = lot.cost * (consumed_qty / lot.quantity)
            proceeds = effective_total * (consumed_qty / effective_qty)
            _record_realized_sale(
                state,
                ticker=ticker,
                tx_date_str=tx_date_str,
                quantity_before=quantity_before,
                consumed_qty=consumed_qty,
                consumed_cost=consumed_cost,
                proceeds=proceeds,
                acquired_at_str=lot.acquired_at.strftime(_ISO_DATETIME_FMT),
            )
            lot.quantity -= consumed_qty
            lot.cost -= consumed_cost
            remaining = _ZERO


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
            state.holdings[tx.ticker] = _Holding()
        state.holdings[tx.ticker].lots.append(
            _Lot(quantity=quantity, cost=-total, acquired_at=tx.date)
        )


def _apply_sell(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)
    ticker = tx.ticker
    quantity = _to_decimal(tx.quantity or 0)
    if not ticker:
        state.cash += total
        return
    if ticker not in state.holdings:
        # Always emit: a sell of an unheld ticker is a data-quality issue
        # the user needs to know about regardless of which calculation path
        # is running. Status surfaces ``state.warnings`` directly; perf
        # passes them through ``calculate_performance`` so the chart can
        # flag tampered historical points.
        state.warnings.append(
            _Warning(
                code="sellNotInHoldings",
                date=tx.date.strftime(_ISO_DATETIME_FMT),
                params={"ticker": ticker},
            )
        )
        return
    h = state.holdings[ticker]
    held = h.quantity
    tx_date_str = tx.date.strftime(_ISO_DATETIME_FMT)

    if quantity > held + HOLDINGS_EPSILON:
        # Always emit: the partial-sell branch silently truncates the
        # quantity, which is dangerous when the underlying chart consumer
        # (perf replay) has no other signal. See ``sellNotInHoldings`` above.
        state.warnings.append(
            _Warning(
                code="sellOversell",
                date=tx_date_str,
                params={
                    "ticker": ticker,
                    "quantity": str(quantity),
                    "available": str(held),
                },
            )
        )
        # Truncate to what's held; total proceeds scaled by held/requested.
        effective_qty = held
        effective_total = total * (held / quantity) if quantity > 0 else _ZERO
    else:
        effective_qty = quantity
        effective_total = total

    state.cash += effective_total
    _consume_lots_fifo(
        state,
        h,
        ticker=ticker,
        tx_date_str=tx_date_str,
        effective_qty=effective_qty,
        effective_total=effective_total,
        quantity_before=held,
    )

    # Drop empty lots and remove the holding entirely if everything is gone.
    h.lots = [lot for lot in h.lots if lot.quantity > HOLDINGS_EPSILON]
    if not h.lots:
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
        # Split adjusts share count per lot; cost basis is unchanged so
        # cost-per-share scales inversely with the split ratio.
        for lot in state.holdings[tx.ticker].lots:
            lot.quantity *= split_ratio


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
