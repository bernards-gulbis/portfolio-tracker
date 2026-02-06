"""Portfolio API routes"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from typing import List

from app.core import get_session
from app.schemas import (
    PortfolioCreate,
    PortfolioUpdate,
    PortfolioCopy,
    PortfolioResponse,
    PortfolioWithTransactions,
    PortfolioStatusResponse,
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
