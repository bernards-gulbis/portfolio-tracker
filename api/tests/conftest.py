"""Shared pytest configuration for test suite."""

import pytest

from app.core.rate_limit import reset_for_tests


@pytest.fixture(params=["asyncio"])
def anyio_backend(request):
    """Restrict anyio tests to asyncio only (trio is not installed)."""
    return request.param


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Wipe rate-limit state between tests so accumulated hits from earlier
    tests don't trip the limit in unrelated cases. The limiter is a process
    singleton; without this the order of tests would matter.
    """
    reset_for_tests()
    yield
