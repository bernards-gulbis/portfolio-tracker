"""
Service for fetching current stock prices
"""
import logging
from typing import Dict, Optional
import requests
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)


class PriceService:
    """Service for fetching current stock prices from Yahoo Finance"""
    
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
        Fetch current price for a single ticker from Yahoo Finance API
        
        Args:
            ticker: Ticker symbol
            
        Returns:
            Current price or None if not found
        """
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
                    return float(current_price)
            
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
