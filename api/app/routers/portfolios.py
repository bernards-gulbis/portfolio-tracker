"""Portfolio API routes"""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.core import get_session
from app.core.auth import current_active_user
from app.models.user import User
from app.schemas import (
    LivePriceInfo,
    LivePricesResponse,
    PerformanceDataPoint,
    PortfolioBase,
    PortfolioCopy,
    PortfolioPerformanceResponse,
    PortfolioResponse,
    PortfolioStatusResponse,
)
from app.services import PortfolioService
from app.services.prices import (
    FxRateService,
    HistoricalPriceService,
    LivePriceService,
)
from app.services.prices.yahoo_finance_client import YahooFinanceClient

logger = logging.getLogger(__name__)

MAX_TICKERS = 100

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


@router.post("/", response_model=PortfolioResponse, status_code=201)
def create_portfolio(
    portfolio: PortfolioBase,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Create a new portfolio"""
    service = PortfolioService(session)
    return service.create_portfolio(portfolio.name, user.id)


@router.get("/", response_model=list[PortfolioResponse])
def list_portfolios(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Get all portfolios"""
    service = PortfolioService(session)
    return service.get_all_portfolios(user.id)


@router.get(
    "/prices/live",
    response_model=LivePricesResponse,
    responses={400: {"description": "Too many tickers requested"}},
)
async def get_live_prices(
    _user: Annotated[User, Depends(current_active_user)],
    tickers: Annotated[list[str] | None, Query()] = None,
):
    """Get current prices and FX rate without replaying transactions.

    Each ticker's ``source`` is ``live`` when Yahoo Finance returned a fresh
    price, ``last_known`` when the DB cache was used because the live fetch
    failed, or ``missing`` when neither is available. Clients render
    stale/missing badges and banners based on this.
    """
    tickers = tickers or []
    if len(tickers) > MAX_TICKERS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many tickers requested ({len(tickers)}). Maximum is {MAX_TICKERS}.",
        )
    # ``LivePriceService.get_current_quotes`` catches its own per-ticker
    # exceptions and returns ``Quote(None, None)`` for failed lookups, so the
    # only paths that escape here are programming errors (e.g. a misconfigured
    # ThreadPoolExecutor). Catching ``RuntimeError`` keeps the response
    # alive for those rare cases without swallowing genuine bugs that should
    # surface as 500s during development.
    #
    # ``LivePriceService.get_current_quotes`` blocks (yfinance + thread pool);
    # offload to a worker thread so the asyncio event loop stays free for
    # other concurrent requests.
    try:
        live_quotes = (
            await asyncio.to_thread(LivePriceService.get_current_quotes, tickers)
            if tickers
            else {}
        )
    except RuntimeError as e:
        logger.error("Live price fetch infrastructure error: %s", e, exc_info=True)
        live_quotes = {}

    now = datetime.now(UTC)
    prices: dict[str, LivePriceInfo] = {}
    fallback_tickers: list[str] = []
    for ticker in tickers:
        quote = live_quotes.get(ticker)
        if quote is not None and quote.price is not None and quote.price > 0:
            prices[ticker] = LivePriceInfo(
                price=float(quote.price),
                source="live",
                as_of=now,
                previous_close=quote.previous_close,
            )
        else:
            fallback_tickers.append(ticker)

    # Batch the DB fallback for every missing ticker into one offloaded
    # query so we don't hit the event loop with N synchronous SQLite reads.
    fallbacks = (
        await asyncio.to_thread(
            LivePriceService.get_last_known_prices_batch, fallback_tickers
        )
        if fallback_tickers
        else {}
    )
    for ticker in fallback_tickers:
        fallback = fallbacks.get(ticker)
        if fallback is not None:
            price, date_str = fallback
            prices[ticker] = LivePriceInfo(
                price=price,
                source="last_known",
                as_of=datetime.fromisoformat(date_str).replace(tzinfo=UTC),
            )
        else:
            prices[ticker] = LivePriceInfo(price=None, source="missing", as_of=None)

    # FxRateService.get_usd_to_eur_rate_safe also goes to Yahoo on a cache
    # miss; offload it for the same reason.
    usd_to_eur_rate = await asyncio.to_thread(FxRateService.get_usd_to_eur_rate_safe)
    return LivePricesResponse(
        prices=prices,
        usd_to_eur_rate=usd_to_eur_rate,
        timestamp=now,
        provider_unavailable=YahooFinanceClient.is_circuit_open(),
    )


@router.get("/{portfolio_id}", response_model=PortfolioResponse)
def get_portfolio(
    portfolio_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Get a specific portfolio"""
    service = PortfolioService(session)
    return service.get_portfolio(portfolio_id, user.id)


@router.get(
    "/{portfolio_id}/status",
    response_model=PortfolioStatusResponse,
    responses={400: {"description": "Invalid portfolio data"}},
)
async def get_portfolio_status(
    portfolio_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Get portfolio status with holdings, cash balance, and performance metrics"""
    service = PortfolioService(session)
    # The full calculation does sync DB reads + Yahoo lookups for live FX
    # and the per-ticker live prices it embeds. Offload to a worker thread
    # so the event loop stays responsive while we wait on Yahoo.
    try:
        return await asyncio.to_thread(
            service.calculate_portfolio_status,
            portfolio_id,
            user.id,
            tax_rate=user.tax_rate,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None


@router.put("/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(
    portfolio_id: int,
    portfolio: PortfolioBase,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Update a portfolio"""
    service = PortfolioService(session)
    return service.update_portfolio(portfolio_id, portfolio.name, user.id)


@router.post("/{portfolio_id}/copy", response_model=PortfolioResponse, status_code=201)
def copy_portfolio(
    portfolio_id: int,
    copy_request: PortfolioCopy,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Copy a portfolio with all its transactions"""
    service = PortfolioService(session)
    return service.copy_portfolio(portfolio_id, copy_request.new_name, user.id)


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(
    portfolio_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Delete a portfolio and all its transactions"""
    service = PortfolioService(session)
    service.delete_portfolio(portfolio_id, user.id)
    return None


@router.get(
    "/{portfolio_id}/performance",
    response_model=PortfolioPerformanceResponse,
    responses={400: {"description": "Invalid date format or date range"}},
)
async def get_portfolio_performance(
    portfolio_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
    start_date: Annotated[
        str | None, Query(description="Start date in YYYY-MM-DD format")
    ] = None,
    end_date: Annotated[
        str | None, Query(description="End date in YYYY-MM-DD format")
    ] = None,
    num_points: Annotated[
        int, Query(ge=2, le=365, description="Number of data points to return")
    ] = 60,
):
    """Get portfolio performance over time as a time series of portfolio values."""
    service = PortfolioService(session)

    start_dt = None
    end_dt = None

    try:
        if start_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        if end_date:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")

        if start_dt and end_dt and start_dt >= end_dt:
            raise HTTPException(
                status_code=400, detail="start_date must be before end_date"
            )
    except ValueError as e:
        raise HTTPException(
            status_code=400, detail=f"Invalid date format: {e!s}"
        ) from None

    try:
        HistoricalPriceService.clear_session_cache()
        # get_portfolio_performance verifies ownership and returns
        # (name, data_points, cost_basis_fallback_tickers, warnings).
        # The call does DB reads, batch Yahoo historical fetches, and the
        # full transaction replay — keep it off the event loop.
        (
            portfolio_name,
            performance_data,
            cost_basis_fallback_tickers,
            warnings,
        ) = await asyncio.to_thread(
            service.get_portfolio_performance,
            portfolio_id,
            user_id=user.id,
            start_date=start_dt,
            end_date=end_dt,
            num_points=num_points,
        )

        data_points = [
            PerformanceDataPoint(
                date=dp["date"],
                principal=dp.get("principal", 0.0),
                principal_eur=dp.get("principal_eur"),
                current_value=dp.get("current_value"),
                fx_rate=dp.get("fx_rate"),
                return_pct=dp.get("return_pct"),
                sp500_return_pct=dp.get("sp500_return_pct"),
            )
            for dp in performance_data
        ]

        return PortfolioPerformanceResponse(
            portfolio_id=portfolio_id,
            portfolio_name=portfolio_name,
            data_points=data_points,
            cost_basis_fallback_tickers=cost_basis_fallback_tickers,
            warnings=warnings,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None
