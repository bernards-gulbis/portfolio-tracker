"""Lightweight in-memory IP+path rate limiter for auth endpoints.

Sliding-window counter: a deque of monotonic timestamps per (IP, path) bucket.
Each request drops entries older than the window and rejects if the bucket is
already at capacity.

In-memory means single-process only — multiple uvicorn workers would each
have their own counter, weakening the gate. Acceptable while we deploy as a
single process; if we move to multi-worker, swap this for a Redis-backed
implementation (or migrate to ``slowapi`` with a Redis backend).
"""

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Depends, HTTPException, Request


class RateLimiter:
    """Sliding-window rate limiter keyed by an arbitrary string."""

    def __init__(self):
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """Return ``True`` and record the hit if the bucket has capacity, else ``False``."""
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._buckets[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= max_requests:
                return False
            bucket.append(now)
            return True

    def reset(self) -> None:
        """Clear all buckets. Used by tests; do not call from request handlers."""
        with self._lock:
            self._buckets.clear()


# Module-level singleton — one limiter per process.
_LIMITER = RateLimiter()


def _client_ip(request: Request) -> str:
    """Best-effort client IP. Honors ``X-Forwarded-For`` (assumes a trusted
    proxy is the only source — change if running behind an untrusted proxy).
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(max_requests: int, window_seconds: int):
    """Build a FastAPI dependency that throttles per (IP, path).

    Use as a router-level dependency::

        app.include_router(
            ...,
            dependencies=[rate_limit(5, 60)],  # 5 requests per minute
        )
    """

    async def dep(request: Request):
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
