"""
Transaction repository for data access
"""
import uuid
from sqlmodel import Session, select, func
from typing import List, Optional, Tuple
from sqlalchemy.exc import SQLAlchemyError
from app.models import Transaction, Portfolio


class TransactionRepository:
    """Repository for Transaction data access"""

    def __init__(self, session: Session):
        self.session = session

    def create(self, transaction: Transaction) -> Transaction:
        """Create a new transaction"""
        self.session.add(transaction)
        self.session.commit()
        self.session.refresh(transaction)
        return transaction

    def bulk_create(self, transactions: List[Transaction]) -> List[Transaction]:
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

    def get_by_id(self, transaction_id: int) -> Optional[Transaction]:
        """Get a transaction by ID"""
        return self.session.get(Transaction, transaction_id)

    def get_by_id_and_user(self, transaction_id: int, user_id: uuid.UUID) -> Optional[Transaction]:
        """Get a transaction by ID verifying ownership via portfolio"""
        statement = (
            select(Transaction)
            .join(Portfolio, Transaction.portfolio_id == Portfolio.id)
            .where(Transaction.id == transaction_id, Portfolio.user_id == user_id)
        )
        return self.session.exec(statement).first()

    def get_by_portfolio_id(self, portfolio_id: int) -> List[Transaction]:
        """Get all transactions for a specific portfolio"""
        statement = select(Transaction).where(Transaction.portfolio_id == portfolio_id)
        return list(self.session.exec(statement).all())

    def get_by_portfolio_id_paginated(self, portfolio_id: int, page: int = 1, page_size: int = 20) -> Tuple[List[Transaction], int]:
        """Get paginated transactions for a specific portfolio"""
        count_statement = select(func.count()).select_from(Transaction).where(Transaction.portfolio_id == portfolio_id)
        total = self.session.exec(count_statement).one()

        offset = (page - 1) * page_size
        statement = (
            select(Transaction)
            .where(Transaction.portfolio_id == portfolio_id)
            .order_by(Transaction.date.desc(), Transaction.id.desc())
            .offset(offset)
            .limit(page_size)
        )
        transactions = list(self.session.exec(statement).all())
        return transactions, total

    def update(self, transaction: Transaction) -> Transaction:
        """Update a transaction"""
        self.session.add(transaction)
        self.session.commit()
        self.session.refresh(transaction)
        return transaction

    def delete(self, transaction_id: int) -> bool:
        """Delete a transaction"""
        transaction = self.get_by_id(transaction_id)
        if transaction:
            self.session.delete(transaction)
            self.session.commit()
            return True
        return False

    def exists(self, transaction_id: int) -> bool:
        """Check if a transaction exists"""
        return self.get_by_id(transaction_id) is not None
