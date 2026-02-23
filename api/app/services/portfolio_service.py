"""
Portfolio service for business logic
"""
import logging
import os
import uuid
from bisect import bisect_right
from dataclasses import dataclass, field as dc_field
from decimal import Decimal
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
HOLDINGS_EPSILON = Decimal('1e-6')

# Tax rate applied to capital gains — overridable via TAX_RATE env var
TAX_RATE = Decimal(os.getenv('TAX_RATE', '0.255'))

# Shorthand for Decimal zero
_ZERO = Decimal('0')

logger = logging.getLogger(__name__)


# ================== Transaction state helpers ==================

def _to_decimal(value) -> Decimal:
    """Convert a value to Decimal, handling None and float inputs."""
    if value is None:
        return _ZERO
    if isinstance(value, Decimal):
        return value
    # Convert float→str→Decimal to preserve the displayed value, not the binary representation
    return Decimal(str(value))


def _normalize_zero(value: Decimal) -> float:
    """Convert very small Decimal values and -0 to 0.0, otherwise return as float."""
    return 0.0 if abs(value) < HOLDINGS_EPSILON else float(value)


@dataclass
class _TxState:
    """Mutable portfolio state built by replaying transactions in chronological order."""
    cash: Decimal = _ZERO
    principal: Decimal = _ZERO        # Net deposits - withdrawals in native currency
    principal_eur: Decimal = _ZERO    # Net deposits - withdrawals in EUR (historical rates)
    deposits_eur: Decimal = _ZERO     # Cumulative deposits in EUR (inflows only, for return % denominator)
    dividends: Decimal = _ZERO
    dividends_eur: Decimal = _ZERO
    realized_gains: Decimal = _ZERO
    holdings: Dict[str, Dict[str, Decimal]] = dc_field(default_factory=dict)


def _eur_from_tx(tx: Transaction, total_amount: Decimal) -> Decimal:
    """Return the EUR equivalent of a transaction, or 0 if no rate is available."""
    if tx.eur_amount is not None:
        return _to_decimal(tx.eur_amount)
    if tx.fx_rate is not None and tx.fx_rate > 0:
        return total_amount / _to_decimal(tx.fx_rate)
    return _ZERO


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
    total = _to_decimal(tx.total_amount)

    if tx_type == TransactionType.DEPOSIT:
        state.cash += total
        state.principal += total
        eur = _eur_from_tx(tx, total)
        state.principal_eur += eur
        state.deposits_eur += eur

    elif tx_type == TransactionType.WITHDRAW:
        state.cash += total           # total is negative
        state.principal += total
        state.principal_eur += _eur_from_tx(tx, total)

    elif tx_type == TransactionType.BUY:
        state.cash += total           # total is negative
        ticker = tx.ticker
        quantity = _to_decimal(tx.quantity or 0)
        cost = -total
        if ticker:
            h = state.holdings.setdefault(ticker, {'quantity': _ZERO, 'total_cost': _ZERO})
            h['quantity'] += quantity
            h['total_cost'] += cost

    elif tx_type == TransactionType.SELL:
        state.cash += total
        ticker = tx.ticker
        quantity = _to_decimal(tx.quantity or 0)
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
            # Proportional cost removal: avoids intermediate avg_cost rounding
            cost_basis = h['total_cost'] * (quantity / h['quantity']) if h['quantity'] > 0 else _ZERO
            state.realized_gains += total - cost_basis
            h['quantity'] -= quantity
            h['total_cost'] -= cost_basis
            if h['quantity'] < HOLDINGS_EPSILON:
                del state.holdings[ticker]

    elif tx_type == TransactionType.DIVIDEND:
        state.cash += total
        state.dividends += total
        state.dividends_eur += _eur_from_tx(tx, total)

    elif tx_type == TransactionType.FEE:
        state.cash += total           # total is negative

    elif tx_type == TransactionType.SPLIT:
        ticker = tx.ticker
        split_ratio = _to_decimal(tx.split_ratio or 1)
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

    @staticmethod
    def _validate_name(name: str) -> str:
        """Validate and return stripped portfolio name."""
        stripped = name.strip() if name else ""
        if not stripped:
            raise InvalidPortfolioNameException("Portfolio name cannot be empty")
        if len(name) > 255:
            raise InvalidPortfolioNameException("Portfolio name cannot exceed 255 characters")
        return stripped

    def create_portfolio(self, name: str, user_id: uuid.UUID) -> Portfolio:
        """Create a new portfolio with validation"""
        return self.portfolio_repo.create(self._validate_name(name), user_id)

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
        portfolio = self.portfolio_repo.update(portfolio_id, self._validate_name(name), user_id)
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
        copied_portfolio = self.portfolio_repo.copy_with_transactions(
            portfolio_id, self._validate_name(new_name), user_id
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

        state = _TxState()
        for tx in transactions:
            _apply_transaction(state, tx, strict=True)

        # Build holdings list with current prices
        holdings_list = []
        holdings_cost = _ZERO
        tickers = list(state.holdings.keys())
        try:
            current_prices = PriceService.get_current_prices(tickers) if tickers else {}
        except Exception as e:
            logger.error("Error fetching prices for portfolio %s: %s", portfolio_id, e, exc_info=True)
            current_prices = {ticker: None for ticker in tickers}

        holdings_value = _ZERO
        unrealized_gains = _ZERO
        missing_prices: List[str] = []

        for ticker, holding_data in state.holdings.items():
            quantity = holding_data['quantity']
            total_cost = holding_data['total_cost']
            avg_cost = total_cost / quantity if quantity > 0 else _ZERO

            current_price = current_prices.get(ticker)
            current_value_h: Optional[Decimal] = None
            unrealized_gain_loss: Optional[Decimal] = None
            unrealized_gain_loss_percent: Optional[Decimal] = None

            if current_price is not None and current_price > 0:
                current_price_d = _to_decimal(current_price)
                current_value_h = quantity * current_price_d
                unrealized_gain_loss = current_value_h - total_cost
                if total_cost > 0:
                    unrealized_gain_loss_percent = (unrealized_gain_loss / total_cost) * 100
                holdings_value += current_value_h
                unrealized_gains += unrealized_gain_loss
            else:
                missing_prices.append(ticker)

            holdings_list.append(HoldingResponse(
                ticker=ticker,
                quantity=float(quantity),
                average_cost=float(avg_cost),
                total_cost=float(total_cost),
                current_price=current_price,
                current_value=float(current_value_h) if current_value_h is not None else None,
                unrealized_gain_loss=float(unrealized_gain_loss) if unrealized_gain_loss is not None else None,
                unrealized_gain_loss_percent=float(unrealized_gain_loss_percent) if unrealized_gain_loss_percent is not None else None,
            ))
            holdings_cost += total_cost

        holdings_list.sort(key=lambda h: h.ticker)

        current_value = state.cash + holdings_value

        unrealized_gains_percent: Optional[Decimal] = None
        if holdings_cost > 0:
            unrealized_gains_percent = (unrealized_gains / holdings_cost) * 100

        current_value_eur: Optional[Decimal] = None
        unrealized_gains_eur: Optional[Decimal] = None
        currency_gains_eur: Optional[Decimal] = None
        currency_gains_percent: Optional[Decimal] = None
        try:
            usd_to_eur_rate = PriceService.get_usd_to_eur_rate()
            if usd_to_eur_rate is not None:
                usd_to_eur_d = _to_decimal(usd_to_eur_rate)
                current_value_eur = current_value * usd_to_eur_d
                unrealized_gains_eur = unrealized_gains * usd_to_eur_d

                principal_at_current_rate = state.principal * usd_to_eur_d
                currency_gains_eur = principal_at_current_rate - state.principal_eur
                if state.deposits_eur > 0:
                    currency_gains_percent = (currency_gains_eur / state.deposits_eur) * 100
        except Exception as e:
            logger.error(
                "Error fetching USD to EUR exchange rate for portfolio %s: %s",
                portfolio_id, e, exc_info=True
            )

        # Normalize dividends_eur:
        # - dividends exist but no EUR conversion available → None (can't compute accurate tax)
        # - no dividends at all → None
        has_valid_eur = state.dividends > 0 and state.dividends_eur > 0
        dividends_eur: Optional[Decimal] = state.dividends_eur if has_valid_eur else None

        # Tax on capital gains (excludes dividends which may have different tax treatment)
        tax_eur: Optional[Decimal] = None
        capital_gains_eur: Optional[Decimal] = None
        if current_value_eur is not None:
            if state.dividends > 0 and dividends_eur is None:
                # Dividends exist but EUR conversion unavailable — cannot compute accurate tax
                pass
            else:
                dividends_for_tax = dividends_eur if dividends_eur is not None else _ZERO
                capital_gains_eur = current_value_eur - state.principal_eur - dividends_for_tax
                tax_eur = capital_gains_eur * TAX_RATE if capital_gains_eur > 0 else _ZERO

        total_return_after_tax_eur: Optional[Decimal] = None
        total_return_after_tax_percent: Optional[Decimal] = None
        if current_value_eur is not None and tax_eur is not None:
            total_return_after_tax_eur = (current_value_eur - state.principal_eur) - tax_eur
            if state.deposits_eur > 0:
                total_return_after_tax_percent = (total_return_after_tax_eur / state.deposits_eur) * 100

        current_value_after_tax_eur: Optional[Decimal] = None
        if current_value_eur is not None and tax_eur is not None:
            current_value_after_tax_eur = current_value_eur - tax_eur

        def _n(v) -> Optional[float]:
            """Normalize a Decimal to float, converting near-zero to 0.0."""
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
            capital_gains_tax_rate=float(TAX_RATE),
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

        # Forward split factor: compensate for Yahoo's split-adjusted prices
        # by multiplying in the split ratios not yet applied at target_date.
        forward_split_factors: Dict[str, Decimal] = {}
        for tx in all_transactions:
            if (tx.type == TransactionType.SPLIT and tx.ticker and tx.split_ratio
                    and tx.date.date() > target_date.date()):
                factor = _to_decimal(tx.split_ratio)
                forward_split_factors[tx.ticker] = forward_split_factors.get(tx.ticker, _ZERO + 1) * factor

        holdings_value = _ZERO
        for ticker, holding_data in state.holdings.items():
            price = historical_prices.get(ticker) if historical_prices else None
            if price is not None and price > 0:
                split_factor = forward_split_factors.get(ticker, _ZERO + 1)
                holdings_value += holding_data['quantity'] * _to_decimal(price) * split_factor
            else:
                # No market price — fall back to cost basis
                holdings_value += holding_data['total_cost']

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
            current_value_eur = float(current_value_usd * _to_decimal(usd_to_eur_rate))

        return (float(state.principal_eur), current_value_eur)

    def get_portfolio_performance(
        self,
        portfolio_id: int,
        user_id: uuid.UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        num_points: int = 60
    ) -> Tuple[str, List[Dict]]:
        """
        Get portfolio performance over time as a time series.

        Returns (portfolio_name, data_points) where each data point is a dict with
        keys: date, principal_eur, current_value_eur.

        Performance: O(N + M) where N = transactions, M = date points.

        Raises:
            PortfolioNotFoundException: If portfolio_id does not exist.
            ValueError: If start_date >= end_date or num_points < 2.
        """
        portfolio = self.portfolio_repo.get_by_id_and_user(portfolio_id, user_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)

        transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)
        if not transactions:
            return portfolio.name, []

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
            date_points = [start_date]
        elif total_days < num_points:
            date_points = [start_date + timedelta(days=i) for i in range(total_days + 1)]
        else:
            interval = total_days / (num_points - 1)
            date_points = [start_date + timedelta(days=int(i * interval)) for i in range(num_points)]

        if total_days > 0 and date_points[-1].date() != end_date.date():
            date_points[-1] = end_date

        all_tickers = {tx.ticker for tx in transactions if tx.ticker}

        # Compute per-ticker earliest transaction date so we don't ask Yahoo
        # for prices before a stock existed (pre-IPO → 400 error).
        ticker_first_date: Dict[str, datetime] = {}
        for tx in transactions:
            if tx.ticker and tx.ticker not in ticker_first_date:
                ticker_first_date[tx.ticker] = tx.date - timedelta(days=5)

        # Fetch ticker prices AND FX rate (EURUSD=X) in a single parallel batch
        fetch_tickers = list(all_tickers | {'EURUSD=X'})
        historical_data = PriceService.get_historical_prices_for_multiple_tickers(
            fetch_tickers,
            start_date - timedelta(days=5),
            end_date + timedelta(days=1),
            per_ticker_start=ticker_first_date,
        )

        # Extract and invert FX rates from the batch result
        eur_usd_prices = historical_data.pop('EURUSD=X', {})
        fx_rates = {
            date_str: 1.0 / rate
            for date_str, rate in eur_usd_prices.items()
            if rate and rate > 0
        }

        # Pre-sort date keys for each ticker's historical data for O(log n) lookups
        sorted_dates_map: Dict[str, List[str]] = {}
        for ticker, data in historical_data.items():
            sorted_dates_map[ticker] = sorted(data.keys())
        sorted_fx_dates = sorted(fx_rates.keys())

        def get_value_for_date(sorted_dates: List[str], data: Dict[str, float], date_str: str) -> Optional[float]:
            """Look up value for a date using bisect, falling back to the most recent earlier date."""
            if not sorted_dates:
                return None
            idx = bisect_right(sorted_dates, date_str) - 1
            return data[sorted_dates[idx]] if idx >= 0 else None

        # Yahoo Finance close prices are split-adjusted: for dates before a split,
        # the price is divided by the split ratio.  The state's quantity, however,
        # only reflects splits that have been replayed so far.  To compensate, we
        # track a per-ticker "forward split factor" — the product of all split
        # ratios not yet applied to the state — and multiply it into the price
        # lookup so that  qty_pre_split × price_adjusted × forward_factor  equals
        # the correct historical value.
        forward_split_factors: Dict[str, Decimal] = {}
        for tx in transactions:
            if tx.type == TransactionType.SPLIT and tx.ticker and tx.split_ratio:
                factor = _to_decimal(tx.split_ratio)
                forward_split_factors[tx.ticker] = forward_split_factors.get(tx.ticker, _ZERO + 1) * factor

        performance_data = []
        state = _TxState()
        tx_index = 0

        for date_point in date_points:
            date_str = date_point.strftime('%Y-%m-%d')

            while (
                tx_index < len(transactions)
                and transactions[tx_index].date.date() <= date_point.date()
            ):
                tx = transactions[tx_index]
                _apply_transaction(state, tx, strict=False)
                # Once a split is applied to the state quantity, remove its
                # contribution from the forward factor.
                if tx.type == TransactionType.SPLIT and tx.ticker and tx.split_ratio:
                    factor = _to_decimal(tx.split_ratio)
                    if tx.ticker in forward_split_factors:
                        forward_split_factors[tx.ticker] /= factor
                tx_index += 1

            holdings_value = _ZERO
            missing_tickers: List[str] = []
            for ticker, holding_data in state.holdings.items():
                ticker_dates = sorted_dates_map.get(ticker, [])
                price = get_value_for_date(ticker_dates, historical_data.get(ticker, {}), date_str)
                if price is not None and price > 0:
                    split_factor = forward_split_factors.get(ticker, _ZERO + 1)
                    holdings_value += holding_data['quantity'] * _to_decimal(price) * split_factor
                else:
                    # No market price available (ticker not yet listed, delisted,
                    # or Yahoo API error).  Fall back to cost basis so the holding
                    # isn't silently valued at $0.
                    holdings_value += holding_data['total_cost']
                    missing_tickers.append(ticker)

            if missing_tickers:
                logger.debug(
                    "Performance %s: no price data for held tickers %s "
                    "(using cost basis as fallback)",
                    date_str, missing_tickers,
                )

            current_value_usd = state.cash + holdings_value
            fx_rate = get_value_for_date(sorted_fx_dates, fx_rates, date_str)
            current_value_eur = float(current_value_usd * _to_decimal(fx_rate)) if fx_rate is not None else None

            return_pct = None
            if current_value_eur is not None and state.deposits_eur > 0:
                cv_d = _to_decimal(current_value_eur)
                return_pct = float((cv_d - state.principal_eur) / state.deposits_eur * Decimal('100'))

            if return_pct is not None and return_pct < -50:
                logger.debug(
                    "Performance %s: large negative return %.2f%% — "
                    "cash=%.2f holdings=%.2f fx=%.6f "
                    "value_usd=%.2f value_eur=%s "
                    "principal_eur=%.2f deposits_eur=%.2f "
                    "held=%s missing=%s",
                    date_str, return_pct,
                    float(state.cash), float(holdings_value),
                    fx_rate if fx_rate is not None else 0,
                    float(current_value_usd), current_value_eur,
                    float(state.principal_eur), float(state.deposits_eur),
                    list(state.holdings.keys()), missing_tickers,
                )

            performance_data.append({
                'date': date_str,
                'principal_eur': float(state.principal_eur),
                'current_value_eur': current_value_eur,
                'return_pct': return_pct,
            })

        return portfolio.name, performance_data
