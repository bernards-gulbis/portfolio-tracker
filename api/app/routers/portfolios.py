"""Portfolio API routes"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session
from typing import Annotated, List, Optional
from datetime import datetime, timezone

from app.core import get_session
from app.core.auth import current_active_user
from app.models.user import User
from app.schemas import (
    PortfolioCreate,
    PortfolioUpdate,
    PortfolioCopy,
    PortfolioResponse,
    PortfolioStatusResponse,
    LivePricesResponse,
    PortfolioPerformanceResponse,
    PerformanceDataPoint,
)

from app.services import PortfolioService
from app.services.price_service import PriceService

logger = logging.getLogger(__name__)

MAX_TICKERS = 100

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


@router.post("/", response_model=PortfolioResponse, status_code=201)
def create_portfolio(
    portfolio: PortfolioCreate,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Create a new portfolio"""
    service = PortfolioService(session)
    return service.create_portfolio(portfolio.name, user.id)


@router.get("/", response_model=List[PortfolioResponse])
def list_portfolios(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Get all portfolios"""
    service = PortfolioService(session)
    return service.get_all_portfolios(user.id)


@router.get("/prices/live", response_model=LivePricesResponse)
def get_live_prices(
    _user: Annotated[User, Depends(current_active_user)],
    tickers: Annotated[Optional[List[str]], Query()] = None,
):
    """Get current prices and FX rate without replaying transactions"""
    tickers = tickers or []
    if len(tickers) > MAX_TICKERS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many tickers requested ({len(tickers)}). Maximum is {MAX_TICKERS}.",
        )
    try:
        prices = PriceService.get_current_prices(tickers) if tickers else {}
    except Exception as e:
        logger.error("Error fetching live prices: %s", e, exc_info=True)
        prices = dict.fromkeys(tickers)
    usd_to_eur_rate = PriceService.get_usd_to_eur_rate_safe()
    return LivePricesResponse(
        prices=prices,
        usd_to_eur_rate=usd_to_eur_rate,
        timestamp=datetime.now(timezone.utc),
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


@router.get("/{portfolio_id}/status", response_model=PortfolioStatusResponse, responses={400: {"description": "Invalid portfolio data"}})
def get_portfolio_status(
    portfolio_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Get portfolio status with holdings, cash balance, and performance metrics"""
    service = PortfolioService(session)
    try:
        return service.calculate_portfolio_status(portfolio_id, user.id, tax_rate=user.tax_rate)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(
    portfolio_id: int,
    portfolio: PortfolioUpdate,
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


@router.get("/{portfolio_id}/performance", response_model=PortfolioPerformanceResponse, responses={400: {"description": "Invalid date format or date range"}})
def get_portfolio_performance(
    portfolio_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
    start_date: Annotated[Optional[str], Query(description="Start date in YYYY-MM-DD format")] = None,
    end_date: Annotated[Optional[str], Query(description="End date in YYYY-MM-DD format")] = None,
    num_points: Annotated[int, Query(ge=2, le=365, description="Number of data points to return")] = 60,
):
    """Get portfolio performance over time as a time series of portfolio values."""
    service = PortfolioService(session)

    start_dt = None
    end_dt = None

    try:
        if start_date:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        if end_date:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')

        if start_dt and end_dt and start_dt >= end_dt:
            raise HTTPException(
                status_code=400,
                detail="start_date must be before end_date"
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {str(e)}")

    try:
        PriceService.clear_session_cache()
        # get_portfolio_performance verifies ownership and returns (name, data_points)
        portfolio_name, performance_data = service.get_portfolio_performance(
            portfolio_id,
            user_id=user.id,
            start_date=start_dt,
            end_date=end_dt,
            num_points=num_points
        )

        data_points = [
            PerformanceDataPoint(
                date=dp['date'],
                principal=dp.get('principal', 0.0),
                principal_eur=dp.get('principal_eur'),
                current_value=dp.get('current_value'),
                fx_rate=dp.get('fx_rate'),
                return_pct=dp.get('return_pct'),
                sp500_return_pct=dp.get('sp500_return_pct'),
            )
            for dp in performance_data
        ]

        return PortfolioPerformanceResponse(
            portfolio_id=portfolio_id,
            portfolio_name=portfolio_name,
            data_points=data_points
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


