"""Tests for the circuit breaker module."""

import pytest

from app.services.prices.circuit_breaker import (
    STATE_CLOSED,
    STATE_HALF_OPEN,
    STATE_OPEN,
    CircuitBreaker,
    CircuitOpenError,
    call_with_breaker,
)


class FakeClock:
    """Manually-advanced monotonic clock for deterministic tests."""

    def __init__(self, now: float = 0.0):
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def _make_breaker(
    threshold: int = 3, timeout: float = 10.0
) -> tuple[CircuitBreaker, FakeClock]:
    clock = FakeClock()
    breaker = CircuitBreaker(
        failure_threshold=threshold, recovery_timeout=timeout, clock=clock
    )
    return breaker, clock


class TestCircuitBreakerStateTransitions:
    def test_starts_closed_and_acquires(self):
        breaker, _ = _make_breaker()
        assert breaker.state == STATE_CLOSED
        assert breaker.acquire() is True

    def test_failures_below_threshold_keep_circuit_closed(self):
        breaker, _ = _make_breaker(threshold=3)
        breaker.record_failure()
        breaker.record_failure()
        assert breaker.state == STATE_CLOSED
        assert breaker.acquire() is True

    def test_threshold_failures_open_circuit(self):
        breaker, _ = _make_breaker(threshold=3)
        for _ in range(3):
            breaker.record_failure()
        assert breaker.state == STATE_OPEN
        assert breaker.acquire() is False

    def test_success_resets_failure_counter(self):
        breaker, _ = _make_breaker(threshold=3)
        breaker.record_failure()
        breaker.record_failure()
        breaker.record_success()
        breaker.record_failure()
        breaker.record_failure()
        # Counter reset by success → only 2 consecutive, not 4.
        assert breaker.state == STATE_CLOSED

    def test_recovery_timeout_transitions_to_half_open(self):
        breaker, clock = _make_breaker(threshold=3, timeout=10.0)
        for _ in range(3):
            breaker.record_failure()
        assert breaker.state == STATE_OPEN

        clock.advance(11.0)
        assert breaker.state == STATE_HALF_OPEN

    def test_half_open_admits_one_probe_then_rejects(self):
        breaker, clock = _make_breaker(threshold=3, timeout=10.0)
        for _ in range(3):
            breaker.record_failure()
        clock.advance(11.0)

        # First acquire is the probe — admitted.
        assert breaker.acquire() is True
        # Concurrent callers get rejected until the probe resolves.
        assert breaker.acquire() is False

    def test_half_open_probe_success_closes_circuit(self):
        breaker, clock = _make_breaker(threshold=3, timeout=10.0)
        for _ in range(3):
            breaker.record_failure()
        clock.advance(11.0)
        assert breaker.acquire() is True
        breaker.record_success()
        assert breaker.state == STATE_CLOSED
        # Subsequent calls flow normally.
        assert breaker.acquire() is True

    def test_half_open_probe_failure_re_opens(self):
        breaker, clock = _make_breaker(threshold=3, timeout=10.0)
        for _ in range(3):
            breaker.record_failure()
        clock.advance(11.0)
        assert breaker.acquire() is True

        breaker.record_failure()
        # Cooldown re-armed from now.
        assert breaker.state == STATE_OPEN
        clock.advance(5.0)
        assert breaker.state == STATE_OPEN
        clock.advance(6.0)
        assert breaker.state == STATE_HALF_OPEN


class TestCallWithBreaker:
    def test_passes_through_when_closed(self):
        breaker, _ = _make_breaker()
        result = call_with_breaker(breaker, lambda: "ok")
        assert result == "ok"
        assert breaker.state == STATE_CLOSED

    def test_raises_circuit_open_error_when_open(self):
        breaker, _ = _make_breaker(threshold=2)
        for _ in range(2):
            breaker.record_failure()

        def _should_not_run():
            raise AssertionError("fn should not be invoked when breaker is open")

        with pytest.raises(CircuitOpenError):
            call_with_breaker(breaker, _should_not_run)

    def test_transient_failure_increments_counter(self):
        breaker, _ = _make_breaker(threshold=2)

        def _fail():
            raise RuntimeError("network blip")

        for _ in range(2):
            with pytest.raises(RuntimeError):
                call_with_breaker(breaker, _fail)

        assert breaker.state == STATE_OPEN

    def test_permanent_failure_does_not_trip(self):
        breaker, _ = _make_breaker(threshold=2)

        def _fail():
            raise ValueError("permanent — caller error")

        is_transient = lambda exc: isinstance(exc, RuntimeError)  # noqa: E731

        for _ in range(5):
            with pytest.raises(ValueError):
                call_with_breaker(breaker, _fail, is_transient=is_transient)

        # Even after 5 ValueErrors, breaker stays closed because they are
        # not classified as transient.
        assert breaker.state == STATE_CLOSED

    def test_success_after_failures_keeps_closed(self):
        breaker, _ = _make_breaker(threshold=3)

        def _fail():
            raise RuntimeError("blip")

        for _ in range(2):
            with pytest.raises(RuntimeError):
                call_with_breaker(breaker, _fail)
        # One success — counter resets.
        call_with_breaker(breaker, lambda: "ok")
        # Two more failures, would have tripped had counter not reset.
        for _ in range(2):
            with pytest.raises(RuntimeError):
                call_with_breaker(breaker, _fail)

        assert breaker.state == STATE_CLOSED


class TestConstructorValidation:
    def test_rejects_zero_threshold(self):
        with pytest.raises(ValueError, match="failure_threshold"):
            CircuitBreaker(failure_threshold=0)

    def test_rejects_negative_recovery_timeout(self):
        with pytest.raises(ValueError, match="recovery_timeout"):
            CircuitBreaker(recovery_timeout=-1.0)
