"""Tests for TransactionRepository — edge cases and error handling."""

import uuid
from datetime import datetime
from unittest.mock import patch

import pytest
from sqlalchemy import event
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.models import Portfolio, Transaction, TransactionType
from app.models.historical_price import FxRate, HistoricalPrice  # noqa: F401
from app.models.user import User
from app.repositories.transaction_repository import TransactionRepository


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


class TestTransactionRepositoryEdgeCases:
    def test_delete_nonexistent_returns_false(self, session: Session):
        repo = TransactionRepository(session)
        result = repo.delete(99999)
        assert result is False

    def test_bulk_create_rolls_back_on_error(self, session: Session):
        user = User(
            id=uuid.uuid4(),
            email="bulk@test.com",
            hashed_password="x",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add(user)
        session.commit()
        p = Portfolio(name="BulkTest", user_id=user.id)
        session.add(p)
        session.commit()

        repo = TransactionRepository(session)
        tx = Transaction(
            portfolio_id=p.id,
            date=datetime(2024, 1, 1),
            type=TransactionType.DEPOSIT,
            total_amount=1000,
        )
        with patch.object(session, "commit", side_effect=SQLAlchemyError("db error")):
            with pytest.raises(SQLAlchemyError):
                repo.bulk_create([tx])
