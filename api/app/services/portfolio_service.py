"""
Portfolio service for business logic
"""
import math
import logging
import os
import uuid
from dataclasses import dataclass, field as dc_field
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from sqlmodel import Session
from app.models import Portfolio, Transaction, TransactionType
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

# Tax rate applied to capital gains — overridable via TAX_RATE env var
TAX_RATE = float(os.getenv('TAX_RATE', '0.255'))

logger = logging.getLogger(__name__)


# ================== Transaction state helpers ==================

def _normalize_zero(value: float) -> float:
    """Convert very small values and -0.0 to 0.0 to avoid negative-zero display."""
    return 0.0 if abs(value) < HOLDINGS_EPSILON else value


@dataclass
class _TxState:
    """Mutable portfolio state built by replaying transactions in chronological order."""
    cash: float = 0.0
    principal: float = 0.0        # Net deposits - withdrawals in native currency
    principal_eur: float = 0.0    # Net deposits - withdrawals in EUR (historical rates)
    dividends: float = 0.0
    dividends_eur: float = 0.0
    realized_gains: float = 0.0
    holdings: Dict[str, Dict[str, float]] = dc_field(default_factory=dict)


def _eur_from_tx(tx: Transaction, total_amount: float) -> float:
    """Return the EUR equivalent of a transaction, or 0.0 if no rate is available."""
    if tx.eur_amount is not None:
        return tx.eur_amount
    if tx.fx_rate is not None and tx.fx_rate > 0:
        return total_amount / tx.fx_rate
    return 0.0


def _apply_transaction(state: _TxState, tx: Transaction, strict: bool = False) -> None:
    """
    Apply a single transaction to *state* in-place.

    Args:
        state:  Mutable portfolio state to update.
        tx:     The transaction to apply.
        strict: If True, raise ValueError for invalid operations (oversell, bad split
                ratio, unknown type). If False, skip the update silently — used for
                historical/performance calculations where missing data is tolerated.
    """
    tx_type = tx.type
    total = tx.total_amount

    if tx_type == TransactionType.DEPOSIT:
        state.cash += total
        state.principal += total
        state.principal_eur += _eur_from_tx(tx, total)

    elif tx_type == TransactionType.WITHDRAW:
        state.cash += total           # total is negative
        state.principal += total
        state.principal_eur += _eur_from_tx(tx, total)

    elif tx_type == TransactionType.BUY:
        state.cash += total           # total is negative
        ticker = tx.ticker
        quantity = tx.quantity or 0
        cost = -total
        if ticker:
            h = state.holdings.setdefault(ticker, {'quantity': 0.0, 'total_cost': 0.0})
            h['quantity'] += quantity
            h['total_cost'] += cost

    elif tx_type == TransactionType.SELL:
        state.cash += total
        ticker = tx.ticker
        quantity = tx.quantity or 0
        if ticker:
            if ticker not in state.holdings:
                if strict:
                    raise ValueError(f"Cannot sell {ticker}: not in holdings")
                return
            h = state.holdings[ticker]
            if quantity > h['quantity'] + HOLDINGS_EPSILON:
                if strict:
                    raise ValueError(
                        f"Cannot sell {quantity} quantity of {ticker}: "
                        f"only {h['quantity']} available"
                    )
                return
            avg_cost = h['total_cost'] / h['quantity'] if h['quantity'] > 0 else 0.0
            cost_basis = avg_cost * quantity
            state.realized_gains += total - cost_basis
            h['quantity'] -= quantity
            h['total_cost'] -= cost_basis
            if (
                math.isclose(h['quantity'], 0.0, abs_tol=HOLDINGS_EPSILON)
                or h['quantity'] < HOLDINGS_EPSILON
            ):
                del state.holdings[ticker]

    elif tx_type == TransactionType.DIVIDEND:
        state.cash += total
        state.dividends += total
        state.dividends_eur += _eur_from_tx(tx, total)

    elif tx_type == TransactionType.FEE:
        state.cash += total           # total is negative

    elif tx_type == TransactionType.SPLIT:
        ticker = tx.ticker
        split_ratio = tx.split_ratio or 1.0
        if strict and split_ratio <= 0:
            raise ValueError(f"Invalid split ratio {split_ratio}: must be positive")
        if ticker and ticker in state.holdings:
            state.holdings[ticker]['quantity'] *= split_ratio

    else:
        if strict:
            raise ValueError(f"Unknown transaction type: {tx_type}")


# ================== Service ==================

class PortfolioService:
    """Service for portfolio business logic"""

    def __init__(self, session: Session):
        self.portfolio_repo = PortfolioRepository(session)
        self.transaction_repo = TransactionRepository(session)

    def create_portfolio(self, name: str, user_id: uuid.UUID) -> Portfolio:
        """Create a new portfolio with validation"""
        if not name or len(name.strip()) == 0:
            raise InvalidPortfolioNameException("Portfolio name cannot be empty")

        if len(name) > 255:
            raise InvalidPortfolioNameException("Portfolio name cannot exceed 255 characters")

        return self.portfolio_repo.create(name.strip(), user_id)

    def get_portfolio(self, portfolio_id: int, user_id: uuid.UUID) -> Portfolio:
        """Get a portfolio by ID (user-scoped)"""
        portfolio = self.portfolio_repo.get_by_id_and_user(portfolio_id, user_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)
        return portfolio

    def get_all_portfolios(self, user_id: uuid.UUID) -> List[Portfolio]:
        """Get all portfolios for user"""
        return self.portfolio_repo.get_all_for_user(user_id)

    def update_portfolio(self, portfolio_id: int, name: str, user_id: uuid.UUID) -> Portfolio:
        """Update a portfolio (user-scoped)"""
        if not name or len(name.strip()) == 0:
            raise InvalidPortfolioNameException("Portfolio name cannot be empty")

        if len(name) > 255:
            raise InvalidPortfolioNameException("Portfolio name cannot exceed 255 characters")

        portfolio = self.portfolio_repo.update(portfolio_id, name.strip(), user_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)
        return portfolio

    def delete_portfolio(self, portfolio_id: int, user_id: uuid.UUID) -> None:
        """Delete a portfolio (user-scoped)"""
        if not self.portfolio_repo.delete(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)

    def portfolio_exists(self, portfolio_id: int, user_id: uuid.UUID) -> bool:
        """Check if a portfolio exists and belongs to user"""
        return self.portfolio_repo.exists_for_user(portfolio_id, user_id)

    def copy_portfolio(self, portfolio_id: int, new_name: str, user_id: uuid.UUID) -> Portfolio:
        """Copy a portfolio with all its transactions (user-scoped)"""
        if not new_name or len(new_name.strip()) == 0:
            raise InvalidPortfolioNameException("Portfolio name cannot be empty")

        if len(new_name) > 255:
            raise InvalidPortfolioNameException("Portfolio name cannot exceed 255 characters")

        copied_portfolio = self.portfolio_repo.copy_with_transactions(
            portfolio_id, new_name.strip(), user_id
        )

        if not copied_portfolio:
            raise PortfolioNotFoundException(portfolio_id)

        return copied_portfolio

    def calculate_portfolio_status(self, portfolio_id: int, user_id: uuid.UUID) -> PortfolioStatusResponse:
        """
        Calculate comprehensive portfolio status including holdings, cash, and performance metrics.

        Processes all transactions chronologically via _apply_transaction, then fetches
        current market prices and converts to EUR for tax calculations.

        Raises:
            PortfolioNotFoundException: If portfolio_id does not exist or belongs to another user.
        """
        portfolio = self.portfolio_repo.get_by_id_and_user(portfolio_id, user_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)

        transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)
        transactions.sort(key=lambda t: (t.date, t.id))

        state = _TxState()
        for tx in transactions:
            _apply_transaction(state, tx, strict=True)

        # Build holdings list with current prices
        holdings_list = []
        holdings_cost = 0.0
        tickers = list(state.holdings.keys())
        try:
            current_prices = PriceService.get_current_prices(tickers) if tickers else {}
        except Exception as e:
            logger.error("Error fetching prices for portfolio %s: %s", portfolio_id, e, exc_info=True)
            current_prices = {ticker: None for ticker in tickers}

        holdings_value = 0.0
        unrealized_gains = 0.0
        missing_prices: List[str] = []

        for ticker, holding_data in state.holdings.items():
            quantity = holding_data['quantity']
            total_cost = holding_data['total_cost']
            avg_cost = total_cost / quantity if quantity > 0 else 0

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
            else:
                missing_prices.append(ticker)

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

        holdings_list.sort(key=lambda h: h.ticker)

        current_value = state.cash + holdings_value

        unrealized_gains_percent = None
        if holdings_cost > 0:
            unrealized_gains_percent = (unrealized_gains / holdings_cost) * 100

        current_value_eur = None
        unrealized_gains_eur = None
        currency_gains_eur = None
        currency_gains_percent = None
        try:
            usd_to_eur_rate = PriceService.get_usd_to_eur_rate()
            if usd_to_eur_rate is not None:
                current_value_eur = current_value * usd_to_eur_rate
                unrealized_gains_eur = unrealized_gains * usd_to_eur_rate

                principal_at_current_rate = state.principal * usd_to_eur_rate
                currency_gains_eur = principal_at_current_rate - state.principal_eur
                if state.principal_eur != 0:
                    currency_gains_percent = (currency_gains_eur / state.principal_eur) * 100
        except Exception as e:
            logger.error(
                "Error fetching USD to EUR exchange rate for portfolio %s: %s",
                portfolio_id, e, exc_info=True
            )

        # Normalize dividends_eur:
        # - dividends exist but no EUR conversion available → None (can't compute accurate tax)
        # - no dividends at all → None
        dividends_eur: Optional[float]
        if state.dividends > 0.0 and state.dividends_eur == 0.0:
            dividends_eur = None
        elif state.dividends == 0.0:
            dividends_eur = None
        else:
            dividends_eur = state.dividends_eur

        # Tax on capital gains (excludes dividends which may have different tax treatment)
        tax_eur = None
        capital_gains_eur = None
        if current_value_eur is not None:
            if state.dividends > 0.0 and dividends_eur is None:
                # Dividends exist but EUR conversion unavailable — cannot compute accurate tax
                pass
            else:
                dividends_for_tax = dividends_eur if dividends_eur is not None else 0.0
                capital_gains_eur = current_value_eur - state.principal_eur - dividends_for_tax
                tax_eur = capital_gains_eur * TAX_RATE if capital_gains_eur > 0 else 0.0

        total_return_after_tax_eur = None
        total_return_after_tax_percent = None
        if current_value_eur is not None and tax_eur is not None:
            total_return_after_tax_eur = (current_value_eur - state.principal_eur) - tax_eur
            if state.principal_eur != 0:
                total_return_after_tax_percent = (total_return_after_tax_eur / state.principal_eur) * 100

        current_value_after_tax_eur = None
        if current_value_eur is not None and tax_eur is not None:
            current_value_after_tax_eur = current_value_eur - tax_eur

        def _n(v: Optional[float]) -> Optional[float]:
            return _normalize_zero(v) if v is not None else None

        return PortfolioStatusResponse(
            portfolio_id=portfolio.id,
            portfolio_name=portfolio.name,
            current_value=_normalize_zero(current_value),
            current_value_eur=_n(current_value_eur),
            principal=_normalize_zero(state.principal),
            principal_eur=_normalize_zero(state.principal_eur),
            dividends=_normalize_zero(state.dividends),
            dividends_eur=_n(dividends_eur),
            cash=_normalize_zero(state.cash),
            holdings=holdings_list,
            holdings_cost=_normalize_zero(holdings_cost),
            holdings_value=_normalize_zero(holdings_value),
            unrealized_gains=_normalize_zero(unrealized_gains),
            unrealized_gains_percent=_n(unrealized_gains_percent),
            unrealized_gains_eur=_n(unrealized_gains_eur),
            realized_gains=_normalize_zero(state.realized_gains),
            currency_gains_eur=_n(currency_gains_eur),
            currency_gains_percent=_n(currency_gains_percent),
            capital_gains_eur=_n(capital_gains_eur),
            capital_gains_tax_rate=TAX_RATE,
            tax_eur=_n(tax_eur),
            total_return_after_tax_eur=_n(total_return_after_tax_eur),
            total_return_after_tax_percent=_n(total_return_after_tax_percent),
            current_value_after_tax_eur=_n(current_value_after_tax_eur),
            missing_prices=missing_prices,
        )

    def calculate_portfolio_status_at_date(
        self,
        portfolio_id: int,
        target_date: datetime,
        historical_prices: Optional[Dict[str, float]] = None,
        usd_to_eur_rate: Optional[float] = None,
        user_id: Optional[uuid.UUID] = None,
    ) -> Tuple[float, Optional[float]]:
        """
        Calculate portfolio value (principal_eur, current_value_eur) at a specific date.

        Args:
            portfolio_id:      The ID of the portfolio.
            target_date:       The date to calculate status for.
            historical_prices: Optional dict of ticker -> price for the target date.
            usd_to_eur_rate:   Optional USD to EUR exchange rate for the target date.
            user_id:           Required — used for ownership verification.

        Returns:
            Tuple of (principal_eur, current_value_eur)

        Raises:
            PortfolioNotFoundException: If portfolio_id does not exist or belongs to another user.
            ValueError: If user_id is not provided.
        """
        if user_id is None:
            raise ValueError("user_id is required")
        portfolio = self.portfolio_repo.get_by_id_and_user(portfolio_id, user_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)

        all_transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)
        transactions = [t for t in all_transactions if t.date.date() <= target_date.date()]
        transactions.sort(key=lambda t: (t.date, t.id))

        state = _TxState()
        for tx in transactions:
            _apply_transaction(state, tx, strict=False)

        if historical_prices is None:
            tickers = list(state.holdings.keys())
            if tickers:
                start_date = target_date - timedelta(days=5)
                end_date = target_date + timedelta(days=1)
                all_historical_prices = PriceService.get_historical_prices_for_multiple_tickers(
                    tickers, start_date, end_date
                )
                historical_prices = {}
                target_date_str = target_date.strftime('%Y-%m-%d')
                for ticker, date_prices in all_historical_prices.items():
                    if not date_prices:
                        continue
                    if target_date_str in date_prices:
                        historical_prices[ticker] = date_prices[target_date_str]
                    else:
                        available_dates = sorted(
                            [d for d in date_prices.keys() if d <= target_date_str], reverse=True
                        )
                        if available_dates:
                            historical_prices[ticker] = date_prices[available_dates[0]]
                        else:
                            historical_prices[ticker] = date_prices[min(date_prices.keys())]
            else:
                historical_prices = {}

        holdings_value = 0.0
        for ticker, holding_data in state.holdings.items():
            price = historical_prices.get(ticker) if historical_prices else None
            if price is not None and price > 0:
                holdings_value += holding_data['quantity'] * price

        current_value_usd = state.cash + holdings_value

        if usd_to_eur_rate is None:
            start_date = target_date - timedelta(days=5)
            end_date = target_date + timedelta(days=1)
            fx_rates = PriceService.get_historical_usd_to_eur_rates(start_date, end_date)
            target_date_str = target_date.strftime('%Y-%m-%d')
            if target_date_str in fx_rates:
                usd_to_eur_rate = fx_rates[target_date_str]
            else:
                available_dates = sorted(
                    [d for d in fx_rates.keys() if d <= target_date_str], reverse=True
                )
                if available_dates:
                    usd_to_eur_rate = fx_rates[available_dates[0]]
                else:
                    try:
                        usd_to_eur_rate = PriceService.get_usd_to_eur_rate()
                    except Exception:
                        usd_to_eur_rate = None

        current_value_eur = None
        if usd_to_eur_rate is not None:
            current_value_eur = current_value_usd * usd_to_eur_rate

        return (state.principal_eur, current_value_eur)

    def get_portfolio_performance(
        self,
        portfolio_id: int,
        user_id: uuid.UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        num_points: int = 60
    ) -> tuple[str, List[Dict]]:
        """
        Get portfolio performance over time as a time series.

        Returns (portfolio_name, data_points) where each data point is a dict with
        keys: date, principal_eur, current_value_eur.

        Performance: O(N + M) where N = transactions, M = date points.

        Raises:
            PortfolioNotFoundException: If portfolio_id does not exist.
            ValueError: If start_date >= end_date or num_points < 2.
        """
        PriceService.clear_session_cache()

        portfolio = self.portfolio_repo.get_by_id_and_user(portfolio_id, user_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)

        transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)
        if not transactions:
            return portfolio.name, []

        transactions.sort(key=lambda t: (t.date, t.id))

        if start_date is None:
            start_date = min(t.date for t in transactions)
        if end_date is None:
            end_date = datetime.now()

        if start_date >= end_date:
            raise ValueError(f"start_date ({start_date}) must be before end_date ({end_date})")
        if num_points < 2:
            raise ValueError(f"num_points must be at least 2, got {num_points}")

        total_days = (end_date - start_date).days
        if total_days == 0:
            date_points = [start_date, end_date]
        elif total_days < num_points:
            date_points = [start_date + timedelta(days=i) for i in range(total_days + 1)]
        else:
            interval = total_days / (num_points - 1)
            date_points = [start_date + timedelta(days=int(i * interval)) for i in range(num_points)]

        if total_days > 0 and date_points[-1].date() != end_date.date():
            date_points[-1] = end_date

        all_tickers = {tx.ticker for tx in transactions if tx.ticker}

        if all_tickers:
            historical_data = PriceService.get_historical_prices_for_multiple_tickers(
                list(all_tickers),
                start_date - timedelta(days=5),
                end_date + timedelta(days=1)
            )
        else:
            historical_data = {}

        fx_rates = PriceService.get_historical_usd_to_eur_rates(
            start_date - timedelta(days=5),
            end_date + timedelta(days=1)
        )

        def get_price_for_date(ticker: str, date_str: str) -> Optional[float]:
            date_prices = historical_data.get(ticker, {})
            if not date_prices:
                return None
            if date_str in date_prices:
                return date_prices[date_str]
            available = sorted([d for d in date_prices if d <= date_str], reverse=True)
            return date_prices[available[0]] if available else None

        def get_fx_rate_for_date(date_str: str) -> Optional[float]:
            if date_str in fx_rates:
                return fx_rates[date_str]
            available = sorted([d for d in fx_rates if d <= date_str], reverse=True)
            return fx_rates[available[0]] if available else None

        performance_data = []
        state = _TxState()
        tx_index = 0

        for date_point in date_points:
            date_str = date_point.strftime('%Y-%m-%d')

            while (
                tx_index < len(transactions)
                and transactions[tx_index].date.date() <= date_point.date()
            ):
                _apply_transaction(state, transactions[tx_index], strict=False)
                tx_index += 1

            holdings_value = sum(
                holding_data['quantity'] * price
                for ticker, holding_data in state.holdings.items()
                if (price := get_price_for_date(ticker, date_str)) is not None and price > 0
            )
            current_value_usd = state.cash + holdings_value
            fx_rate = get_fx_rate_for_date(date_str)
            current_value_eur = current_value_usd * fx_rate if fx_rate is not None else None

            performance_data.append({
                'date': date_str,
                'principal_eur': state.principal_eur,
                'current_value_eur': current_value_eur,
            })

        return portfolio.name, performance_data
