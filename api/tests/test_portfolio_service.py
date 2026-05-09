"""Tests for app.services.portfolio_service."""

import pytest

from app.core.exceptions import InvalidPortfolioNameException
from app.services.portfolio_service import PortfolioService


class TestPortfolioServiceValidation:
    """Cover portfolio_service.py line 38: name > 255 chars raises."""

    def test_validate_name_too_long_raises(self):
        with pytest.raises(InvalidPortfolioNameException, match="cannot exceed 255"):
            PortfolioService._validate_name("A" * 256)
