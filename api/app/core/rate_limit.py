"""Lightweight in-memory IP+path rate limiter for auth endpoints.

Sliding-window counter: a deque of monotonic timestamps per (IP, path) bucket.
Each request drops entries older than the window and rejects if the bucket is
already at capacity.

In-memory means single-process only — multiple uvicorn workers would each
have their own counter, weakening the gate. Acceptable while we deploy as a
single process; if we move to multi-worker, swap this for a Redis-backed
implementation (or migrate to ``slowapi`` with a Redis backend).
"""

import logging
import os
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Depends, HTTPException, Request

# Set DISABLE_RATE_LIMIT=true in the API env to bypass limits (e.g. for e2e tests).
_RATE_LIMIT_DISABLED = os.getenv("DISABLE_RATE_LIMIT", "").lower() == "true"

logger = logging.getLogger(__name__)


class RateLimiter:
    """Sliding-window rate limiter keyed by an arbitrary string."""

    # Run a global expiry sweep every N successful ``check`` calls. Without
    # this, ``_buckets`` grows unbounded as new (IP, path) pairs are seen —
    # only the *accessed* key is trimmed on each call, so idle keys leak.
    _SWEEP_EVERY = 256

    def __init__(self):
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()
        self._sweep_counter = 0

    def check(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """Return ``True`` and record the hit if the bucket has capacity, else ``False``."""
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            self._sweep_counter += 1
            if self._sweep_counter >= self._SWEEP_EVERY:
                self._sweep_counter = 0
                self._sweep_locked(cutoff)
            bucket = self._buckets[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= max_requests:
                return False
            bucket.append(now)
            return True

    def _sweep_locked(self, cutoff: float) -> None:
        """Drop expired timestamps from every bucket and remove empty deques.

        Caller MUST already hold ``self._lock``. The ``cutoff`` is the current
        keyed window's cutoff — sufficient to shed timestamps idle longer than
        any window the limiter is asked about; any still-live entries on other
        keys will simply be re-added on their next request.
        """
        for k in list(self._buckets.keys()):
            b = self._buckets[k]
            while b and b[0] < cutoff:
                b.popleft()
            if not b:
                del self._buckets[k]

    def reset(self) -> None:
        """Clear all buckets. Used by tests; do not call from request handlers."""
        with self._lock:
            self._buckets.clear()


# Module-level singleton — one limiter per process.
_LIMITER = RateLimiter()


def _client_ip(request: Request) -> str:
    """Best-effort client IP keyed solely on the immediate peer.

    ``X-Forwarded-For`` is intentionally ignored: without a vetted
    trusted-proxy list, an attacker can spoof the header to evade per-IP
    rate limiting. If we ever deploy behind a known proxy, parse XFF only
    when ``request.client.host`` matches a configured trusted-proxy set.
    """
    if request.client:
        return request.client.host
    logger.debug(
        "No client IP available, falling back to 'unknown' (method=%s, url=%s)",
        getattr(request, "method", "?"),
        getattr(request, "url", "?"),
    )
    return "unknown"


def rate_limit(max_requests: int, window_seconds: int):
    """Build a FastAPI dependency that throttles per (IP, path).

    Use as a router-level dependency::

        app.include_router(
            ...,
            dependencies=[rate_limit(5, 60)],  # 5 requests per minute
        )

    Set env var DISABLE_RATE_LIMIT=true to bypass all limits (e.g. in e2e tests).
    """
    if max_requests <= 0 or window_seconds <= 0:
        raise ValueError(
            "rate_limit requires positive integers, got "
            f"max_requests={max_requests}, window_seconds={window_seconds}"
        )

    def dep(request: Request):
        if _RATE_LIMIT_DISABLED:
            return
        key = f"{_client_ip(request)}:{request.url.path}"
        if not _LIMITER.check(key, max_requests, window_seconds):
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(window_seconds)},
            )

    return Depends(dep)


def reset_for_tests() -> None:
    """Wipe all rate-limit state. Test fixtures call this to keep cases independent."""
    _LIMITER.reset()
