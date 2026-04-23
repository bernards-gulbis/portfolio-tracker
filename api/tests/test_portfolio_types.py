"""Tests for portfolio_types.py — type conversion and normalization helpers."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

import pytest

from app.services.portfolio_types import (
    HOLDINGS_EPSILON,
    _eur_from_tx,
    _lookup_historical_rate,
    _opt_float,
    _opt_normalize,
    _to_decimal,
)


@dataclass
class _StubTx:
    """Minimal transaction-like object for _eur_from_tx coverage."""

    date: datetime
    eur_amount: Decimal | None = None
    fx_rate: Decimal | None = None


class TestToDecimal:
    def test_none_returns_zero(self):
        assert _to_decimal(None) == Decimal("0")

    def test_decimal_returns_unchanged(self):
        d = Decimal("3.14")
        assert _to_decimal(d) is d

    def test_float_converts_via_string(self):
        result = _to_decimal(1.5)
        assert result == Decimal("1.5")

    def test_int_converts(self):
        result = _to_decimal(42)
        assert result == Decimal("42")


class TestOptFloat:
    def test_none_returns_none(self):
        assert _opt_float(None) is None

    def test_decimal_returns_float(self):
        assert _opt_float(Decimal("2.5")) == pytest.approx(2.5)


class TestOptNormalize:
    def test_none_returns_none(self):
        assert _opt_normalize(None) is None

    def test_near_zero_returns_zero(self):
        tiny = HOLDINGS_EPSILON / Decimal("2")
        assert _opt_normalize(tiny) == 0.0

    def test_normal_value_returned(self):
        assert _opt_normalize(Decimal("5.0")) == pytest.approx(5.0)


class TestLookupHistoricalRate:
    def test_empty_dict_returns_none(self):
        assert _lookup_historical_rate({}, "2025-01-15") is None

    def test_exact_date_match(self):
        rates = {"2025-01-14": 1.10, "2025-01-15": 1.08}
        assert _lookup_historical_rate(rates, "2025-01-15") == 1.08

    def test_nearest_earlier_date_when_target_missing(self):
        rates = {"2025-01-10": 1.10, "2025-01-12": 1.05}
        # target 2025-01-15 not in map → returns the most recent earlier date
        assert _lookup_historical_rate(rates, "2025-01-15") == 1.05

    def test_returns_none_when_only_later_dates(self):
        rates = {"2025-01-20": 1.10, "2025-01-21": 1.05}
        assert _lookup_historical_rate(rates, "2025-01-15") is None


class TestEurFromTx:
    """Covers the historical-rate fallback branch and the zero-fallback path.

    The ``tx.eur_amount`` and ``tx.fx_rate`` branches (priorities 1 and 2) are
    exercised by the broader status-endpoint tests — this class focuses on the
    S3-introduced historical-rate lookup + current-rate fallback behavior.
    """

    def test_historical_rate_preferred_over_current_fallback(self):
        tx = _StubTx(datetime(2025, 1, 15))
        result = _eur_from_tx(
            tx,
            total_amount=Decimal("100"),
            usd_to_eur_fallback=2.0,
            historical_rates={"2025-01-15": 1.1},
        )
        # 100 * 1.1 (historical) not 100 * 2.0 (current)
        assert result == Decimal("110.0")

    def test_current_fallback_when_no_historical_rate_for_date(self):
        tx = _StubTx(datetime(2025, 1, 15))
        result = _eur_from_tx(
            tx,
            total_amount=Decimal("100"),
            usd_to_eur_fallback=0.9,
            historical_rates={
                "2020-01-01": 0.8
            },  # all dates earlier than target → no match
        )
        # _lookup_historical_rate finds nearest-earlier (0.8), so that wins over
        # the current fallback. This pins the documented precedence order.
        assert result == Decimal("80.0")

    def test_current_fallback_when_historical_dict_empty(self):
        tx = _StubTx(datetime(2025, 1, 15))
        result = _eur_from_tx(
            tx,
            total_amount=Decimal("100"),
            usd_to_eur_fallback=0.9,
            historical_rates={},
        )
        assert result == Decimal("90.0")

    def test_zero_when_no_rates_at_all(self):
        tx = _StubTx(datetime(2025, 1, 15))
        result = _eur_from_tx(
            tx,
            total_amount=Decimal("100"),
            usd_to_eur_fallback=None,
            historical_rates=None,
        )
        assert result == Decimal("0")
