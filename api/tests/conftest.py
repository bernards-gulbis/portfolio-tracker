"""Shared pytest configuration for test suite."""

import pytest


@pytest.fixture(params=["asyncio"])
def anyio_backend(request):
    """Restrict anyio tests to asyncio only (trio is not installed)."""
    return request.param
