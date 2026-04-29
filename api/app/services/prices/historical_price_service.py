"""Historical (daily) stock-price service.

Three-tier cache:

1. **In-memory request-scoped cache** — populated on first lookup,
   cleared by ``clear_session_cache`` at the start of each request.
2. **Database** (``HistoricalPrice`` table) — durable cache; immutable
   for dates older than ``_HISTORICAL_DATA_CUTOFF_DAYS``.
3. **Yahoo Finance** — only when neither cache covers the request.

See the module-level docstring of the original ``PriceService`` for the
documented concurrency tradeoffs (double-fetch under contention is
accepted; cross-request cache leakage is bounded by the TTL).
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, date, datetime, timedelta
from threading import Lock
from typing import ClassVar

import requests
from sqlmodel import Session, select

from app.core.database import engine
from app.models.historical_price import HistoricalPrice

from ._db_helpers import bulk_upsert
from .yahoo_finance_client import YahooFinanceClient

logger = logging.getLogger(__name__)


class HistoricalPriceService:
    """Daily historical close prices with three-tier caching."""

    _historical_cache: ClassVar[dict[str, dict[str, float]]] = {}
    _historical_cache_lock = Lock()
    _HISTORICAL_CACHE_MAX_SIZE = 100
    _HISTORICAL_DATA_CUTOFF_DAYS = 2

    @classmethod
    def clear_session_cache(cls) -> None:
        """Clear the in-memory historical price cache (call at start of each request)."""
        with cls._historical_cache_lock:
            cls._historical_cache.clear()
            logger.debug("Cleared in-memory historical price cache")

    @classmethod
    def _store_in_historical_cache(cls, key: str, data: dict[str, float]) -> None:
        """Store data in in-memory historical cache with FIFO eviction."""
        with cls._historical_cache_lock:
            if len(cls._historical_cache) >= cls._HISTORICAL_CACHE_MAX_SIZE:
                evicted = next(iter(cls._historical_cache))
                cls._historical_cache.pop(evicted)
                logger.debug("Evicted cache entry: %s", evicted)
            cls._historical_cache[key] = data.copy()

    @classmethod
    def _get_cached_historical_prices(
        cls,
        ticker: str,
        start_date: datetime,
        end_date: datetime,
        session: Session | None = None,
    ) -> dict[str, float]:
        """Retrieve cached historical prices from database."""
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")

        def _query(s: Session) -> dict[str, float]:
            statement = select(HistoricalPrice).where(
                HistoricalPrice.ticker == ticker,
                HistoricalPrice.date >= start_str,
                HistoricalPrice.date <= end_str,
            )
            results = s.exec(statement).all()
            # Cast Decimal → float at the boundary: the column is Decimal
            # for ledger-grade precision, but every caller expects float per
            # this method's return type. Leaking Decimal through breaks
            # plain arithmetic like ``1.0 / rate`` downstream.
            return {price.date: float(price.price) for price in results}

        if session is not None:
            return _query(session)
        with Session(engine) as s:
            return _query(s)

    @classmethod
    def _save_historical_prices(cls, ticker: str, prices: dict[str, float]) -> None:
        """Save historical prices to database using bulk upsert."""
        now = datetime.now(UTC)
        values = [
            {"ticker": ticker, "date": date_str, "price": price, "created_at": now}
            for date_str, price in prices.items()
        ]
        bulk_upsert(
            HistoricalPrice,
            values,
            index_elements=["ticker", "date"],
            update_fields=["price", "created_at"],
            label=f"historical prices for {ticker}",
        )

    @classmethod
    def _determine_fetch_ranges(
        cls,
        cached_prices: dict[str, float],
        start_date: datetime,
        end_date: datetime,
        yesterday: date,
    ) -> list[tuple[datetime, datetime]]:
        """Compute date ranges that need to be fetched given cached data."""
        if not cached_prices:
            return [(start_date, end_date)]

        earliest_cached_date = datetime.strptime(
            min(cached_prices.keys()), "%Y-%m-%d"
        ).date()
        latest_cached_date = datetime.strptime(
            max(cached_prices.keys()), "%Y-%m-%d"
        ).date()

        ranges: list[tuple[datetime, datetime]] = []

        if start_date.date() < earliest_cached_date:
            fetch_end = datetime.combine(
                earliest_cached_date, datetime.min.time()
            ) - timedelta(days=1)
            ranges.append((start_date, fetch_end))

        if end_date.date() <= latest_cached_date:
            return ranges

        fetch_start = datetime.combine(
            latest_cached_date, datetime.min.time()
        ) + timedelta(days=1)
        if end_date.date() <= yesterday:
            ranges.append((fetch_start, end_date))
        elif latest_cached_date >= yesterday:
            pass  # already have yesterday; don't fetch today
        else:
            ranges.append(
                (fetch_start, datetime.combine(yesterday, datetime.max.time()))
            )

        return ranges

    @classmethod
    def _fetch_yahoo_range(
        cls, ticker: str, fetch_start: datetime, fetch_end: datetime
    ) -> dict[str, float]:
        """Fetch daily closing prices from Yahoo for a single date range."""
        period1 = int(
            datetime.combine(fetch_start.date(), datetime.min.time())
            .replace(tzinfo=UTC)
            .timestamp()
        )
        period2 = int(
            datetime.combine(fetch_end.date() + timedelta(days=1), datetime.min.time())
            .replace(tzinfo=UTC)
            .timestamp()
        )

        response = YahooFinanceClient.fetch_chart(
            ticker, {"period1": period1, "period2": period2, "interval": "1d"}
        )

        data = response.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return {}

        timestamps = result[0].get("timestamp", [])
        quotes = result[0].get("indicators", {}).get("quote", [{}])[0]
        closes = quotes.get("close", [])

        prices: dict[str, float] = {}
        for timestamp, close in zip(timestamps, closes, strict=False):
            if close is not None:
                date_str = datetime.fromtimestamp(timestamp, tz=UTC).strftime(
                    "%Y-%m-%d"
                )
                prices[date_str] = float(close)
        return prices

    @classmethod
    def _fetch_single_range(
        cls,
        ticker: str,
        fetch_start: datetime,
        fetch_end: datetime,
        today: date,
    ) -> dict[str, float]:
        """Fetch one date range, persist historical prices, and handle errors."""
        if fetch_start.date() > fetch_end.date():
            return {}
        try:
            new_prices = cls._fetch_yahoo_range(ticker, fetch_start, fetch_end)
        except requests.exceptions.HTTPError as e:
            cls._log_http_error(ticker, fetch_start, fetch_end, e)
            return {}
        except Exception as e:
            logger.error(
                "Error fetching historical prices for %s (%s to %s): %s",
                ticker,
                fetch_start.date(),
                fetch_end.date(),
                e,
                exc_info=True,
            )
            return {}

        if new_prices:
            historical = {
                k: v
                for k, v in new_prices.items()
                if datetime.strptime(k, "%Y-%m-%d").date() < today
            }
            if historical:
                cls._save_historical_prices(ticker, historical)
                logger.debug(
                    "Cached %d historical prices for %s", len(historical), ticker
                )
        return new_prices

    @staticmethod
    def _log_http_error(
        ticker: str, fetch_start: datetime, fetch_end: datetime, e
    ) -> None:
        """Log an HTTP error from Yahoo, with concise output for expected 400/404."""
        status = e.response.status_code if e.response is not None else None
        if status in (400, 404):
            logger.warning(
                "No Yahoo data for %s (%s to %s): HTTP %s",
                ticker,
                fetch_start.date(),
                fetch_end.date(),
                status,
            )
        else:
            logger.error(
                "Error fetching historical prices for %s (%s to %s): %s",
                ticker,
                fetch_start.date(),
                fetch_end.date(),
                e,
                exc_info=True,
            )

    @classmethod
    def get_historical_prices(
        cls, ticker: str, start_date: datetime, end_date: datetime
    ) -> dict[str, float]:
        """Fetch historical daily closing prices for a ticker.

        Raises ``ValueError`` if ``start_date >= end_date``.
        """
        if start_date >= end_date:
            raise ValueError(
                f"start_date ({start_date}) must be strictly before "
                f"end_date ({end_date}); equal dates are not allowed"
            )

        cache_key = f"{ticker}:{start_date.date()}:{end_date.date()}"
        with cls._historical_cache_lock:
            if cache_key in cls._historical_cache:
                logger.debug("In-memory cache hit for %s", ticker)
                return cls._historical_cache[cache_key].copy()

        today = datetime.now(UTC).date()
        yesterday = today - timedelta(days=1)

        cached_prices = cls._get_cached_historical_prices(ticker, start_date, end_date)

        ranges_to_fetch = cls._determine_fetch_ranges(
            cached_prices,
            start_date,
            end_date,
            yesterday,
        )

        if not ranges_to_fetch:
            cls._store_in_historical_cache(cache_key, cached_prices)
            return cached_prices

        for fetch_start, fetch_end in ranges_to_fetch:
            new_prices = cls._fetch_single_range(ticker, fetch_start, fetch_end, today)
            cached_prices.update(new_prices)

        cls._store_in_historical_cache(cache_key, cached_prices)
        return cached_prices

    @classmethod
    def get_historical_prices_for_multiple_tickers(
        cls,
        tickers: list[str],
        start_date: datetime,
        end_date: datetime,
        max_workers: int = 5,
        per_ticker_start: dict[str, datetime] | None = None,
    ) -> dict[str, dict[str, float]]:
        """Fetch historical prices for multiple tickers in parallel.

        ``per_ticker_start`` lets the caller pin a later start for tickers
        whose IPO date is after ``start_date`` — Yahoo returns 400 for
        date ranges before a stock existed.
        """
        if not tickers:
            return {}

        all_prices: dict[str, dict[str, float]] = {}

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_ticker: dict = {}
            for ticker in tickers:
                ticker_start = start_date
                if per_ticker_start and ticker in per_ticker_start:
                    ticker_start = max(start_date, per_ticker_start[ticker])
                if ticker_start >= end_date:
                    all_prices[ticker] = {}
                    continue
                future_to_ticker[
                    executor.submit(
                        cls.get_historical_prices, ticker, ticker_start, end_date
                    )
                ] = ticker

            for future in as_completed(future_to_ticker):
                ticker = future_to_ticker[future]
                try:
                    all_prices[ticker] = future.result()
                except Exception as e:
                    logger.error(
                        "Error fetching historical prices for %s: %s",
                        ticker,
                        e,
                        exc_info=True,
                    )
                    all_prices[ticker] = {}

        for ticker in tickers:
            if ticker not in all_prices:
                all_prices[ticker] = {}

        return all_prices
