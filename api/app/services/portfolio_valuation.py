"""Historical valuation helpers: date lookup, price fetch, FX resolution.

All functions here are read-only — they consult ``PriceService`` to turn a
``(ticker, date)`` pair into a price or a USD→EUR rate, and fall back to
nearest-earlier-date or DB-cached last-known values when a live value is
unavailable. No transaction state is mutated.
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal

from app.services.portfolio_types import _ONE, _ZERO, _to_decimal, _TxState
from app.services.price_service import PriceService

logger = logging.getLogger(__name__)


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
        # If every available date is strictly AFTER target_date, omit the
        # ticker so the caller falls back to DB last-known or cost basis.
        # Using a future price to value a historical date is just wrong.
        if price is not None:
            result[ticker] = price
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
