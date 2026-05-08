"""Tests for Pydantic schemas with non-trivial validation logic."""

from datetime import UTC, datetime, timezone

import pytest
from pydantic import ValidationError

from app.models import TransactionType
from app.schemas import LivePriceInfo
from app.schemas.schemas import TransactionCreate, TransactionUpdate


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


class TestTransactionCreateTimezoneAware:
    """``TransactionCreate.date`` must carry explicit timezone info so
    downstream date arithmetic isn't silently reinterpreted against the
    server's local clock. Naive inputs are coerced to UTC (non-breaking for
    existing callers); aware inputs pass through unchanged.
    """

    def test_naive_datetime_is_coerced_to_utc(self):
        tx = TransactionCreate(
            date=datetime(2025, 1, 1, 10, 30),  # naive
            type=TransactionType.DEPOSIT,
            total_amount=100.0,
        )
        assert tx.date.tzinfo is UTC
        assert tx.date == datetime(2025, 1, 1, 10, 30, tzinfo=UTC)

    def test_utc_aware_datetime_preserved(self):
        tx = TransactionCreate(
            date=datetime(2025, 1, 1, 10, 30, tzinfo=UTC),
            type=TransactionType.DEPOSIT,
            total_amount=100.0,
        )
        assert tx.date == datetime(2025, 1, 1, 10, 30, tzinfo=UTC)

    def test_non_utc_aware_datetime_preserved(self):
        """A non-UTC aware input must not be silently converted to UTC —
        the user's offset is semantic information we must respect."""
        from datetime import timedelta

        offset_plus_5 = timezone(timedelta(hours=5))
        tx = TransactionCreate(
            date=datetime(2025, 1, 1, 10, 30, tzinfo=offset_plus_5),
            type=TransactionType.DEPOSIT,
            total_amount=100.0,
        )
        assert tx.date.utcoffset() == timedelta(hours=5)


class TestTransactionUpdateTimezoneAware:
    """``TransactionUpdate`` is a separate class from ``TransactionBase``
    (partial-update semantics — every field optional), so its ``date``
    validator lives on the class itself. The coercion must mirror
    ``TransactionCreate`` so PUT and POST have symmetric tz semantics; a
    naive PUT would otherwise silently store tz-ambiguous data while a
    fresh POST would coerce.
    """

    def test_naive_datetime_is_coerced_to_utc(self):
        """Mirror of ``TransactionCreate`` coercion so PUT /transactions/{id}
        has the same tz semantics as POST."""
        tx = TransactionUpdate(date=datetime(2025, 1, 1, 10, 30))
        assert tx.date is not None
        assert tx.date.tzinfo is UTC

    def test_none_date_passes_through(self):
        """Most partial updates don't touch ``date``; the validator must
        tolerate ``None`` (field omitted)."""
        tx = TransactionUpdate(total_amount=100.0)
        assert tx.date is None


class TestTransactionUpdateValidator:
    """Cover schemas.py line 186: coerce_naive_to_utc when value already has tzinfo."""

    def test_coerce_naive_to_utc_already_aware_returns_unchanged(self):
        """Passing a tz-aware datetime returns it unchanged (line 185: if v.tzinfo is not None)."""
        from app.schemas.schemas import TransactionUpdate

        aware_dt = datetime(2024, 6, 1, 12, 0, 0, tzinfo=UTC)
        update = TransactionUpdate(date=aware_dt)
        assert update.date == aware_dt
        assert update.date.tzinfo is not None

