"""Tests for the in-memory rate limiter and its integration with auth routes."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.rate_limit import RateLimiter, _client_ip, reset_for_tests
from main import app


class TestRateLimiterUnit:
    def test_first_request_allowed(self):
        limiter = RateLimiter()
        assert limiter.check("k", 3, 60) is True

    def test_blocks_at_capacity(self):
        limiter = RateLimiter()
        for _ in range(3):
            assert limiter.check("k", 3, 60) is True
        assert limiter.check("k", 3, 60) is False

    def test_keys_are_independent(self):
        limiter = RateLimiter()
        for _ in range(3):
            limiter.check("a", 3, 60)
        # Hitting capacity on "a" must not affect "b"
        assert limiter.check("b", 3, 60) is True

    def test_window_slides(self):
        limiter = RateLimiter()
        with patch("app.core.rate_limit.time.monotonic") as mock_time:
            mock_time.return_value = 1000.0
            for _ in range(3):
                limiter.check("k", 3, 60)
            assert limiter.check("k", 3, 60) is False

            # Advance past the window — old entries drop, capacity restored.
            mock_time.return_value = 1000.0 + 61
            assert limiter.check("k", 3, 60) is True

    def test_reset_clears_buckets(self):
        limiter = RateLimiter()
        for _ in range(5):
            limiter.check("k", 3, 60)
        limiter.reset()
        assert limiter.check("k", 3, 60) is True


class TestClientIp:
    def test_uses_x_forwarded_for_first_value(self):
        request = type(
            "R",
            (),
            {
                "headers": {"x-forwarded-for": "10.0.0.1, 10.0.0.2"},
                "client": type("C", (), {"host": "127.0.0.1"})(),
            },
        )()
        assert _client_ip(request) == "10.0.0.1"

    def test_falls_back_to_client_host(self):
        request = type(
            "R",
            (),
            {"headers": {}, "client": type("C", (), {"host": "192.168.1.1"})()},
        )()
        assert _client_ip(request) == "192.168.1.1"

    def test_unknown_when_no_client(self):
        request = type("R", (), {"headers": {}, "client": None})()
        assert _client_ip(request) == "unknown"


class TestAuthEndpointRateLimit:
    """End-to-end: hitting /auth/register too many times returns 429.

    The register endpoint has a 3/60s limit, so the 4th request from the same
    client (TestClient defaults to ``testclient`` as the IP) is blocked.
    """

    def setup_method(self):
        reset_for_tests()

    @pytest.mark.parametrize("attempts", [3])
    def test_under_limit_allowed(self, attempts):
        client = TestClient(app)
        # Use distinct emails so each request is a fresh signup attempt; we're
        # asserting the rate limiter does NOT trigger, not that registration
        # succeeds (the test DB may reject the body — we only check status != 429).
        for i in range(attempts):
            resp = client.post(
                "/auth/register",
                json={"email": f"rl_under_{i}@x.com", "password": "Password123!"},
            )
            assert resp.status_code != 429, (
                f"request {i + 1} unexpectedly rate-limited: {resp.text}"
            )

    def test_fourth_request_returns_429(self):
        client = TestClient(app)
        for i in range(3):
            client.post(
                "/auth/register",
                json={"email": f"rl_burst_{i}@x.com", "password": "Password123!"},
            )

        resp = client.post(
            "/auth/register",
            json={"email": "rl_burst_4@x.com", "password": "Password123!"},
        )
        assert resp.status_code == 429
        assert "Too many requests" in resp.json()["detail"]
        assert resp.headers["retry-after"] == "60"

    def test_reset_releases_capacity(self):
        client = TestClient(app)
        for i in range(3):
            client.post(
                "/auth/register",
                json={"email": f"rl_reset_{i}@x.com", "password": "Password123!"},
            )
        # Reset state — like the window expiring — and confirm requests flow again.
        reset_for_tests()
        resp = client.post(
            "/auth/register",
            json={"email": "rl_reset_after@x.com", "password": "Password123!"},
        )
        assert resp.status_code != 429


def test_rate_limit_does_not_block_unrelated_paths():
    """The login bucket and the register bucket are independent (per-path keying)."""
    reset_for_tests()
    client = TestClient(app)

    # Burn the register limit (3/60).
    for i in range(4):
        client.post(
            "/auth/register",
            json={"email": f"rl_iso_{i}@x.com", "password": "Password123!"},
        )

    # /auth/cookie/login is a different path → fresh bucket.
    resp = client.post(
        "/auth/cookie/login",
        data={"username": "rl_iso_0@x.com", "password": "Password123!"},
    )
    assert resp.status_code != 429
