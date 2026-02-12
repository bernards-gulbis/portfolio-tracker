"""Portfolio API routes"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session
from typing import List, Optional
from datetime import datetime

from app.core import get_session
from app.schemas import (
    PortfolioCreate,
    PortfolioUpdate,
    PortfolioCopy,
    PortfolioResponse,
    PortfolioWithTransactions,
    PortfolioStatusResponse,
    PortfolioPerformanceResponse,
    PerformanceDataPoint,
)
from app.services import PortfolioService

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


@router.post("/", response_model=PortfolioResponse, status_code=201)
def create_portfolio(
    portfolio: PortfolioCreate,
    session: Session = Depends(get_session)
):
    """Create a new portfolio"""
    service = PortfolioService(session)
    return service.create_portfolio(portfolio.name)


@router.get("/", response_model=List[PortfolioResponse])
def list_portfolios(session: Session = Depends(get_session)):
    """Get all portfolios"""
    service = PortfolioService(session)
    return service.get_all_portfolios()


@router.get("/{portfolio_id}", response_model=PortfolioWithTransactions)
def get_portfolio(
    portfolio_id: int,
    session: Session = Depends(get_session)
):
    """Get a specific portfolio with its transactions"""
    service = PortfolioService(session)
    return service.get_portfolio(portfolio_id)


@router.get("/{portfolio_id}/status", response_model=PortfolioStatusResponse)
def get_portfolio_status(
    portfolio_id: int,
    session: Session = Depends(get_session)
):
    """Get portfolio status with holdings, cash balance, and performance metrics"""
    service = PortfolioService(session)
    try:
        return service.calculate_portfolio_status(portfolio_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(
    portfolio_id: int,
    portfolio: PortfolioUpdate,
    session: Session = Depends(get_session)
):
    """Update a portfolio"""
    service = PortfolioService(session)
    return service.update_portfolio(portfolio_id, portfolio.name)


@router.post("/{portfolio_id}/copy", response_model=PortfolioResponse, status_code=201)
def copy_portfolio(
    portfolio_id: int,
    copy_request: PortfolioCopy,
    session: Session = Depends(get_session)
):
    """Copy a portfolio with all its transactions"""
    service = PortfolioService(session)
    return service.copy_portfolio(portfolio_id, copy_request.new_name)


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(
    portfolio_id: int,
    session: Session = Depends(get_session)
):
    """Delete a portfolio and all its transactions"""
    service = PortfolioService(session)
    service.delete_portfolio(portfolio_id)
    return None


@router.get("/{portfolio_id}/performance", response_model=PortfolioPerformanceResponse)
def get_portfolio_performance(
    portfolio_id: int,
    start_date: Optional[str] = Query(None, description="Start date in YYYY-MM-DD format"),
    end_date: Optional[str] = Query(None, description="End date in YYYY-MM-DD format"),
    num_points: int = Query(60, ge=2, le=365, description="Number of data points to return"),
    session: Session = Depends(get_session)
):
    """
    Get portfolio performance over time.
    
    Returns a time series of portfolio values showing how the portfolio has evolved.
    Includes principal_eur (deposits/withdrawals) and current_value_eur (market value).
    """
    service = PortfolioService(session)
    
    # Parse dates if provided
    start_dt = None
    end_dt = None
    
    try:
        if start_date:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        if end_date:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        
        # Validate date range
        if start_dt and end_dt and start_dt > end_dt:
            raise HTTPException(
                status_code=400, 
                detail="start_date must be before or equal to end_date"
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {str(e)}")
    
    try:
        # Get the portfolio to check if it exists and get the name
        portfolio = service.get_portfolio(portfolio_id)
        
        # Get performance data
        performance_data = service.get_portfolio_performance(
            portfolio_id,
            start_date=start_dt,
            end_date=end_dt,
            num_points=num_points
        )
        
        # Convert to schema objects
        data_points = [
            PerformanceDataPoint(
                date=dp['date'],
                principal_eur=dp['principal_eur'],
                current_value_eur=dp['current_value_eur']
            )
            for dp in performance_data
        ]
        
        return PortfolioPerformanceResponse(
            portfolio_id=portfolio.id,
            portfolio_name=portfolio.name,
            data_points=data_points
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
