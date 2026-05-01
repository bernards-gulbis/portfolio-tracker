"""Tests for TransactionRepository — edge cases and error handling."""

import uuid
from datetime import UTC, datetime
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
        with (
            patch.object(session, "commit", side_effect=SQLAlchemyError("db error")),
            patch.object(session, "rollback") as mock_rollback,
            pytest.raises(SQLAlchemyError),
        ):
            repo.bulk_create([tx])
        mock_rollback.assert_called_once()


def _seed_portfolio(session: Session, name: str = "AuditTest") -> Portfolio:
    user = User(
        id=uuid.uuid4(),
        email=f"{name.lower()}@test.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    session.add(user)
    session.commit()
    p = Portfolio(name=name, user_id=user.id)
    session.add(p)
    session.commit()
    return p


class TestSoftDelete:
    """Soft-delete should hide rows from default queries but preserve them
    on disk so a deletion can be reconstructed from the audit trail."""

    def test_delete_marks_deleted_at_without_removing_row(self, session: Session):
        p = _seed_portfolio(session, "SoftDel1")
        repo = TransactionRepository(session)
        tx = repo.create(
            Transaction(
                portfolio_id=p.id,
                date=datetime(2024, 1, 1),
                type=TransactionType.DEPOSIT,
                total_amount=500,
            )
        )

        assert repo.delete(tx.id) is True

        # Row is hidden from default reads.
        assert repo.get_by_id(tx.id) is None
        assert repo.get_by_portfolio_id(p.id) == []
        paginated, total = repo.get_by_portfolio_id_paginated(p.id)
        assert paginated == []
        assert total == 0

        # But still exists when you ask for it explicitly.
        revealed = repo.get_by_id(tx.id, include_deleted=True)
        assert revealed is not None
        assert revealed.deleted_at is not None

    def test_delete_is_idempotent_for_already_deleted(self, session: Session):
        p = _seed_portfolio(session, "SoftDel2")
        repo = TransactionRepository(session)
        tx = repo.create(
            Transaction(
                portfolio_id=p.id,
                date=datetime(2024, 1, 1),
                type=TransactionType.DEPOSIT,
                total_amount=500,
            )
        )

        assert repo.delete(tx.id) is True
        # Second delete should report False rather than re-stamping.
        assert repo.delete(tx.id) is False

    def test_get_by_id_and_user_excludes_deleted_by_default(self, session: Session):
        p = _seed_portfolio(session, "SoftDel3")
        repo = TransactionRepository(session)
        tx = repo.create(
            Transaction(
                portfolio_id=p.id,
                date=datetime(2024, 1, 1),
                type=TransactionType.DEPOSIT,
                total_amount=500,
            )
        )
        repo.delete(tx.id)

        assert repo.get_by_id_and_user(tx.id, p.user_id) is None
        assert (
            repo.get_by_id_and_user(tx.id, p.user_id, include_deleted=True) is not None
        )

    def test_hard_delete_removes_row_entirely(self, session: Session):
        p = _seed_portfolio(session, "SoftDel4")
        repo = TransactionRepository(session)
        tx = repo.create(
            Transaction(
                portfolio_id=p.id,
                date=datetime(2024, 1, 1),
                type=TransactionType.DEPOSIT,
                total_amount=500,
            )
        )
        tx_id = tx.id

        assert repo.hard_delete(tx_id) is True
        # Even ``include_deleted=True`` cannot resurrect a hard-deleted row.
        assert repo.get_by_id(tx_id, include_deleted=True) is None
        assert repo.hard_delete(tx_id) is False


class TestUpdateStampsUpdatedAt:
    def test_update_sets_updated_at(self, session: Session):
        p = _seed_portfolio(session, "Audit5")
        repo = TransactionRepository(session)
        tx = repo.create(
            Transaction(
                portfolio_id=p.id,
                date=datetime(2024, 1, 1),
                type=TransactionType.DEPOSIT,
                total_amount=500,
            )
        )
        assert tx.updated_at is None

        tx.total_amount = 600
        updated = repo.update(tx)
        assert updated.updated_at is not None


class TestCreateStampsCreatedAt:
    def test_create_sets_created_at_python_side(self, session: Session):
        p = _seed_portfolio(session, "Audit6")
        repo = TransactionRepository(session)
        before = datetime.now(UTC)
        tx = repo.create(
            Transaction(
                portfolio_id=p.id,
                date=datetime(2024, 1, 1),
                type=TransactionType.DEPOSIT,
                total_amount=500,
            )
        )
        after = datetime.now(UTC)

        assert tx.created_at is not None
        # SQLite-loaded datetimes come back naive; compare against naive bounds.
        created_at = tx.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        assert before <= created_at <= after
