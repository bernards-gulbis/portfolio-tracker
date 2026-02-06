"""
Service for fetching current stock prices
"""
import logging
from typing import Dict, Optional, Tuple
import requests
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

logger = logging.getLogger(__name__)


class PriceService:
    """Service for fetching current stock prices from Yahoo Finance"""
    
    # Class-level cache: ticker -> (price, timestamp)
    _price_cache: Dict[str, Tuple[Optional[float], datetime]] = {}
    _cache_ttl: timedelta = timedelta(minutes=15)
    _cache_lock = Lock()  # Thread-safe cache access
    
    @staticmethod
    def get_current_prices(tickers: list[str], max_workers: int = 5) -> Dict[str, Optional[float]]:
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
        # Check cache first (thread-safe)
        now = datetime.now()
        with PriceService._cache_lock:
            if ticker in PriceService._price_cache:
                cached_price, cached_time = PriceService._price_cache[ticker]
                if now - cached_time < PriceService._cache_ttl:
                    logger.debug(f"Cache hit for {ticker}: {cached_price}")
                    return cached_price
        
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
