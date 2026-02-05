"""
Portfolio service for business logic
"""
import math
from typing import List, Dict
from sqlmodel import Session
from app.models import Portfolio, TransactionType
from app.repositories.portfolio_repository import PortfolioRepository
from app.repositories.transaction_repository import TransactionRepository
from app.core.exceptions import (
    PortfolioNotFoundException,
    InvalidPortfolioNameException,
)
from app.schemas import HoldingResponse, PortfolioStatusResponse

# Precision threshold for holdings units (8 decimal places)
HOLDINGS_EPSILON = 1e-8


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
    
    def copy_portfolio(self, portfolio_id: int, new_name: str) -> Portfolio:
        """Copy a portfolio with all its transactions"""
        # Validate new name
        if not new_name or len(new_name.strip()) == 0:
            raise InvalidPortfolioNameException("Portfolio name cannot be empty")
        
        if len(new_name) > 255:
            raise InvalidPortfolioNameException("Portfolio name cannot exceed 255 characters")
        
        # Copy the portfolio
        copied_portfolio = self.portfolio_repo.copy_with_transactions(
            portfolio_id, new_name.strip()
        )
        
        if not copied_portfolio:
            raise PortfolioNotFoundException(portfolio_id)
        
        return copied_portfolio
    
    def calculate_portfolio_status(self, portfolio_id: int) -> PortfolioStatusResponse:
        """Calculate current portfolio status including holdings, cash balance, and metrics"""
        # Get portfolio
        portfolio = self.portfolio_repo.get_by_id(portfolio_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)
        
        # Get all transactions ordered by date
        transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)
        
        # Sort by date_time to process in chronological order
        transactions.sort(key=lambda t: (t.date_time, t.id))
        
        # Initialize tracking variables
        cash_balance = 0.0
        total_invested = 0.0  # Deposits - Withdrawals
        dividends_received = 0.0
        realized_gains = 0.0
        total_value_eur = 0.0  # Sum of all EUR values
        holdings: Dict[str, Dict[str, float]] = {}  # ticker -> {units, total_cost}
        
        # Process each transaction
        for transaction in transactions:
            tx_type = transaction.type
            value = transaction.value  # Stored as positive, apply sign as needed
            fee = transaction.fee  # Stored as positive
            
            if tx_type == TransactionType.DEPOSIT:
                # Deposit adds cash and increases invested amount
                cash_balance += value
                total_invested += value
                if transaction.value_eur is not None:
                    total_value_eur += transaction.value_eur
                
            elif tx_type == TransactionType.WITHDRAW:
                # Withdraw removes cash and decreases invested amount (value stored as positive)
                cash_balance -= value
                total_invested -= value
                if transaction.value_eur is not None:
                    total_value_eur -= transaction.value_eur
                
            elif tx_type == TransactionType.BUY:
                # Buy decreases cash and adds to holdings (value stored as positive)
                cash_balance -= value
                
                ticker = transaction.ticker
                units = transaction.units or 0
                price = transaction.price or 0
                cost = value  # Cost basis for these units
                
                if ticker:
                    if ticker not in holdings:
                        holdings[ticker] = {'units': 0.0, 'total_cost': 0.0}
                    holdings[ticker]['units'] += units
                    holdings[ticker]['total_cost'] += cost
                    
            elif tx_type == TransactionType.SELL:
                # Sell increases cash, removes from holdings, and calculates gain (value stored as positive, includes fees)
                cash_balance += value
                
                ticker = transaction.ticker
                units = transaction.units or 0
                
                if ticker:
                    # Validate ticker exists in holdings
                    if ticker not in holdings:
                        raise ValueError(f"Cannot sell {ticker}: not in holdings for portfolio {portfolio_id}")
                    
                    # Validate sufficient units (with epsilon for floating-point precision)
                    if units > holdings[ticker]['units'] + HOLDINGS_EPSILON:
                        raise ValueError(
                            f"Cannot sell {units} units of {ticker}: only {holdings[ticker]['units']} available"
                        )
                    
                    # Calculate average cost per unit for this holding
                    avg_cost_per_unit = (holdings[ticker]['total_cost'] / holdings[ticker]['units'] 
                                        if holdings[ticker]['units'] > 0 else 0)
                    
                    # Cost basis of units being sold
                    cost_basis = avg_cost_per_unit * units
                    
                    # Realized gain = sale proceeds - cost basis (fees already included in value)
                    realized_gains += (value - cost_basis)
                    
                    # Update holdings
                    holdings[ticker]['units'] -= units
                    holdings[ticker]['total_cost'] -= cost_basis
                    
                    # Remove if fully sold (using 8 decimal place precision)
                    if math.isclose(holdings[ticker]['units'], 0.0, abs_tol=HOLDINGS_EPSILON) or holdings[ticker]['units'] < HOLDINGS_EPSILON:
                        del holdings[ticker]
                        
            elif tx_type == TransactionType.DIVIDEND:
                # Dividend adds cash and tracks dividend income (value stored as positive)
                cash_balance += value
                dividends_received += value
                
            elif tx_type == TransactionType.FEE:
                # Fee reduces cash (value stored as positive, apply negative)
                cash_balance -= value
                
            elif tx_type == TransactionType.SPLIT:
                # Split adjusts the number of units
                ticker = transaction.ticker
                split_ratio = transaction.split_ratio or 1.0
                
                # Validate split ratio
                if split_ratio <= 0:
                    raise ValueError(f"Invalid split ratio {split_ratio}: must be positive")
                
                if ticker and ticker in holdings:
                    holdings[ticker]['units'] *= split_ratio
                    # Cost basis remains the same (value doesn't change, just distribution)
        
        # Convert holdings dict to list of HoldingResponse
        holdings_list = []
        total_holdings_cost = 0.0
        
        for ticker, holding_data in holdings.items():
            units = holding_data['units']
            total_cost = holding_data['total_cost']
            avg_cost = total_cost / units if units > 0 else 0
            
            holdings_list.append(HoldingResponse(
                ticker=ticker,
                units=units,
                average_cost=avg_cost,
                total_cost=total_cost
            ))
            total_holdings_cost += total_cost
        
        # Sort holdings by ticker
        holdings_list.sort(key=lambda h: h.ticker)
        
        # Normalize negative zero values for display
        def normalize_zero(value: float) -> float:
            """Convert -0.0 to 0.0 to avoid negative zero display"""
            return 0.0 if abs(value) < HOLDINGS_EPSILON else value
        
        return PortfolioStatusResponse(
            portfolio_id=portfolio.id,
            portfolio_name=portfolio.name,
            cash_balance=normalize_zero(cash_balance),
            total_invested=normalize_zero(total_invested),
            dividends_received=normalize_zero(dividends_received),
            realized_gains=normalize_zero(realized_gains),
            total_value_eur=normalize_zero(total_value_eur),
            holdings=holdings_list,
            total_holdings_cost=normalize_zero(total_holdings_cost)
        )
