"""
Portfolio repository for data access
"""
import uuid
from sqlmodel import Session, select
from typing import List, Optional
from sqlalchemy.exc import SQLAlchemyError
from app.models import Portfolio, Transaction


class PortfolioRepository:
    """Repository for Portfolio data access"""

    def __init__(self, session: Session):
        self.session = session

    def create(self, name: str, user_id: uuid.UUID) -> Portfolio:
        """Create a new portfolio"""
        portfolio = Portfolio(name=name, user_id=user_id)
        self.session.add(portfolio)
        self.session.commit()
        self.session.refresh(portfolio)
        return portfolio

    def get_by_id(self, portfolio_id: int) -> Optional[Portfolio]:
        """Get a portfolio by ID (no user check)"""
        return self.session.get(Portfolio, portfolio_id)

    def get_by_id_and_user(self, portfolio_id: int, user_id: uuid.UUID) -> Optional[Portfolio]:
        """Get a portfolio by ID scoped to user"""
        statement = select(Portfolio).where(
            Portfolio.id == portfolio_id,
            Portfolio.user_id == user_id
        )
        return self.session.exec(statement).first()

    def get_all(self) -> List[Portfolio]:
        """Get all portfolios (no user filter)"""
        statement = select(Portfolio)
        return list(self.session.exec(statement).all())

    def get_all_for_user(self, user_id: uuid.UUID) -> List[Portfolio]:
        """Get all portfolios for a specific user"""
        statement = select(Portfolio).where(Portfolio.user_id == user_id)
        return list(self.session.exec(statement).all())

    def update(self, portfolio_id: int, name: str, user_id: uuid.UUID) -> Optional[Portfolio]:
        """Update a portfolio's name (user-scoped)"""
        portfolio = self.get_by_id_and_user(portfolio_id, user_id)
        if portfolio:
            portfolio.name = name
            self.session.add(portfolio)
            self.session.commit()
            self.session.refresh(portfolio)
        return portfolio

    def delete(self, portfolio_id: int, user_id: uuid.UUID) -> bool:
        """Delete a portfolio and all its transactions (user-scoped)"""
        portfolio = self.get_by_id_and_user(portfolio_id, user_id)
        if portfolio:
            self.session.delete(portfolio)
            self.session.commit()
            return True
        return False

    def exists_for_user(self, portfolio_id: int, user_id: uuid.UUID) -> bool:
        """Check if a portfolio exists and belongs to user"""
        return self.get_by_id_and_user(portfolio_id, user_id) is not None

    def copy_with_transactions(self, portfolio_id: int, new_name: str, user_id: uuid.UUID) -> Optional[Portfolio]:
        """Copy a portfolio with all its transactions (user-scoped)"""
        original = self.get_by_id_and_user(portfolio_id, user_id)
        if not original:
            return None

        new_portfolio = Portfolio(name=new_name, user_id=user_id)
        self.session.add(new_portfolio)
        self.session.flush()

        for original_transaction in original.transactions:
            new_transaction = Transaction(
                portfolio_id=new_portfolio.id,
                date=original_transaction.date,
                type=original_transaction.type,
                ticker=original_transaction.ticker,
                quantity=original_transaction.quantity,
                price_per_share=original_transaction.price_per_share,
                fee=original_transaction.fee,
                total_amount=original_transaction.total_amount,
                eur_amount=original_transaction.eur_amount,
                split_ratio=original_transaction.split_ratio,
                currency=original_transaction.currency,
                fx_rate=original_transaction.fx_rate,
            )
            self.session.add(new_transaction)

        self.session.commit()
        self.session.refresh(new_portfolio)
        return new_portfolio
