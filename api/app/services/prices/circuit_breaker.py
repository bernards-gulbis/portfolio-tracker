"""Thread-safe consecutive-failure circuit breaker for outbound HTTP calls.

Wraps a remote dependency (Yahoo Finance, in our case) so transient outages
fail fast instead of burning the thread pool with retries × every ticker.

States
------
* **CLOSED** — normal operation; calls pass through.
* **OPEN**   — recent consecutive failures crossed ``failure_threshold``;
  ``acquire()`` returns ``False`` until ``recovery_timeout`` seconds elapse.
* **HALF_OPEN** — cooldown elapsed; one probe call is allowed through. If it
  succeeds the breaker closes; if it fails the cooldown re-arms.

Only *transient* failures count toward the threshold. Permanent client errors
(404, 400) reach the breaker as successes — Yahoo is reachable, the call just
asked for something invalid. The caller decides which exceptions are
transient via :func:`call_with_breaker`'s ``is_transient`` predicate.
"""

import logging
import time
from collections.abc import Callable
from enum import StrEnum
from threading import Lock

logger = logging.getLogger(__name__)


class CircuitState(StrEnum):
    """Circuit breaker state. ``StrEnum`` so equality against the raw values
    (``"closed"`` / ``"open"`` / ``"half_open"``) still works."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(RuntimeError):
    """Raised when a call is rejected because the circuit is open."""


class CircuitBreaker:
    """Consecutive-failure circuit breaker.

    Thread-safe. Defaults are tuned for a public price feed: trip after 5
    consecutive transient failures and stay open for 30s before probing.
    """

    def __init__(
        self,
        *,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if failure_threshold < 1:
            raise ValueError("failure_threshold must be >= 1")
        if recovery_timeout < 0:
            raise ValueError("recovery_timeout must be >= 0")
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._clock = clock
        self._lock = Lock()
        self._consecutive_failures = 0
        self._opened_at: float | None = None
        self._half_open_in_flight = False

    @property
    def state(self) -> CircuitState:
        with self._lock:
            return self._state_locked()

    def _state_locked(self) -> CircuitState:
        if self._opened_at is None:
            return CircuitState.CLOSED
        if self._clock() - self._opened_at < self._recovery_timeout:
            return CircuitState.OPEN
        return CircuitState.HALF_OPEN

    def acquire(self) -> bool:
        """Return ``True`` if a call may proceed, ``False`` if rejected.

        In HALF_OPEN state only one probe is admitted; concurrent callers
        get ``False`` until the probe resolves.
        """
        with self._lock:
            state = self._state_locked()
            if state == CircuitState.OPEN:
                return False
            if state == CircuitState.HALF_OPEN:
                if self._half_open_in_flight:
                    return False
                self._half_open_in_flight = True
            return True

    def record_success(self) -> None:
        """Mark a call as succeeded. Resets the failure counter and closes
        the breaker if it was tripped."""
        with self._lock:
            was_open = self._opened_at is not None
            self._consecutive_failures = 0
            self._opened_at = None
            self._half_open_in_flight = False
            if was_open:
                logger.info("Circuit breaker closed after successful probe")

    def record_failure(self) -> None:
        """Mark a call as failed. Re-opens the breaker if a HALF_OPEN probe
        failed, or trips it if the threshold is now reached."""
        with self._lock:
            self._consecutive_failures += 1
            if self._half_open_in_flight:
                self._opened_at = self._clock()
                self._half_open_in_flight = False
                logger.warning("Circuit breaker re-opened after probe failed")
                return
            if (
                self._opened_at is None
                and self._consecutive_failures >= self._failure_threshold
            ):
                self._opened_at = self._clock()
                logger.warning(
                    "Circuit breaker opened after %d consecutive failures",
                    self._consecutive_failures,
                )

    def is_open(self) -> bool:
        """Whether calls are currently being rejected (OPEN state)."""
        return self.state == CircuitState.OPEN


def call_with_breaker[T](
    breaker: CircuitBreaker,
    fn: Callable[[], T],
    *,
    is_transient: Callable[[Exception], bool] = lambda _e: True,
) -> T:
    """Execute ``fn`` under breaker protection.

    Raises :class:`CircuitOpenError` if the breaker rejects the call.
    Otherwise runs ``fn``: a return value records a success; an exception
    records a success or failure depending on ``is_transient(exc)``.
    Permanent (non-transient) errors propagate without tripping the breaker.
    """
    if not breaker.acquire():
        raise CircuitOpenError("circuit breaker is open")
    try:
        result = fn()
    except Exception as exc:
        if is_transient(exc):
            breaker.record_failure()
        else:
            breaker.record_success()
        raise
    breaker.record_success()
    return result
