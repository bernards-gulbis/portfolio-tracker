"""Tests for app.services.health_service."""

from unittest.mock import MagicMock


class TestHealthServiceExceptionPaths:
    """Cover health_service.py lines 44-46 and 53-55."""

    def test_get_price_cache_age_seconds_returns_none_on_exception(self):
        """Exception in the query is caught and returns None (lines 44-46)."""
        from app.services.health_service import get_price_cache_age_seconds

        mock_session = MagicMock()
        mock_session.exec.side_effect = Exception("DB error")

        result = get_price_cache_age_seconds(mock_session)
        assert result is None

    def test_get_last_fx_rate_age_seconds_returns_none_on_exception(self):
        """Exception in the query is caught and returns None (lines 53-55)."""
        from app.services.health_service import get_last_fx_rate_age_seconds

        mock_session = MagicMock()
        mock_session.exec.side_effect = Exception("DB error")

        result = get_last_fx_rate_age_seconds(mock_session)
        assert result is None
