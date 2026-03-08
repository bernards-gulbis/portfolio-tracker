"""Performance time-series calculation for portfolios."""

import logging
from bisect import bisect_right
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.models import Transaction, TransactionType
from app.services.portfolio_calc import (
    _apply_transaction,
    _compute_forward_split_factors,
    _resolve_usd_to_eur_rate,
)
from app.services.portfolio_types import (
    _ONE,
    _ZERO,
    _to_decimal,
    _TxState,
)
from app.services.price_service import PriceService

logger = logging.getLogger(__name__)


# ================== Performance helpers ==================


def _bisect_lookup(
    sorted_dates: list[str], data: dict[str, float], date_str: str
) -> float | None:
    """Look up value for a date using bisect, falling back to the most recent earlier date."""
    if not sorted_dates:
        return None
    idx = bisect_right(sorted_dates, date_str) - 1
    return data[sorted_dates[idx]] if idx >= 0 else None


def _generate_date_points(
    start_date: datetime, end_date: datetime, num_points: int
) -> list[datetime]:
    """Generate evenly-spaced date points between start and end."""
    total_days = (end_date - start_date).days
    if total_days == 0:
        date_points = [start_date, end_date]
    elif total_days < num_points:
        date_points = [start_date + timedelta(days=i) for i in range(total_days + 1)]
    else:
        interval = total_days / (num_points - 1)
        date_points = [
            start_date + timedelta(days=int(i * interval)) for i in range(num_points)
        ]

    if total_days > 0 and date_points[-1].date() != end_date.date():
        date_points[-1] = end_date
    return date_points


def _prepare_perf_data(
    transactions: list[Transaction],
    start_date: datetime,
    end_date: datetime,
) -> tuple[
    dict[str, dict[str, float]],  # historical_data
    dict[str, list[str]],  # sorted_dates_map
    dict[str, float],  # fx_rates
    list[str],  # sorted_fx_dates
    dict[str, float],  # sp500_prices
    list[str],  # sorted_sp500_dates
    dict[str, float],  # ticker_last_price
]:
    """Fetch all historical price data, FX rates, and S&P 500 in a single batch."""
    all_tickers = {tx.ticker for tx in transactions if tx.ticker}

    # Per-ticker earliest transaction date (avoid pre-IPO lookups)
    ticker_first_date: dict[str, datetime] = {}
    for tx in transactions:
        if tx.ticker and tx.ticker not in ticker_first_date:
            ticker_first_date[tx.ticker] = tx.date - timedelta(days=5)

    fetch_tickers = list(all_tickers | {"EURUSD=X", "^GSPC"})
    historical_data = PriceService.get_historical_prices_for_multiple_tickers(
        fetch_tickers,
        start_date - timedelta(days=5),
        end_date + timedelta(days=1),
        per_ticker_start=ticker_first_date,
    )

    # Extract and invert FX rates
    eur_usd_prices = historical_data.pop("EURUSD=X", {})
    fx_rates = {
        date_str: 1.0 / rate
        for date_str, rate in eur_usd_prices.items()
        if rate and rate > 0
    }

    sp500_prices = historical_data.pop("^GSPC", {})

    # Pre-sort date keys for O(log n) bisect lookups
    sorted_dates_map: dict[str, list[str]] = {}
    for ticker, data in historical_data.items():
        sorted_dates_map[ticker] = sorted(data.keys())
    sorted_fx_dates = sorted(fx_rates.keys())
    sorted_sp500_dates = sorted(sp500_prices.keys())

    # Seed last known prices from DB for tickers with no Yahoo data
    ticker_last_price: dict[str, float] = {}
    for ticker in all_tickers:
        if not historical_data.get(ticker):
            db_price = PriceService.get_last_known_price(ticker)
            if db_price is not None:
                ticker_last_price[ticker] = db_price
                logger.info(
                    "Seeded last known price for %s: %.4f (from DB cache)",
                    ticker,
                    db_price,
                )

    return (
        historical_data,
        sorted_dates_map,
        fx_rates,
        sorted_fx_dates,
        sp500_prices,
        sorted_sp500_dates,
        ticker_last_price,
    )


def _replay_transactions_up_to(
    transactions: list[Transaction],
    tx_index: int,
    state: _TxState,
    date_point: datetime,
    forward_split_factors: dict[str, Decimal],
) -> int:
    """Replay transactions up to *date_point*, updating state and split factors. Returns new tx_index."""
    while (
        tx_index < len(transactions)
        and transactions[tx_index].date.date() <= date_point.date()
    ):
        tx = transactions[tx_index]
        _apply_transaction(state, tx, strict=False)
        if tx.type == TransactionType.SPLIT and tx.ticker and tx.split_ratio:
            factor = _to_decimal(tx.split_ratio)
            if tx.ticker in forward_split_factors:
                forward_split_factors[tx.ticker] /= factor
        tx_index += 1
    return tx_index


def _compute_perf_holdings(
    state: _TxState,
    sorted_dates_map: dict[str, list[str]],
    historical_data: dict[str, dict[str, float]],
    ticker_last_price: dict[str, float],
    forward_split_factors: dict[str, Decimal],
    date_str: str,
) -> tuple[Decimal, list[str], list[str]]:
    """Compute total holdings value for a performance date point using price → last-known → cost basis."""
    holdings_value = _ZERO
    last_known_tickers: list[str] = []
    cost_basis_tickers: list[str] = []
    for ticker, h in state.holdings.items():
        ticker_dates = sorted_dates_map.get(ticker, [])
        price = _bisect_lookup(ticker_dates, historical_data.get(ticker, {}), date_str)
        if price is not None and price > 0:
            split_factor = forward_split_factors.get(ticker, _ONE)
            holdings_value += h.quantity * _to_decimal(price) * split_factor
            ticker_last_price[ticker] = price  # store raw Yahoo price
        elif ticker in ticker_last_price:
            # Use last known raw price × current split factor
            split_factor = forward_split_factors.get(ticker, _ONE)
            holdings_value += (
                h.quantity * _to_decimal(ticker_last_price[ticker]) * split_factor
            )
            last_known_tickers.append(ticker)
        else:
            # No price ever seen — fall back to cost basis (last resort)
            holdings_value += h.total_cost
            cost_basis_tickers.append(ticker)
    return holdings_value, last_known_tickers, cost_basis_tickers


@dataclass
class _TwrState:
    """Running state for Time-Weighted Return calculation."""

    prev_value: Decimal = _ZERO
    prev_principal: Decimal = _ZERO
    twr_factor: Decimal = _ONE  # cumulative (1+r1)(1+r2)…
    started: bool = False


def _compute_perf_data_point(
    state: _TxState,
    twr: _TwrState,
    date_str: str,
    holdings_value: Decimal,
    last_known_tickers: list[str],
    cost_basis_tickers: list[str],
    fx_rates: dict[str, float],
    sorted_fx_dates: list[str],
    sp500_prices: dict[str, float],
    sorted_sp500_dates: list[str],
    sp500_base_price: float | None,
) -> tuple[dict, float | None]:
    """Build a single performance data-point dict. Returns (data_point, updated sp500_base_price)."""
    if last_known_tickers:
        logger.debug(
            "Performance %s: using last known price for %s",
            date_str,
            last_known_tickers,
        )
    if cost_basis_tickers:
        logger.warning(
            "Performance %s: no price data for %s (using cost basis as fallback)",
            date_str,
            cost_basis_tickers,
        )

    current_value = state.cash + holdings_value
    fx_rate = _bisect_lookup(sorted_fx_dates, fx_rates, date_str)

    # Time-Weighted Return: chain sub-period returns between cash-flow events.
    return_pct = None
    if not twr.started:
        if current_value > 0:
            twr.started = True
        return_pct = 0.0 if current_value > 0 else None
    else:
        cf = state.principal - twr.prev_principal
        base = twr.prev_value + cf
        if base > 0:
            sub_return = current_value / base
            twr.twr_factor *= sub_return
        return_pct = float((twr.twr_factor - _ONE) * Decimal("100"))

    twr.prev_value = current_value
    twr.prev_principal = state.principal

    # S&P 500 in USD — frontend applies FX rate for EUR mode
    sp500_return_pct = None
    sp500_price = _bisect_lookup(sorted_sp500_dates, sp500_prices, date_str)
    if sp500_price is not None and sp500_price > 0:
        if sp500_base_price is None:
            sp500_base_price = sp500_price
        sp500_return_pct = (sp500_price / sp500_base_price - 1.0) * 100.0

    data_point = {
        "date": date_str,
        "principal": float(state.principal),
        "principal_eur": float(state.principal_eur),
        "current_value": float(current_value),
        "fx_rate": fx_rate,
        "return_pct": return_pct,
        "sp500_return_pct": sp500_return_pct,
    }
    return data_point, sp500_base_price


# ================== Main entry point ==================


def calculate_performance(
    transactions: list[Transaction],
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    num_points: int = 60,
) -> list[dict]:
    """Calculate portfolio performance time-series from transactions.

    Returns list of data-point dicts with keys:
    date, principal, principal_eur, current_value, fx_rate, return_pct, sp500_return_pct.
    """
    if not transactions:
        return []

    if start_date is None:
        start_date = min(t.date for t in transactions)
    if end_date is None:
        end_date = datetime.now(UTC).replace(tzinfo=None)

    if start_date >= end_date:
        raise ValueError(
            f"start_date ({start_date}) must be before end_date ({end_date})"
        )
    if num_points < 2:
        raise ValueError(f"num_points must be at least 2, got {num_points}")

    date_points = _generate_date_points(start_date, end_date, num_points)

    (
        historical_data,
        sorted_dates_map,
        fx_rates,
        sorted_fx_dates,
        sp500_prices,
        sorted_sp500_dates,
        ticker_last_price,
    ) = _prepare_perf_data(transactions, start_date, end_date)

    forward_split_factors = _compute_forward_split_factors(transactions)

    performance_data = []
    state = _TxState()
    state.usd_to_eur_fallback = _resolve_usd_to_eur_rate(end_date)
    twr = _TwrState()
    tx_index = 0
    sp500_base_price: float | None = None

    for date_point in date_points:
        date_str = date_point.strftime("%Y-%m-%d")
        tx_index = _replay_transactions_up_to(
            transactions,
            tx_index,
            state,
            date_point,
            forward_split_factors,
        )
        holdings_value, last_known, cost_basis = _compute_perf_holdings(
            state,
            sorted_dates_map,
            historical_data,
            ticker_last_price,
            forward_split_factors,
            date_str,
        )
        data_point_dict, sp500_base_price = _compute_perf_data_point(
            state,
            twr,
            date_str,
            holdings_value,
            last_known,
            cost_basis,
            fx_rates,
            sorted_fx_dates,
            sp500_prices,
            sorted_sp500_dates,
            sp500_base_price,
        )
        performance_data.append(data_point_dict)

    return performance_data
