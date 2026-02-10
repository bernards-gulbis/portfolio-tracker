"""
Portfolio service for business logic
"""
import math
import logging
from typing import List, Dict, Optional
from datetime import datetime, timedelta
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
        """
        Calculate comprehensive portfolio status including holdings, cash, and performance metrics.
        
        This method processes all transactions chronologically to build the current portfolio state,
        calculates valuation at current market prices, and computes tax-adjusted return metrics.
        
        Args:
            portfolio_id: The ID of the portfolio to calculate status for
            
        Returns:
            PortfolioStatusResponse containing:
                - current_value: Total current value in USD (cash + holdings at market prices)
                - current_value_eur: Current value converted to EUR at current exchange rate
                - principal: Net deposits/withdrawals in USD (deposits - withdrawals)
                - principal_eur: Net deposits/withdrawals converted to EUR at historical exchange rates
                - unrealized_gains: Current paper gains/losses on open positions in USD
                - unrealized_gains_eur: Unrealized gains converted to EUR at current exchange rate
                - unrealized_gains_percent: Unrealized gains as percentage of cost basis (if holdings exist)
                - realized_gains: Cumulative gains/losses from closed positions in USD
                - dividends: Total dividends received in USD
                - dividends_eur: Total dividends converted to EUR at historical exchange rates
                - tax_eur: Estimated tax liability (TAX_RATE * capital_gains_eur) where capital_gains excludes dividends
                - total_return_after_tax_eur: Net profit after taxes (current_value_eur - principal_eur - tax_eur)
                - total_return_after_tax_percent: After-tax return as percentage of principal_eur
                - current_value_after_tax_eur: Portfolio value after taxes (current_value_eur - tax_eur)
                - cash: Cash available in USD
                - holdings: List of current positions with quantities and market values
                
        Raises:
            PortfolioNotFoundException: If portfolio_id does not exist
            
        Calculation Logic:
            1. Process transactions chronologically to build position history:
               - DEPOSIT/WITHDRAW: Update cash and principal
               - BUY: Reduce cash, increase holdings quantity and cost basis
               - SELL: Increase cash, reduce holdings, calculate realized gains
               - DIVIDEND: Increase cash and track dividends separately
            2. Value current holdings at latest market prices (excluding holdings without prices)
            3. Convert USD values to EUR using appropriate exchange rates:
               - principal_eur: Sum of deposits/withdrawals converted at their historical rates
               - dividends_eur: Sum of dividends converted at their historical rates
               - current_value_eur, unrealized_gains_eur: Current values at today's rate
            4. Calculate tax on capital gains: (current_value_eur - principal_eur - dividends_eur) * TAX_RATE
            5. Calculate after-tax return: (current_value_eur - principal_eur) - tax_eur
            
        Edge Cases:
            - Holdings without current price: Excluded from unrealized gains calculation
            - Zero principal: Returns None for percentage-based metrics to avoid division by zero
            - Negative cash: Allowed (represents margin/borrowed funds)
        """
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
                # Cost basis includes purchase price plus fees (total_amount is negative for buys)
                cost = -total_amount
                
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
        # Note: Only includes holdings with available prices in both numerator and denominator
        unrealized_gains_percent = None
        if holdings_cost > 0:
            unrealized_gains_percent = (unrealized_gains / holdings_cost) * 100
        
        # Calculate portfolio value in EUR using current exchange rate
        # Note: All USD values are converted using the current rate, regardless of transaction dates
        current_value_eur = None
        unrealized_gains_eur = None
        try:
            usd_to_eur_rate = PriceService.get_usd_to_eur_rate()
            if usd_to_eur_rate is not None:
                current_value_eur = current_value * usd_to_eur_rate
                unrealized_gains_eur = unrealized_gains * usd_to_eur_rate
        except Exception as e:
            logger.error(f"Error fetching USD to EUR exchange rate for portfolio {portfolio_id}: {e}", exc_info=True)
        
        # Normalize dividends_eur before computing tax
        # If dividends exist but no EUR conversion is available, set to None
        if dividends > 0.0 and dividends_eur == 0.0:
            # Dividends exist but no EUR conversion was available
            dividends_eur = None
        elif dividends == 0.0:
            # No dividends at all
            dividends_eur = None
        
        # Calculate tax on capital gains (cannot be negative)
        # Tax base = current portfolio value - initial principal - dividends received
        # This represents only price appreciation gains (both realized and unrealized)
        # Dividends are excluded as they may have different tax treatment
        # If dividends exist but EUR conversion is unavailable, we cannot compute accurate tax
        tax_eur = None
        if current_value_eur is not None:
            if dividends > 0.0 and dividends_eur is None:
                # Dividends exist but EUR conversion unavailable - cannot compute accurate tax
                tax_eur = None
            else:
                dividends_for_tax = dividends_eur if dividends_eur is not None else 0.0
                capital_gains = current_value_eur - principal_eur - dividends_for_tax
                tax_eur = capital_gains * TAX_RATE if capital_gains > 0 else 0.0
        
        # Calculate total return after tax
        total_return_after_tax_eur = None
        total_return_after_tax_percent = None
        if current_value_eur is not None and tax_eur is not None:
            total_return_after_tax_eur = (current_value_eur - principal_eur) - tax_eur
            if principal_eur != 0:
                total_return_after_tax_percent = (total_return_after_tax_eur / principal_eur) * 100
        
        # Calculate current value after tax
        current_value_after_tax_eur = None
        if current_value_eur is not None and tax_eur is not None:
            current_value_after_tax_eur = current_value_eur - tax_eur
        
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
            total_return_after_tax_percent=normalize_zero(total_return_after_tax_percent) if total_return_after_tax_percent is not None else None,
            current_value_after_tax_eur=normalize_zero(current_value_after_tax_eur) if current_value_after_tax_eur is not None else None
        )
    
    def calculate_portfolio_status_at_date(
        self, 
        portfolio_id: int, 
        target_date: datetime,
        historical_prices: Dict[str, Optional[float]] = None,
        usd_to_eur_rate: Optional[float] = None
    ) -> tuple[float, float]:
        """
        Calculate portfolio value (principal_eur and current_value_eur) at a specific date.
        
        This method processes all transactions up to and including the target date to build
        the portfolio state, then calculates the value using historical prices for that date.
        
        Args:
            portfolio_id: The ID of the portfolio
            target_date: The date to calculate the portfolio status for
            historical_prices: Optional dict of ticker -> price for the target date.
                             If not provided, will fetch from PriceService.
            usd_to_eur_rate: Optional USD to EUR exchange rate for the target date.
                           If not provided, will fetch from PriceService.
            
        Returns:
            Tuple of (principal_eur, current_value_eur)
            
        Raises:
            PortfolioNotFoundException: If portfolio_id does not exist
        """
        # Get portfolio
        portfolio = self.portfolio_repo.get_by_id(portfolio_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)
        
        # Get all transactions up to and including target date
        all_transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)
        transactions = [t for t in all_transactions if t.date.date() <= target_date.date()]
        
        # Sort by date to process in chronological order
        transactions.sort(key=lambda t: (t.date, t.id))
        
        # Initialize tracking variables
        cash = 0.0
        principal_eur = 0.0
        holdings: Dict[str, Dict[str, float]] = {}
        
        # Process each transaction (simplified version, focusing on principal and holdings)
        for transaction in transactions:
            tx_type = transaction.type
            total_amount = transaction.total_amount
            
            if tx_type == TransactionType.DEPOSIT:
                cash += total_amount
                if transaction.eur_amount is not None:
                    principal_eur += transaction.eur_amount
                elif transaction.fx_rate is not None and transaction.fx_rate > 0:
                    principal_eur += total_amount / transaction.fx_rate
                
            elif tx_type == TransactionType.WITHDRAW:
                cash += total_amount
                if transaction.eur_amount is not None:
                    principal_eur += transaction.eur_amount
                elif transaction.fx_rate is not None and transaction.fx_rate > 0:
                    principal_eur += total_amount / transaction.fx_rate
                
            elif tx_type == TransactionType.BUY:
                cash += total_amount
                ticker = transaction.ticker
                quantity = transaction.quantity or 0
                cost = -total_amount
                
                if ticker:
                    if ticker not in holdings:
                        holdings[ticker] = {'quantity': 0.0, 'total_cost': 0.0}
                    holdings[ticker]['quantity'] += quantity
                    holdings[ticker]['total_cost'] += cost
                    
            elif tx_type == TransactionType.SELL:
                cash += total_amount
                ticker = transaction.ticker
                quantity = transaction.quantity or 0
                
                if ticker and ticker in holdings:
                    avg_cost_per_unit = (holdings[ticker]['total_cost'] / holdings[ticker]['quantity'] 
                                        if holdings[ticker]['quantity'] > 0 else 0)
                    cost_basis = avg_cost_per_unit * quantity
                    
                    holdings[ticker]['quantity'] -= quantity
                    holdings[ticker]['total_cost'] -= cost_basis
                    
                    if math.isclose(holdings[ticker]['quantity'], 0.0, abs_tol=HOLDINGS_EPSILON) or holdings[ticker]['quantity'] < HOLDINGS_EPSILON:
                        del holdings[ticker]
                        
            elif tx_type == TransactionType.DIVIDEND:
                cash += total_amount
                
            elif tx_type == TransactionType.FEE:
                cash += total_amount
                
            elif tx_type == TransactionType.SPLIT:
                ticker = transaction.ticker
                split_ratio = transaction.split_ratio or 1.0
                
                if ticker and ticker in holdings:
                    holdings[ticker]['quantity'] *= split_ratio
        
        # Get historical prices for all holdings if not provided
        if historical_prices is None:
            tickers = list(holdings.keys())
            if tickers:
                # Fetch historical prices for the target date (use a range of +/- 5 days to account for weekends/holidays)
                start_date = target_date - timedelta(days=5)
                end_date = target_date + timedelta(days=1)
                
                all_historical_prices = PriceService.get_historical_prices_for_multiple_tickers(
                    tickers, start_date, end_date
                )
                
                # Get the closest available price for each ticker
                historical_prices = {}
                target_date_str = target_date.strftime('%Y-%m-%d')
                
                for ticker, date_prices in all_historical_prices.items():
                    if not date_prices:
                        historical_prices[ticker] = None
                        continue
                    
                    # Try to get exact date first
                    if target_date_str in date_prices:
                        historical_prices[ticker] = date_prices[target_date_str]
                    else:
                        # Get the most recent price before or on the target date
                        available_dates = sorted([d for d in date_prices.keys() if d <= target_date_str], reverse=True)
                        if available_dates:
                            historical_prices[ticker] = date_prices[available_dates[0]]
                        else:
                            # No price available before target date, use earliest available
                            earliest_date = min(date_prices.keys())
                            historical_prices[ticker] = date_prices[earliest_date]
            else:
                historical_prices = {}
        
        # Calculate holdings value using historical prices
        holdings_value = 0.0
        for ticker, holding_data in holdings.items():
            quantity = holding_data['quantity']
            price = historical_prices.get(ticker) if historical_prices else None
            
            if price is not None and price > 0:
                holdings_value += quantity * price
        
        # Calculate total portfolio value in USD
        current_value_usd = cash + holdings_value
        
        # Get USD to EUR rate for the target date if not provided
        if usd_to_eur_rate is None:
            # Fetch historical FX rate
            start_date = target_date - timedelta(days=5)
            end_date = target_date + timedelta(days=1)
            
            fx_rates = PriceService.get_historical_usd_to_eur_rates(start_date, end_date)
            
            target_date_str = target_date.strftime('%Y-%m-%d')
            if target_date_str in fx_rates:
                usd_to_eur_rate = fx_rates[target_date_str]
            else:
                # Get the most recent rate before or on the target date
                available_dates = sorted([d for d in fx_rates.keys() if d <= target_date_str], reverse=True)
                if available_dates:
                    usd_to_eur_rate = fx_rates[available_dates[0]]
                else:
                    # No rate available, try current rate
                    try:
                        usd_to_eur_rate = PriceService.get_usd_to_eur_rate()
                    except:
                        usd_to_eur_rate = None
        
        # Convert to EUR
        current_value_eur = None
        if usd_to_eur_rate is not None:
            current_value_eur = current_value_usd * usd_to_eur_rate
        
        return (principal_eur, current_value_eur)
    
    def get_portfolio_performance(
        self, 
        portfolio_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        num_points: int = 30
    ) -> List[Dict]:
        """
        Get portfolio performance over time as a time series.
        
        This method efficiently calculates portfolio value at multiple points in time by
        processing transactions only once in chronological order and taking snapshots
        at each requested date point.
        
        Performance: O(N + M) where N = transactions, M = date points
        (vs. previous O(N × M) approach)
        
        Args:
            portfolio_id: The ID of the portfolio
            start_date: Start date for the performance data (defaults to first transaction date)
            end_date: End date for the performance data (defaults to today)
            num_points: Number of data points to return (default: 30)
            
        Returns:
            List of dictionaries with keys: date, principal_eur, current_value_eur
            
        Raises:
            PortfolioNotFoundException: If portfolio_id does not exist
            ValueError: If start_date >= end_date or num_points < 2
        """
        # Get portfolio
        portfolio = self.portfolio_repo.get_by_id(portfolio_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)
        
        # Get all transactions sorted by date
        transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)
        
        if not transactions:
            return []
        
        # Sort transactions chronologically
        transactions.sort(key=lambda t: (t.date, t.id))
        
        # Determine date range
        if start_date is None:
            start_date = min(t.date for t in transactions)
        if end_date is None:
            end_date = datetime.now()
        
        # Validate date range
        if start_date >= end_date:
            raise ValueError(f"start_date ({start_date}) must be before end_date ({end_date})")
        
        if num_points < 2:
            raise ValueError(f"num_points must be at least 2, got {num_points}")
        
        # Generate date points
        total_days = (end_date - start_date).days
        if total_days < num_points:
            # Use daily data points if the range is short
            date_points = [start_date + timedelta(days=i) for i in range(total_days + 1)]
        else:
            # Sample evenly across the date range
            interval = total_days / (num_points - 1)
            date_points = [start_date + timedelta(days=int(i * interval)) for i in range(num_points)]
        
        # Ensure end_date is included
        if date_points[-1].date() != end_date.date():
            date_points[-1] = end_date
        
        # Get all unique tickers across all transactions
        all_tickers = set()
        for tx in transactions:
            if tx.ticker:
                all_tickers.add(tx.ticker)
        
        # Fetch historical prices for all tickers
        if all_tickers:
            historical_data = PriceService.get_historical_prices_for_multiple_tickers(
                list(all_tickers),
                start_date - timedelta(days=5),  # Add buffer for weekends/holidays
                end_date + timedelta(days=1)
            )
        else:
            historical_data = {}
        
        # Fetch historical FX rates
        fx_rates = PriceService.get_historical_usd_to_eur_rates(
            start_date - timedelta(days=5),
            end_date + timedelta(days=1)
        )
        
        # Helper function to get price for a date
        def get_price_for_date(ticker: str, date_str: str) -> Optional[float]:
            """Get the closest available historical price for a ticker on or before a date"""
            date_prices = historical_data.get(ticker, {})
            if not date_prices:
                return None
            
            if date_str in date_prices:
                return date_prices[date_str]
            
            # Find most recent price before this date
            available_dates = sorted([d for d in date_prices.keys() if d <= date_str], reverse=True)
            if available_dates:
                return date_prices[available_dates[0]]
            
            return None
        
        # Helper function to get FX rate for a date
        def get_fx_rate_for_date(date_str: str) -> Optional[float]:
            """Get the closest available FX rate on or before a date"""
            if date_str in fx_rates:
                return fx_rates[date_str]
            
            # Find most recent rate before this date
            available_dates = sorted([d for d in fx_rates.keys() if d <= date_str], reverse=True)
            if available_dates:
                return fx_rates[available_dates[0]]
            
            return None
        
        # Helper function to calculate portfolio value at current state
        def calculate_current_value(cash: float, holdings: Dict, date_str: str) -> Optional[float]:
            """Calculate total portfolio value in USD using historical prices"""
            holdings_value = 0.0
            
            for ticker, holding_data in holdings.items():
                quantity = holding_data['quantity']
                price = get_price_for_date(ticker, date_str)
                
                if price is not None and price > 0:
                    holdings_value += quantity * price
                else:
                    # If we can't get a price, we can't calculate accurate value
                    # Could return None here or estimate somehow
                    pass
            
            return cash + holdings_value
        
        # Process transactions once, taking snapshots at each date point
        performance_data = []
        
        # Initialize portfolio state
        cash = 0.0
        principal_eur = 0.0
        holdings: Dict[str, Dict[str, float]] = {}
        
        # Track position in transactions array
        tx_index = 0
        
        # Process each date point
        for date_point in date_points:
            date_str = date_point.strftime('%Y-%m-%d')
            
            # Process all transactions up to and including this date point
            while tx_index < len(transactions) and transactions[tx_index].date.date() <= date_point.date():
                tx = transactions[tx_index]
                tx_type = tx.type
                total_amount = tx.total_amount
                
                # Update portfolio state based on transaction type
                if tx_type == TransactionType.DEPOSIT:
                    cash += total_amount
                    if tx.eur_amount is not None:
                        principal_eur += tx.eur_amount
                    elif tx.fx_rate is not None and tx.fx_rate > 0:
                        principal_eur += total_amount / tx.fx_rate
                    
                elif tx_type == TransactionType.WITHDRAW:
                    cash += total_amount  # total_amount is negative
                    if tx.eur_amount is not None:
                        principal_eur += tx.eur_amount  # eur_amount is negative
                    elif tx.fx_rate is not None and tx.fx_rate > 0:
                        principal_eur += total_amount / tx.fx_rate
                    
                elif tx_type == TransactionType.BUY:
                    cash += total_amount  # total_amount is negative
                    ticker = tx.ticker
                    quantity = tx.quantity or 0
                    cost = -total_amount
                    
                    if ticker:
                        if ticker not in holdings:
                            holdings[ticker] = {'quantity': 0.0, 'total_cost': 0.0}
                        holdings[ticker]['quantity'] += quantity
                        holdings[ticker]['total_cost'] += cost
                        
                elif tx_type == TransactionType.SELL:
                    cash += total_amount
                    ticker = tx.ticker
                    quantity = tx.quantity or 0
                    
                    if ticker and ticker in holdings:
                        avg_cost_per_unit = (holdings[ticker]['total_cost'] / holdings[ticker]['quantity'] 
                                            if holdings[ticker]['quantity'] > 0 else 0)
                        cost_basis = avg_cost_per_unit * quantity
                        
                        holdings[ticker]['quantity'] -= quantity
                        holdings[ticker]['total_cost'] -= cost_basis
                        
                        # Remove if fully sold
                        if math.isclose(holdings[ticker]['quantity'], 0.0, abs_tol=HOLDINGS_EPSILON) or holdings[ticker]['quantity'] < HOLDINGS_EPSILON:
                            del holdings[ticker]
                            
                elif tx_type == TransactionType.DIVIDEND:
                    cash += total_amount
                    
                elif tx_type == TransactionType.FEE:
                    cash += total_amount  # total_amount is negative
                    
                elif tx_type == TransactionType.SPLIT:
                    ticker = tx.ticker
                    split_ratio = tx.split_ratio or 1.0
                    
                    if ticker and ticker in holdings:
                        holdings[ticker]['quantity'] *= split_ratio
                
                tx_index += 1
            
            # Take snapshot at this date point
            current_value_usd = calculate_current_value(cash, holdings, date_str)
            
            # Convert to EUR
            fx_rate = get_fx_rate_for_date(date_str)
            current_value_eur = None
            if current_value_usd is not None and fx_rate is not None:
                current_value_eur = current_value_usd * fx_rate
            
            performance_data.append({
                'date': date_str,
                'principal_eur': principal_eur,
                'current_value_eur': current_value_eur
            })
        
        return performance_data
