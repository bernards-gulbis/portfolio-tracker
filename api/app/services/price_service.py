"""
Service for fetching current stock prices
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, date, datetime, timedelta
from threading import Lock, Semaphore
from typing import ClassVar

import requests
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlmodel import Session, select

from app.core.config import PRICE_CACHE_TTL_SECONDS
from app.core.database import engine, is_postgresql
from app.models.historical_price import FxRate, HistoricalPrice

logger = logging.getLogger(__name__)


class PriceService:
    """Service for fetching current stock prices from Yahoo Finance"""

    # Class-level cache: ticker -> (price, timestamp)
    _price_cache: ClassVar[dict[str, tuple[float | None, datetime]]] = {}
    _cache_ttl: timedelta = timedelta(seconds=PRICE_CACHE_TTL_SECONDS)
    _cache_lock = Lock()  # Thread-safe cache access
    _yahoo_semaphore = Semaphore(5)  # Max 5 concurrent outgoing Yahoo Finance requests

    # In-memory cache for historical prices (clears after request completes)
    _historical_cache: ClassVar[dict[str, dict[str, float]]] = {}
    _historical_cache_lock = Lock()
    _HISTORICAL_CACHE_MAX_SIZE = 100  # Max entries to prevent memory issues

    # Configuration: days to consider data "historical" (immutable)
    _HISTORICAL_DATA_CUTOFF_DAYS = 2

    @classmethod
    def clear_session_cache(cls) -> None:
        """Clear the in-memory historical price cache (call at start of each request)"""
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
        """Retrieve cached historical prices from database"""
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")

        def _query(s: Session) -> dict[str, float]:
            statement = select(HistoricalPrice).where(
                HistoricalPrice.ticker == ticker,
                HistoricalPrice.date >= start_str,
                HistoricalPrice.date <= end_str,
            )
            results = s.exec(statement).all()
            return {price.date: price.price for price in results}

        if session is not None:
            return _query(session)
        with Session(engine) as s:
            return _query(s)

    @classmethod
    def _bulk_upsert(
        cls,
        model,
        values: list[dict],
        index_elements: list[str],
        update_fields: list[str],
        label: str,
        session: Session | None = None,
    ) -> None:
        """Bulk upsert rows into a table using ON CONFLICT, silently swallowing errors."""
        if not values:
            return
        try:

            def _execute(s: Session) -> None:
                insert_fn = pg_insert if is_postgresql else sqlite_insert
                stmt = insert_fn(model).values(values)
                stmt = stmt.on_conflict_do_update(
                    index_elements=index_elements,
                    set_={k: getattr(stmt.excluded, k) for k in update_fields},
                )
                s.execute(stmt)
                s.commit()

            if session is not None:
                _execute(session)
            else:
                with Session(engine) as s:
                    _execute(s)
            logger.debug("Saved %d %s to cache", len(values), label)
        except Exception as e:
            logger.error(
                "Failed to save %d %s: %s", len(values), label, e, exc_info=True
            )

    @classmethod
    def _save_historical_prices(cls, ticker: str, prices: dict[str, float]) -> None:
        """Save historical prices to database using bulk upsert"""
        now = datetime.now(UTC)
        values = [
            {"ticker": ticker, "date": date_str, "price": price, "created_at": now}
            for date_str, price in prices.items()
        ]
        cls._bulk_upsert(
            HistoricalPrice,
            values,
            index_elements=["ticker", "date"],
            update_fields=["price", "created_at"],
            label=f"historical prices for {ticker}",
        )

    @classmethod
    def _get_cached_fx_rates(
        cls,
        start_date: datetime,
        end_date: datetime,
        session: Session | None = None,
    ) -> dict[str, float]:
        """Retrieve cached FX rates from database"""
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")

        def _query(s: Session) -> dict[str, float]:
            statement = select(FxRate).where(
                FxRate.date >= start_str, FxRate.date <= end_str
            )
            results = s.exec(statement).all()
            return {rate.date: rate.usd_to_eur_rate for rate in results}

        if session is not None:
            return _query(session)
        with Session(engine) as s:
            return _query(s)

    @classmethod
    def _save_fx_rates(cls, rates: dict[str, float]) -> None:
        """Save FX rates to database using bulk upsert"""
        now = datetime.now(UTC)
        values = [
            {"date": date_str, "usd_to_eur_rate": rate, "created_at": now}
            for date_str, rate in rates.items()
        ]
        cls._bulk_upsert(
            FxRate,
            values,
            index_elements=["date"],
            update_fields=["usd_to_eur_rate", "created_at"],
            label="FX rates",
        )

    @classmethod
    def get_last_known_price(
        cls, ticker: str, session: Session | None = None
    ) -> float | None:
        """Return the most recent cached price for a ticker, regardless of date range.

        Uses the HistoricalPrice table (composite PK on ticker+date), so
        ORDER BY date DESC LIMIT 1 is index-friendly.
        """
        result = cls.get_last_known_price_with_date(ticker, session)
        return result[0] if result is not None else None

    @classmethod
    def get_last_known_price_with_date(
        cls, ticker: str, session: Session | None = None
    ) -> tuple[float, str] | None:
        """Return (price, date_str YYYY-MM-DD) of the most recent cached price, or None."""

        def _query(s: Session) -> tuple[float, str] | None:
            statement = (
                select(HistoricalPrice)
                .where(HistoricalPrice.ticker == ticker)
                .order_by(HistoricalPrice.date.desc())
                .limit(1)
            )
            row = s.exec(statement).first()
            if row:
                return float(row.price), row.date
            return None

        if session is not None:
            return _query(session)
        with Session(engine) as s:
            return _query(s)

    @classmethod
    def get_current_prices(
        cls, tickers: list[str], max_workers: int = 3
    ) -> dict[str, float | None]:
        """
        Fetch current prices for a list of tickers from Yahoo Finance in parallel

        Args:
            tickers: List of ticker symbols
            max_workers: Maximum number of concurrent API requests (default: 3)

        Returns:
            Dictionary mapping ticker symbols to their current prices (None if not found)
        """
        if not tickers:
            return {}

        prices = {}

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_ticker = {
                executor.submit(cls.get_current_price, ticker): ticker
                for ticker in tickers
            }

            for future in as_completed(future_to_ticker):
                ticker = future_to_ticker[future]
                try:
                    price = future.result()
                    prices[ticker] = price
                except Exception as e:
                    logger.error(
                        "Error fetching price for %s: %s", ticker, e, exc_info=True
                    )
                    prices[ticker] = None

        return prices

    @classmethod
    def get_current_price(cls, ticker: str) -> float | None:
        """
        Fetch current price for a single ticker from Yahoo Finance API with caching

        Args:
            ticker: Ticker symbol

        Returns:
            Current price or None if not found
        """
        # Check cache first (thread-safe)
        now = datetime.now(UTC)
        with cls._cache_lock:
            if ticker in cls._price_cache:
                cached_price, cached_time = cls._price_cache[ticker]
                if now - cached_time < cls._cache_ttl:
                    logger.debug("Cache hit for %s: %s", ticker, cached_price)
                    return cached_price

        # Fetch from API (semaphore caps total concurrent Yahoo Finance requests)
        with cls._yahoo_semaphore:
            try:
                # Use Yahoo Finance v8 API (free, no API key needed)
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"

                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }

                params = {"interval": "1d", "range": "1d"}

                response = requests.get(url, headers=headers, params=params, timeout=10)
                response.raise_for_status()

                data = response.json()

                # Extract the current price from the response
                result = data.get("chart", {}).get("result", [])
                fetched_price: float | None = None
                if result:
                    meta = result[0].get("meta", {})
                    current_price = meta.get("regularMarketPrice")
                    if current_price is not None:
                        fetched_price = float(current_price)

                # Double-check locking: only write if cache is still stale.
                with cls._cache_lock:
                    existing = cls._price_cache.get(ticker)
                    if existing is None or (now - existing[1]) >= cls._cache_ttl:
                        cls._price_cache[ticker] = (fetched_price, now)
                return fetched_price

            except requests.exceptions.RequestException as e:
                logger.warning("Network error fetching price for %s: %s", ticker, e)
                return None
            except (KeyError, ValueError, IndexError) as e:
                logger.warning("Error parsing price data for %s: %s", ticker, e)
                return None
            except Exception as e:
                logger.error(
                    "Unexpected error fetching price for %s: %s",
                    ticker,
                    e,
                    exc_info=True,
                )
                return None

    @classmethod
    def get_usd_to_eur_rate(cls) -> float | None:
        """
        Fetch current USD to EUR exchange rate from Yahoo Finance

        Returns:
            Exchange rate (EUR per USD) or None if not found
        """
        # EURUSD=X gives EUR/USD (how many USD per EUR)
        # We need USD/EUR (how many EUR per USD), which is 1 / EURUSD
        eur_usd_rate = cls.get_current_price("EURUSD=X")
        if eur_usd_rate and eur_usd_rate > 0:
            return 1.0 / eur_usd_rate
        return None

    @classmethod
    def get_usd_to_eur_rate_safe(cls) -> float | None:
        """Like get_usd_to_eur_rate but returns None on any exception."""
        try:
            return cls.get_usd_to_eur_rate()
        except requests.exceptions.RequestException as e:
            logger.warning("Network error fetching USD/EUR rate: %s", e)
            return None
        except Exception as e:
            logger.error("Unexpected error fetching USD/EUR rate: %s", e, exc_info=True)
            return None

    @classmethod
    def _determine_fetch_ranges(
        cls,
        cached_prices: dict[str, float],
        start_date: datetime,
        end_date: datetime,
        yesterday: date,
    ) -> list[tuple[datetime, datetime]]:
        """Compute date ranges that need to be fetched from the API given cached data."""
        if not cached_prices:
            return [(start_date, end_date)]

        earliest_cached_date = datetime.strptime(
            min(cached_prices.keys()), "%Y-%m-%d"
        ).date()
        latest_cached_date = datetime.strptime(
            max(cached_prices.keys()), "%Y-%m-%d"
        ).date()

        ranges: list[tuple[datetime, datetime]] = []

        # Gap BEFORE the cached range
        if start_date.date() < earliest_cached_date:
            fetch_end = datetime.combine(
                earliest_cached_date, datetime.min.time()
            ) - timedelta(days=1)
            ranges.append((start_date, fetch_end))

        # No gap AFTER — cache covers the request
        if end_date.date() <= latest_cached_date:
            return ranges

        # Gap AFTER the cached range
        fetch_start = datetime.combine(
            latest_cached_date, datetime.min.time()
        ) + timedelta(days=1)
        if end_date.date() <= yesterday:
            ranges.append((fetch_start, end_date))
        elif latest_cached_date >= yesterday:
            pass  # already have yesterday; don't fetch today (market may not be closed)
        else:
            ranges.append(
                (fetch_start, datetime.combine(yesterday, datetime.max.time()))
            )

        return ranges

    @classmethod
    def _fetch_yahoo_range(
        cls, ticker: str, fetch_start: datetime, fetch_end: datetime
    ) -> dict[str, float]:
        """Fetch daily closing prices from Yahoo Finance for a single date range."""
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

        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        params = {"period1": period1, "period2": period2, "interval": "1d"}

        with cls._yahoo_semaphore:
            response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()

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
        cls, ticker: str, fetch_start: datetime, fetch_end: datetime, today
    ) -> dict[str, float]:
        """Fetch one date range, persist historical prices, and handle errors. Returns new prices."""
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
        """Log an HTTP error from Yahoo Finance, with concise output for expected 400/404."""
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
        """
        Fetch historical daily closing prices for a ticker from Yahoo Finance
        with permanent caching (historical data doesn't change)

        Args:
            ticker: Ticker symbol
            start_date: Start date (inclusive)
            end_date: End date (inclusive)

        Returns:
            Dictionary mapping date strings (YYYY-MM-DD) to closing prices (only trading days)

        Raises:
            ValueError: If start_date >= end_date
        """
        if start_date >= end_date:
            raise ValueError(
                f"start_date ({start_date}) must be before end_date ({end_date})"
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
    def get_historical_usd_to_eur_rates(
        cls, start_date: datetime, end_date: datetime
    ) -> dict[str, float]:
        """
        Fetch historical USD to EUR exchange rates from Yahoo Finance
        with permanent caching (historical data doesn't change)

        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)

        Returns:
            Dictionary mapping date strings (YYYY-MM-DD) to exchange rates (EUR per USD, only trading days)
        """
        eur_usd_rates = cls.get_historical_prices("EURUSD=X", start_date, end_date)

        return {
            date_str: 1.0 / rate
            for date_str, rate in eur_usd_rates.items()
            if rate and rate > 0
        }

    @classmethod
    def get_historical_prices_for_multiple_tickers(
        cls,
        tickers: list[str],
        start_date: datetime,
        end_date: datetime,
        max_workers: int = 5,
        per_ticker_start: dict[str, datetime] | None = None,
    ) -> dict[str, dict[str, float]]:
        """
        Fetch historical prices for multiple tickers in parallel

        Args:
            tickers: List of ticker symbols
            start_date: Default start date (inclusive)
            end_date: End date (inclusive)
            max_workers: Maximum number of concurrent API requests (default: 5)
            per_ticker_start: Optional dict mapping ticker → earliest start date.
                              Prevents asking Yahoo for data before a stock existed
                              (IPO date), which would otherwise return 400.

        Returns:
            Dictionary mapping ticker symbols to date-price dictionaries (only trading days)
        """
        if not tickers:
            return {}

        all_prices = {}

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_ticker = {}
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

        # Ensure every requested ticker has an entry
        for ticker in tickers:
            if ticker not in all_prices:
                all_prices[ticker] = {}

        return all_prices
