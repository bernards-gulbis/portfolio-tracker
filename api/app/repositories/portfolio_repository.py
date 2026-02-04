"""
Portfolio repository for data access
"""
from sqlmodel import Session, select
from typing import List, Optional
from app.models import Portfolio, Transaction


class PortfolioRepository:
    """Repository for Portfolio data access"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def create(self, name: str) -> Portfolio:
        """Create a new portfolio"""
        portfolio = Portfolio(name=name)
        self.session.add(portfolio)
        self.session.commit()
        self.session.refresh(portfolio)
        return portfolio
    
    def get_by_id(self, portfolio_id: int) -> Optional[Portfolio]:
        """Get a portfolio by ID"""
        return self.session.get(Portfolio, portfolio_id)
    
    def get_all(self) -> List[Portfolio]:
        """Get all portfolios"""
        statement = select(Portfolio)
        return list(self.session.exec(statement).all())
    
    def update(self, portfolio_id: int, name: str) -> Optional[Portfolio]:
        """Update a portfolio's name"""
        portfolio = self.get_by_id(portfolio_id)
        if portfolio:
            portfolio.name = name
            self.session.add(portfolio)
            self.session.commit()
            self.session.refresh(portfolio)
        return portfolio
    
    def delete(self, portfolio_id: int) -> bool:
        """Delete a portfolio and all its transactions"""
        portfolio = self.get_by_id(portfolio_id)
        if portfolio:
            # Delete all associated transactions first
            statement = select(Transaction).where(Transaction.portfolio_id == portfolio_id)
            transactions = self.session.exec(statement).all()
            for transaction in transactions:
                self.session.delete(transaction)
            
            self.session.delete(portfolio)
            self.session.commit()
            return True
        return False
    
    def exists(self, portfolio_id: int) -> bool:
        """Check if a portfolio exists"""
        return self.get_by_id(portfolio_id) is not None
