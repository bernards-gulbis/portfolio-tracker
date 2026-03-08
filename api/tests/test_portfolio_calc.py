"""Tests for portfolio_calc.py — transaction handlers, helpers, and edge cases."""

from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

from app.models import Transaction, TransactionType
from app.services.portfolio_calc import (
    _apply_transaction,
    _build_holdings_list,
    _compute_forward_split_factors,
    _resolve_nearest_date_value,
    _value_holdings_at_date,
    calculate_status,
)
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
        """split_ratio=0 is falsy, so `tx.split_ratio or 1` evaluates to 1 — no warning."""
        state = _TxState()
        state.holdings["AAPL"] = _Holding(
            quantity=Decimal("10"),
            total_cost=Decimal("1500"),
            first_buy_date=datetime(2025, 1, 1),
        )
        tx = _make_tx(type=TransactionType.SPLIT, ticker="AAPL", split_ratio=0)
        _apply_transaction(state, tx, strict=True)
        assert len(state.warnings) == 0
        assert state.holdings["AAPL"].quantity == Decimal("10")  # 10 * 1

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
