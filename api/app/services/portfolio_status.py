"""Top-level portfolio status calculation.

Orchestrates:
  1. Pre-fetching historical FX rates for transactions that lack explicit
     ``eur_amount``/``fx_rate``.
  2. Replaying every transaction through the handler dispatch.
  3. Building the holdings list + totals and assembling the response.

This is the only module that ``portfolio_service`` needs to import.
"""

import dataclasses
import logging
from datetime import timedelta
from decimal import Decimal

from app.models import Transaction, TransactionType
from app.schemas import HoldingResponse, PortfolioStatusResponse
from app.schemas.schemas import (
    DividendReceivedResponse,
    RealizedSaleResponse,
    TransactionWarning,
    WithdrawalFxResponse,
)
from app.services.portfolio_handlers import _apply_transaction
from app.services.portfolio_types import (
    _ISO_DATETIME_FMT,
    _ZERO,
    _normalize_zero,
    _opt_normalize,
    _TxState,
    _Warning,
)
from app.services.price_service import PriceService

logger = logging.getLogger(__name__)


# ================== Holdings builder ==================


def _build_holdings_list(
    state: _TxState,
) -> tuple[list[HoldingResponse], Decimal]:
    """Build the sorted holdings list and total cost basis (transaction-derived only)."""
    holdings_list: list[HoldingResponse] = []
    holdings_cost = _ZERO

    for ticker, h in state.holdings.items():
        avg_cost = h.total_cost / h.quantity if h.quantity > 0 else _ZERO

        holdings_list.append(
            HoldingResponse(
                ticker=ticker,
                quantity=float(h.quantity),
                average_cost=float(avg_cost),
                total_cost=float(h.total_cost),
                first_buy_date=h.first_buy_date.date()
                if hasattr(h.first_buy_date, "date")
                else h.first_buy_date,
            )
        )
        holdings_cost += h.total_cost

    holdings_list.sort(key=lambda hr: hr.ticker)
    return holdings_list, holdings_cost


# ================== Status calculation ==================


_FX_AWARE_TX_TYPES = {
    TransactionType.DEPOSIT,
    TransactionType.WITHDRAW,
    TransactionType.DIVIDEND,
}


def _prefetch_historical_fx_rates(
    transactions: list[Transaction],
    state: _TxState,
) -> dict[str, float]:
    """Fetch historical USD→EUR rates spanning the dates of transactions that
    lack both ``eur_amount`` and ``fx_rate``.

    On provider failure, records a bulk ``fxRatesUnavailable`` warning on
    *state* listing how many transactions are affected and flips the
    ``fx_rates_unavailable`` flag so per-transaction fallback warnings are
    suppressed (the bulk warning already covers them). Returns ``{}`` when
    nothing needs historical lookup or the fetch failed — the caller then
    falls back to the current rate for each affected transaction.
    """
    fx_blind = [
        tx
        for tx in transactions
        if tx.type in _FX_AWARE_TX_TYPES
        and tx.eur_amount is None
        and tx.fx_rate is None
    ]
    if not fx_blind:
        return {}
    # Back-pad the fetch window by 5 days so a transaction dated on a
    # Sunday/holiday can still resolve to the nearest prior trading day's
    # rate (FX markets don't publish on weekends/holidays).
    start = min(tx.date for tx in fx_blind) - timedelta(days=5)
    end = max(tx.date for tx in fx_blind) + timedelta(days=1)
    try:
        return PriceService.get_historical_usd_to_eur_rates(start, end)
    except Exception as exc:
        logger.warning("Historical USD/EUR rate fetch failed: %s", exc)
        state.fx_rates_unavailable = True
        # The bulk warning carries the earliest affected transaction date
        # (not a specific "failed" tx — the whole fetch failed). The UI uses
        # this date only as the React key; the translated text omits it
        # because the warning is portfolio-wide, not transaction-specific.
        earliest = min(fx_blind, key=lambda tx: tx.date)
        state.warnings.append(
            _Warning(
                code="fxRatesUnavailable",
                date=earliest.date.strftime(_ISO_DATETIME_FMT),
                params={"count": str(len(fx_blind))},
            )
        )
        return {}


def calculate_status(
    transactions: list[Transaction],
    usd_to_eur_rate: float | None,
    tax_rate: Decimal,
    portfolio_id: int,
    portfolio_name: str,
) -> PortfolioStatusResponse:
    """Calculate comprehensive portfolio status from transactions."""
    transactions = sorted(transactions, key=lambda t: t.date)
    state = _TxState()
    state.usd_to_eur_fallback = usd_to_eur_rate
    state.historical_usd_to_eur_rates = _prefetch_historical_fx_rates(
        transactions, state
    )
    for tx in transactions:
        _apply_transaction(state, tx, strict=True)

    holdings_list, holdings_cost = _build_holdings_list(state)

    # Normalize dividends_eur (historical per-transaction rates)
    has_valid_eur = state.dividends > 0 and state.dividends_eur > 0
    dividends_eur: Decimal | None = state.dividends_eur if has_valid_eur else None

    return PortfolioStatusResponse(
        portfolio_id=portfolio_id,
        portfolio_name=portfolio_name,
        principal=_normalize_zero(state.principal),
        principal_eur=_normalize_zero(state.principal_eur),
        principal_eur_avg=_normalize_zero(state.principal_eur_avg),
        dividends=_normalize_zero(state.dividends),
        dividends_eur=_opt_normalize(dividends_eur),
        cash=_normalize_zero(state.cash),
        holdings=holdings_list,
        holdings_cost=_normalize_zero(holdings_cost),
        realized_gains=_normalize_zero(state.realized_gains),
        capital_gains_tax_rate=float(tax_rate),
        realized_sales=[
            RealizedSaleResponse(**dataclasses.asdict(s)) for s in state.realized_sales
        ],
        dividends_received=[
            DividendReceivedResponse(**dataclasses.asdict(d))
            for d in state.dividends_received
        ],
        realized_withdrawals=[
            WithdrawalFxResponse(**dataclasses.asdict(w))
            for w in state.realized_withdrawals
        ],
        warnings=[TransactionWarning(**dataclasses.asdict(w)) for w in state.warnings],
        usd_to_eur_rate=usd_to_eur_rate,
    )
