"""Tests for the portfolio calculation subsystem — handlers and status —
and for portfolio_perf.py."""

from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.models import Transaction, TransactionType
from app.services import portfolio_perf
from app.services.portfolio_handlers import (
    _apply_transaction,
    _compute_forward_split_factors,
)
from app.services.portfolio_perf import _generate_date_points, calculate_performance
from app.services.portfolio_status import (
    _build_holdings_list,
    calculate_status,
)
from app.services.portfolio_types import _ZERO, _Holding, _Lot, _TxState


def _holding_from_aggregate(
    quantity: Decimal | int | float,
    total_cost: Decimal | int | float,
    first_buy_date: datetime,
) -> _Holding:
    """Build a ``_Holding`` containing a single lot. Convenience for tests
    that don't care about per-lot detail and just want a position with a
    given total quantity and cost basis."""
    return _Holding(
        lots=[
            _Lot(
                quantity=Decimal(str(quantity)),
                cost=Decimal(str(total_cost)),
                acquired_at=first_buy_date,
            )
        ]
    )


def _make_tx(**kwargs) -> Transaction:
    """Create a Transaction with sensible defaults."""
    defaults = dict(
        id=1,
        portfolio_id=1,
        date=datetime(2025, 1, 15, 10, 0, 0),
        type=TransactionType.DEPOSIT,
        ticker=None,
        quantity=None,
        price_per_share=None,
        fee=None,
        total_amount=0.0,
        eur_amount=None,
        split_ratio=None,
        fx_rate=None,
        currency=None,
    )
    defaults.update(kwargs)
    return Transaction(**defaults)


# ==================== _compute_forward_split_factors ====================


class TestComputeForwardSplitFactors:
    def test_no_splits(self):
        txs = [_make_tx(type=TransactionType.BUY, ticker="AAPL")]
        assert _compute_forward_split_factors(txs) == {}

    def test_single_split(self):
        txs = [
            _make_tx(
                type=TransactionType.SPLIT,
                ticker="AAPL",
                split_ratio=4.0,
                date=datetime(2025, 6, 1),
            )
        ]
        factors = _compute_forward_split_factors(txs)
        assert factors["AAPL"] == Decimal("4")

    def test_multiple_splits_same_ticker(self):
        txs = [
            _make_tx(
                type=TransactionType.SPLIT,
                ticker="AAPL",
                split_ratio=2.0,
                date=datetime(2025, 3, 1),
            ),
            _make_tx(
                type=TransactionType.SPLIT,
                ticker="AAPL",
                split_ratio=3.0,
                date=datetime(2025, 6, 1),
            ),
        ]
        factors = _compute_forward_split_factors(txs)
        assert factors["AAPL"] == Decimal("6")  # 2 * 3

    def test_cutoff_date_excludes_earlier_splits(self):
        txs = [
            _make_tx(
                type=TransactionType.SPLIT,
                ticker="AAPL",
                split_ratio=2.0,
                date=datetime(2025, 3, 1),
            ),
            _make_tx(
                type=TransactionType.SPLIT,
                ticker="AAPL",
                split_ratio=4.0,
                date=datetime(2025, 6, 1),
            ),
        ]
        factors = _compute_forward_split_factors(txs, cutoff_date=datetime(2025, 3, 1))
        assert factors["AAPL"] == Decimal("4")  # Only the June split

    def test_ignores_non_split_transactions(self):
        txs = [
            _make_tx(type=TransactionType.BUY, ticker="AAPL"),
            _make_tx(type=TransactionType.SPLIT, ticker="MSFT", split_ratio=2.0),
        ]
        factors = _compute_forward_split_factors(txs)
        assert "AAPL" not in factors
        assert factors["MSFT"] == Decimal("2")

    def test_skips_split_with_negative_ratio(self):
        """A split with ratio <= 0 should be silently skipped."""
        txs = [
            _make_tx(
                type=TransactionType.SPLIT,
                ticker="AAPL",
                split_ratio=-2.0,
                date=datetime(2025, 6, 1),
            )
        ]
        factors = _compute_forward_split_factors(txs)
        assert "AAPL" not in factors


# ==================== Transaction handlers edge cases ====================


class TestTransactionHandlers:
    def test_sell_without_ticker_just_adds_cash(self):
        state = _TxState()
        state.cash = Decimal("5000")
        tx = _make_tx(type=TransactionType.SELL, ticker=None, total_amount=500.0)
        _apply_transaction(state, tx, strict=True)
        assert state.cash == Decimal("5500")

    def test_sell_ticker_not_in_holdings_warns(self):
        state = _TxState()
        tx = _make_tx(
            type=TransactionType.SELL, ticker="XYZ", quantity=5, total_amount=500.0
        )
        _apply_transaction(state, tx, strict=True)
        assert len(state.warnings) == 1
        assert state.warnings[0].code == "sellNotInHoldings"

    def test_sell_oversell_produces_warning(self):
        state = _TxState()
        state.holdings["AAPL"] = _holding_from_aggregate(5, 750, datetime(2025, 1, 1))
        tx = _make_tx(
            type=TransactionType.SELL, ticker="AAPL", quantity=10, total_amount=2000.0
        )
        _apply_transaction(state, tx, strict=True)
        assert len(state.warnings) == 1
        assert state.warnings[0].code == "sellOversell"
        # Holding should be removed after oversell
        assert "AAPL" not in state.holdings

    def test_split_with_negative_ratio_warns(self):
        state = _TxState()
        state.holdings["AAPL"] = _holding_from_aggregate(10, 1500, datetime(2025, 1, 1))
        tx = _make_tx(type=TransactionType.SPLIT, ticker="AAPL", split_ratio=-2)
        _apply_transaction(state, tx, strict=True)
        assert len(state.warnings) == 1
        assert state.warnings[0].code == "invalidSplitRatio"
        assert state.holdings["AAPL"].quantity == Decimal("10")  # unchanged

    def test_split_with_zero_ratio_treated_as_one(self):
        """split_ratio=0 is falsy, so it falls back to 1 — no change to holdings."""
        state = _TxState()
        state.holdings["AAPL"] = _holding_from_aggregate(10, 1500, datetime(2025, 1, 1))
        tx = _make_tx(type=TransactionType.SPLIT, ticker="AAPL", split_ratio=0)
        _apply_transaction(state, tx, strict=True)
        # 0 is falsy → treated as "no ratio provided" → defaults to 1:1
        assert state.holdings["AAPL"].quantity == Decimal("10")

    def test_unknown_transaction_type_warns(self):
        state = _TxState()
        tx = _make_tx(type="UnknownType")
        _apply_transaction(state, tx, strict=True)
        assert len(state.warnings) == 1
        assert state.warnings[0].code == "unknownType"

    def test_withdraw_negative_cash_warns(self):
        state = _TxState()
        state.cash = Decimal("100")
        state.principal = Decimal("1000")
        # Seed the EUR accumulators so the avg-rate path inside _apply_withdraw
        # has real numbers to work with (otherwise the avg accumulator is
        # complete-but-zero, which the new logic correctly handles but isn't
        # the scenario this test exercises).
        state.principal_eur.add(Decimal("900"))
        state.principal_eur_avg.add(Decimal("900"))
        tx = _make_tx(
            type=TransactionType.WITHDRAW, total_amount=-500.0, eur_amount=-460.0
        )
        _apply_transaction(state, tx, strict=True)
        assert len(state.warnings) == 1
        assert state.warnings[0].code == "withdrawNegativeCash"

    def test_dividend_records_amount_eur(self):
        state = _TxState()
        tx = _make_tx(
            type=TransactionType.DIVIDEND,
            ticker="MSFT",
            total_amount=50.0,
            fx_rate=1.08,
        )
        _apply_transaction(state, tx, strict=True)
        assert len(state.dividends_received) == 1
        assert state.dividends_received[0].ticker == "MSFT"
        # EUR amount should be 50 / 1.08
        assert state.dividends_received[0].amount_eur is not None

    def test_fee_reduces_cash(self):
        state = _TxState()
        state.cash = Decimal("1000")
        tx = _make_tx(type=TransactionType.FEE, total_amount=-10.0)
        _apply_transaction(state, tx, strict=True)
        assert state.cash == Decimal("990")

    def test_sell_removes_holding_when_fully_sold(self):
        state = _TxState()
        state.holdings["AAPL"] = _holding_from_aggregate(10, 1000, datetime(2025, 1, 1))
        tx = _make_tx(
            type=TransactionType.SELL, ticker="AAPL", quantity=10, total_amount=1500.0
        )
        _apply_transaction(state, tx, strict=True)
        assert "AAPL" not in state.holdings
        assert len(state.realized_sales) == 1
        assert state.realized_sales[0].realized_gain == 500.0
        assert state.realized_sales[0].first_buy_date == "2025-01-01T00:00:00"

    def test_buy_creates_new_holding(self):
        state = _TxState()
        state.cash = Decimal("5000")
        tx = _make_tx(
            type=TransactionType.BUY,
            ticker="GOOG",
            quantity=5,
            total_amount=-1000.0,
        )
        _apply_transaction(state, tx, strict=True)
        assert "GOOG" in state.holdings
        assert state.holdings["GOOG"].quantity == Decimal("5")
        assert state.holdings["GOOG"].total_cost == Decimal("1000")

    def test_buy_adds_to_existing_holding(self):
        state = _TxState()
        state.cash = Decimal("10000")
        state.holdings["GOOG"] = _holding_from_aggregate(5, 1000, datetime(2025, 1, 1))
        tx = _make_tx(
            type=TransactionType.BUY,
            ticker="GOOG",
            quantity=3,
            total_amount=-600.0,
        )
        _apply_transaction(state, tx, strict=True)
        assert state.holdings["GOOG"].quantity == Decimal("8")
        assert state.holdings["GOOG"].total_cost == Decimal("1600")
        # New BUY appends a separate FIFO lot — not merged with the prior one.
        assert len(state.holdings["GOOG"].lots) == 2

    def test_sell_oversell_nonstrict_reconciles_with_warning(self):
        """Oversell still reconciles in non-strict mode, AND emits a warning.

        Previously the warning was suppressed in non-strict mode, which let
        perf replay silently truncate quantities — the chart looked fine but
        didn't reconcile with the broker. Warnings are now always collected
        so any consumer can surface them.
        """
        state = _TxState()
        state.cash = Decimal("0")
        state.holdings["AAPL"] = _holding_from_aggregate(5, 750, datetime(2025, 1, 1))
        tx = _make_tx(
            type=TransactionType.SELL, ticker="AAPL", quantity=10, total_amount=2000.0
        )
        _apply_transaction(state, tx, strict=False)
        assert len(state.warnings) == 1
        assert state.warnings[0].code == "sellOversell"
        # Holding should be removed
        assert "AAPL" not in state.holdings
        # Partial sell: 5/10 of proceeds = 1000
        assert state.cash == Decimal("1000")
        # Realized gain = 1000 - 750 = 250
        assert state.realized_gains == Decimal("250")
        assert len(state.realized_sales) == 1


# ==================== _build_holdings_list ====================


class TestBuildHoldingsList:
    def test_sorts_by_ticker(self):
        state = _TxState()
        state.holdings["MSFT"] = _holding_from_aggregate(5, 1500, datetime(2025, 1, 1))
        state.holdings["AAPL"] = _holding_from_aggregate(10, 2000, datetime(2025, 1, 1))
        holdings_list, cost = _build_holdings_list(state)
        assert holdings_list[0].ticker == "AAPL"
        assert holdings_list[1].ticker == "MSFT"
        assert cost == Decimal("3500")

    def test_empty_holdings(self):
        state = _TxState()
        holdings_list, cost = _build_holdings_list(state)
        assert holdings_list == []
        assert cost == _ZERO


# ==================== calculate_status ====================


class TestCalculateStatus:
    def test_empty_transactions(self):
        result = calculate_status([], None, Decimal("0.20"), 1, "Test")
        assert result.portfolio_id == 1
        assert result.portfolio_name == "Test"
        assert result.principal == 0.0
        assert result.cash == 0.0
        assert result.holdings == []

    def test_deposit_then_buy(self):
        txs = [
            _make_tx(
                type=TransactionType.DEPOSIT, total_amount=5000.0, eur_amount=4500.0
            ),
            _make_tx(
                type=TransactionType.BUY,
                ticker="AAPL",
                quantity=10,
                total_amount=-1500.0,
                date=datetime(2025, 1, 16),
            ),
        ]
        result = calculate_status(txs, 0.92, Decimal("0.20"), 1, "Test")
        assert result.principal == 5000.0
        assert result.cash == 3500.0
        assert len(result.holdings) == 1
        assert result.holdings[0].ticker == "AAPL"
        assert result.holdings[0].quantity == 10.0

    def test_out_of_order_transactions(self):
        """Transactions passed out of chronological order should produce the same result."""
        txs_ordered = [
            _make_tx(
                type=TransactionType.DEPOSIT,
                total_amount=5000.0,
                date=datetime(2025, 1, 10),
            ),
            _make_tx(
                type=TransactionType.BUY,
                ticker="AAPL",
                quantity=10,
                total_amount=-1500.0,
                date=datetime(2025, 1, 16),
            ),
        ]
        txs_reversed = list(reversed(txs_ordered))
        result_ordered = calculate_status(txs_ordered, None, Decimal("0.20"), 1, "A")
        result_reversed = calculate_status(txs_reversed, None, Decimal("0.20"), 1, "B")
        assert result_ordered.cash == result_reversed.cash
        assert result_ordered.principal == result_reversed.principal
        assert result_ordered.realized_gains == result_reversed.realized_gains
        assert len(result_ordered.holdings) == len(result_reversed.holdings)
        assert len(result_ordered.realized_sales) == len(result_reversed.realized_sales)
        assert len(result_ordered.warnings) == len(result_reversed.warnings)


# ==================== calculate_performance ====================


class TestCalculatePerformance:
    @patch(
        "app.services.portfolio_status.FxRateService.get_historical_usd_to_eur_rates",
        return_value={},
    )
    @patch(
        "app.services.portfolio_perf.LivePriceService.get_last_known_price",
        return_value=None,
    )
    @patch(
        "app.services.portfolio_perf.HistoricalPriceService"
        ".get_historical_prices_for_multiple_tickers",
        return_value={},
    )
    def test_out_of_order_transactions(self, _mock_hist, _mock_live, _mock_fx):
        """Out-of-order transactions should produce the same performance as sorted ones."""

        txs_ordered = [
            _make_tx(
                type=TransactionType.DEPOSIT,
                total_amount=5000.0,
                date=datetime(2025, 1, 10),
            ),
            _make_tx(
                type=TransactionType.BUY,
                ticker="AAPL",
                quantity=10,
                total_amount=-1500.0,
                date=datetime(2025, 1, 16),
            ),
        ]
        txs_reversed = list(reversed(txs_ordered))
        end = datetime(2025, 2, 1)
        points_ordered, _, _ = calculate_performance(
            txs_ordered, end_date=end, num_points=5
        )
        points_reversed, _, _ = calculate_performance(
            txs_reversed, end_date=end, num_points=5
        )
        assert len(points_ordered) == len(points_reversed)
        for a, b in zip(points_ordered, points_reversed, strict=True):
            assert a["principal"] == b["principal"]
            assert a["current_value"] == b["current_value"]


# ── portfolio_perf.py: _generate_date_points edge cases ──────────────


class TestGenerateDatePoints:
    def test_zero_total_days_returns_two_points(self):
        d = datetime(2025, 1, 1)
        points = _generate_date_points(d, d, 60)
        assert len(points) == 2
        assert points[0] == d
        assert points[1] == d

    def test_fewer_days_than_num_points(self):
        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 5)
        points = _generate_date_points(start, end, 60)
        assert len(points) == 5
        assert points[0].date() == start.date()
        assert points[-1].date() == end.date()

    def test_more_days_than_num_points_evenly_spaced(self):
        start = datetime(2025, 1, 1)
        end = datetime(2025, 12, 31)
        num = 10
        points = _generate_date_points(start, end, num)
        assert len(points) == num
        assert points[0].date() == start.date()
        assert points[-1].date() == end.date()

    def test_last_point_adjusted_to_end(self):
        start = datetime(2025, 1, 1)
        end = datetime(2025, 3, 31)
        points = _generate_date_points(start, end, 7)
        assert points[-1].date() == end.date()


# ── portfolio_perf.py: calculate_performance edge cases ──────────────


class TestCalculatePerformanceEdgeCases:
    def test_empty_transactions_returns_empty_result(self):
        data_points, fallback, warnings = calculate_performance([])
        assert data_points == []
        assert fallback == []
        assert warnings == []

    def test_start_date_equal_to_end_raises(self):
        tx = MagicMock()
        tx.date = datetime(2024, 1, 15)
        tx.ticker = None
        with pytest.raises(ValueError, match="start_date"):
            calculate_performance(
                [tx],
                start_date=datetime(2025, 1, 1),
                end_date=datetime(2025, 1, 1),
            )

    def test_num_points_less_than_2_raises(self):
        tx = MagicMock()
        tx.date = datetime(2024, 1, 15)
        tx.ticker = None
        with pytest.raises(ValueError, match="num_points"):
            calculate_performance(
                [tx],
                start_date=datetime(2024, 1, 1),
                end_date=datetime(2025, 1, 1),
                num_points=1,
            )

    def test_cost_basis_fallback_tickers_surfaced_when_price_missing(self):
        """When no historical price is available for a held ticker — and no
        DB last-known price either — the performance series falls back to
        cost basis (flat-line) for that ticker. The returned fallback-ticker
        list must surface the affected symbols so the UI can warn the user
        that the chart is lying about those positions."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2025, 1, 1),
                total_amount=10000.0,
                eur_amount=9000.0,
            ),
            _make_tx(
                id=2,
                type=TransactionType.BUY,
                date=datetime(2025, 1, 2),
                ticker="UNKNOWN",
                quantity=10,
                total_amount=-1000.0,
            ),
        ]
        # Make every price path miss so cost-basis fallback kicks in.
        with (
            patch(
                "app.services.portfolio_perf.HistoricalPriceService."
                "get_historical_prices_for_multiple_tickers",
                return_value={},
            ),
            patch(
                "app.services.portfolio_perf.LivePriceService.get_last_known_price",
                return_value=None,
            ),
            patch(
                "app.services.portfolio_status.FxRateService."
                "get_historical_usd_to_eur_rates",
                return_value={},
            ),
            patch(
                "app.services.portfolio_status.FxRateService.get_usd_to_eur_rate_safe",
                return_value=0.9,
            ),
        ):
            data_points, fallback, _ = calculate_performance(
                txs,
                start_date=datetime(2025, 1, 1),
                end_date=datetime(2025, 2, 1),
                num_points=5,
            )
        assert len(data_points) == 5
        assert "UNKNOWN" in fallback

    def test_oversell_warnings_surface_through_perf(self):
        """An oversell during historical replay must propagate as a warning
        in the perf response so the chart can flag tampered points rather
        than silently rendering the truncated quantity."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2025, 1, 1),
                total_amount=10000.0,
                eur_amount=9000.0,
            ),
            _make_tx(
                id=2,
                type=TransactionType.BUY,
                date=datetime(2025, 1, 2),
                ticker="AAPL",
                quantity=5,
                total_amount=-500.0,
            ),
            # Oversell — quantity 20 exceeds the 5 held.
            _make_tx(
                id=3,
                type=TransactionType.SELL,
                date=datetime(2025, 1, 10),
                ticker="AAPL",
                quantity=20,
                total_amount=2000.0,
            ),
        ]
        with (
            patch(
                "app.services.portfolio_perf.HistoricalPriceService."
                "get_historical_prices_for_multiple_tickers",
                return_value={},
            ),
            patch(
                "app.services.portfolio_perf.LivePriceService.get_last_known_price",
                return_value=None,
            ),
            patch(
                "app.services.portfolio_status.FxRateService."
                "get_historical_usd_to_eur_rates",
                return_value={},
            ),
            patch(
                "app.services.portfolio_status.FxRateService.get_usd_to_eur_rate_safe",
                return_value=0.9,
            ),
        ):
            _, _, warnings = calculate_performance(
                txs,
                start_date=datetime(2025, 1, 1),
                end_date=datetime(2025, 2, 1),
                num_points=5,
            )

        assert any(w.code == "sellOversell" for w in warnings), (
            f"expected sellOversell warning, got {[w.code for w in warnings]}"
        )


# ==================== Decimal precision regression ====================


class TestDecimalPrecision:
    """Guard against float binary-drift creeping back into the ledger."""

    def test_ten_buys_at_point_one_sum_exactly(self):
        """0.1 + 0.1 + ... (10x) must be exactly 1.00 in Decimal, never 0.99999..."""
        state = _TxState()
        for _ in range(10):
            tx = _make_tx(
                type=TransactionType.BUY,
                ticker="AAPL",
                quantity=0.01,
                price_per_share=10.0,
                total_amount=-0.1,
            )
            _apply_transaction(state, tx)
        assert state.cash == Decimal("-1.00")
        assert state.holdings["AAPL"].total_cost == Decimal("1.00")

    def test_historical_fx_used_when_tx_missing_eur_and_fx_rate(self):
        """Deposit at 2024 rate 1.10, withdraw at 2025 rate 1.05.

        Both transactions lack eur_amount and fx_rate. Without the S3 fix, the
        withdrawal would be valued at today's rate (usd_to_eur_rate arg).
        With the fix, each transaction uses the historical rate for its date,
        and the resulting realized FX gain is exact.
        """
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2024, 6, 1),
                total_amount=1000.0,
            ),
            _make_tx(
                id=2,
                type=TransactionType.WITHDRAW,
                date=datetime(2025, 6, 1),
                total_amount=-500.0,
            ),
        ]
        historical = {"2024-06-01": 1.10, "2025-06-01": 1.05}
        with patch(
            "app.services.portfolio_status."
            "FxRateService.get_historical_usd_to_eur_rates",
            return_value=historical,
        ):
            result = calculate_status(
                txs,
                usd_to_eur_rate=0.50,  # deliberately "wrong" current rate
                tax_rate=Decimal("0.20"),
                portfolio_id=1,
                portfolio_name="FX test",
            )
        # Deposit: 1000 * 1.10 = 1100 EUR. Withdraw valued historically:
        # -500 * 1.05 = -525 EUR. Net principal_eur = 1100 - 525 = 575 EUR.
        # Crucially, the live 0.50 rate should never show up.
        assert result.principal_eur == pytest.approx(575.0)
        # realized_fx_gain = eur_historical - eur_avg_cost
        # avg_rate = 1100 / 1000 = 1.10; eur_avg_cost = 500 * 1.10 = 550
        # eur_historical of withdrawal = 525; realized_fx_gain = 525 - 550 = -25
        assert result.realized_withdrawals[0].realized_fx_gain == pytest.approx(-25.0)

    def test_prefetch_fx_failure_marks_aggregates_incomplete(self):
        """If PriceService raises, calculate_status must produce a result
        without silently falling back to today's live rate. EUR aggregates
        are reported as None and ``eur_incomplete`` is True."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2024, 6, 1),
                total_amount=1000.0,
            ),
        ]
        with patch(
            "app.services.portfolio_status."
            "FxRateService.get_historical_usd_to_eur_rates",
            side_effect=RuntimeError("yahoo down"),
        ):
            result = calculate_status(
                txs,
                usd_to_eur_rate=0.90,  # live rate present but must NOT be substituted
                tax_rate=Decimal("0.20"),
                portfolio_id=1,
                portfolio_name="FX missing",
            )
        # The deposit had no historical rate available — aggregate is None,
        # not 1000 * today's-rate. The live rate is exposed separately.
        assert result.principal_eur is None
        assert result.eur_incomplete is True
        assert result.fx_missing_tx_ids == [1]
        assert result.usd_to_eur_rate == pytest.approx(0.90)

    def test_prefetch_skipped_when_no_fx_blind_transactions(self):
        """Deposit with eur_amount set → no PriceService call at all."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2024, 6, 1),
                total_amount=1000.0,
                eur_amount=900.0,  # explicit EUR → skip historical lookup
            ),
        ]
        with patch(
            "app.services.portfolio_status."
            "FxRateService.get_historical_usd_to_eur_rates",
        ) as mock_fetch:
            result = calculate_status(
                txs,
                usd_to_eur_rate=0.50,
                tax_rate=Decimal("0.20"),
                portfolio_id=1,
                portfolio_name="skip fetch",
            )
        mock_fetch.assert_not_called()
        assert result.principal_eur == pytest.approx(900.0)

    def test_db_roundtrip_preserves_displayed_precision(self):
        """A value saved to the DB must read back at its displayed precision.

        This guards the end-to-end path: float API input → NUMERIC column →
        Decimal on read. The invariant is "what the user typed is what is
        stored and retrieved", not the binary float representation.
        """
        from sqlmodel import Session, SQLModel, create_engine

        from app.models import Portfolio, User

        engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False}
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            user = User(email="x@y.z", hashed_password="x")
            session.add(user)
            session.commit()
            session.refresh(user)
            portfolio = Portfolio(name="P", user_id=user.id)
            session.add(portfolio)
            session.commit()
            session.refresh(portfolio)
            session.add(
                Transaction(
                    portfolio_id=portfolio.id,
                    date=datetime(2025, 1, 1),
                    type=TransactionType.DEPOSIT,
                    total_amount=Decimal("1000.00"),
                    fx_rate=Decimal("1.087"),
                )
            )
            session.commit()
            session.expunge_all()
            from sqlmodel import select

            tx = session.exec(select(Transaction)).one()
            assert tx.total_amount == Decimal("1000.0000")
            assert tx.fx_rate == Decimal("1.087000")


class TestFxRateMissingWarnings:
    """When historical FX rates are unavailable for a transaction, the EUR
    aggregate is reported as incomplete and a structured warning is emitted —
    today's live rate is never silently substituted for a historical date.
    """

    def test_prefetch_failure_emits_bulk_warning_and_marks_incomplete(self):
        """PriceService raising → one aggregate ``fxRatesUnavailable`` warning
        carrying the count of affected transactions, EUR aggregates None,
        ``eur_incomplete`` True, all affected ids surfaced."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2024, 6, 1),
                total_amount=1000.0,
            ),
            _make_tx(
                id=2,
                type=TransactionType.DEPOSIT,
                date=datetime(2023, 3, 15),
                total_amount=500.0,
            ),
        ]
        with patch(
            "app.services.portfolio_status."
            "FxRateService.get_historical_usd_to_eur_rates",
            side_effect=RuntimeError("yahoo down"),
        ):
            result = calculate_status(
                txs,
                usd_to_eur_rate=0.90,
                tax_rate=Decimal("0.20"),
                portfolio_id=1,
                portfolio_name="FX bulk missing",
            )
        # No silent today-rate substitution — aggregates are None.
        assert result.principal_eur is None
        assert result.principal_eur_avg is None
        assert result.eur_incomplete is True
        assert result.fx_missing_tx_ids == [1, 2]
        # One aggregate warning with a count of affected transactions.
        bulk = [w for w in result.warnings if w.code == "fxRatesUnavailable"]
        assert len(bulk) == 1
        assert bulk[0].params.get("count") == "2"
        # And no per-tx warnings (the bulk one covers them).
        per_tx = [
            w
            for w in result.warnings
            if w.code in ("fxRateMissing", "fxRateMissingTicker")
        ]
        assert per_tx == []
        # The legacy ``fxFallback*`` codes must never appear — they were
        # renamed precisely because their semantics changed.
        legacy = [
            w
            for w in result.warnings
            if w.code in ("fxFallbackToCurrent", "fxFallbackToCurrentTicker")
        ]
        assert legacy == []

    def test_per_tx_warning_when_date_missing_from_rates(self):
        """PriceService succeeds but returns no rate on-or-before the tx date
        → per-tx ``fxRateMissing`` warning (no ticker in params, since
        deposits don't carry one), no bulk warning."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2020, 1, 1),
                total_amount=1000.0,
            ),
        ]
        # Rates exist but none on-or-before 2020-01-01 → lookup returns None.
        with patch(
            "app.services.portfolio_status."
            "FxRateService.get_historical_usd_to_eur_rates",
            return_value={"2025-06-01": 1.05},
        ):
            result = calculate_status(
                txs,
                usd_to_eur_rate=0.90,  # live rate must NOT seep into principal_eur
                tax_rate=Decimal("0.20"),
                portfolio_id=1,
                portfolio_name="Per-tx missing",
            )
        # No today-rate substitution — aggregate is None.
        assert result.principal_eur is None
        assert result.eur_incomplete is True
        assert result.fx_missing_tx_ids == [1]
        per_tx = [w for w in result.warnings if w.code == "fxRateMissing"]
        assert len(per_tx) == 1
        # Deposit has no ticker, so params is empty.
        assert per_tx[0].params == {}
        assert "2020-01-01" in per_tx[0].date
        # Ticker-specific variant must not fire when there is no ticker.
        assert [w for w in result.warnings if w.code == "fxRateMissingTicker"] == []
        # Bulk warning should NOT fire when prefetch succeeded.
        assert [w for w in result.warnings if w.code == "fxRatesUnavailable"] == []

    def test_no_warning_when_every_tx_has_explicit_eur_amount(self):
        """Explicit eur_amount means no missing-rate path was taken — no warnings."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2020, 1, 1),
                total_amount=1000.0,
                eur_amount=900.0,
            ),
        ]
        result = calculate_status(
            txs,
            usd_to_eur_rate=0.90,
            tax_rate=Decimal("0.20"),
            portfolio_id=1,
            portfolio_name="Explicit EUR",
        )
        codes = {w.code for w in result.warnings}
        assert "fxRateMissing" not in codes
        assert "fxRateMissingTicker" not in codes
        assert "fxRatesUnavailable" not in codes
        assert result.principal_eur == pytest.approx(900.0)
        assert result.eur_incomplete is False
        assert result.fx_missing_tx_ids == []

    def test_dividend_with_missing_rate_emits_warning_with_ticker(self):
        """Dividends carry a ticker, so the missing-rate warning uses the
        ``fxRateMissingTicker`` variant with the ticker in params — letting
        the UI render a clean "EUR value for this AAPL transaction"
        sentence instead of an empty-placeholder gap."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2020, 1, 1),
                total_amount=10000.0,
                eur_amount=9000.0,  # explicit — not fx-blind, no warning
            ),
            _make_tx(
                id=2,
                type=TransactionType.DIVIDEND,
                date=datetime(2020, 6, 15),
                ticker="AAPL",
                total_amount=50.0,
                # no eur_amount, no fx_rate → fx-blind
            ),
        ]
        with patch(
            "app.services.portfolio_status."
            "FxRateService.get_historical_usd_to_eur_rates",
            return_value={},  # empty rates → missing for dividend
        ):
            result = calculate_status(
                txs,
                usd_to_eur_rate=0.90,
                tax_rate=Decimal("0.20"),
                portfolio_id=1,
                portfolio_name="Dividend missing",
            )
        per_tx = [w for w in result.warnings if w.code == "fxRateMissingTicker"]
        assert len(per_tx) == 1
        assert per_tx[0].params == {"ticker": "AAPL"}
        # No-ticker variant must not fire when a ticker is present.
        assert [w for w in result.warnings if w.code == "fxRateMissing"] == []
        # The explicit-EUR deposit must not produce a warning.
        assert [w for w in result.warnings if w.date.startswith("2020-01-01")] == []
        # principal_eur stays valid (deposit had explicit EUR), but
        # dividends_eur is None because the dividend was unconvertible.
        assert result.principal_eur == pytest.approx(9000.0)
        assert result.dividends_eur is None
        assert result.eur_incomplete is True
        assert result.fx_missing_tx_ids == [2]

    def test_partial_coverage_does_not_silently_contaminate(self):
        """Two deposits with no explicit EUR. Historical prefetch returns a
        rate only late in the timeline; the earlier deposit has no rate
        on-or-before its date and falls into the ``missing`` branch. The
        old silent-fallback cascade would have used today's live rate for
        that deposit and produced a finite-but-wrong principal_eur. With
        the fix, the aggregate is None — incomplete is visible, not hidden.
        """
        deposit_old = _make_tx(
            id=11,
            type=TransactionType.DEPOSIT,
            date=datetime(2020, 1, 1),
            total_amount=1000.0,
        )
        deposit_new = _make_tx(
            id=22,
            type=TransactionType.DEPOSIT,
            date=datetime(2024, 6, 1),
            total_amount=2000.0,
        )
        # Rate only available on 2024-06-01. The 2020-01-01 deposit has no
        # rate on-or-before its date, so the nearest-earlier lookup misses.
        with patch(
            "app.services.portfolio_status."
            "FxRateService.get_historical_usd_to_eur_rates",
            return_value={"2024-06-01": 0.95},
        ):
            result = calculate_status(
                [deposit_old, deposit_new],
                usd_to_eur_rate=1.10,  # deliberately different from historical
                tax_rate=Decimal("0.20"),
                portfolio_id=1,
                portfolio_name="Partial coverage",
            )
        # The aggregate is incomplete — not a contaminated finite number.
        assert result.principal_eur is None
        assert result.eur_incomplete is True
        # Only the older deposit needs a fix.
        assert result.fx_missing_tx_ids == [11]
        # Per-tx warning identifies the offending transaction.
        per_tx = [w for w in result.warnings if w.code == "fxRateMissing"]
        assert len(per_tx) == 1
        assert "2020-01-01" in per_tx[0].date


# ==================== calculate_performance complexity ====================


class TestCalculatePerformanceComplexity:
    """Regression guard for :func:`calculate_performance`'s amortized-linear
    complexity. The current implementation uses a monotonic ``tx_index``
    cursor (``portfolio_perf.py::_replay_transactions_up_to``), so each
    transaction is replayed exactly once across the entire data-point
    loop — total work is O(n_transactions), not O(n × points).

    We verify this property structurally by spying on ``_apply_transaction``
    and asserting the total call count equals ``len(transactions)``.
    A refactor that accidentally reintroduces per-point full replay would
    multiply the call count by ``num_points`` and immediately trip this.
    Wall-clock timing is not used: it's flaky on CI and tests the wrong
    thing (performance, not the invariant that causes it).
    """

    @patch(
        "app.services.portfolio_status.FxRateService.get_historical_usd_to_eur_rates",
        return_value={},
    )
    @patch(
        "app.services.portfolio_perf.LivePriceService.get_last_known_price",
        return_value=None,
    )
    @patch(
        "app.services.portfolio_perf.HistoricalPriceService"
        ".get_historical_prices_for_multiple_tickers",
        return_value={},
    )
    def test_each_transaction_applied_exactly_once(
        self, _mock_hist, _mock_live, _mock_fx
    ):

        start = datetime(2020, 1, 1)
        end = datetime(2025, 1, 1)
        span_days = (end - start).days

        # 500 mixed transactions over 5 years, cycling through 10 tickers.
        # Every 5th is a DEPOSIT; the rest are BUYs, giving a steady
        # holdings count the replay loop can exercise.
        transactions: list[Transaction] = []
        for i in range(500):
            day = start + timedelta(days=int(i * span_days / 500))
            if i % 5 == 0:
                transactions.append(
                    _make_tx(
                        id=i + 1,
                        type=TransactionType.DEPOSIT,
                        date=day,
                        total_amount=1000.0,
                    )
                )
            else:
                transactions.append(
                    _make_tx(
                        id=i + 1,
                        type=TransactionType.BUY,
                        ticker=f"TICK{i % 10}",
                        quantity=1.0,
                        price_per_share=100.0,
                        total_amount=-100.0,
                        date=day,
                    )
                )

        with patch.object(
            portfolio_perf,
            "_apply_transaction",
            wraps=portfolio_perf._apply_transaction,
        ) as spy:
            data_points, _, _ = calculate_performance(
                transactions, start, end, num_points=365
            )

        assert len(data_points) == 365
        assert spy.call_count == len(transactions), (
            f"Expected {len(transactions)} total replays across the "
            f"365-point loop (each transaction applied exactly once via "
            f"the monotonic tx_index cursor), got {spy.call_count}. "
            f"Likely a complexity regression — per-point full replay?"
        )


# ==================== FIFO cost basis ====================


class TestFifoCostBasis:
    """Realized gains use FIFO, not average cost. Latvian capital-gains tax
    requires FIFO; the previous proportional-cost-removal logic averaged the
    basis when a position was built from multiple buys at different prices.
    """

    def test_partial_sell_consumes_oldest_lot_first(self):
        """100@$10 then 100@$20, sell 50 → realized gain uses the $10 lot,
        not the average of $15."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2025, 1, 1),
                total_amount=10000.0,
                eur_amount=9000.0,
            ),
            _make_tx(
                id=2,
                type=TransactionType.BUY,
                date=datetime(2025, 1, 2),
                ticker="AAPL",
                quantity=100,
                total_amount=-1000.0,  # 100 @ $10
            ),
            _make_tx(
                id=3,
                type=TransactionType.BUY,
                date=datetime(2025, 1, 3),
                ticker="AAPL",
                quantity=100,
                total_amount=-2000.0,  # 100 @ $20
            ),
            _make_tx(
                id=4,
                type=TransactionType.SELL,
                date=datetime(2025, 1, 4),
                ticker="AAPL",
                quantity=50,
                total_amount=900.0,  # 50 @ $18 → proceeds 900
            ),
        ]
        result = calculate_status(txs, None, Decimal("0.20"), 1, "FIFO partial")
        # Cost basis for the consumed slice = 50 × $10 (FIFO from oldest lot)
        # = $500. Realized gain = 900 − 500 = 400.
        # (Average-cost would have given 50 × $15 = $750 → gain = 150 — wrong.)
        assert len(result.realized_sales) == 1
        sale = result.realized_sales[0]
        assert sale.quantity == 50.0
        assert sale.cost_basis == 500.0
        assert sale.proceeds == 900.0
        assert sale.realized_gain == 400.0
        assert sale.first_buy_date == "2025-01-02T00:00:00"
        assert result.realized_gains == 400.0
        # 150 shares left: 50 from the $10 lot + 100 from the $20 lot.
        # Total cost basis remaining = 50×10 + 100×20 = $2500.
        held = next(h for h in result.holdings if h.ticker == "AAPL")
        assert held.quantity == 150.0
        assert held.total_cost == 2500.0

    def test_sell_spanning_multiple_lots_emits_one_row_per_lot(self):
        """Selling across two lots produces two ``RealizedSale`` rows, each
        with the consumed lot's acquisition date in ``first_buy_date``."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2025, 1, 1),
                total_amount=10000.0,
                eur_amount=9000.0,
            ),
            _make_tx(
                id=2,
                type=TransactionType.BUY,
                date=datetime(2025, 1, 2),
                ticker="AAPL",
                quantity=100,
                total_amount=-1000.0,
            ),
            _make_tx(
                id=3,
                type=TransactionType.BUY,
                date=datetime(2025, 1, 5),
                ticker="AAPL",
                quantity=100,
                total_amount=-2000.0,
            ),
            _make_tx(
                id=4,
                type=TransactionType.SELL,
                date=datetime(2025, 1, 10),
                ticker="AAPL",
                quantity=150,
                total_amount=2700.0,  # proceeds 2700, $18/share
            ),
        ]
        result = calculate_status(txs, None, Decimal("0.20"), 1, "FIFO span")
        assert len(result.realized_sales) == 2
        first, second = result.realized_sales
        # First row consumes the entire 100-share oldest lot.
        assert first.quantity == 100.0
        assert first.cost_basis == 1000.0
        # Proceeds split proportionally: 100/150 of 2700 = 1800.
        assert first.proceeds == 1800.0
        assert first.realized_gain == 800.0
        assert first.first_buy_date == "2025-01-02T00:00:00"
        # Second row consumes 50 of 100 from the second lot ($20 each).
        assert second.quantity == 50.0
        assert second.cost_basis == 1000.0  # 50 × $20
        assert second.proceeds == 900.0  # 50/150 of 2700
        assert second.realized_gain == -100.0
        assert second.first_buy_date == "2025-01-05T00:00:00"
        # Total realized gain across both rows.
        assert result.realized_gains == 700.0

    def test_split_preserves_per_lot_cost_basis(self):
        """A 2:1 split doubles each lot's quantity but leaves total cost
        unchanged — cost-per-share halves, FIFO ordering preserved."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2025, 1, 1),
                total_amount=10000.0,
                eur_amount=9000.0,
            ),
            _make_tx(
                id=2,
                type=TransactionType.BUY,
                date=datetime(2025, 1, 2),
                ticker="AAPL",
                quantity=100,
                total_amount=-1000.0,  # 100 @ $10
            ),
            _make_tx(
                id=3,
                type=TransactionType.BUY,
                date=datetime(2025, 1, 3),
                ticker="AAPL",
                quantity=100,
                total_amount=-2000.0,  # 100 @ $20
            ),
            _make_tx(
                id=4,
                type=TransactionType.SPLIT,
                date=datetime(2025, 2, 1),
                ticker="AAPL",
                split_ratio=2,
                total_amount=0.0,
            ),
            _make_tx(
                id=5,
                type=TransactionType.SELL,
                date=datetime(2025, 2, 2),
                ticker="AAPL",
                quantity=200,
                total_amount=2000.0,  # post-split: 200 shares @ $10
            ),
        ]
        result = calculate_status(txs, None, Decimal("0.20"), 1, "Split")
        # Pre-split lots: 100@$10 and 100@$20.
        # After 2:1 split: 200@$5 and 200@$10 (cost unchanged).
        # Sell of 200 consumes the entire oldest 200-share lot at $1000 cost.
        assert len(result.realized_sales) == 1
        sale = result.realized_sales[0]
        assert sale.quantity == 200.0
        assert sale.cost_basis == 1000.0
        assert sale.realized_gain == 1000.0
        assert sale.first_buy_date == "2025-01-02T00:00:00"


# ==================== TWR edge cases ====================


class TestTwrEdgeCases:
    """Time-Weighted Return must report ``None`` (not the prior factor) for
    points where the sub-period base is non-positive — e.g. after a full
    cash-out — so the chart doesn't render a misleading flat line."""

    def test_returns_none_after_full_cashout(self):
        """Deposit, buy, sell everything, withdraw all cash — the next
        data point's base is 0, return_pct should be None."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2025, 1, 1),
                total_amount=1000.0,
                eur_amount=900.0,
            ),
            _make_tx(
                id=2,
                type=TransactionType.BUY,
                date=datetime(2025, 1, 5),
                ticker="AAPL",
                quantity=10,
                total_amount=-500.0,
            ),
            _make_tx(
                id=3,
                type=TransactionType.SELL,
                date=datetime(2025, 1, 15),
                ticker="AAPL",
                quantity=10,
                total_amount=600.0,  # +100 realized
            ),
            _make_tx(
                id=4,
                type=TransactionType.WITHDRAW,
                date=datetime(2025, 1, 20),
                total_amount=-1100.0,  # full cash-out
            ),
        ]
        with (
            patch(
                "app.services.portfolio_perf.HistoricalPriceService."
                "get_historical_prices_for_multiple_tickers",
                return_value={},
            ),
            patch(
                "app.services.portfolio_perf.LivePriceService.get_last_known_price",
                return_value=None,
            ),
            patch(
                "app.services.portfolio_status.FxRateService."
                "get_historical_usd_to_eur_rates",
                return_value={},
            ),
        ):
            data_points, _, _ = calculate_performance(
                txs,
                start_date=datetime(2025, 1, 1),
                end_date=datetime(2025, 2, 1),
                num_points=10,
            )
        # The final point is after the full cash-out — base is 0 so the TWR
        # is undefined for that sub-period. Must be None, not a stale prior
        # factor that would render as "no change".
        assert data_points[-1]["return_pct"] is None


# ── Extra coverage paths ─────────────────────────────────────────


class TestConsumeLotsFifoEdgeCases:
    """Cover portfolio_handlers.py line 84: effective_qty <= 0 early return."""

    def test_consume_lots_fifo_noop_when_qty_zero(self):
        """_consume_lots_fifo does nothing when effective_qty is 0 (line 84)."""
        from decimal import Decimal

        from app.services.portfolio_handlers import _consume_lots_fifo
        from app.services.portfolio_types import _Holding, _Lot, _TxState

        state = _TxState()
        h = _Holding()
        h.lots.append(
            _Lot(
                quantity=Decimal("10"),
                cost=Decimal("1000"),
                acquired_at=datetime(2024, 1, 1),
            )
        )

        _consume_lots_fifo(
            state,
            h,
            ticker="AAPL",
            tx_date_str="2024-06-01T00:00:00",
            effective_qty=Decimal("0"),
            effective_total=Decimal("0"),
            quantity_before=Decimal("10"),
        )

        assert len(h.lots) == 1
        assert len(state.realized_sales) == 0

    def test_consume_lots_fifo_noop_when_qty_negative(self):
        """_consume_lots_fifo does nothing when effective_qty is negative."""
        from decimal import Decimal

        from app.services.portfolio_handlers import _consume_lots_fifo
        from app.services.portfolio_types import _Holding, _Lot, _TxState

        state = _TxState()
        h = _Holding()
        h.lots.append(
            _Lot(
                quantity=Decimal("5"),
                cost=Decimal("500"),
                acquired_at=datetime(2024, 1, 1),
            )
        )

        _consume_lots_fifo(
            state,
            h,
            ticker="AAPL",
            tx_date_str="2024-06-01T00:00:00",
            effective_qty=Decimal("-1"),
            effective_total=Decimal("-100"),
            quantity_before=Decimal("5"),
        )

        assert len(h.lots) == 1
        assert len(state.realized_sales) == 0


class TestApplyWithdrawIncompleteAccumulator:
    """Cover portfolio_handlers.py lines 198-199: withdraw when avg accumulator is incomplete."""

    def test_withdraw_with_incomplete_eur_avg_accumulator(self):
        """When principal > 0 but the EUR avg accumulator is incomplete,
        eur_avg_cost and avg_delta are set to None (lines 198-199)."""
        from decimal import Decimal

        state = _TxState()

        deposit = Transaction(
            id=1,
            portfolio_id=1,
            date=datetime(2024, 1, 1),
            type=TransactionType.DEPOSIT,
            total_amount=Decimal("1000"),
            eur_amount=None,
        )
        _apply_transaction(state, deposit, strict=False)
        assert state.principal == Decimal("1000")
        assert state.principal_eur_avg.is_incomplete

        withdraw = Transaction(
            id=2,
            portfolio_id=1,
            date=datetime(2024, 2, 1),
            type=TransactionType.WITHDRAW,
            total_amount=Decimal("-200"),
            eur_amount=None,
        )
        _apply_transaction(state, withdraw, strict=False)

        assert state.principal == Decimal("800")
        assert len(state.realized_withdrawals) == 1
        assert state.realized_withdrawals[0].amount_eur_avg is None

