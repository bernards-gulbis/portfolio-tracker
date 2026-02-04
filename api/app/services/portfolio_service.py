"""
Portfolio service for business logic
"""
from typing import List
from sqlmodel import Session
from app.models import Portfolio
from app.repositories.portfolio_repository import PortfolioRepository
from app.repositories.transaction_repository import TransactionRepository
from app.core.exceptions import (
    PortfolioNotFoundException,
    InvalidPortfolioNameException,
)


class PortfolioService:
    """Service for portfolio business logic"""
    
    def __init__(self, session: Session):
        self.portfolio_repo = PortfolioRepository(session)
        self.transaction_repo = TransactionRepository(session)
    
    def create_portfolio(self, name: str) -> Portfolio:
        """Create a new portfolio with validation"""
        # Business validation
        if not name or len(name.strip()) == 0:
            raise InvalidPortfolioNameException("Portfolio name cannot be empty")
        
        if len(name) > 255:
            raise InvalidPortfolioNameException("Portfolio name cannot exceed 255 characters")
        
        return self.portfolio_repo.create(name.strip())
    
    def get_portfolio(self, portfolio_id: int) -> Portfolio:
        """Get a portfolio by ID"""
        portfolio = self.portfolio_repo.get_by_id(portfolio_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)
        return portfolio
    
    def get_all_portfolios(self) -> List[Portfolio]:
        """Get all portfolios"""
        return self.portfolio_repo.get_all()
    
    def update_portfolio(self, portfolio_id: int, name: str) -> Portfolio:
        """Update a portfolio"""
        # Business validation
        if not name or len(name.strip()) == 0:
            raise InvalidPortfolioNameException("Portfolio name cannot be empty")
        
        if len(name) > 255:
            raise InvalidPortfolioNameException("Portfolio name cannot exceed 255 characters")
        
        portfolio = self.portfolio_repo.update(portfolio_id, name.strip())
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)
        return portfolio
    
    def delete_portfolio(self, portfolio_id: int) -> None:
        """Delete a portfolio"""
        if not self.portfolio_repo.delete(portfolio_id):
            raise PortfolioNotFoundException(portfolio_id)
    
    def portfolio_exists(self, portfolio_id: int) -> bool:
        """Check if a portfolio exists"""
        return self.portfolio_repo.exists(portfolio_id)
