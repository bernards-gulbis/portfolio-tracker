"""
Service for fetching current stock prices
"""
import logging
from typing import Dict, Optional, Tuple, List
import requests
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
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
    _cache_ttl: timedelta = timedelta(minutes=15)
    _cache_lock = Lock()  # Thread-safe cache access
    
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
    def _save_historical_prices(cls, ticker: str, prices: Dict[str, float]) -> None:
        """Save historical prices to database using bulk upsert"""
        if not prices:
            return
        
        now = datetime.now(timezone.utc)
        
        try:
            with Session(engine) as session:
                # Prepare bulk insert data
                values = [
                    {
                        'ticker': ticker,
                        'date': date_str,
                        'price': price,
                        'created_at': now
                    }
                    for date_str, price in prices.items()
                ]
                
                # Use database-specific bulk upsert (ON CONFLICT)
                if is_postgresql:
                    stmt = pg_insert(HistoricalPrice).values(values)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['ticker', 'date'],
                        set_=dict(
                            price=stmt.excluded.price,
                            created_at=stmt.excluded.created_at
                        )
                    )
                else:
                    # SQLite: Use ON CONFLICT with composite primary key
                    stmt = sqlite_insert(HistoricalPrice).values(values)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['ticker', 'date'],
                        set_=dict(
                            price=stmt.excluded.price,
                            created_at=stmt.excluded.created_at
                        )
                    )
                
                session.execute(stmt)
                session.commit()
            
            logger.debug(f"Saved {len(prices)} historical prices for {ticker} to cache")
        except Exception as e:
            logger.error(f"Failed to save {len(prices)} historical prices for {ticker}: {e}", exc_info=True)
            # Don't raise - caching failure shouldn't break the request
            # Data will be refetched next time
    
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
        if not rates:
            return
        
        now = datetime.now(timezone.utc)
        
        try:
            with Session(engine) as session:
                # Prepare bulk insert data
                values = [
                    {
                        'date': date_str,
                        'usd_to_eur_rate': rate,
                        'created_at': now
                    }
                    for date_str, rate in rates.items()
                ]
                
                # Use database-specific bulk upsert (ON CONFLICT)
                if is_postgresql:
                    stmt = pg_insert(FxRate).values(values)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['date'],
                        set_=dict(
                            usd_to_eur_rate=stmt.excluded.usd_to_eur_rate,
                            created_at=stmt.excluded.created_at
                        )
                    )
                else:
                    # SQLite: Use ON CONFLICT with primary key
                    stmt = sqlite_insert(FxRate).values(values)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['date'],
                        set_=dict(
                            usd_to_eur_rate=stmt.excluded.usd_to_eur_rate,
                            created_at=stmt.excluded.created_at
                        )
                    )
                
                session.execute(stmt)
                session.commit()
            
            logger.debug(f"Saved {len(rates)} FX rates to cache")
        except Exception as e:
            logger.error(f"Failed to save {len(rates)} FX rates: {e}", exc_info=True)
            # Don't raise - caching failure shouldn't break the request
    
    @staticmethod
    def get_current_prices(tickers: List[str], max_workers: int = 5) -> Dict[str, Optional[float]]:
        """
        Fetch current prices for a list of tickers from Yahoo Finance in parallel
        
        Args:
            tickers: List of ticker symbols
            max_workers: Maximum number of concurrent API requests (default: 5)
            
        Returns:
            Dictionary mapping ticker symbols to their current prices (None if not found)
        """
        if not tickers:
            return {}
        
        prices = {}
        
        # Use ThreadPoolExecutor for parallel requests
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all requests
            future_to_ticker = {
                executor.submit(PriceService.get_current_price, ticker): ticker 
                for ticker in tickers
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_ticker):
                ticker = future_to_ticker[future]
                try:
                    price = future.result()
                    prices[ticker] = price
                except Exception as e:
                    logger.error(f"Error fetching price for {ticker}: {e}", exc_info=True)
                    prices[ticker] = None
        
        return prices
    
    @staticmethod
    def get_current_price(ticker: str) -> Optional[float]:
        """
        Fetch current price for a single ticker from Yahoo Finance API with caching
        
        Args:
            ticker: Ticker symbol
            
        Returns:
            Current price or None if not found
        """
        # Check cache first (thread-safe) - keep entire check inside lock to avoid race condition
        now = datetime.now()
        with PriceService._cache_lock:
            if ticker in PriceService._price_cache:
                cached_price, cached_time = PriceService._price_cache[ticker]
                if now - cached_time < PriceService._cache_ttl:
                    logger.debug(f"Cache hit for {ticker}: {cached_price}")
                    return cached_price
                # Cache expired, will be updated below
        
        # Fetch from API
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
            if result:
                meta = result[0].get('meta', {})
                current_price = meta.get('regularMarketPrice')
                
                if current_price is not None:
                    price = float(current_price)
                    # Cache the result (thread-safe)
                    with PriceService._cache_lock:
                        PriceService._price_cache[ticker] = (price, now)
                    return price
            
            # Cache None result to avoid repeated failed requests (thread-safe)
            with PriceService._cache_lock:
                PriceService._price_cache[ticker] = (None, now)
            return None
            
        except requests.exceptions.RequestException as e:
            logger.warning(f"Network error fetching price for {ticker}: {e}")
            return None
        except (KeyError, ValueError, IndexError) as e:
            logger.warning(f"Error parsing price data for {ticker}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching price for {ticker}: {e}", exc_info=True)
            return None
    
    @staticmethod
    def get_usd_to_eur_rate() -> Optional[float]:
        """
        Fetch current USD to EUR exchange rate from Yahoo Finance
        
        Returns:
            Exchange rate (EUR per USD) or None if not found
        """
        # EURUSD=X gives EUR/USD (how many USD per EUR)
        # We need USD/EUR (how many EUR per USD), which is 1 / EURUSD
        eur_usd_rate = PriceService.get_current_price("EURUSD=X")
        if eur_usd_rate and eur_usd_rate > 0:
            return 1.0 / eur_usd_rate  # Convert to USD/EUR
        return None
    
    @staticmethod
    def get_historical_prices(
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
        with PriceService._historical_cache_lock:
            if cache_key in PriceService._historical_cache:
                logger.debug(f"In-memory cache hit for {ticker}")
                return PriceService._historical_cache[cache_key].copy()
        
        # Determine if we need to fetch from API
        # Historical data (> cutoff days old) is immutable and can be fully cached
        # Recent data should always be fetched to get latest closing prices
        today = datetime.now(timezone.utc).date()
        yesterday = today - timedelta(days=1)
        cutoff_date = today - timedelta(days=PriceService._HISTORICAL_DATA_CUTOFF_DAYS)
        
        # Check persistent cache for historical data
        cached_prices = PriceService._get_cached_historical_prices(ticker, start_date, end_date)
        
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
                logger.debug(f"Need data before cache for {ticker}: {start_date.date()} to {fetch_end_before.date()}")
            
            # Check if we need data AFTER the cached range
            if end_date.date() > latest_cached_date:
                # For fully historical ranges, cached data should be complete
                if end_date.date() <= cutoff_date:
                    # Historical request but cache doesn't extend to end_date
                    # Fetch missing portion
                    fetch_start_after = datetime.combine(latest_cached_date, datetime.min.time()) + timedelta(days=1)
                    ranges_to_fetch.append((fetch_start_after, end_date))
                    logger.debug(f"Need historical data after cache for {ticker}: {fetch_start_after.date()} to {end_date.date()}")
                elif end_date.date() <= yesterday:
                    # Requesting up to yesterday - fetch if not cached
                    fetch_start_after = datetime.combine(latest_cached_date, datetime.min.time()) + timedelta(days=1)
                    ranges_to_fetch.append((fetch_start_after, end_date))
                    logger.debug(f"Need data up to yesterday for {ticker}: {fetch_start_after.date()} to {end_date.date()}")
                elif latest_cached_date >= yesterday:
                    # Cache has yesterday's data, don't fetch today (market may not be closed)
                    logger.debug(f"Cache has recent data for {ticker} up to {latest_cached_date}, skipping today")
                else:
                    # Cache is older than yesterday, fetch up to yesterday (not today)
                    fetch_start_after = datetime.combine(latest_cached_date, datetime.min.time()) + timedelta(days=1)
                    fetch_end_recent = datetime.combine(yesterday, datetime.max.time())
                    ranges_to_fetch.append((fetch_start_after, fetch_end_recent))
                    logger.debug(f"Need recent data for {ticker}: {fetch_start_after.date()} to {fetch_end_recent.date()}")
            elif end_date.date() <= cutoff_date:
                # Cache fully covers the historical range
                logger.debug(f"Cache fully covers historical range for {ticker} ({len(cached_prices)} days)")
        else:
            # No cache - fetch entire range
            ranges_to_fetch.append((start_date, end_date))
            logger.debug(f"No cache for {ticker}, fetching full range")
        
        # If no ranges to fetch, return cached data
        if not ranges_to_fetch:
            # Store in in-memory cache before returning
            with PriceService._historical_cache_lock:
                # Enforce cache size limit
                if len(PriceService._historical_cache) >= PriceService._HISTORICAL_CACHE_MAX_SIZE:
                    first_key = next(iter(PriceService._historical_cache))
                    PriceService._historical_cache.pop(first_key)
                    logger.debug(f"Evicted cache entry: {first_key}")
                PriceService._historical_cache[cache_key] = cached_prices.copy()
            return cached_prices
        
        # Fetch missing data from API for each range
        for fetch_start, fetch_end in ranges_to_fetch:
            try:
                # Convert dates to Unix timestamps
                # Normalize naive datetimes to timezone-aware UTC to avoid local timezone interpretation
                fetch_start_utc = fetch_start.replace(tzinfo=timezone.utc) if fetch_start.tzinfo is None else fetch_start
                fetch_end_utc = fetch_end.replace(tzinfo=timezone.utc) if fetch_end.tzinfo is None else fetch_end
                period1 = int(fetch_start_utc.timestamp())
                period2 = int(fetch_end_utc.timestamp())
                
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
                
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
                
                params = {
                    'period1': period1,
                    'period2': period2,
                    'interval': '1d'
                }
                
                response = requests.get(url, headers=headers, params=params, timeout=10)
                response.raise_for_status()
                
                data = response.json()
                
                result = data.get('chart', {}).get('result', [])
                if not result:
                    continue
                
                # Extract timestamps and closing prices
                timestamps = result[0].get('timestamp', [])
                quotes = result[0].get('indicators', {}).get('quote', [{}])[0]
                closes = quotes.get('close', [])
                
                # Build dictionary mapping date strings to prices
                new_prices = {}
                for timestamp, close in zip(timestamps, closes):
                    if close is not None:
                        # Use UTC to avoid timezone-related date shifts
                        date_str = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime('%Y-%m-%d')
                        new_prices[date_str] = float(close)
                
                # Save new prices to persistent cache (only historical data, not today)
                if new_prices:
                    # Filter out today's data from permanent cache (it's still being traded)
                    historical_prices = {k: v for k, v in new_prices.items() 
                                       if datetime.strptime(k, '%Y-%m-%d').date() < today}
                    if historical_prices:
                        PriceService._save_historical_prices(ticker, historical_prices)
                        logger.debug(f"Cached {len(historical_prices)} historical prices for {ticker}")
                
                # Merge with cached prices
                cached_prices.update(new_prices)
                
            except Exception as e:
                logger.error(f"Error fetching historical prices for {ticker} ({fetch_start.date()} to {fetch_end.date()}): {e}", exc_info=True)
                # Continue with other ranges or return what we have
        
        # Store in in-memory cache
        with PriceService._historical_cache_lock:
            # Enforce cache size limit to prevent memory issues
            if len(PriceService._historical_cache) >= PriceService._HISTORICAL_CACHE_MAX_SIZE:
                # Remove first entry (FIFO eviction) - deterministic in Python 3.7+
                first_key = next(iter(PriceService._historical_cache))
                PriceService._historical_cache.pop(first_key)
                logger.debug(f"Evicted cache entry: {first_key}")
            PriceService._historical_cache[cache_key] = cached_prices.copy()
        
        return cached_prices
    
    @staticmethod
    def get_historical_usd_to_eur_rates(
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
        # Use get_historical_prices which has smart caching logic
        # This will cache EURUSD=X data and handle recent vs historical data properly
        eur_usd_rates = PriceService.get_historical_prices("EURUSD=X", start_date, end_date)
        
        # Convert to USD/EUR (how many EUR per USD)
        usd_eur_rates = {}
        for date_str, rate in eur_usd_rates.items():
            if rate and rate > 0:
                usd_eur_rates[date_str] = 1.0 / rate
        
        return usd_eur_rates
    
    @staticmethod
    def get_historical_prices_for_multiple_tickers(
        tickers: List[str], 
        start_date: datetime, 
        end_date: datetime,
        max_workers: int = 5
    ) -> Dict[str, Dict[str, float]]:
        """
        Fetch historical prices for multiple tickers in parallel
        
        Args:
            tickers: List of ticker symbols
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            max_workers: Maximum number of concurrent API requests (default: 5)
            
        Returns:
            Dictionary mapping ticker symbols to date-price dictionaries (only trading days)
        """
        if not tickers:
            return {}
        
        all_prices = {}
        
        # Use ThreadPoolExecutor for parallel requests
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all requests
            future_to_ticker = {
                executor.submit(
                    PriceService.get_historical_prices, 
                    ticker, 
                    start_date, 
                    end_date
                ): ticker 
                for ticker in tickers
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_ticker):
                ticker = future_to_ticker[future]
                try:
                    prices = future.result()
                    all_prices[ticker] = prices
                except Exception as e:
                    logger.error(f"Error fetching historical prices for {ticker}: {e}", exc_info=True)
                    all_prices[ticker] = {}
        
        return all_prices
