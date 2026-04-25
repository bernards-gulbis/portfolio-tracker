"""Tests for portfolio_types.py — type conversion and normalization helpers."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

import pytest

from app.services.portfolio_types import (
    HOLDINGS_EPSILON,
    EurAccumulator,
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
    """Covers the EUR-conversion cascade and the ``FxSource`` tag each branch
    returns. The cascade does NOT fall back to today's live rate — when no
    historical rate is available, it returns ``(None, "missing")`` so the
    caller can mark its EUR aggregate as incomplete instead of silently
    distorting it.
    """

    def test_explicit_eur_amount_preferred(self):
        tx = _StubTx(datetime(2025, 1, 15), eur_amount=Decimal("42.0"))
        value, source = _eur_from_tx(
            tx,
            total_amount=Decimal("100"),
            historical_rates={"2025-01-15": 1.1},
        )
        assert value == Decimal("42.0")
        assert source == "explicit_eur"

    def test_explicit_fx_rate_used_when_no_eur_amount(self):
        tx = _StubTx(datetime(2025, 1, 15), fx_rate=Decimal("1.25"))
        value, source = _eur_from_tx(
            tx,
            total_amount=Decimal("100"),
            historical_rates={"2025-01-15": 1.1},
        )
        # 100 / 1.25 = 80 (USD→EUR via fx_rate)
        assert value == Decimal("80")
        assert source == "explicit_fx_rate"

    def test_historical_rate_used_when_no_explicit(self):
        tx = _StubTx(datetime(2025, 1, 15))
        value, source = _eur_from_tx(
            tx,
            total_amount=Decimal("100"),
            historical_rates={"2025-01-15": 1.1},
        )
        assert value == Decimal("110.0")
        assert source == "historical"

    def test_historical_nearest_earlier_still_counts_as_historical(self):
        tx = _StubTx(datetime(2025, 1, 15))
        value, source = _eur_from_tx(
            tx,
            total_amount=Decimal("100"),
            historical_rates={
                "2020-01-01": 0.8
            },  # all dates earlier than target → nearest-earlier match
        )
        # _lookup_historical_rate finds nearest-earlier (0.8). The cascade
        # treats this as a real historical hit, not a fallback.
        assert value == Decimal("80.0")
        assert source == "historical"

    def test_returns_missing_when_historical_dict_empty(self):
        """No historical rate available, no explicit eur/fx_rate → (None, missing).

        Critically, we do NOT silently substitute today's live rate. The
        caller must mark its aggregate as incomplete and surface the gap.
        """
        tx = _StubTx(datetime(2025, 1, 15))
        value, source = _eur_from_tx(
            tx,
            total_amount=Decimal("100"),
            historical_rates={},
        )
        assert value is None
        assert source == "missing"

    def test_returns_missing_when_no_rates_at_all(self):
        tx = _StubTx(datetime(2025, 1, 15))
        value, source = _eur_from_tx(
            tx,
            total_amount=Decimal("100"),
            historical_rates=None,
        )
        assert value is None
        assert source == "missing"

    def test_returns_missing_when_only_later_historical_rates(self):
        """Historical dict has rates but only AFTER the tx date — the nearest-earlier
        lookup misses, so no historical rate applies. Must return missing,
        not a future rate."""
        tx = _StubTx(datetime(2020, 1, 1))
        value, source = _eur_from_tx(
            tx,
            total_amount=Decimal("100"),
            historical_rates={"2025-06-01": 1.05},
        )
        assert value is None
        assert source == "missing"


class TestEurAccumulator:
    """Once any contribution is unknown, the aggregate stays unknown. The raw
    ``total`` keeps accumulating for diagnostics; ``value`` is the trustworthy
    surface."""

    def test_starts_at_zero_complete(self):
        acc = EurAccumulator()
        assert acc.value == Decimal("0")
        assert acc.is_incomplete is False

    def test_pure_decimal_adds_sum(self):
        acc = EurAccumulator()
        acc.add(Decimal("100"))
        acc.add(Decimal("50"))
        assert acc.value == Decimal("150")
        assert acc.is_incomplete is False

    def test_single_none_flips_to_incomplete(self):
        acc = EurAccumulator()
        acc.add(Decimal("100"))
        acc.add(None)
        assert acc.value is None
        assert acc.is_incomplete is True

    def test_subsequent_decimal_does_not_recover_completeness(self):
        """Once a None has been observed, every later valid value still
        leaves ``value`` None — partial sums are not trustworthy."""
        acc = EurAccumulator()
        acc.add(None)
        acc.add(Decimal("100"))
        acc.add(Decimal("50"))
        assert acc.value is None
        # ``total`` keeps the partial sum for diagnostics.
        assert acc.total == Decimal("150")

    def test_multiple_nones_counted(self):
        acc = EurAccumulator()
        acc.add(None)
        acc.add(None)
        assert acc.incomplete_count == 2
