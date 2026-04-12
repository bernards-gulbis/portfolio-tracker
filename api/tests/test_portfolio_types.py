"""Tests for portfolio_types.py — type conversion and normalization helpers."""

from decimal import Decimal

import pytest

from app.services.portfolio_types import (
    HOLDINGS_EPSILON,
    _opt_float,
    _opt_normalize,
    _to_decimal,
)


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
