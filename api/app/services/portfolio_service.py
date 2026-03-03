"""
Portfolio service for business logic
"""
import logging
import uuid
from bisect import bisect_right
from dataclasses import dataclass, field as dc_field
from decimal import Decimal
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta, timezone
from sqlmodel import Session
from app.models import Portfolio, Transaction, TransactionType
from app.repositories.portfolio_repository import PortfolioRepository
from app.repositories.transaction_repository import TransactionRepository
from app.core.exceptions import (
    PortfolioNotFoundException,
    InvalidPortfolioNameException,
)
from app.schemas import HoldingResponse, PortfolioStatusResponse
from app.schemas.schemas import TransactionWarning
from app.services.price_service import PriceService

# Precision threshold for holdings quantity (allowing for accumulated floating-point errors)
HOLDINGS_EPSILON = Decimal('1e-6')

_DEFAULT_TAX_RATE = Decimal('0.255')

# Shorthand for Decimal constants
_ZERO = Decimal('0')
_ONE = Decimal('1')

logger = logging.getLogger(__name__)


# ================== Transaction state helpers ==================

def _to_decimal(value: object) -> Decimal:
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


def _opt_float(value: Optional[Decimal]) -> Optional[float]:
    """Convert Optional[Decimal] to Optional[float]."""
    return float(value) if value is not None else None


def _opt_normalize(value: Optional[Decimal]) -> Optional[float]:
    """Normalize Optional[Decimal] to Optional[float], converting near-zero to 0.0."""
    return _normalize_zero(value) if value is not None else None


def _compute_forward_split_factors(
    transactions: List[Transaction],
    cutoff_date: Optional[datetime] = None,
) -> Dict[str, Decimal]:
    """Compute the product of all future split ratios per ticker.

    Yahoo Finance close prices are split-adjusted: for dates before a split,
    the price is divided by the split ratio.  The state's quantity, however,
    only reflects splits that have been replayed so far.  To compensate, we
    track a per-ticker "forward split factor" — the product of all split
    ratios not yet applied to the state — and multiply it into the price
    lookup so that  qty_pre_split × price_adjusted × forward_factor  equals
    the correct historical value.

    Args:
        transactions: Full list of transactions (sorted chronologically).
        cutoff_date:  If given, only include splits *after* this date.
                      If None, include all splits (caller will decrement as
                      splits are replayed).
    """
    factors: Dict[str, Decimal] = {}
    for tx in transactions:
        if tx.type != TransactionType.SPLIT or not tx.ticker or not tx.split_ratio:
            continue
        if cutoff_date is not None and tx.date.date() <= cutoff_date.date():
            continue
        ratio = _to_decimal(tx.split_ratio)
        factors[tx.ticker] = factors.get(tx.ticker, _ONE) * ratio
    return factors


@dataclass
class _TxState:
    """Mutable portfolio state built by replaying transactions in chronological order."""
    cash: Decimal = _ZERO
    principal: Decimal = _ZERO        # Net deposits - withdrawals in native currency
    principal_eur: Decimal = _ZERO    # Net deposits - withdrawals in EUR (historical rates)
    total_deposits: Decimal = _ZERO   # Cumulative deposits only (never decremented)
    dividends: Decimal = _ZERO
    dividends_eur: Decimal = _ZERO
    realized_gains: Decimal = _ZERO
    holdings: Dict[str, Dict[str, Decimal]] = dc_field(default_factory=dict)
    warnings: List[Dict[str, object]] = dc_field(default_factory=list)
    usd_to_eur_fallback: Optional[float] = None


def _eur_from_tx(tx: Transaction, total_amount: Decimal, usd_to_eur_fallback: Optional[float] = None) -> Decimal:
    """Return the EUR equivalent of a transaction, or 0 if no rate is available."""
    if tx.eur_amount is not None:
        return _to_decimal(tx.eur_amount)
    if tx.fx_rate is not None and tx.fx_rate > 0:
        return total_amount / _to_decimal(tx.fx_rate)
    # Fallback: use pre-fetched USD→EUR rate
    if usd_to_eur_fallback is not None:
        return total_amount * _to_decimal(usd_to_eur_fallback)
    return _ZERO


def _apply_deposit(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)
    state.cash += total
    state.principal += total
    state.total_deposits += total
    eur = _eur_from_tx(tx, total, state.usd_to_eur_fallback)
    state.principal_eur += eur


def _apply_withdraw(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)  # total is negative
    state.cash += total
    state.principal += total
    state.principal_eur += _eur_from_tx(tx, total, state.usd_to_eur_fallback)
    if strict and state.cash < 0:
        state.warnings.append({
            'code': 'withdrawNegativeCash',
            'date': tx.date.strftime('%Y-%m-%dT%H:%M:%S'),
            'params': {'amount': str(-total), 'balance': str(state.cash)},
        })


def _apply_buy(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)  # total is negative
    state.cash += total
    if tx.ticker:
        quantity = _to_decimal(tx.quantity or 0)
        h = state.holdings.setdefault(tx.ticker, {'quantity': _ZERO, 'total_cost': _ZERO})
        h['quantity'] += quantity
        h['total_cost'] += -total


def _apply_sell(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)
    ticker = tx.ticker
    quantity = _to_decimal(tx.quantity or 0)
    if not ticker:
        state.cash += total
        return
    if ticker not in state.holdings:
        if strict:
            state.warnings.append({
                'code': 'sellNotInHoldings',
                'date': tx.date.strftime('%Y-%m-%dT%H:%M:%S'),
                'params': {'ticker': ticker},
            })
        return
    h = state.holdings[ticker]
    if quantity > h['quantity'] + HOLDINGS_EPSILON:
        if strict:
            held = h['quantity']
            state.warnings.append({
                'code': 'sellOversell',
                'date': tx.date.strftime('%Y-%m-%dT%H:%M:%S'),
                'params': {'ticker': ticker, 'quantity': str(quantity), 'available': str(held)},
            })
            # Partial sell: sell only what is held, with proportional total
            partial_total = total * (held / quantity) if quantity > 0 else _ZERO
            cost_basis = h['total_cost']
            state.cash += partial_total
            state.realized_gains += partial_total - cost_basis
            del state.holdings[ticker]
        return
    state.cash += total
    # Proportional cost removal: avoids intermediate avg_cost rounding
    cost_basis = h['total_cost'] * (quantity / h['quantity']) if h['quantity'] > 0 else _ZERO
    state.realized_gains += total - cost_basis
    h['quantity'] -= quantity
    h['total_cost'] -= cost_basis
    if h['quantity'] < HOLDINGS_EPSILON:
        del state.holdings[ticker]


def _apply_dividend(state: _TxState, tx: Transaction, strict: bool) -> None:
    total = _to_decimal(tx.total_amount)
    state.cash += total
    state.dividends += total
    state.dividends_eur += _eur_from_tx(tx, total, state.usd_to_eur_fallback)


def _apply_fee(state: _TxState, tx: Transaction, strict: bool) -> None:
    state.cash += _to_decimal(tx.total_amount)  # total is negative


def _apply_split(state: _TxState, tx: Transaction, strict: bool) -> None:
    split_ratio = _to_decimal(tx.split_ratio or 1)
    if split_ratio <= 0:
        if strict:
            state.warnings.append({
                'code': 'invalidSplitRatio',
                'date': tx.date.strftime('%Y-%m-%dT%H:%M:%S'),
                'params': {'ticker': tx.ticker or '', 'ratio': str(split_ratio)},
            })
        return
    if tx.ticker and tx.ticker in state.holdings:
        state.holdings[tx.ticker]['quantity'] *= split_ratio


_TX_HANDLERS = {
    TransactionType.DEPOSIT: _apply_deposit,
    TransactionType.WITHDRAW: _apply_withdraw,
    TransactionType.BUY: _apply_buy,
    TransactionType.SELL: _apply_sell,
    TransactionType.DIVIDEND: _apply_dividend,
    TransactionType.FEE: _apply_fee,
    TransactionType.SPLIT: _apply_split,
}


def _apply_transaction(state: _TxState, tx: Transaction, strict: bool = False) -> None:
    """
    Apply a single transaction to *state* in-place.

    Args:
        state:  Mutable portfolio state to update.
        tx:     The transaction to apply.
        strict: If True, append warnings to state.warnings for invalid operations
                (oversell, bad split ratio, unknown type).  If False, skip the update
                silently — used for historical/performance calculations where missing
                data is tolerated.
    """
    handler = _TX_HANDLERS.get(tx.type)
    if handler is None:
        if strict:
            state.warnings.append({
                'code': 'unknownType',
                'date': tx.date.strftime('%Y-%m-%dT%H:%M:%S'),
                'params': {'type': str(tx.type)},
            })
        return
    handler(state, tx, strict)


# ================== Date / price resolution helpers ==================


def _resolve_nearest_date_value(
    date_prices: Dict[str, float], target_date_str: str
) -> Optional[float]:
    """Return the value for *target_date_str* or the nearest earlier date, else None."""
    if not date_prices:
        return None
    if target_date_str in date_prices:
        return date_prices[target_date_str]
    available = sorted(
        (d for d in date_prices if d <= target_date_str), reverse=True
    )
    if available:
        return date_prices[available[0]]
    return None


def _fetch_historical_prices(
    tickers: List[str], target_date: datetime
) -> Dict[str, float]:
    """Fetch historical prices for *tickers* at (or near) *target_date*."""
    if not tickers:
        return {}
    start_date = target_date - timedelta(days=5)
    end_date = target_date + timedelta(days=1)
    all_prices = PriceService.get_historical_prices_for_multiple_tickers(
        tickers, start_date, end_date
    )
    target_date_str = target_date.strftime('%Y-%m-%d')
    result: Dict[str, float] = {}
    for ticker, date_prices in all_prices.items():
        if not date_prices:
            continue
        price = _resolve_nearest_date_value(date_prices, target_date_str)
        if price is not None:
            result[ticker] = price
        else:
            # All dates are after target; use earliest as best guess
            result[ticker] = date_prices[min(date_prices.keys())]
    return result


def _value_holdings_at_date(
    state: _TxState,
    historical_prices: Optional[Dict[str, float]],
    forward_split_factors: Dict[str, Decimal],
    target_date_str: str,
) -> Decimal:
    """Compute total holdings value at a historical date using price → DB cache → cost basis fallback."""
    holdings_value = _ZERO
    for ticker, holding_data in state.holdings.items():
        price = historical_prices.get(ticker) if historical_prices else None
        if price is not None and price > 0:
            split_factor = forward_split_factors.get(ticker, _ONE)
            holdings_value += holding_data['quantity'] * _to_decimal(price) * split_factor
            continue
        # Try last known price from DB cache before falling back to cost basis
        db_price = PriceService.get_last_known_price(ticker)
        if db_price is not None and db_price > 0:
            split_factor = forward_split_factors.get(ticker, _ONE)
            holdings_value += holding_data['quantity'] * _to_decimal(db_price) * split_factor
            logger.debug(
                "Status at %s: using last known price %.4f for %s",
                target_date_str, db_price, ticker,
            )
        else:
            holdings_value += holding_data['total_cost']
            logger.warning(
                "Status at %s: no price data for %s (using cost basis)",
                target_date_str, ticker,
            )
    return holdings_value


def _resolve_usd_to_eur_rate(target_date: datetime) -> Optional[float]:
    """Resolve USD→EUR rate at *target_date*, falling back to nearest earlier date or current rate."""
    start_date = target_date - timedelta(days=5)
    end_date = target_date + timedelta(days=1)
    fx_rates = PriceService.get_historical_usd_to_eur_rates(start_date, end_date)
    target_date_str = target_date.strftime('%Y-%m-%d')
    rate = _resolve_nearest_date_value(fx_rates, target_date_str)
    if rate is not None:
        return rate
    return PriceService.get_usd_to_eur_rate_safe()


# ================== Portfolio status helpers ==================


def _build_holdings_list(
    state: _TxState,
) -> Tuple[List[HoldingResponse], Decimal]:
    """Build the sorted holdings list and total cost basis (transaction-derived only).

    Returns:
        (holdings_list, holdings_cost)
    """
    holdings_list: List[HoldingResponse] = []
    holdings_cost = _ZERO

    for ticker, holding_data in state.holdings.items():
        quantity = holding_data['quantity']
        total_cost = holding_data['total_cost']
        avg_cost = total_cost / quantity if quantity > 0 else _ZERO

        holdings_list.append(HoldingResponse(
            ticker=ticker,
            quantity=float(quantity),
            average_cost=float(avg_cost),
            total_cost=float(total_cost),
        ))
        holdings_cost += total_cost

    holdings_list.sort(key=lambda h: h.ticker)
    return holdings_list, holdings_cost


# ================== Performance helpers ==================


def _bisect_lookup(
    sorted_dates: List[str], data: Dict[str, float], date_str: str
) -> Optional[float]:
    """Look up value for a date using bisect, falling back to the most recent earlier date."""
    if not sorted_dates:
        return None
    idx = bisect_right(sorted_dates, date_str) - 1
    return data[sorted_dates[idx]] if idx >= 0 else None


def _generate_date_points(
    start_date: datetime, end_date: datetime, num_points: int
) -> List[datetime]:
    """Generate evenly-spaced date points between start and end."""
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
    return date_points


def _prepare_perf_data(
    transactions: List[Transaction],
    start_date: datetime,
    end_date: datetime,
) -> Tuple[
    Dict[str, Dict[str, float]],   # historical_data
    Dict[str, List[str]],          # sorted_dates_map
    Dict[str, float],              # fx_rates
    List[str],                     # sorted_fx_dates
    Dict[str, float],              # sp500_prices
    List[str],                     # sorted_sp500_dates
    Dict[str, float],              # ticker_last_price
]:
    """Fetch all historical price data, FX rates, and S&P 500 in a single batch."""
    all_tickers = {tx.ticker for tx in transactions if tx.ticker}

    # Per-ticker earliest transaction date (avoid pre-IPO lookups)
    ticker_first_date: Dict[str, datetime] = {}
    for tx in transactions:
        if tx.ticker and tx.ticker not in ticker_first_date:
            ticker_first_date[tx.ticker] = tx.date - timedelta(days=5)

    fetch_tickers = list(all_tickers | {'EURUSD=X', '^GSPC'})
    historical_data = PriceService.get_historical_prices_for_multiple_tickers(
        fetch_tickers,
        start_date - timedelta(days=5),
        end_date + timedelta(days=1),
        per_ticker_start=ticker_first_date,
    )

    # Extract and invert FX rates
    eur_usd_prices = historical_data.pop('EURUSD=X', {})
    fx_rates = {
        date_str: 1.0 / rate
        for date_str, rate in eur_usd_prices.items()
        if rate and rate > 0
    }

    sp500_prices = historical_data.pop('^GSPC', {})

    # Pre-sort date keys for O(log n) bisect lookups
    sorted_dates_map: Dict[str, List[str]] = {}
    for ticker, data in historical_data.items():
        sorted_dates_map[ticker] = sorted(data.keys())
    sorted_fx_dates = sorted(fx_rates.keys())
    sorted_sp500_dates = sorted(sp500_prices.keys())

    # Seed last known prices from DB for tickers with no Yahoo data
    ticker_last_price: Dict[str, float] = {}
    for ticker in all_tickers:
        if not historical_data.get(ticker):
            db_price = PriceService.get_last_known_price(ticker)
            if db_price is not None:
                ticker_last_price[ticker] = db_price
                logger.info(
                    "Seeded last known price for %s: %.4f (from DB cache)",
                    ticker, db_price,
                )

    return (historical_data, sorted_dates_map, fx_rates, sorted_fx_dates,
            sp500_prices, sorted_sp500_dates, ticker_last_price)


def _replay_transactions_up_to(
    transactions: List[Transaction],
    tx_index: int,
    state: _TxState,
    date_point: datetime,
    forward_split_factors: Dict[str, Decimal],
) -> int:
    """Replay transactions up to *date_point*, updating state and split factors. Returns new tx_index."""
    while tx_index < len(transactions) and transactions[tx_index].date.date() <= date_point.date():
        tx = transactions[tx_index]
        _apply_transaction(state, tx, strict=False)
        if tx.type == TransactionType.SPLIT and tx.ticker and tx.split_ratio:
            factor = _to_decimal(tx.split_ratio)
            if tx.ticker in forward_split_factors:
                forward_split_factors[tx.ticker] /= factor
        tx_index += 1
    return tx_index


def _compute_perf_holdings(
    state: _TxState,
    sorted_dates_map: Dict[str, List[str]],
    historical_data: Dict[str, Dict[str, float]],
    ticker_last_price: Dict[str, float],
    forward_split_factors: Dict[str, Decimal],
    date_str: str,
) -> Tuple[Decimal, List[str], List[str]]:
    """Compute total holdings value for a performance date point using price → last-known → cost basis."""
    holdings_value = _ZERO
    last_known_tickers: List[str] = []
    cost_basis_tickers: List[str] = []
    for ticker, holding_data in state.holdings.items():
        ticker_dates = sorted_dates_map.get(ticker, [])
        price = _bisect_lookup(ticker_dates, historical_data.get(ticker, {}), date_str)
        if price is not None and price > 0:
            split_factor = forward_split_factors.get(ticker, _ONE)
            holdings_value += holding_data['quantity'] * _to_decimal(price) * split_factor
            ticker_last_price[ticker] = price  # store raw Yahoo price
        elif ticker in ticker_last_price:
            # Use last known raw price × current split factor
            split_factor = forward_split_factors.get(ticker, _ONE)
            holdings_value += holding_data['quantity'] * _to_decimal(ticker_last_price[ticker]) * split_factor
            last_known_tickers.append(ticker)
        else:
            # No price ever seen — fall back to cost basis (last resort)
            holdings_value += holding_data['total_cost']
            cost_basis_tickers.append(ticker)
    return holdings_value, last_known_tickers, cost_basis_tickers


def _compute_perf_data_point(
    state: _TxState,
    date_str: str,
    holdings_value: Decimal,
    last_known_tickers: List[str],
    cost_basis_tickers: List[str],
    fx_rates: Dict[str, float],
    sorted_fx_dates: List[str],
    sp500_prices: Dict[str, float],
    sorted_sp500_dates: List[str],
    sp500_base_price: Optional[float],
) -> Tuple[Dict, Optional[float]]:
    """Build a single performance data-point dict. Returns (data_point, updated sp500_base_price)."""
    if last_known_tickers:
        logger.debug(
            "Performance %s: using last known price for %s",
            date_str, last_known_tickers,
        )
    if cost_basis_tickers:
        logger.warning(
            "Performance %s: no price data for %s (using cost basis as fallback)",
            date_str, cost_basis_tickers,
        )

    current_value = state.cash + holdings_value
    fx_rate = _bisect_lookup(sorted_fx_dates, fx_rates, date_str)

    return_pct = None
    if state.total_deposits > 0:
        return_pct = float((current_value - state.principal) / state.total_deposits * Decimal('100'))

    # S&P 500 in USD — frontend applies FX rate for EUR mode
    sp500_return_pct = None
    sp500_price = _bisect_lookup(sorted_sp500_dates, sp500_prices, date_str)
    if sp500_price is not None and sp500_price > 0:
        if sp500_base_price is None:
            sp500_base_price = sp500_price
        sp500_return_pct = (sp500_price / sp500_base_price - 1.0) * 100.0

    data_point = {
        'date': date_str,
        'principal': float(state.principal),
        'principal_eur': float(state.principal_eur),
        'current_value': float(current_value),
        'fx_rate': fx_rate,
        'return_pct': return_pct,
        'sp500_return_pct': sp500_return_pct,
    }
    return data_point, sp500_base_price


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
        if len(stripped) > 255:
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

    def copy_portfolio(self, portfolio_id: int, new_name: str, user_id: uuid.UUID) -> Portfolio:
        """Copy a portfolio with all its transactions (user-scoped)"""
        copied_portfolio = self.portfolio_repo.copy_with_transactions(
            portfolio_id, self._validate_name(new_name), user_id
        )

        if not copied_portfolio:
            raise PortfolioNotFoundException(portfolio_id)

        return copied_portfolio

    def calculate_portfolio_status(self, portfolio_id: int, user_id: uuid.UUID, tax_rate: Decimal = _DEFAULT_TAX_RATE) -> PortfolioStatusResponse:
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

        # Fetch live USD→EUR rate once; reused for EUR fallback in transaction loop
        # and returned to frontend for client-side EUR conversion
        usd_to_eur_rate = PriceService.get_usd_to_eur_rate_safe()

        state = _TxState()
        state.usd_to_eur_fallback = usd_to_eur_rate
        for tx in transactions:
            _apply_transaction(state, tx, strict=True)

        # Build holdings list (transaction-derived only, no prices)
        holdings_list, holdings_cost = _build_holdings_list(state)

        # Normalize dividends_eur (historical per-transaction rates):
        # - dividends exist but no EUR conversion available → None (dividends_eur == 0)
        # - no dividends at all → None (dividends == 0)
        # Note: both cases produce None on the frontend, which is intentional — the
        # distinction (no dividends vs. dividends with missing EUR rate) is not surfaced in UI.
        has_valid_eur = state.dividends > 0 and state.dividends_eur > 0
        dividends_eur: Optional[Decimal] = state.dividends_eur if has_valid_eur else None

        return PortfolioStatusResponse(
            portfolio_id=portfolio.id,
            portfolio_name=portfolio.name,
            principal=_normalize_zero(state.principal),
            principal_eur=_normalize_zero(state.principal_eur),
            dividends=_normalize_zero(state.dividends),
            dividends_eur=_opt_normalize(dividends_eur),
            cash=_normalize_zero(state.cash),
            holdings=holdings_list,
            holdings_cost=_normalize_zero(holdings_cost),
            realized_gains=_normalize_zero(state.realized_gains),
            capital_gains_tax_rate=float(tax_rate),
            warnings=[TransactionWarning(**w) for w in state.warnings],
            usd_to_eur_rate=usd_to_eur_rate,
        )

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
        keys: date, principal, principal_eur, current_value, fx_rate, return_pct, sp500_return_pct.

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
            end_date = datetime.now(timezone.utc).replace(tzinfo=None)

        if start_date >= end_date:
            raise ValueError(f"start_date ({start_date}) must be before end_date ({end_date})")
        if num_points < 2:
            raise ValueError(f"num_points must be at least 2, got {num_points}")

        date_points = _generate_date_points(start_date, end_date, num_points)

        (historical_data, sorted_dates_map, fx_rates, sorted_fx_dates,
         sp500_prices, sorted_sp500_dates, ticker_last_price) = \
            _prepare_perf_data(transactions, start_date, end_date)

        forward_split_factors = _compute_forward_split_factors(transactions)

        performance_data = []
        state = _TxState()
        state.usd_to_eur_fallback = _resolve_usd_to_eur_rate(end_date)
        tx_index = 0
        sp500_base_price: Optional[float] = None

        for date_point in date_points:
            date_str = date_point.strftime('%Y-%m-%d')
            tx_index = _replay_transactions_up_to(
                transactions, tx_index, state, date_point, forward_split_factors,
            )
            holdings_value, last_known, cost_basis = _compute_perf_holdings(
                state, sorted_dates_map, historical_data,
                ticker_last_price, forward_split_factors, date_str,
            )
            data_point_dict, sp500_base_price = _compute_perf_data_point(
                state, date_str, holdings_value, last_known, cost_basis,
                fx_rates, sorted_fx_dates, sp500_prices, sorted_sp500_dates,
                sp500_base_price,
            )
            performance_data.append(data_point_dict)

        return portfolio.name, performance_data
