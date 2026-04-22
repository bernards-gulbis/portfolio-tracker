"""Tests for portfolio_calc.py and portfolio_perf.py — transaction handlers, helpers, and edge cases."""

from datetime import datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.models import Transaction, TransactionType
from app.services.portfolio_calc import (
    _apply_transaction,
    _build_holdings_list,
    _compute_forward_split_factors,
    _fetch_historical_prices,
    _resolve_nearest_date_value,
    _resolve_usd_to_eur_rate,
    _value_holdings_at_date,
    calculate_status,
)
from app.services.portfolio_perf import _generate_date_points, calculate_performance
from app.services.portfolio_types import _ZERO, _Holding, _TxState


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


# ==================== _resolve_nearest_date_value ====================


class TestResolveNearestDateValue:
    def test_returns_none_for_empty_dict(self):
        assert _resolve_nearest_date_value({}, "2025-01-15") is None

    def test_exact_match(self):
        prices = {"2025-01-14": 100.0, "2025-01-15": 105.0}
        assert _resolve_nearest_date_value(prices, "2025-01-15") == 105.0

    def test_nearest_earlier_date(self):
        prices = {"2025-01-13": 99.0, "2025-01-14": 100.0}
        assert _resolve_nearest_date_value(prices, "2025-01-15") == 100.0

    def test_returns_none_when_all_dates_after(self):
        prices = {"2025-01-16": 110.0, "2025-01-17": 115.0}
        assert _resolve_nearest_date_value(prices, "2025-01-15") is None


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


# ==================== _fetch_historical_prices ====================


class TestFetchHistoricalPrices:
    def test_returns_empty_dict_for_no_tickers(self):
        result = _fetch_historical_prices([], datetime(2025, 6, 15))
        assert result == {}

    @patch("app.services.portfolio_calc.PriceService")
    def test_returns_empty_dict_when_no_prices_available(self, mock_ps):
        mock_ps.get_historical_prices_for_multiple_tickers.return_value = {}
        result = _fetch_historical_prices(["AAPL"], datetime(2025, 6, 15))
        assert result == {}

    @patch("app.services.portfolio_calc.PriceService")
    def test_returns_price_for_nearest_earlier_date(self, mock_ps):
        mock_ps.get_historical_prices_for_multiple_tickers.return_value = {
            "AAPL": {"2025-06-13": 190.0, "2025-06-14": 195.0}
        }
        result = _fetch_historical_prices(["AAPL"], datetime(2025, 6, 15))
        assert result["AAPL"] == 195.0

    @patch("app.services.portfolio_calc.PriceService")
    def test_uses_earliest_available_when_all_dates_after_target(self, mock_ps):
        """If all available dates are after the target date, use the earliest one."""
        mock_ps.get_historical_prices_for_multiple_tickers.return_value = {
            "AAPL": {"2025-06-17": 200.0, "2025-06-18": 205.0}
        }
        result = _fetch_historical_prices(["AAPL"], datetime(2025, 6, 15))
        assert result["AAPL"] == 200.0

    @patch("app.services.portfolio_calc.PriceService")
    def test_skips_ticker_with_empty_date_prices(self, mock_ps):
        mock_ps.get_historical_prices_for_multiple_tickers.return_value = {
            "AAPL": {},
            "MSFT": {"2025-06-14": 410.0},
        }
        result = _fetch_historical_prices(["AAPL", "MSFT"], datetime(2025, 6, 15))
        assert "AAPL" not in result
        assert result["MSFT"] == 410.0


# ==================== _value_holdings_at_date ====================


class TestValueHoldingsAtDate:
    def test_uses_historical_price(self):
        state = _TxState()
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("10"),
            total_cost=Decimal("1500"),
            first_buy_date=datetime(2025, 1, 1),
        )
        result = _value_holdings_at_date(
            state,
            {"AAPL": 200.0},
            {},
            "2025-06-15",
        )
        assert result == Decimal("10") * Decimal("200")

    def test_applies_split_factor(self):
        state = _TxState()
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("10"),
            total_cost=Decimal("1500"),
            first_buy_date=datetime(2025, 1, 1),
        )
        result = _value_holdings_at_date(
            state,
            {"AAPL": 50.0},
            {"AAPL": Decimal("4")},
            "2025-06-15",
        )
        assert result == Decimal("10") * Decimal("50") * Decimal("4")

    @patch("app.services.portfolio_calc.PriceService")
    def test_falls_back_to_db_price(self, mock_price_service):
        mock_price_service.get_last_known_price.return_value = 180.0
        state = _TxState()
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("10"),
            total_cost=Decimal("1500"),
            first_buy_date=datetime(2025, 1, 1),
        )
        result = _value_holdings_at_date(
            state,
            {},  # No historical prices
            {},
            "2025-06-15",
        )
        assert result == Decimal("10") * Decimal("180")

    @patch("app.services.portfolio_calc.PriceService")
    def test_falls_back_to_cost_basis(self, mock_price_service):
        mock_price_service.get_last_known_price.return_value = None
        state = _TxState()
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("10"),
            total_cost=Decimal("1500"),
            first_buy_date=datetime(2025, 1, 1),
        )
        result = _value_holdings_at_date(
            state,
            {},  # No historical prices
            {},
            "2025-06-15",
        )
        assert result == Decimal("1500")

    @patch("app.services.portfolio_calc.PriceService")
    def test_handles_none_historical_prices(self, mock_price_service):
        mock_price_service.get_last_known_price.return_value = 150.0
        state = _TxState()
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("5"),
            total_cost=Decimal("700"),
            first_buy_date=datetime(2025, 1, 1),
        )
        result = _value_holdings_at_date(
            state,
            None,
            {},
            "2025-06-15",
        )
        assert result == Decimal("5") * Decimal("150")

    @patch("app.services.portfolio_calc.PriceService")
    def test_skips_zero_price(self, mock_price_service):
        """Price of 0 should not be used; fall back to DB cache."""
        mock_price_service.get_last_known_price.return_value = 100.0
        state = _TxState()
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("10"),
            total_cost=Decimal("1000"),
            first_buy_date=datetime(2025, 1, 1),
        )
        result = _value_holdings_at_date(
            state,
            {"AAPL": 0.0},
            {},
            "2025-06-15",
        )
        assert result == Decimal("10") * Decimal("100")


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
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("5"),
            total_cost=Decimal("750"),
            first_buy_date=datetime(2025, 1, 1),
        )
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
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("10"),
            total_cost=Decimal("1500"),
            first_buy_date=datetime(2025, 1, 1),
        )
        tx = _make_tx(type=TransactionType.SPLIT, ticker="AAPL", split_ratio=-2)
        _apply_transaction(state, tx, strict=True)
        assert len(state.warnings) == 1
        assert state.warnings[0].code == "invalidSplitRatio"
        assert state.holdings["AAPL"].quantity == Decimal("10")  # unchanged

    def test_split_with_zero_ratio_treated_as_one(self):
        """split_ratio=0 is falsy, so it falls back to 1 — no change to holdings."""
        state = _TxState()
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("10"),
            total_cost=Decimal("1500"),
            first_buy_date=datetime(2025, 1, 1),
        )
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
        state.principal_eur = Decimal("900")
        state.principal_eur_avg = Decimal("900")
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
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("10"),
            total_cost=Decimal("1000"),
            first_buy_date=datetime(2025, 1, 1),
        )
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
        state.holdings["GOOG"] = _Holding(
            quantity=Decimal("5"),
            total_cost=Decimal("1000"),
            first_buy_date=datetime(2025, 1, 1),
        )
        tx = _make_tx(
            type=TransactionType.BUY,
            ticker="GOOG",
            quantity=3,
            total_amount=-600.0,
        )
        _apply_transaction(state, tx, strict=True)
        assert state.holdings["GOOG"].quantity == Decimal("8")
        assert state.holdings["GOOG"].total_cost == Decimal("1600")

    def test_sell_oversell_nonstrict_reconciles(self):
        """In non-strict mode, oversell should still reconcile (partial sell + remove holding)."""
        state = _TxState()
        state.cash = Decimal("0")
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("5"),
            total_cost=Decimal("750"),
            first_buy_date=datetime(2025, 1, 1),
        )
        tx = _make_tx(
            type=TransactionType.SELL, ticker="AAPL", quantity=10, total_amount=2000.0
        )
        _apply_transaction(state, tx, strict=False)
        # No warnings in non-strict mode
        assert len(state.warnings) == 0
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
        state.holdings["MSFT"] = _Holding(
            quantity=Decimal("5"),
            total_cost=Decimal("1500"),
            first_buy_date=datetime(2025, 1, 1),
        )
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("10"),
            total_cost=Decimal("2000"),
            first_buy_date=datetime(2025, 1, 1),
        )
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
    @patch("app.services.portfolio_perf.PriceService")
    @patch("app.services.portfolio_perf._resolve_usd_to_eur_rate", return_value=0.92)
    def test_out_of_order_transactions(self, _mock_eur, mock_price_service):
        """Out-of-order transactions should produce the same performance as sorted ones."""
        mock_price_service.get_historical_prices_for_multiple_tickers.return_value = {}
        mock_price_service.get_last_known_price.return_value = None

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
        result_ordered = calculate_performance(txs_ordered, end_date=end, num_points=5)
        result_reversed = calculate_performance(
            txs_reversed, end_date=end, num_points=5
        )
        assert len(result_ordered) == len(result_reversed)
        for a, b in zip(result_ordered, result_reversed, strict=True):
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
    def test_empty_transactions_returns_empty_list(self):
        result = calculate_performance([])
        assert result == []

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


# ── portfolio_calc.py: _resolve_usd_to_eur_rate ─────────────────────


class TestResolveUsdToEurRate:
    def test_fallback_to_live_rate_when_no_historical(self):
        with (
            patch(
                "app.services.portfolio_calc.PriceService.get_historical_usd_to_eur_rates",
                return_value={},
            ),
            patch(
                "app.services.portfolio_calc.PriceService.get_usd_to_eur_rate_safe",
                return_value=0.92,
            ) as mock_live,
        ):
            rate = _resolve_usd_to_eur_rate(datetime(2024, 6, 15))
        mock_live.assert_called_once()
        assert rate == pytest.approx(0.92)

    def test_returns_historical_rate_when_available(self):
        with (
            patch(
                "app.services.portfolio_calc.PriceService.get_historical_usd_to_eur_rates",
                return_value={"2024-06-15": 0.91},
            ),
            patch(
                "app.services.portfolio_calc.PriceService.get_usd_to_eur_rate_safe",
            ) as mock_live,
        ):
            rate = _resolve_usd_to_eur_rate(datetime(2024, 6, 15))
        mock_live.assert_not_called()
        assert rate == pytest.approx(0.91)


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
            "app.services.portfolio_calc."
            "PriceService.get_historical_usd_to_eur_rates",
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
        assert result.realized_withdrawals[0].realized_fx_gain == pytest.approx(
            -25.0
        )

    def test_prefetch_fx_fallback_on_provider_error(self):
        """If PriceService raises, calculate_status must still produce a result
        using the current-rate fallback (not crash)."""
        txs = [
            _make_tx(
                id=1,
                type=TransactionType.DEPOSIT,
                date=datetime(2024, 6, 1),
                total_amount=1000.0,
            ),
        ]
        with patch(
            "app.services.portfolio_calc."
            "PriceService.get_historical_usd_to_eur_rates",
            side_effect=RuntimeError("yahoo down"),
        ):
            result = calculate_status(
                txs,
                usd_to_eur_rate=0.90,
                tax_rate=Decimal("0.20"),
                portfolio_id=1,
                portfolio_name="FX fallback",
            )
        # Fallback to current rate: 1000 * 0.90 = 900
        assert result.principal_eur == pytest.approx(900.0)

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
            "app.services.portfolio_calc."
            "PriceService.get_historical_usd_to_eur_rates",
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
