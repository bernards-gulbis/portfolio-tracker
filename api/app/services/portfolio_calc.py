"""Transaction handlers, holdings builder, and portfolio status calculation."""

import dataclasses
import logging
from datetime import datetime, timedelta
from decimal import Decimal

from app.models import Transaction, TransactionType
from app.schemas import HoldingResponse, PortfolioStatusResponse
from app.schemas.schemas import (
    DividendReceivedResponse,
    RealizedSaleResponse,
    TransactionWarning,
    WithdrawalFxResponse,
)
from app.services.portfolio_types import (
    _ISO_DATETIME_FMT,
    _ONE,
    _ZERO,
    HOLDINGS_EPSILON,
    _DividendReceived,
    _eur_from_tx,
    _Holding,
    _normalize_zero,
    _opt_normalize,
    _RealizedSale,
    _to_decimal,
    _TxState,
    _Warning,
    _WithdrawalFx,
)
from app.services.price_service import PriceService

logger = logging.getLogger(__name__)


# ================== Transaction handlers ==================


def _apply_deposit(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)
    state.cash += total
    state.principal += total
    eur = _eur_from_tx(tx, total, state.usd_to_eur_fallback)
    state.principal_eur += eur
    state.principal_eur_avg += eur


def _apply_withdraw(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)  # total is negative
    state.cash += total
    eur_historical = _eur_from_tx(tx, total, state.usd_to_eur_fallback)
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
            held = h.quantity
            state.warnings.append(
                _Warning(
                    code="sellOversell",
                    date=tx.date.strftime(_ISO_DATETIME_FMT),
                    params={
                        "ticker": ticker,
                        "quantity": str(quantity),
                        "available": str(held),
                    },
                )
            )
            # Partial sell: sell only what is held, with proportional total
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
                    days_held=(tx.date - h.first_buy_date).days,
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
            days_held=(tx.date - h.first_buy_date).days,
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
    eur = _eur_from_tx(tx, total, state.usd_to_eur_fallback)
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
    split_ratio = _to_decimal(tx.split_ratio or 1)
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
        factors[tx.ticker] = factors.get(tx.ticker, _ONE) * ratio
    return factors


# ================== Date / price resolution helpers ==================


def _resolve_nearest_date_value(
    date_prices: dict[str, float], target_date_str: str
) -> float | None:
    """Return the value for *target_date_str* or the nearest earlier date, else None."""
    if not date_prices:
        return None
    if target_date_str in date_prices:
        return date_prices[target_date_str]
    available = sorted((d for d in date_prices if d <= target_date_str), reverse=True)
    if available:
        return date_prices[available[0]]
    return None


def _fetch_historical_prices(
    tickers: list[str], target_date: datetime
) -> dict[str, float]:
    """Fetch historical prices for *tickers* at (or near) *target_date*."""
    if not tickers:
        return {}
    start_date = target_date - timedelta(days=5)
    end_date = target_date + timedelta(days=1)
    all_prices = PriceService.get_historical_prices_for_multiple_tickers(
        tickers, start_date, end_date
    )
    target_date_str = target_date.strftime("%Y-%m-%d")
    result: dict[str, float] = {}
    for ticker, date_prices in all_prices.items():
        if not date_prices:
            continue
        price = _resolve_nearest_date_value(date_prices, target_date_str)
        if price is not None:
            result[ticker] = price
        else:
            # All dates are after target; use earliest as best guess
            result[ticker] = date_prices[min(date_prices.keys())]
    return result


def _value_holdings_at_date(
    state: _TxState,
    historical_prices: dict[str, float] | None,
    forward_split_factors: dict[str, Decimal],
    target_date_str: str,
) -> Decimal:
    """Compute total holdings value at a historical date using price → DB cache → cost basis fallback."""
    holdings_value = _ZERO
    for ticker, h in state.holdings.items():
        price = historical_prices.get(ticker) if historical_prices else None
        if price is not None and price > 0:
            split_factor = forward_split_factors.get(ticker, _ONE)
            holdings_value += h.quantity * _to_decimal(price) * split_factor
            continue
        # Try last known price from DB cache before falling back to cost basis
        db_price = PriceService.get_last_known_price(ticker)
        if db_price is not None and db_price > 0:
            split_factor = forward_split_factors.get(ticker, _ONE)
            holdings_value += h.quantity * _to_decimal(db_price) * split_factor
            logger.debug(
                "Status at %s: using last known price %.4f for %s",
                target_date_str,
                db_price,
                ticker,
            )
        else:
            holdings_value += h.total_cost
            logger.warning(
                "Status at %s: no price data for %s (using cost basis)",
                target_date_str,
                ticker,
            )
    return holdings_value


def _resolve_usd_to_eur_rate(target_date: datetime) -> float | None:
    """Resolve USD→EUR rate at *target_date*, falling back to nearest earlier date or current rate."""
    start_date = target_date - timedelta(days=5)
    end_date = target_date + timedelta(days=1)
    fx_rates = PriceService.get_historical_usd_to_eur_rates(start_date, end_date)
    target_date_str = target_date.strftime("%Y-%m-%d")
    rate = _resolve_nearest_date_value(fx_rates, target_date_str)
    if rate is not None:
        return rate
    return PriceService.get_usd_to_eur_rate_safe()


# ================== Holdings builder ==================


def _build_holdings_list(
    state: _TxState,
) -> tuple[list[HoldingResponse], Decimal]:
    """Build the sorted holdings list and total cost basis (transaction-derived only)."""
    holdings_list: list[HoldingResponse] = []
    holdings_cost = _ZERO

    for ticker, h in state.holdings.items():
        avg_cost = h.total_cost / h.quantity if h.quantity > 0 else _ZERO

        holdings_list.append(
            HoldingResponse(
                ticker=ticker,
                quantity=float(h.quantity),
                average_cost=float(avg_cost),
                total_cost=float(h.total_cost),
                first_buy_date=h.first_buy_date.date()
                if hasattr(h.first_buy_date, "date")
                else h.first_buy_date,
            )
        )
        holdings_cost += h.total_cost

    holdings_list.sort(key=lambda hr: hr.ticker)
    return holdings_list, holdings_cost


# ================== Status calculation ==================


def calculate_status(
    transactions: list[Transaction],
    usd_to_eur_rate: float | None,
    tax_rate: Decimal,
    portfolio_id: int,
    portfolio_name: str,
) -> PortfolioStatusResponse:
    """Calculate comprehensive portfolio status from transactions."""
    state = _TxState()
    state.usd_to_eur_fallback = usd_to_eur_rate
    for tx in transactions:
        _apply_transaction(state, tx, strict=True)

    holdings_list, holdings_cost = _build_holdings_list(state)

    # Normalize dividends_eur (historical per-transaction rates)
    has_valid_eur = state.dividends > 0 and state.dividends_eur > 0
    dividends_eur: Decimal | None = state.dividends_eur if has_valid_eur else None

    return PortfolioStatusResponse(
        portfolio_id=portfolio_id,
        portfolio_name=portfolio_name,
        principal=_normalize_zero(state.principal),
        principal_eur=_normalize_zero(state.principal_eur),
        principal_eur_avg=_normalize_zero(state.principal_eur_avg),
        dividends=_normalize_zero(state.dividends),
        dividends_eur=_opt_normalize(dividends_eur),
        cash=_normalize_zero(state.cash),
        holdings=holdings_list,
        holdings_cost=_normalize_zero(holdings_cost),
        realized_gains=_normalize_zero(state.realized_gains),
        capital_gains_tax_rate=float(tax_rate),
        realized_sales=[
            RealizedSaleResponse(**dataclasses.asdict(s)) for s in state.realized_sales
        ],
        dividends_received=[
            DividendReceivedResponse(**dataclasses.asdict(d))
            for d in state.dividends_received
        ],
        realized_withdrawals=[
            WithdrawalFxResponse(**dataclasses.asdict(w))
            for w in state.realized_withdrawals
        ],
        warnings=[TransactionWarning(**dataclasses.asdict(w)) for w in state.warnings],
        usd_to_eur_rate=usd_to_eur_rate,
    )
