"""
Unit tests for TransactionService — targeting uncovered lines.
Uses a real in-memory SQLite database with SQLModel.
"""

import uuid
from datetime import datetime

import pytest
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.core.exceptions import (
    InvalidCSVFormatException,
    InvalidTransactionDataException,
    PortfolioNotFoundException,
    TransactionNotFoundException,
)
from app.models import Portfolio, TransactionType
from app.models.historical_price import FxRate, HistoricalPrice  # noqa: F401
from app.models.user import User
from app.services.transaction_service import TransactionService, _coalesce, _csv_field

# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _set_fk(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


@pytest.fixture(name="user_id")
def user_id_fixture(session: Session):
    user = User(
        id=uuid.uuid4(),
        email="svc@test.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user.id


@pytest.fixture(name="portfolio_id")
def portfolio_id_fixture(session: Session, user_id: uuid.UUID):
    p = Portfolio(name="Test", user_id=user_id)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p.id


@pytest.fixture(name="svc")
def service_fixture(session: Session):
    return TransactionService(session)


# ── Helper functions ──────────────────────────────────────────────────


class TestHelpers:
    def test_csv_field_none(self):
        assert _csv_field(None) == ""

    def test_csv_field_value(self):
        assert _csv_field(42) == 42

    def test_coalesce_new(self):
        assert _coalesce(10, 5) == 10

    def test_coalesce_existing(self):
        assert _coalesce(None, 5) == 5


# ── create_transaction validation ─────────────────────────────────────


class TestCreateTransaction:
    def test_portfolio_not_found(self, svc, user_id):
        with pytest.raises(PortfolioNotFoundException):
            svc.create_transaction(
                portfolio_id=999,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.DEPOSIT,
                total_amount=1000,
            )

    def test_negative_fx_rate(self, svc, user_id, portfolio_id):
        with pytest.raises(
            InvalidTransactionDataException, match="fx_rate must be positive"
        ):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.DEPOSIT,
                total_amount=1000,
                fx_rate=-1.0,
            )

    def test_zero_fx_rate(self, svc, user_id, portfolio_id):
        with pytest.raises(
            InvalidTransactionDataException, match="fx_rate must be positive"
        ):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.DEPOSIT,
                total_amount=1000,
                fx_rate=0,
            )

    def test_negative_split_ratio(self, svc, user_id, portfolio_id):
        with pytest.raises(
            InvalidTransactionDataException, match="split_ratio must be positive"
        ):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.SPLIT,
                ticker="AAPL",
                total_amount=0,
                split_ratio=-2.0,
            )

    def test_zero_split_ratio(self, svc, user_id, portfolio_id):
        with pytest.raises(
            InvalidTransactionDataException, match="split_ratio must be positive"
        ):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.SPLIT,
                ticker="AAPL",
                total_amount=0,
                split_ratio=0,
            )

    def test_eur_amount_sign_mismatch_positive_total_negative_eur(
        self, svc, user_id, portfolio_id
    ):
        with pytest.raises(InvalidTransactionDataException, match="sign must match"):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.DEPOSIT,
                total_amount=1000,
                eur_amount=-500,
            )

    def test_eur_amount_sign_mismatch_negative_total_positive_eur(
        self, svc, user_id, portfolio_id
    ):
        with pytest.raises(InvalidTransactionDataException, match="sign must match"):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.WITHDRAW,
                total_amount=-1000,
                eur_amount=500,
            )

    def test_eur_amount_sign_skip_for_split(self, svc, user_id, portfolio_id):
        """SPLIT transactions skip eur_amount sign check"""
        tx = svc.create_transaction(
            portfolio_id=portfolio_id,
            user_id=user_id,
            date=datetime(2024, 1, 1),
            transaction_type=TransactionType.SPLIT,
            total_amount=0,
            ticker="AAPL",
            split_ratio=2.0,
        )
        assert tx.type == TransactionType.SPLIT

    def test_deposit_with_ticker_rejected(self, svc, user_id, portfolio_id):
        with pytest.raises(
            InvalidTransactionDataException, match="should not have ticker"
        ):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.DEPOSIT,
                total_amount=1000,
                ticker="AAPL",
            )

    def test_deposit_with_quantity_rejected(self, svc, user_id, portfolio_id):
        with pytest.raises(
            InvalidTransactionDataException, match="should not have ticker"
        ):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.DEPOSIT,
                total_amount=1000,
                quantity=10,
            )

    def test_withdraw_with_price_rejected(self, svc, user_id, portfolio_id):
        with pytest.raises(
            InvalidTransactionDataException, match="should not have ticker"
        ):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.WITHDRAW,
                total_amount=-500,
                price_per_share=10,
            )

    def test_dividend_without_ticker_rejected(self, svc, user_id, portfolio_id):
        with pytest.raises(InvalidTransactionDataException, match="require a ticker"):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.DIVIDEND,
                total_amount=50,
            )

    def test_split_without_ticker_rejected(self, svc, user_id, portfolio_id):
        with pytest.raises(InvalidTransactionDataException, match="require a ticker"):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.SPLIT,
                total_amount=0,
                split_ratio=2.0,
            )

    def test_buy_missing_ticker(self, svc, user_id, portfolio_id):
        with pytest.raises(InvalidTransactionDataException, match="require a ticker"):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.BUY,
                total_amount=-1000,
                quantity=10,
                price_per_share=100,
            )

    def test_buy_missing_quantity(self, svc, user_id, portfolio_id):
        with pytest.raises(InvalidTransactionDataException, match="require quantity"):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.BUY,
                total_amount=-1000,
                ticker="AAPL",
                price_per_share=100,
            )

    def test_buy_missing_price(self, svc, user_id, portfolio_id):
        with pytest.raises(InvalidTransactionDataException, match="require a price"):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.BUY,
                total_amount=-1000,
                ticker="AAPL",
                quantity=10,
            )

    def test_sell_value_inconsistency(self, svc, user_id, portfolio_id):
        """SELL expected = qty * price - fee; big mismatch raises"""
        with pytest.raises(
            InvalidTransactionDataException, match="Value inconsistency"
        ):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.SELL,
                total_amount=9999,  # way off from 10*100 - 5 = 995
                ticker="AAPL",
                quantity=10,
                price_per_share=100,
                fee=5,
            )

    def test_negative_quantity_rejected(self, svc, user_id, portfolio_id):
        with pytest.raises(
            InvalidTransactionDataException, match="Quantity must be greater"
        ):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.BUY,
                total_amount=-1000,
                ticker="AAPL",
                quantity=-5,
                price_per_share=100,
            )

    def test_negative_price_rejected(self, svc, user_id, portfolio_id):
        with pytest.raises(
            InvalidTransactionDataException, match="Price must be greater"
        ):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.BUY,
                total_amount=-1000,
                ticker="AAPL",
                quantity=10,
                price_per_share=-100,
            )

    def test_negative_fee_rejected(self, svc, user_id, portfolio_id):
        with pytest.raises(
            InvalidTransactionDataException, match="Fee must be positive"
        ):
            svc.create_transaction(
                portfolio_id=portfolio_id,
                user_id=user_id,
                date=datetime(2024, 1, 1),
                transaction_type=TransactionType.DEPOSIT,
                total_amount=1000,
                fee=-1,
            )

    def test_successful_create(self, svc, user_id, portfolio_id):
        tx = svc.create_transaction(
            portfolio_id=portfolio_id,
            user_id=user_id,
            date=datetime(2024, 1, 1),
            transaction_type=TransactionType.DEPOSIT,
            total_amount=1000,
            eur_amount=920,
            currency="USD",
            fx_rate=1.087,
        )
        assert tx.id is not None
        assert tx.total_amount == pytest.approx(1000)
        assert tx.fx_rate == pytest.approx(1.087)


# ── get_transaction ───────────────────────────────────────────────────


class TestGetTransaction:
    def test_not_found(self, svc):
        with pytest.raises(TransactionNotFoundException):
            svc.get_transaction(999)

    def test_found(self, svc, user_id, portfolio_id):
        tx = svc.create_transaction(
            portfolio_id=portfolio_id,
            user_id=user_id,
            date=datetime(2024, 1, 1),
            transaction_type=TransactionType.DEPOSIT,
            total_amount=500,
        )
        found = svc.get_transaction(tx.id)
        assert found.id == tx.id


# ── get_transactions_by_portfolio ─────────────────────────────────────


class TestGetTransactionsByPortfolio:
    def test_portfolio_not_found(self, svc, user_id):
        with pytest.raises(PortfolioNotFoundException):
            svc.get_transactions_by_portfolio(999, user_id)

    def test_returns_list(self, svc, user_id, portfolio_id):
        svc.create_transaction(
            portfolio_id=portfolio_id,
            user_id=user_id,
            date=datetime(2024, 1, 1),
            transaction_type=TransactionType.DEPOSIT,
            total_amount=500,
        )
        result = svc.get_transactions_by_portfolio(portfolio_id, user_id)
        assert len(result) == 1


# ── paginated ─────────────────────────────────────────────────────────


class TestPaginated:
    def test_portfolio_not_found(self, svc, user_id):
        with pytest.raises(PortfolioNotFoundException):
            svc.get_transactions_by_portfolio_paginated(999, user_id)


# ── update_transaction ────────────────────────────────────────────────


class TestUpdateTransaction:
    def _make_deposit(self, svc, user_id, portfolio_id, amount=1000):
        return svc.create_transaction(
            portfolio_id=portfolio_id,
            user_id=user_id,
            date=datetime(2024, 1, 1),
            transaction_type=TransactionType.DEPOSIT,
            total_amount=amount,
        )

    def test_not_found(self, svc, user_id):
        with pytest.raises(TransactionNotFoundException):
            svc.update_transaction(999, user_id, total_amount=500)

    def test_fx_rate_zero_rejected(self, svc, user_id, portfolio_id):
        tx = self._make_deposit(svc, user_id, portfolio_id)
        with pytest.raises(
            InvalidTransactionDataException, match="fx_rate must be positive"
        ):
            svc.update_transaction(tx.id, user_id, fx_rate=0)

    def test_fx_rate_negative_rejected(self, svc, user_id, portfolio_id):
        tx = self._make_deposit(svc, user_id, portfolio_id)
        with pytest.raises(
            InvalidTransactionDataException, match="fx_rate must be positive"
        ):
            svc.update_transaction(tx.id, user_id, fx_rate=-1)

    def test_eur_amount_sign_mismatch_on_update(self, svc, user_id, portfolio_id):
        tx = self._make_deposit(svc, user_id, portfolio_id, amount=1000)
        with pytest.raises(InvalidTransactionDataException, match="sign must match"):
            svc.update_transaction(tx.id, user_id, eur_amount=-500)

    def test_eur_amount_sign_negative_total_positive_eur(
        self, svc, user_id, portfolio_id
    ):
        tx = svc.create_transaction(
            portfolio_id=portfolio_id,
            user_id=user_id,
            date=datetime(2024, 1, 1),
            transaction_type=TransactionType.WITHDRAW,
            total_amount=-500,
        )
        with pytest.raises(InvalidTransactionDataException, match="sign must match"):
            svc.update_transaction(tx.id, user_id, eur_amount=100)

    def test_eur_sign_skip_for_split(self, svc, user_id, portfolio_id):
        tx = svc.create_transaction(
            portfolio_id=portfolio_id,
            user_id=user_id,
            date=datetime(2024, 1, 1),
            transaction_type=TransactionType.SPLIT,
            total_amount=0,
            ticker="AAPL",
            split_ratio=2.0,
        )
        updated = svc.update_transaction(tx.id, user_id, eur_amount=-10)
        assert updated.eur_amount == pytest.approx(-10)

    def test_successful_update(self, svc, user_id, portfolio_id):
        tx = self._make_deposit(svc, user_id, portfolio_id)
        updated = svc.update_transaction(
            tx.id, user_id, total_amount=2000, eur_amount=1800
        )
        assert updated.total_amount == pytest.approx(2000)
        assert updated.eur_amount == pytest.approx(1800)


# ── delete_transaction ────────────────────────────────────────────────


class TestDeleteTransaction:
    def test_not_found(self, svc, user_id):
        with pytest.raises(TransactionNotFoundException):
            svc.delete_transaction(999, user_id)

    def test_successful(self, svc, user_id, portfolio_id):
        tx = svc.create_transaction(
            portfolio_id=portfolio_id,
            user_id=user_id,
            date=datetime(2024, 1, 1),
            transaction_type=TransactionType.DEPOSIT,
            total_amount=500,
        )
        svc.delete_transaction(tx.id, user_id)
        with pytest.raises(TransactionNotFoundException):
            svc.get_transaction(tx.id)


# ── export CSV ────────────────────────────────────────────────────────


class TestExportCSV:
    def test_portfolio_not_found(self, svc, user_id):
        with pytest.raises(PortfolioNotFoundException):
            svc.export_transactions_to_csv(999, user_id)

    def test_export_contains_header_and_rows(self, svc, user_id, portfolio_id):
        svc.create_transaction(
            portfolio_id=portfolio_id,
            user_id=user_id,
            date=datetime(2024, 3, 15, 10, 30, 0),
            transaction_type=TransactionType.DEPOSIT,
            total_amount=1000,
            eur_amount=920,
            currency="USD",
            fx_rate=1.087,
        )
        csv_out = svc.export_transactions_to_csv(portfolio_id, user_id)
        lines = csv_out.strip().split("\n")
        assert len(lines) == 2  # header + 1 row
        assert "date,type" in lines[0]
        assert "03/15/2024 10:30:00" in lines[1]
        assert "Deposit" in lines[1]

    def test_export_none_fields_become_empty(self, svc, user_id, portfolio_id):
        svc.create_transaction(
            portfolio_id=portfolio_id,
            user_id=user_id,
            date=datetime(2024, 1, 1, 0, 0, 0),
            transaction_type=TransactionType.DEPOSIT,
            total_amount=500,
        )
        csv_out = svc.export_transactions_to_csv(portfolio_id, user_id)
        # Deposit has no ticker, quantity, price_per_share — should be empty
        row = csv_out.strip().split("\n")[1]
        # ticker field (3rd) should be empty
        parts = row.split(",")
        assert parts[2] == ""  # ticker
        assert parts[3] == ""  # quantity
        assert parts[4] == ""  # price_per_share


# ── import CSV / _parse_csv ──────────────────────────────────────────


class TestImportCSV:
    def test_portfolio_not_found(self, svc, user_id):
        with pytest.raises(PortfolioNotFoundException):
            svc.import_from_csv("date,type,total_amount\n", 999, user_id)

    def test_missing_required_headers(self, svc, user_id, portfolio_id):
        with pytest.raises(InvalidCSVFormatException, match="must contain headers"):
            svc.import_from_csv("foo,bar\n1,2\n", portfolio_id, user_id)

    def test_empty_csv_no_rows(self, svc, user_id, portfolio_id):
        with pytest.raises(InvalidCSVFormatException, match="empty"):
            svc.import_from_csv("date,type,total_amount\n", portfolio_id, user_id)

    def test_invalid_date(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount\nnot-a-date,Deposit,1000\n"
        with pytest.raises(InvalidCSVFormatException, match="Invalid date format"):
            svc.import_from_csv(csv, portfolio_id, user_id)

    def test_invalid_transaction_type(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount\n01/01/2024 00:00:00,BadType,1000\n"
        with pytest.raises(InvalidCSVFormatException, match="Invalid transaction type"):
            svc.import_from_csv(csv, portfolio_id, user_id)

    def test_empty_total_amount(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount\n01/01/2024 00:00:00,Deposit,\n"
        with pytest.raises(InvalidCSVFormatException, match="total_amount"):
            svc.import_from_csv(csv, portfolio_id, user_id)

    def test_invalid_number_format(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount,quantity\n01/01/2024 00:00:00,Deposit,abc,\n"
        with pytest.raises(InvalidCSVFormatException, match="Invalid number"):
            svc.import_from_csv(csv, portfolio_id, user_id)

    def test_invalid_currency_length(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount,currency\n01/01/2024 00:00:00,Deposit,1000,US\n"
        with pytest.raises(InvalidCSVFormatException, match="3-letter code"):
            svc.import_from_csv(csv, portfolio_id, user_id)

    def test_invalid_fx_rate_zero(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount,fx_rate\n01/01/2024 00:00:00,Deposit,1000,0\n"
        with pytest.raises(InvalidCSVFormatException, match="fx_rate must be positive"):
            svc.import_from_csv(csv, portfolio_id, user_id)

    def test_invalid_fx_rate_negative(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount,fx_rate\n01/01/2024 00:00:00,Deposit,1000,-2\n"
        with pytest.raises(InvalidCSVFormatException, match="fx_rate must be positive"):
            svc.import_from_csv(csv, portfolio_id, user_id)

    def test_successful_import(self, svc, user_id, portfolio_id):
        csv = (
            "date,type,total_amount,ticker,quantity,price_per_share,fee,eur,split_ratio,currency,fx_rate\n"
            "01/15/2024 10:00:00,Deposit,5000,,,,4600,,,USD,1.087\n"
            "01/16/2024 11:00:00,Buy,-1505,AAPL,10,150,5,,,,\n"
        )
        txs, skipped = svc.import_from_csv(csv, portfolio_id, user_id)
        assert len(txs) == 2
        assert skipped == 0
        assert txs[0].type == TransactionType.DEPOSIT
        assert txs[1].ticker == "AAPL"


# ── _apply_csv_total_amount_sign ─────────────────────────────────────


class TestApplyCSVTotalAmountSign:
    def test_buy_positive_corrected(self, svc, user_id, portfolio_id):
        csv = (
            "date,type,total_amount,ticker,quantity,price_per_share\n"
            "01/01/2024 00:00:00,Buy,1000,AAPL,10,100\n"
        )
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == -1000

    def test_buy_negative_unchanged(self, svc, user_id, portfolio_id):
        csv = (
            "date,type,total_amount,ticker,quantity,price_per_share\n"
            "01/01/2024 00:00:00,Buy,-1000,AAPL,10,100\n"
        )
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == -1000

    def test_sell_negative_corrected(self, svc, user_id, portfolio_id):
        csv = (
            "date,type,total_amount,ticker,quantity,price_per_share\n"
            "01/01/2024 00:00:00,Sell,-1000,AAPL,10,100\n"
        )
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == 1000

    def test_sell_positive_unchanged(self, svc, user_id, portfolio_id):
        csv = (
            "date,type,total_amount,ticker,quantity,price_per_share\n"
            "01/01/2024 00:00:00,Sell,1000,AAPL,10,100\n"
        )
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == 1000

    def test_deposit_negative_corrected(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount\n01/01/2024 00:00:00,Deposit,-500\n"
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == 500

    def test_deposit_positive_unchanged(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount\n01/01/2024 00:00:00,Deposit,500\n"
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == 500

    def test_withdraw_positive_corrected(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount\n01/01/2024 00:00:00,Withdraw,500\n"
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == -500

    def test_withdraw_negative_unchanged(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount\n01/01/2024 00:00:00,Withdraw,-500\n"
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == -500

    def test_fee_positive_corrected(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount\n01/01/2024 00:00:00,Fee,10\n"
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == -10

    def test_fee_negative_unchanged(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount\n01/01/2024 00:00:00,Fee,-10\n"
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == -10

    def test_dividend_negative_corrected(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount,ticker\n01/01/2024 00:00:00,Dividend,-50,AAPL\n"
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == 50

    def test_dividend_positive_unchanged(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount,ticker\n01/01/2024 00:00:00,Dividend,50,AAPL\n"
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].total_amount == 50

    def test_split_nonzero_rejected(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount,ticker,split_ratio\n01/01/2024 00:00:00,Split,100,AAPL,2\n"
        with pytest.raises(InvalidCSVFormatException, match="total_amount of 0"):
            svc.import_from_csv(csv, portfolio_id, user_id)


# ── _apply_csv_eur_sign ─────────────────────────────────────────────


class TestApplyCSVEurSign:
    def test_eur_sign_corrected(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount,eur\n01/01/2024 00:00:00,Deposit,1000,-500\n"
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].eur_amount == 500

    def test_eur_sign_already_correct(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount,eur\n01/01/2024 00:00:00,Deposit,1000,500\n"
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].eur_amount == 500

    def test_eur_sign_ok_for_split(self, svc, user_id, portfolio_id):
        """SPLIT normalizes eur_amount to zero (no cash impact)"""
        csv = "date,type,total_amount,ticker,split_ratio,eur\n01/01/2024 00:00:00,Split,0,AAPL,2,-10\n"
        txs, _skipped = svc.import_from_csv(csv, portfolio_id, user_id)
        assert len(txs) == 1
        assert txs[0].eur_amount == 0.0

    def test_eur_none_passes(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount,eur\n01/01/2024 00:00:00,Deposit,1000,\n"
        txs, _skipped = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].eur_amount is None

    def test_eur_sign_corrected_negative_total(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount,eur\n01/01/2024 00:00:00,Withdraw,-500,300\n"
        txs, _ = svc.import_from_csv(csv, portfolio_id, user_id)
        assert txs[0].eur_amount == -300


# ── Deduplication ────────────────────────────────────────────────────


class TestImportCSVDeduplication:
    def test_all_duplicates_skipped(self, svc, user_id, portfolio_id):
        csv = "date,type,total_amount\n01/01/2024 00:00:00,Deposit,1000\n"
        txs1, skipped1 = svc.import_from_csv(csv, portfolio_id, user_id)
        assert len(txs1) == 1
        assert skipped1 == 0

        txs2, skipped2 = svc.import_from_csv(csv, portfolio_id, user_id)
        assert len(txs2) == 0
        assert skipped2 == 1

    def test_partial_duplicates(self, svc, user_id, portfolio_id):
        csv1 = "date,type,total_amount\n01/01/2024 00:00:00,Deposit,1000\n"
        svc.import_from_csv(csv1, portfolio_id, user_id)

        csv2 = (
            "date,type,total_amount\n"
            "01/01/2024 00:00:00,Deposit,1000\n"
            "01/02/2024 00:00:00,Deposit,2000\n"
        )
        txs, skipped = svc.import_from_csv(csv2, portfolio_id, user_id)
        assert len(txs) == 1
        assert skipped == 1
        assert txs[0].total_amount == 2000

    def test_no_duplicates(self, svc, user_id, portfolio_id):
        csv1 = "date,type,total_amount\n01/01/2024 00:00:00,Deposit,1000\n"
        svc.import_from_csv(csv1, portfolio_id, user_id)

        csv2 = "date,type,total_amount\n01/02/2024 00:00:00,Deposit,2000\n"
        txs, skipped = svc.import_from_csv(csv2, portfolio_id, user_id)
        assert len(txs) == 1
        assert skipped == 0

    def test_different_field_not_duplicate(self, svc, user_id, portfolio_id):
        csv1 = "date,type,total_amount\n01/01/2024 00:00:00,Deposit,1000\n"
        svc.import_from_csv(csv1, portfolio_id, user_id)

        csv2 = "date,type,total_amount\n01/01/2024 00:00:00,Deposit,999\n"
        txs, skipped = svc.import_from_csv(csv2, portfolio_id, user_id)
        assert len(txs) == 1
        assert skipped == 0

    def test_within_batch_duplicates(self, svc, user_id, portfolio_id):
        """Duplicate rows within the same CSV batch should be deduplicated."""
        csv = (
            "date,type,total_amount\n"
            "01/01/2024 00:00:00,Deposit,1000\n"
            "01/01/2024 00:00:00,Deposit,1000\n"
            "01/02/2024 00:00:00,Deposit,2000\n"
        )
        txs, skipped = svc.import_from_csv(csv, portfolio_id, user_id)
        assert len(txs) == 2
        assert skipped == 1


# ── _clean_csv_number ────────────────────────────────────────────────


class TestCleanCSVNumber:
    def test_empty_string_returns_none(self):
        assert TransactionService._clean_csv_number("", "x") is None

    def test_whitespace_returns_none(self):
        assert TransactionService._clean_csv_number("   ", "x") is None

    def test_thousand_separators_stripped(self):
        assert TransactionService._clean_csv_number("1,234.56", "x") == pytest.approx(
            1234.56
        )

    def test_negative(self):
        assert TransactionService._clean_csv_number("-500", "x") == pytest.approx(-500)

    def test_invalid_raises(self):
        with pytest.raises(ValueError, match="Invalid number"):
            TransactionService._clean_csv_number("abc", "x")
