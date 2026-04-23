"""Tests for Pydantic schemas with non-trivial validation logic."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas import LivePriceInfo


class TestLivePriceInfoInvariants:
    """The model validator enforces that (price, source, as_of) form a
    consistent triple. These tests pin that contract so a later refactor
    can't quietly loosen it."""

    NOW = datetime(2026, 4, 22, 12, 0, tzinfo=UTC)

    def test_live_with_price_and_as_of_is_valid(self):
        info = LivePriceInfo(price=150.0, source="live", as_of=self.NOW)
        assert info.price == 150.0
        assert info.source == "live"

    def test_last_known_with_price_and_as_of_is_valid(self):
        info = LivePriceInfo(price=148.5, source="last_known", as_of=self.NOW)
        assert info.source == "last_known"

    def test_missing_with_nulls_is_valid(self):
        info = LivePriceInfo(price=None, source="missing", as_of=None)
        assert info.price is None

    def test_missing_with_price_rejected(self):
        with pytest.raises(ValidationError, match="must have price=None"):
            LivePriceInfo(price=150.0, source="missing", as_of=None)

    def test_missing_with_as_of_rejected(self):
        with pytest.raises(ValidationError, match="must have as_of=None"):
            LivePriceInfo(price=None, source="missing", as_of=self.NOW)

    def test_live_without_price_rejected(self):
        with pytest.raises(ValidationError, match="must have a non-None price"):
            LivePriceInfo(price=None, source="live", as_of=self.NOW)

    def test_live_without_as_of_rejected(self):
        with pytest.raises(
            ValidationError, match="must have a non-None as_of timestamp"
        ):
            LivePriceInfo(price=150.0, source="live", as_of=None)

    def test_last_known_without_as_of_rejected(self):
        with pytest.raises(
            ValidationError, match="must have a non-None as_of timestamp"
        ):
            LivePriceInfo(price=150.0, source="last_known", as_of=None)
