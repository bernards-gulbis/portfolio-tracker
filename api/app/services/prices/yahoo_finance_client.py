"""Yahoo Finance HTTP client with retry/backoff and circuit breaker.

Owns all outgoing traffic to ``query1.finance.yahoo.com`` and the
process-wide concurrency limit.

Retry policy
------------
* Up to 3 attempts (1 initial + 2 retries).
* Exponential backoff between attempts: 1s, then 2s.
* Retries on ``RequestException`` (network/timeout), 5xx responses,
  and transient 4xx codes (408 Request Timeout, 429 Too Many Requests).
* Other 4xx responses are permanent (unknown ticker, bad date range)
  and surface immediately as ``HTTPError`` without retrying.

Concurrency
-----------
A class-level ``Semaphore(5)`` caps concurrent outgoing requests. The
semaphore is held for the duration of an entire ``fetch_chart`` call,
including backoff sleeps. This prevents thread-fan-out under contention
at the cost of a small throughput hit when one slot is mid-retry.

Circuit breaker
---------------
A process-wide :class:`CircuitBreaker` wraps the call. After
``failure_threshold`` consecutive transient failures (network error,
5xx, 408, 429) the breaker opens and ``fetch_chart`` raises
:class:`CircuitOpenError` for ``recovery_timeout`` seconds before
allowing a single probe. Permanent 4xx errors (404, 400) — which mean
"Yahoo is reachable but you asked for nothing" — do not count toward the
trip threshold. This stops a Yahoo outage from cascading into ~3 retries
× 50 tickers of pointless backoff sleep.
"""

import logging
import time
from threading import Semaphore
from typing import Any, ClassVar

import requests

from .circuit_breaker import (
    CircuitBreaker,
    CircuitOpenError,
    call_with_breaker,
)

logger = logging.getLogger(__name__)


def _is_transient_yahoo_failure(exc: BaseException) -> bool:
    """Treat network errors and Yahoo-side 5xx/transient-4xx as transient.

    Permanent 4xx (404 unknown ticker, 400 bad request) are caller errors
    and don't reflect Yahoo's health, so they don't trip the breaker.
    """
    if isinstance(exc, requests.exceptions.HTTPError):
        resp = exc.response
        if resp is None:
            return True
        status = resp.status_code
        return status >= 500 or status in YahooFinanceClient._TRANSIENT_4XX
    return isinstance(exc, requests.exceptions.RequestException)


class YahooFinanceClient:
    _BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart"
    _HEADERS: ClassVar[dict[str, str]] = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    _TIMEOUT_SECONDS = 10
    _MAX_ATTEMPTS = 3
    _BACKOFF_BASE_SECONDS = 1.0
    _TRANSIENT_4XX = frozenset({408, 429})

    _semaphore = Semaphore(5)
    _breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=30.0)

    @classmethod
    def fetch_chart(cls, ticker: str, params: dict[str, Any]) -> requests.Response:
        """Fetch from ``/v8/finance/chart/{ticker}`` with retry/backoff.

        Returns the raw ``Response`` on 2xx. Raises ``HTTPError`` on
        non-transient 4xx without retrying. Retries on 5xx, 408, 429,
        and ``RequestException``; raises the last error after exhausting
        attempts. Raises :class:`CircuitOpenError` immediately when the
        circuit breaker is open.
        """
        return call_with_breaker(
            cls._breaker,
            lambda: cls._fetch_chart_impl(ticker, params),
            is_transient=_is_transient_yahoo_failure,
        )

    @classmethod
    def _fetch_chart_impl(
        cls, ticker: str, params: dict[str, Any]
    ) -> requests.Response:
        """Inner retry loop without circuit-breaker wrapping. Used by
        :meth:`fetch_chart` and exposed for tests that need to bypass the
        breaker."""
        url = f"{cls._BASE_URL}/{ticker}"
        last_exc: BaseException | None = None

        with cls._semaphore:
            for attempt in range(cls._MAX_ATTEMPTS):
                try:
                    resp = requests.get(
                        url,
                        headers=cls._HEADERS,
                        params=params,
                        timeout=cls._TIMEOUT_SECONDS,
                    )
                    if (
                        400 <= resp.status_code < 500
                        and resp.status_code not in cls._TRANSIENT_4XX
                    ):
                        # Permanent client error — release the connection
                        # before surfacing the error so we don't pin it
                        # to the pool until GC.
                        try:
                            resp.raise_for_status()
                        finally:
                            resp.close()
                    if (
                        resp.status_code >= 500
                        or resp.status_code in cls._TRANSIENT_4XX
                    ):
                        last_exc = requests.exceptions.HTTPError(
                            f"HTTP {resp.status_code}", response=resp
                        )
                        logger.warning(
                            "Yahoo error for %s (attempt %d/%d): HTTP %s %s",
                            ticker,
                            attempt + 1,
                            cls._MAX_ATTEMPTS,
                            resp.status_code,
                            resp.reason,
                        )
                        # Release the connection — we won't read the body
                        # before retrying, and leaving it hanging would
                        # exhaust the pool under repeated retry storms.
                        resp.close()
                        cls._sleep_before_retry(attempt)
                        continue
                    resp.raise_for_status()
                    return resp
                except requests.exceptions.HTTPError:
                    raise
                except requests.exceptions.RequestException as e:
                    last_exc = e
                    logger.warning(
                        "Yahoo network error for %s (attempt %d/%d): %s",
                        ticker,
                        attempt + 1,
                        cls._MAX_ATTEMPTS,
                        e,
                    )
                    cls._sleep_before_retry(attempt)
                    continue

        assert last_exc is not None
        raise last_exc

    @classmethod
    def is_circuit_open(cls) -> bool:
        """Whether the breaker is currently rejecting calls."""
        return cls._breaker.is_open()

    @classmethod
    def reset_circuit(cls) -> None:
        """Force the breaker back to CLOSED. Used by tests."""
        cls._breaker.record_success()

    @classmethod
    def _sleep_before_retry(cls, attempt: int) -> None:
        if attempt < cls._MAX_ATTEMPTS - 1:
            time.sleep(cls._BACKOFF_BASE_SECONDS * (2**attempt))


__all__ = ["CircuitOpenError", "YahooFinanceClient"]
