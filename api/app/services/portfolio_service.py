"""
Portfolio service for business logic
"""
import math
import logging
from typing import List, Dict
from datetime import datetime
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

# Precision threshold for holdings quantity (allowing for accumulated floating-point errors)
HOLDINGS_EPSILON = 1e-6

# Tax rate applied to capital gains
TAX_RATE = 0.25

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
        cash = 0.0
        principal = 0.0  # Deposits - Withdrawals
        dividends = 0.0
        dividends_eur = 0.0  # Sum of all dividend EUR values calculated from fx_rate
        realized_gains = 0.0
        principal_eur = 0.0  # Sum of all deposit and withdraw EUR values
        holdings: Dict[str, Dict[str, float]] = {}  # ticker -> {quantity, total_cost}
        
        # Process each transaction
        for transaction in transactions:
            tx_type = transaction.type
            total_amount = transaction.total_amount  # Now stored with correct sign
            
            if tx_type == TransactionType.DEPOSIT:
                # Deposit adds cash and increases principal amount (stored as positive)
                cash += total_amount
                principal += total_amount
                if transaction.eur_amount is not None:
                    principal_eur += transaction.eur_amount
                elif transaction.fx_rate is not None and transaction.fx_rate > 0:
                    principal_eur += total_amount / transaction.fx_rate
                
            elif tx_type == TransactionType.WITHDRAW:
                # Withdraw removes cash and decreases principal amount (stored as negative)
                cash += total_amount  # total_amount is negative, so this subtracts
                principal += total_amount  # total_amount is negative, so this subtracts
                if transaction.eur_amount is not None:
                    principal_eur += transaction.eur_amount  # eur_amount is negative for withdraws
                elif transaction.fx_rate is not None and transaction.fx_rate > 0:
                    principal_eur += total_amount / transaction.fx_rate  # total_amount is negative for withdraws
                
            elif tx_type == TransactionType.BUY:
                # Buy decreases cash and adds to holdings (stored as negative)
                cash += total_amount  # total_amount is negative, so this subtracts
                
                ticker = transaction.ticker
                quantity = transaction.quantity or 0
                price_per_share = transaction.price_per_share or 0
                fee = transaction.fee or 0
                # Cost basis includes purchase price plus fees
                cost = quantity * price_per_share + fee
                
                if ticker:
                    if ticker not in holdings:
                        holdings[ticker] = {'quantity': 0.0, 'total_cost': 0.0}
                    holdings[ticker]['quantity'] += quantity
                    holdings[ticker]['total_cost'] += cost
                    
            elif tx_type == TransactionType.SELL:
                # Sell increases cash, removes from holdings, and calculates gain (stored as positive)
                cash += total_amount
                
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
                    
                    # Calculate average cost per unit for this holding (includes buy fees proportionally)
                    avg_cost_per_unit = (holdings[ticker]['total_cost'] / holdings[ticker]['quantity'] 
                                        if holdings[ticker]['quantity'] > 0 else 0)
                    
                    # Cost basis of quantity being sold (includes buy fees proportionally)
                    cost_basis = avg_cost_per_unit * quantity
                    
                    # Realized gain = net proceeds - cost basis
                    # total_amount = sale proceeds after deducting sell fee
                    # cost_basis = purchase cost including buy fees
                    # Both buy and sell fees reduce the realized gain (standard accounting)
                    realized_gains += (total_amount - cost_basis)
                    
                    # Update holdings
                    holdings[ticker]['quantity'] -= quantity
                    holdings[ticker]['total_cost'] -= cost_basis
                    
                    # Remove if fully sold (using 8 decimal place precision)
                    if math.isclose(holdings[ticker]['quantity'], 0.0, abs_tol=HOLDINGS_EPSILON) or holdings[ticker]['quantity'] < HOLDINGS_EPSILON:
                        del holdings[ticker]
                        
            elif tx_type == TransactionType.DIVIDEND:
                # Dividend adds cash and tracks dividend income (stored as positive)
                cash += total_amount
                dividends += total_amount
                
                # Calculate EUR amount using fx_rate if available
                if transaction.eur_amount is not None:
                    dividends_eur += transaction.eur_amount
                elif transaction.fx_rate is not None and transaction.fx_rate > 0:
                    dividends_eur += total_amount / transaction.fx_rate
                
            elif tx_type == TransactionType.FEE:
                # Fee reduces cash (stored as negative)
                cash += total_amount  # total_amount is negative, so this subtracts
                
            elif tx_type == TransactionType.SPLIT:
                # Split adjusts the number of shares
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
        holdings_cost = 0.0
        
        # Get current prices for all tickers
        tickers = list(holdings.keys())
        try:
            current_prices = PriceService.get_current_prices(tickers) if tickers else {}
        except Exception as e:
            # If price service fails, continue without prices
            logger.error(f"Error fetching prices for portfolio {portfolio_id}: {e}", exc_info=True)
            current_prices = {ticker: None for ticker in tickers}
        
        # Calculate holdings with current prices and unrealized gains
        holdings_value = 0.0
        unrealized_gains = 0.0
        
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
                
                holdings_value += current_value
                unrealized_gains += unrealized_gain_loss
            
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
            holdings_cost += total_cost
        
        # Sort holdings by ticker
        holdings_list.sort(key=lambda h: h.ticker)
        
        # Calculate total portfolio value
        current_value = cash + holdings_value
        
        # Calculate unrealized gains percentage
        unrealized_gains_percent = None
        if holdings_cost > 0:
            unrealized_gains_percent = (unrealized_gains / holdings_cost) * 100
        
        # Calculate portfolio value in EUR
        current_value_eur = None
        unrealized_gains_eur = None
        try:
            usd_to_eur_rate = PriceService.get_usd_to_eur_rate()
            if usd_to_eur_rate is not None:
                current_value_eur = current_value * usd_to_eur_rate
                unrealized_gains_eur = unrealized_gains * usd_to_eur_rate
        except Exception as e:
            logger.error(f"Error fetching USD to EUR exchange rate for portfolio {portfolio_id}: {e}", exc_info=True)
        
        # Calculate tax_eur (cannot be negative)
        tax_eur = None
        if current_value_eur is not None:
            dividends_for_tax = dividends_eur if dividends_eur is not None else 0.0
            tax_eur = (current_value_eur - principal_eur - dividends_for_tax) * TAX_RATE
            if tax_eur < 0:
                tax_eur = 0.0
        
        # Calculate total return after tax
        total_return_after_tax_eur = None
        total_return_after_tax_percent = None
        if current_value_eur is not None and tax_eur is not None:
            total_return_after_tax_eur = (current_value_eur - principal_eur) - tax_eur
            if principal_eur != 0:
                total_return_after_tax_percent = (total_return_after_tax_eur / principal_eur) * 100
        
        # Set dividends_eur to None if no dividend transactions had fx_rate or eur_amount
        if dividends_eur == 0.0 and dividends == 0.0:
            dividends_eur = None
        elif dividends_eur == 0.0 and dividends > 0.0:
            # If we have dividends but no EUR calculation, set to None
            dividends_eur = None
        
        # Normalize negative zero values for display
        def normalize_zero(value: float) -> float:
            """Convert -0.0 to 0.0 to avoid negative zero display"""
            return 0.0 if abs(value) < HOLDINGS_EPSILON else value
        
        return PortfolioStatusResponse(
            portfolio_id=portfolio.id,
            portfolio_name=portfolio.name,
            current_value=normalize_zero(current_value),
            current_value_eur=normalize_zero(current_value_eur) if current_value_eur is not None else None,
            principal=normalize_zero(principal),
            principal_eur=normalize_zero(principal_eur),
            dividends=normalize_zero(dividends),
            dividends_eur=normalize_zero(dividends_eur) if dividends_eur is not None else None,
            cash=normalize_zero(cash),
            holdings=holdings_list,
            holdings_cost=normalize_zero(holdings_cost),
            holdings_value=normalize_zero(holdings_value),
            unrealized_gains=normalize_zero(unrealized_gains),
            unrealized_gains_percent=normalize_zero(unrealized_gains_percent) if unrealized_gains_percent is not None else None,
            unrealized_gains_eur=normalize_zero(unrealized_gains_eur) if unrealized_gains_eur is not None else None,
            realized_gains=normalize_zero(realized_gains),
            tax_eur=normalize_zero(tax_eur) if tax_eur is not None else None,
            total_return_after_tax_eur=normalize_zero(total_return_after_tax_eur) if total_return_after_tax_eur is not None else None,
            total_return_after_tax_percent=normalize_zero(total_return_after_tax_percent) if total_return_after_tax_percent is not None else None
        )
