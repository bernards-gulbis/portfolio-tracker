"""
Service for fetching current stock prices
"""
import logging
import os
from typing import Dict, Optional, Tuple, List
import requests
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock, Semaphore
from sqlmodel import Session, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.core.database import engine, is_postgresql
from app.models.historical_price import HistoricalPrice, FxRate

logger = logging.getLogger(__name__)


class PriceService:
    """Service for fetching current stock prices from Yahoo Finance"""
    
    # Class-level cache: ticker -> (price, timestamp)
    _price_cache: Dict[str, Tuple[Optional[float], datetime]] = {}
    _cache_ttl: timedelta = timedelta(minutes=int(os.getenv('PRICE_CACHE_TTL', '15')))
    _cache_lock = Lock()  # Thread-safe cache access
    _yahoo_semaphore = Semaphore(5)  # Max 5 concurrent outgoing Yahoo Finance requests
    
    # In-memory cache for historical prices (clears after request completes)
    _historical_cache: Dict[str, Dict[str, float]] = {}
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
    def _store_in_historical_cache(cls, key: str, data: Dict[str, float]) -> None:
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
        end_date: datetime
    ) -> Dict[str, float]:
        """Retrieve cached historical prices from database"""
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')

        with Session(engine) as session:
            statement = select(HistoricalPrice).where(
                HistoricalPrice.ticker == ticker,
                HistoricalPrice.date >= start_str,
                HistoricalPrice.date <= end_str
            )
            results = session.exec(statement).all()
            return {price.date: price.price for price in results}

    @classmethod
    def _bulk_upsert(cls, model, values: List[dict], index_elements: List[str], update_fields: dict, label: str) -> None:
        """Bulk upsert rows into a table using ON CONFLICT, silently swallowing errors."""
        if not values:
            return
        try:
            with Session(engine) as session:
                insert_fn = pg_insert if is_postgresql else sqlite_insert
                stmt = insert_fn(model).values(values)
                stmt = stmt.on_conflict_do_update(
                    index_elements=index_elements,
                    set_={k: getattr(stmt.excluded, k) for k in update_fields},
                )
                session.execute(stmt)
                session.commit()
            logger.debug("Saved %d %s to cache", len(values), label)
        except Exception as e:
            logger.error("Failed to save %d %s: %s", len(values), label, e, exc_info=True)

    @classmethod
    def _save_historical_prices(cls, ticker: str, prices: Dict[str, float]) -> None:
        """Save historical prices to database using bulk upsert"""
        now = datetime.now(timezone.utc)
        values = [
            {'ticker': ticker, 'date': date_str, 'price': price, 'created_at': now}
            for date_str, price in prices.items()
        ]
        cls._bulk_upsert(
            HistoricalPrice, values,
            index_elements=['ticker', 'date'],
            update_fields={'price', 'created_at'},
            label=f"historical prices for {ticker}",
        )

    @classmethod
    def _get_cached_fx_rates(
        cls,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, float]:
        """Retrieve cached FX rates from database"""
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')

        with Session(engine) as session:
            statement = select(FxRate).where(
                FxRate.date >= start_str,
                FxRate.date <= end_str
            )
            results = session.exec(statement).all()
            return {rate.date: rate.usd_to_eur_rate for rate in results}

    @classmethod
    def _save_fx_rates(cls, rates: Dict[str, float]) -> None:
        """Save FX rates to database using bulk upsert"""
        now = datetime.now(timezone.utc)
        values = [
            {'date': date_str, 'usd_to_eur_rate': rate, 'created_at': now}
            for date_str, rate in rates.items()
        ]
        cls._bulk_upsert(
            FxRate, values,
            index_elements=['date'],
            update_fields={'usd_to_eur_rate', 'created_at'},
            label="FX rates",
        )
    
    @classmethod
    def get_current_prices(cls, tickers: List[str], max_workers: int = 3) -> Dict[str, Optional[float]]:
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
                    logger.error("Error fetching price for %s: %s", ticker, e, exc_info=True)
                    prices[ticker] = None

        return prices

    @classmethod
    def get_current_price(cls, ticker: str) -> Optional[float]:
        """
        Fetch current price for a single ticker from Yahoo Finance API with caching
        
        Args:
            ticker: Ticker symbol
            
        Returns:
            Current price or None if not found
        """
        # Check cache first (thread-safe)
        now = datetime.now(timezone.utc)
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
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }

                params = {
                    'interval': '1d',
                    'range': '1d'
                }

                response = requests.get(url, headers=headers, params=params, timeout=10)
                response.raise_for_status()

                data = response.json()

                # Extract the current price from the response
                result = data.get('chart', {}).get('result', [])
                fetched_price: Optional[float] = None
                if result:
                    meta = result[0].get('meta', {})
                    current_price = meta.get('regularMarketPrice')
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
                logger.error("Unexpected error fetching price for %s: %s", ticker, e, exc_info=True)
                return None
    
    @classmethod
    def get_usd_to_eur_rate(cls) -> Optional[float]:
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
    def get_historical_prices(
        cls,
        ticker: str,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, float]:
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
        # Input validation
        if start_date >= end_date:
            raise ValueError(f"start_date ({start_date}) must be before end_date ({end_date})")
        
        # Check in-memory cache first (for current request session)
        cache_key = f"{ticker}:{start_date.date()}:{end_date.date()}"
        with cls._historical_cache_lock:
            if cache_key in cls._historical_cache:
                logger.debug("In-memory cache hit for %s", ticker)
                return cls._historical_cache[cache_key].copy()

        # Historical data (> cutoff days old) is immutable and can be fully cached
        # Recent data should always be fetched to get latest closing prices
        today = datetime.now(timezone.utc).date()
        yesterday = today - timedelta(days=1)
        cutoff_date = today - timedelta(days=cls._HISTORICAL_DATA_CUTOFF_DAYS)

        cached_prices = cls._get_cached_historical_prices(ticker, start_date, end_date)
        
        # Determine if cache fully covers the requested range
        ranges_to_fetch = []  # List of (start, end) tuples to fetch
        
        if cached_prices:
            earliest_cached_str = min(cached_prices.keys())
            latest_cached_str = max(cached_prices.keys())
            earliest_cached_date = datetime.strptime(earliest_cached_str, '%Y-%m-%d').date()
            latest_cached_date = datetime.strptime(latest_cached_str, '%Y-%m-%d').date()
            
            # Check if we need data BEFORE the cached range
            if start_date.date() < earliest_cached_date:
                # Need to fetch from start_date to day before earliest cached
                fetch_end_before = datetime.combine(earliest_cached_date, datetime.min.time()) - timedelta(days=1)
                ranges_to_fetch.append((start_date, fetch_end_before))
                logger.debug("Need data before cache for %s: %s to %s", ticker, start_date.date(), fetch_end_before.date())
            
            # Check if we need data AFTER the cached range
            if end_date.date() > latest_cached_date:
                # For fully historical ranges, cached data should be complete
                if end_date.date() <= cutoff_date:
                    # Historical request but cache doesn't extend to end_date
                    # Fetch missing portion
                    fetch_start_after = datetime.combine(latest_cached_date, datetime.min.time()) + timedelta(days=1)
                    ranges_to_fetch.append((fetch_start_after, end_date))
                    logger.debug("Need historical data after cache for %s: %s to %s", ticker, fetch_start_after.date(), end_date.date())
                elif end_date.date() <= yesterday:
                    # Requesting up to yesterday - fetch if not cached
                    fetch_start_after = datetime.combine(latest_cached_date, datetime.min.time()) + timedelta(days=1)
                    ranges_to_fetch.append((fetch_start_after, end_date))
                    logger.debug("Need data up to yesterday for %s: %s to %s", ticker, fetch_start_after.date(), end_date.date())
                elif latest_cached_date >= yesterday:
                    # Cache has yesterday's data, don't fetch today (market may not be closed)
                    logger.debug("Cache has recent data for %s up to %s, skipping today", ticker, latest_cached_date)
                else:
                    # Cache is older than yesterday, fetch up to yesterday (not today)
                    fetch_start_after = datetime.combine(latest_cached_date, datetime.min.time()) + timedelta(days=1)
                    fetch_end_recent = datetime.combine(yesterday, datetime.max.time())
                    ranges_to_fetch.append((fetch_start_after, fetch_end_recent))
                    logger.debug("Need recent data for %s: %s to %s", ticker, fetch_start_after.date(), fetch_end_recent.date())
            elif end_date.date() <= cutoff_date:
                # Cache fully covers the historical range
                logger.debug("Cache fully covers historical range for %s (%d days)", ticker, len(cached_prices))
        else:
            # No cache - fetch entire range
            ranges_to_fetch.append((start_date, end_date))
            logger.debug("No cache for %s, fetching full range", ticker)
        
        # If no ranges to fetch, return cached data
        if not ranges_to_fetch:
            cls._store_in_historical_cache(cache_key, cached_prices)
            return cached_prices

        # Fetch missing data from API for each range
        for fetch_start, fetch_end in ranges_to_fetch:
            # Skip ranges where start date is past end date (can happen when
            # per-ticker start dates have time-of-day components that shift
            # the start past a midnight-based end boundary).
            if fetch_start.date() > fetch_end.date():
                continue
            try:
                # Normalize to midnight UTC boundaries — Yahoo API uses
                # calendar-day resolution and requires period1 < period2.
                # period2 is set to the day *after* fetch_end so the last
                # requested day is included (period2 is exclusive).
                period1 = int(datetime.combine(
                    fetch_start.date(), datetime.min.time()
                ).replace(tzinfo=timezone.utc).timestamp())
                period2 = int(datetime.combine(
                    fetch_end.date() + timedelta(days=1), datetime.min.time()
                ).replace(tzinfo=timezone.utc).timestamp())

                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"

                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }

                params = {
                    'period1': period1,
                    'period2': period2,
                    'interval': '1d'
                }

                with cls._yahoo_semaphore:
                    response = requests.get(url, headers=headers, params=params, timeout=10)
                response.raise_for_status()

                data = response.json()

                result = data.get('chart', {}).get('result', [])
                if not result:
                    continue

                timestamps = result[0].get('timestamp', [])
                quotes = result[0].get('indicators', {}).get('quote', [{}])[0]
                closes = quotes.get('close', [])

                new_prices = {}
                for timestamp, close in zip(timestamps, closes):
                    if close is not None:
                        date_str = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime('%Y-%m-%d')
                        new_prices[date_str] = float(close)

                # Save only historical data to persistent cache (today's data is still being traded)
                if new_prices:
                    historical_prices = {k: v for k, v in new_prices.items()
                                        if datetime.strptime(k, '%Y-%m-%d').date() < today}
                    if historical_prices:
                        cls._save_historical_prices(ticker, historical_prices)
                        logger.debug("Cached %d historical prices for %s", len(historical_prices), ticker)

                cached_prices.update(new_prices)

            except requests.exceptions.HTTPError as e:
                # 400/404 are expected for delisted or pre-IPO tickers — log
                # concisely without a traceback so production logs stay clean.
                status = e.response.status_code if e.response is not None else None
                if status in (400, 404):
                    logger.warning(
                        "No Yahoo data for %s (%s to %s): HTTP %s",
                        ticker, fetch_start.date(), fetch_end.date(), status,
                    )
                else:
                    logger.error(
                        "Error fetching historical prices for %s (%s to %s): %s",
                        ticker, fetch_start.date(), fetch_end.date(), e, exc_info=True,
                    )
            except Exception as e:
                logger.error("Error fetching historical prices for %s (%s to %s): %s", ticker, fetch_start.date(), fetch_end.date(), e, exc_info=True)

        cls._store_in_historical_cache(cache_key, cached_prices)
        return cached_prices

    @classmethod
    def get_historical_usd_to_eur_rates(
        cls,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, float]:
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
        tickers: List[str],
        start_date: datetime,
        end_date: datetime,
        max_workers: int = 5,
        per_ticker_start: Optional[Dict[str, datetime]] = None,
    ) -> Dict[str, Dict[str, float]]:
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
                    executor.submit(cls.get_historical_prices, ticker, ticker_start, end_date)
                ] = ticker

            for future in as_completed(future_to_ticker):
                ticker = future_to_ticker[future]
                try:
                    all_prices[ticker] = future.result()
                except Exception as e:
                    logger.error("Error fetching historical prices for %s: %s", ticker, e, exc_info=True)
                    all_prices[ticker] = {}

        # Ensure every requested ticker has an entry
        for ticker in tickers:
            if ticker not in all_prices:
                all_prices[ticker] = {}

        return all_prices
