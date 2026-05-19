"""Live (current) stock-price service.

In-memory TTL cache (``PRICE_CACHE_TTL_SECONDS``) shared across all
threads, guarded by a single lock. ``get_last_known_price[_with_date]``
read straight from the ``HistoricalPrice`` table for fallback when the
live fetch returns nothing.

Concurrent callers asking for the same ticker share a single in-flight
fetch via a per-ticker ``Future`` registry — without it, N concurrent
status requests for the same portfolio would fan out N identical Yahoo
requests during the cache-miss window.
"""

import logging
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import ClassVar, NamedTuple

import requests
from sqlalchemy import and_, func
from sqlmodel import Session, select

from app.core.config import PRICE_CACHE_TTL_SECONDS
from app.core.database import engine
from app.models.historical_price import HistoricalPrice

from .yahoo_finance_client import YahooFinanceClient

logger = logging.getLogger(__name__)


class Quote(NamedTuple):
    """Live quote: current price plus prior trading day's close.

    ``previous_close`` powers the day-over-day change shown in the UI; it is
    ``None`` whenever Yahoo's response omits ``chartPreviousClose`` (e.g.
    for tickers that just started trading or for the ``last_known`` fallback
    path where we read a stale historical row and have no notion of yesterday).
    """

    price: float | None
    previous_close: float | None


class LivePriceService:
    """Current-price quotes from Yahoo Finance with TTL cache."""

    _price_cache: ClassVar[dict[str, tuple[Quote, datetime]]] = {}
    _cache_ttl: timedelta = timedelta(seconds=PRICE_CACHE_TTL_SECONDS)
    _cache_lock = Lock()
    # Single-flight registry: per-ticker Future shared across concurrent
    # cache-missers. The first caller registers a Future and runs the fetch;
    # waiters await the same Future and read the resulting cache entry.
    _in_flight: ClassVar[dict[str, "Future[Quote]"]] = {}
    _in_flight_lock = Lock()

    @classmethod
    def clear_cache(cls) -> None:
        """Clear the in-memory price cache. Used by tests."""
        with cls._cache_lock:
            cls._price_cache.clear()
        with cls._in_flight_lock:
            cls._in_flight.clear()

    @classmethod
    def get_current_prices(
        cls, tickers: list[str], max_workers: int = 3
    ) -> dict[str, float | None]:
        """Fetch current prices for a list of tickers in parallel.

        Convenience wrapper around :meth:`get_current_quotes` for callers
        that only need the price scalar. Day-change consumers should call
        :meth:`get_current_quotes` directly to avoid losing previous-close.
        """
        return {
            t: q.price for t, q in cls.get_current_quotes(tickers, max_workers).items()
        }

    @classmethod
    def get_current_quotes(
        cls, tickers: list[str], max_workers: int = 3
    ) -> dict[str, Quote]:
        """Fetch full quotes (price + previous close) in parallel."""
        if not tickers:
            return {}

        quotes: dict[str, Quote] = {}

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_ticker = {
                executor.submit(cls.get_current_quote, ticker): ticker
                for ticker in tickers
            }

            for future in as_completed(future_to_ticker):
                ticker = future_to_ticker[future]
                try:
                    quotes[ticker] = future.result()
                except Exception as e:
                    logger.exception("Error fetching quote for %s: %s", ticker, e)
                    quotes[ticker] = Quote(price=None, previous_close=None)

        return quotes

    @classmethod
    def get_current_price(cls, ticker: str) -> float | None:
        """Fetch the current price for a single ticker, with TTL cache.

        Convenience wrapper around :meth:`get_current_quote` that returns
        only the price scalar. Returns ``None`` on permanent failure.
        """
        return cls.get_current_quote(ticker).price

    @classmethod
    def get_current_quote(cls, ticker: str) -> Quote:
        """Fetch the full quote (price + previous close) for a ticker.

        Returns ``Quote(None, None)`` on permanent failure (4xx, parse error)
        or after retry-exhaustion on the underlying HTTP client. Concurrent
        callers for the same ticker share one fetch via the in-flight registry.
        """
        now = datetime.now(UTC)
        with cls._cache_lock:
            if ticker in cls._price_cache:
                cached_quote, cached_time = cls._price_cache[ticker]
                if now - cached_time < cls._cache_ttl:
                    logger.debug("Cache hit for %s: %s", ticker, cached_quote)
                    return cached_quote

        # Cache miss — register or join an in-flight fetch.
        own_fetch = False
        with cls._in_flight_lock:
            existing = cls._in_flight.get(ticker)
            if existing is not None:
                fetch_future = existing
            else:
                fetch_future = Future()
                cls._in_flight[ticker] = fetch_future
                own_fetch = True

        if not own_fetch:
            # Another thread is already fetching this ticker. Wait on its
            # Future — the result is identical to what we would have fetched.
            try:
                return fetch_future.result()
            except Exception:
                return Quote(price=None, previous_close=None)

        try:
            fetched_quote = cls._fetch_from_yahoo(ticker)
            with cls._cache_lock:
                existing_entry = cls._price_cache.get(ticker)
                if (
                    existing_entry is None
                    or (now - existing_entry[1]) >= cls._cache_ttl
                ):
                    cls._price_cache[ticker] = (fetched_quote, now)
            fetch_future.set_result(fetched_quote)
            return fetched_quote
        finally:
            with cls._in_flight_lock:
                cls._in_flight.pop(ticker, None)

    @classmethod
    def _fetch_from_yahoo(cls, ticker: str) -> Quote:
        """Inner fetch — error-swallowing to match the existing public
        contract (``Quote(None, None)`` on any failure).

        Uses ``meta.chartPreviousClose`` from the same Yahoo chart payload
        that supplies the live price, so day-change is free of extra HTTP.
        """
        try:
            response = YahooFinanceClient.fetch_chart(
                ticker, {"interval": "1d", "range": "1d"}
            )
            data = response.json()
            result = data.get("chart", {}).get("result", [])
            if result:
                meta = result[0].get("meta", {})
                current_price = meta.get("regularMarketPrice")
                previous_close = meta.get("chartPreviousClose")
                price_value = (
                    float(current_price) if current_price is not None else None
                )
                prev_value = (
                    float(previous_close)
                    if previous_close is not None and previous_close > 0
                    else None
                )
                return Quote(price=price_value, previous_close=prev_value)
            return Quote(price=None, previous_close=None)
        except requests.exceptions.RequestException as e:
            logger.warning("Network error fetching price for %s: %s", ticker, e)
            return Quote(price=None, previous_close=None)
        except (KeyError, ValueError, IndexError) as e:
            logger.warning("Error parsing price data for %s: %s", ticker, e)
            return Quote(price=None, previous_close=None)
        except Exception as e:
            logger.exception(
                "Unexpected error fetching price for %s: %s",
                ticker,
                e,
            )
            return Quote(price=None, previous_close=None)

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

    @classmethod
    def get_last_known_prices_batch(
        cls, tickers: list[str], session: Session | None = None
    ) -> dict[str, tuple[float, str] | None]:
        """Batch variant of ``get_last_known_price_with_date``.

        Returns a dict keyed by every requested ticker mapping to either
        ``(price, date_str)`` for the most recent cached row or ``None``
        when no row exists. Single SQL roundtrip — used by the live-prices
        router so N missing tickers don't fan out into N event-loop blocks.
        """
        if not tickers:
            return {}

        def _query(s: Session) -> dict[str, tuple[float, str] | None]:
            result: dict[str, tuple[float, str] | None] = dict.fromkeys(tickers)
            # GROUP BY ticker → MAX(date) gives the latest-row coordinate per
            # ticker; INNER JOIN back to HistoricalPrice picks up its price.
            latest_per_ticker = (
                select(
                    HistoricalPrice.ticker.label("ticker"),
                    func.max(HistoricalPrice.date).label("max_date"),
                )
                .where(HistoricalPrice.ticker.in_(tickers))
                .group_by(HistoricalPrice.ticker)
                .subquery()
            )
            statement = select(HistoricalPrice).join(
                latest_per_ticker,
                and_(
                    HistoricalPrice.ticker == latest_per_ticker.c.ticker,
                    HistoricalPrice.date == latest_per_ticker.c.max_date,
                ),
            )
            for row in s.exec(statement).all():
                result[row.ticker] = (float(row.price), row.date)
            return result

        if session is not None:
            return _query(session)
        with Session(engine) as s:
            return _query(s)
