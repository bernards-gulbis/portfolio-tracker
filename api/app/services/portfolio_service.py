"""
Portfolio service for business logic
"""
import math
import logging
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
from app.services.price_service import PriceService

# Precision threshold for holdings quantity (8 decimal places)
HOLDINGS_EPSILON = 1e-8

logger = logging.getLogger(__name__)


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
        
        # Sort by date to process in chronological order
        transactions.sort(key=lambda t: (t.date, t.id))
        
        # Initialize tracking variables
        cash_balance = 0.0
        total_invested = 0.0  # Deposits - Withdrawals
        dividends_received = 0.0
        realized_gains = 0.0
        total_eur_amount = 0.0  # Sum of all deposit and withdraw EUR values
        holdings: Dict[str, Dict[str, float]] = {}  # ticker -> {quantity, total_cost}
        
        # Process each transaction
        for transaction in transactions:
            tx_type = transaction.type
            total_amount = transaction.total_amount  # Now stored with correct sign
            
            if tx_type == TransactionType.DEPOSIT:
                # Deposit adds cash and increases invested amount (stored as positive)
                cash_balance += total_amount
                total_invested += total_amount
                if transaction.eur_amount is not None:
                    total_eur_amount += transaction.eur_amount
                
            elif tx_type == TransactionType.WITHDRAW:
                # Withdraw removes cash and decreases invested amount (stored as negative)
                cash_balance += total_amount  # total_amount is negative, so this subtracts
                total_invested += total_amount  # total_amount is negative, so this subtracts
                if transaction.eur_amount is not None:
                    total_eur_amount += transaction.eur_amount  # eur_amount is negative for withdraws
                
            elif tx_type == TransactionType.BUY:
                # Buy decreases cash and adds to holdings (stored as negative)
                cash_balance += total_amount  # total_amount is negative, so this subtracts
                
                ticker = transaction.ticker
                quantity = transaction.quantity or 0
                price_per_share = transaction.price_per_share or 0
                cost = abs(total_amount)  # Cost basis is positive
                
                if ticker:
                    if ticker not in holdings:
                        holdings[ticker] = {'quantity': 0.0, 'total_cost': 0.0}
                    holdings[ticker]['quantity'] += quantity
                    holdings[ticker]['total_cost'] += cost
                    
            elif tx_type == TransactionType.SELL:
                # Sell increases cash, removes from holdings, and calculates gain (stored as positive)
                cash_balance += total_amount
                
                ticker = transaction.ticker
                quantity = transaction.quantity or 0
                
                if ticker:
                    # Validate ticker exists in holdings
                    if ticker not in holdings:
                        raise ValueError(f"Cannot sell {ticker}: not in holdings for portfolio {portfolio_id}")
                    
                    # Validate sufficient quantity (with epsilon for floating-point precision)
                    if quantity > holdings[ticker]['quantity'] + HOLDINGS_EPSILON:
                        raise ValueError(
                            f"Cannot sell {quantity} quantity of {ticker}: only {holdings[ticker]['quantity']} available"
                        )
                    
                    # Calculate average cost per unit for this holding
                    avg_cost_per_unit = (holdings[ticker]['total_cost'] / holdings[ticker]['quantity'] 
                                        if holdings[ticker]['quantity'] > 0 else 0)
                    
                    # Cost basis of quantity being sold
                    cost_basis = avg_cost_per_unit * quantity
                    
                    # Realized gain = sale proceeds - cost basis (fees already included in total_amount)
                    realized_gains += (total_amount - cost_basis)
                    
                    # Update holdings
                    holdings[ticker]['quantity'] -= quantity
                    holdings[ticker]['total_cost'] -= cost_basis
                    
                    # Remove if fully sold (using 8 decimal place precision)
                    if math.isclose(holdings[ticker]['quantity'], 0.0, abs_tol=HOLDINGS_EPSILON) or holdings[ticker]['quantity'] < HOLDINGS_EPSILON:
                        del holdings[ticker]
                        
            elif tx_type == TransactionType.DIVIDEND:
                # Dividend adds cash and tracks dividend income (stored as positive)
                cash_balance += total_amount
                dividends_received += total_amount
                
            elif tx_type == TransactionType.FEE:
                # Fee reduces cash (stored as negative)
                cash_balance += total_amount  # total_amount is negative, so this subtracts
                
            elif tx_type == TransactionType.SPLIT:
                # Split adjusts the number of quantity
                ticker = transaction.ticker
                split_ratio = transaction.split_ratio or 1.0
                
                # Validate split ratio
                if split_ratio <= 0:
                    raise ValueError(f"Invalid split ratio {split_ratio}: must be positive")
                
                if ticker and ticker in holdings:
                    holdings[ticker]['quantity'] *= split_ratio
                    # Cost basis remains the same (value doesn't change, just distribution)
            
            else:
                raise ValueError(f"Unknown transaction type: {tx_type}")
        
        # Convert holdings dict to list of HoldingResponse
        holdings_list = []
        total_holdings_cost = 0.0
        
        # Get current prices for all tickers
        tickers = list(holdings.keys())
        try:
            current_prices = PriceService.get_current_prices(tickers) if tickers else {}
        except Exception as e:
            # If price service fails, continue without prices
            logger.error(f"Error fetching prices for portfolio {portfolio_id}: {e}", exc_info=True)
            current_prices = {ticker: None for ticker in tickers}
        
        # Calculate holdings with current prices and unrealized gains
        total_current_value = 0.0
        total_unrealized_gains = 0.0
        
        for ticker, holding_data in holdings.items():
            quantity = holding_data['quantity']
            total_cost = holding_data['total_cost']
            avg_cost = total_cost / quantity if quantity > 0 else 0
            
            # Get current price and calculate current value
            current_price = current_prices.get(ticker)
            current_value = None
            unrealized_gain_loss = None
            unrealized_gain_loss_percent = None
            
            if current_price is not None and current_price > 0:
                current_value = quantity * current_price
                unrealized_gain_loss = current_value - total_cost
                if total_cost > 0:
                    unrealized_gain_loss_percent = (unrealized_gain_loss / total_cost) * 100
                
                total_current_value += current_value
                total_unrealized_gains += unrealized_gain_loss
            
            holdings_list.append(HoldingResponse(
                ticker=ticker,
                quantity=quantity,
                average_cost=avg_cost,
                total_cost=total_cost,
                current_price=current_price,
                current_value=current_value,
                unrealized_gain_loss=unrealized_gain_loss,
                unrealized_gain_loss_percent=unrealized_gain_loss_percent
            ))
            total_holdings_cost += total_cost
        
        # Sort holdings by ticker
        holdings_list.sort(key=lambda h: h.ticker)
        
        # Calculate total portfolio value
        total_portfolio_value = cash_balance + total_current_value
        
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
            total_eur_amount=normalize_zero(total_eur_amount),
            holdings=holdings_list,
            total_holdings_cost=normalize_zero(total_holdings_cost),
            total_current_value=normalize_zero(total_current_value),
            unrealized_gains=normalize_zero(total_unrealized_gains),
            total_portfolio_value=normalize_zero(total_portfolio_value)
        )
