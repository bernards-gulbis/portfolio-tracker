"""
Transaction repository for data access
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, func, select

from app.models import Portfolio, Transaction


def _utcnow() -> datetime:
    return datetime.now(UTC)


class TransactionRepository:
    """Repository for Transaction data access.

    All read methods filter out soft-deleted rows by default (``deleted_at IS
    NULL``); pass ``include_deleted=True`` for audit/recovery use cases. The
    ``delete`` method performs a soft-delete (sets ``deleted_at = utcnow``);
    use ``hard_delete`` only when genuinely removing data is required.
    """

    def __init__(self, session: Session):
        self.session = session

    def create(self, transaction: Transaction) -> Transaction:
        """Create a new transaction"""
        self.session.add(transaction)
        self.session.commit()
        self.session.refresh(transaction)
        return transaction

    def bulk_create(self, transactions: list[Transaction]) -> list[Transaction]:
        """Create multiple transactions atomically"""
        try:
            for transaction in transactions:
                self.session.add(transaction)
            self.session.commit()
            for transaction in transactions:
                self.session.refresh(transaction)
            return transactions
        except SQLAlchemyError:
            self.session.rollback()
            raise

    def get_by_id(
        self, transaction_id: int, *, include_deleted: bool = False
    ) -> Transaction | None:
        """Get a transaction by ID. Excludes soft-deleted rows by default."""
        tx = self.session.get(Transaction, transaction_id)
        if tx is None:
            return None
        if not include_deleted and tx.deleted_at is not None:
            return None
        return tx

    def get_by_id_and_user(
        self,
        transaction_id: int,
        user_id: uuid.UUID,
        *,
        include_deleted: bool = False,
    ) -> Transaction | None:
        """Get a transaction by ID verifying ownership via portfolio."""
        statement = (
            select(Transaction)
            .join(Portfolio, Transaction.portfolio_id == Portfolio.id)
            .where(Transaction.id == transaction_id, Portfolio.user_id == user_id)
        )
        if not include_deleted:
            statement = statement.where(Transaction.deleted_at.is_(None))
        return self.session.exec(statement).first()

    def get_by_portfolio_id(
        self, portfolio_id: int, *, include_deleted: bool = False
    ) -> list[Transaction]:
        """Get all live transactions for a portfolio, ordered chronologically."""
        statement = (
            select(Transaction)
            .where(Transaction.portfolio_id == portfolio_id)
            .order_by(Transaction.date, Transaction.id)
        )
        if not include_deleted:
            statement = statement.where(Transaction.deleted_at.is_(None))
        return list(self.session.exec(statement).all())

    def get_by_portfolio_id_paginated(
        self,
        portfolio_id: int,
        page: int = 1,
        page_size: int = 20,
        ticker: str | None = None,
        transaction_types: list[str] | None = None,
        sort_order: str = "desc",
    ) -> tuple[list[Transaction], int]:
        """Get paginated live transactions for a portfolio."""
        conditions = [
            Transaction.portfolio_id == portfolio_id,
            Transaction.deleted_at.is_(None),
        ]
        if ticker:
            conditions.append(Transaction.ticker.ilike(f"%{ticker}%"))
        if transaction_types:
            conditions.append(Transaction.type.in_(transaction_types))

        count_statement = (
            select(func.count()).select_from(Transaction).where(*conditions)
        )
        total = self.session.exec(count_statement).one()

        date_col = (
            Transaction.date.asc() if sort_order == "asc" else Transaction.date.desc()
        )
        id_col = Transaction.id.asc() if sort_order == "asc" else Transaction.id.desc()

        offset = (page - 1) * page_size
        statement = (
            select(Transaction)
            .where(*conditions)
            .order_by(date_col, id_col)
            .offset(offset)
            .limit(page_size)
        )
        transactions = list(self.session.exec(statement).all())
        return transactions, total

    def update(self, transaction: Transaction) -> Transaction:
        """Update a transaction. Stamps ``updated_at``."""
        transaction.updated_at = _utcnow()
        self.session.add(transaction)
        self.session.commit()
        self.session.refresh(transaction)
        return transaction

    def delete(self, transaction_id: int) -> bool:
        """Soft-delete a transaction by stamping ``deleted_at``.

        Returns ``True`` if a live row was found and marked deleted, ``False``
        if the row does not exist or was already soft-deleted (idempotent).
        """
        transaction = self.get_by_id(transaction_id)
        if transaction is None:
            return False
        transaction.deleted_at = _utcnow()
        self.session.add(transaction)
        self.session.commit()
        return True

    def hard_delete(self, transaction_id: int) -> bool:
        """Permanently remove a transaction (bypasses the audit trail).

        Reserved for genuine data-removal needs (e.g. GDPR erasure). Most
        callers should prefer :meth:`delete`.
        """
        transaction = self.session.get(Transaction, transaction_id)
        if transaction is None:
            return False
        self.session.delete(transaction)
        self.session.commit()
        return True
