"""Live (current) stock-price service.

In-memory TTL cache (``PRICE_CACHE_TTL_SECONDS``) shared across all
threads, guarded by a single lock. ``get_last_known_price[_with_date]``
read straight from the ``HistoricalPrice`` table for fallback when the
live fetch returns nothing.
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import ClassVar

import requests
from sqlmodel import Session, select

from app.core.config import PRICE_CACHE_TTL_SECONDS
from app.core.database import engine
from app.models.historical_price import HistoricalPrice

from .yahoo_finance_client import YahooFinanceClient

logger = logging.getLogger(__name__)


class LivePriceService:
    """Current-price quotes from Yahoo Finance with TTL cache."""

    _price_cache: ClassVar[dict[str, tuple[float | None, datetime]]] = {}
    _cache_ttl: timedelta = timedelta(seconds=PRICE_CACHE_TTL_SECONDS)
    _cache_lock = Lock()

    @classmethod
    def clear_cache(cls) -> None:
        """Clear the in-memory price cache. Used by tests."""
        with cls._cache_lock:
            cls._price_cache.clear()

    @classmethod
    def get_current_prices(
        cls, tickers: list[str], max_workers: int = 3
    ) -> dict[str, float | None]:
        """Fetch current prices for a list of tickers in parallel."""
        if not tickers:
            return {}

        prices: dict[str, float | None] = {}

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_ticker = {
                executor.submit(cls.get_current_price, ticker): ticker
                for ticker in tickers
            }

            for future in as_completed(future_to_ticker):
                ticker = future_to_ticker[future]
                try:
                    prices[ticker] = future.result()
                except Exception as e:
                    logger.error(
                        "Error fetching price for %s: %s", ticker, e, exc_info=True
                    )
                    prices[ticker] = None

        return prices

    @classmethod
    def get_current_price(cls, ticker: str) -> float | None:
        """Fetch the current price for a single ticker, with TTL cache.

        Returns ``None`` on permanent failure (4xx, parse error) or after
        retry-exhaustion on the underlying HTTP client.
        """
        now = datetime.now(UTC)
        with cls._cache_lock:
            if ticker in cls._price_cache:
                cached_price, cached_time = cls._price_cache[ticker]
                if now - cached_time < cls._cache_ttl:
                    logger.debug("Cache hit for %s: %s", ticker, cached_price)
                    return cached_price

        try:
            response = YahooFinanceClient.fetch_chart(
                ticker, {"interval": "1d", "range": "1d"}
            )
            data = response.json()
            result = data.get("chart", {}).get("result", [])
            fetched_price: float | None = None
            if result:
                meta = result[0].get("meta", {})
                current_price = meta.get("regularMarketPrice")
                if current_price is not None:
                    fetched_price = float(current_price)

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
    def get_last_known_price(
        cls, ticker: str, session: Session | None = None
    ) -> float | None:
        """Return the most recent cached price for a ticker, or None."""
        result = cls.get_last_known_price_with_date(ticker, session)
        return result[0] if result is not None else None

    @classmethod
    def get_last_known_price_with_date(
        cls, ticker: str, session: Session | None = None
    ) -> tuple[float, str] | None:
        """Return ``(price, date_str YYYY-MM-DD)`` for the most recent
        cached price, or ``None``.
        """

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
