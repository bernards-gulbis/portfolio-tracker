from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from sqlmodel import Session
from typing import List
from contextlib import asynccontextmanager

from database import create_db_and_tables, get_session
from schemas import (
    PortfolioCreate,
    PortfolioUpdate,
    PortfolioResponse,
    PortfolioWithTransactions,
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
    BulkImportResponse,
)
import crud


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    create_db_and_tables()
    yield
    # Shutdown (cleanup if needed)


app = FastAPI(
    title="Portfolio Tracker API",
    description="API for tracking investment portfolios and transactions",
    version="1.0.0",
    lifespan=lifespan,
)


# ================== Portfolio Endpoints ==================

@app.post("/portfolios/", response_model=PortfolioResponse, status_code=201)
def create_portfolio(
    portfolio: PortfolioCreate,
    session: Session = Depends(get_session)
):
    """Create a new portfolio"""
    return crud.create_portfolio(session, portfolio.name)


@app.get("/portfolios/", response_model=List[PortfolioResponse])
def list_portfolios(session: Session = Depends(get_session)):
    """Get all portfolios"""
    return crud.get_all_portfolios(session)


@app.get("/portfolios/{portfolio_id}", response_model=PortfolioWithTransactions)
def get_portfolio(
    portfolio_id: int,
    session: Session = Depends(get_session)
):
    """Get a specific portfolio with its transactions"""
    portfolio = crud.get_portfolio(session, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


@app.put("/portfolios/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(
    portfolio_id: int,
    portfolio: PortfolioUpdate,
    session: Session = Depends(get_session)
):
    """Update a portfolio"""
    updated_portfolio = crud.update_portfolio(session, portfolio_id, portfolio.name)
    if not updated_portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return updated_portfolio


@app.delete("/portfolios/{portfolio_id}", status_code=204)
def delete_portfolio(
    portfolio_id: int,
    session: Session = Depends(get_session)
):
    """Delete a portfolio and all its transactions"""
    success = crud.delete_portfolio(session, portfolio_id)
    if not success:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return None


# ================== Transaction Endpoints ==================

@app.post(
    "/portfolios/{portfolio_id}/transactions/",
    response_model=TransactionResponse,
    status_code=201
)
def create_transaction(
    portfolio_id: int,
    transaction: TransactionCreate,
    session: Session = Depends(get_session)
):
    """Create a new transaction for a portfolio"""
    new_transaction = crud.add_transaction(
        session=session,
        portfolio_id=portfolio_id,
        date_time=transaction.date_time,
        transaction_type=transaction.type,
        value=transaction.value,
        ticker=transaction.ticker,
        units=transaction.units,
        price=transaction.price,
        fee=transaction.fee,
        value_eur=transaction.value_eur,
        split_ratio=transaction.split_ratio,
    )
    if not new_transaction:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return new_transaction


@app.get(
    "/portfolios/{portfolio_id}/transactions",
    response_model=List[TransactionResponse]
)
def list_transactions(
    portfolio_id: int,
    session: Session = Depends(get_session)
):
    """Get all transactions for a specific portfolio"""
    # Verify portfolio exists
    portfolio = crud.get_portfolio(session, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    return crud.get_transactions_for_portfolio(session, portfolio_id)


@app.post(
    "/portfolios/{portfolio_id}/upload",
    response_model=BulkImportResponse,
    status_code=201
)
async def upload_transactions_csv(
    portfolio_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    """
    Upload a CSV file to bulk import transactions.
    
    Expected CSV format:
    date_time,type,ticker,units,price,fee,value,EUR,split_ratio
    2/12/2020 20:14:40,Deposit,,,,,"3,000.00","2,760.27",
    2/12/2020 20:16:10,Buy,MSFT,15.00000001,183.69,0.00,"-2,755.35",,
    """
    # Verify file is CSV
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=400,
            detail="File must be a CSV file"
        )
    
    # Read file content
    try:
        content = await file.read()
        csv_content = content.decode('utf-8')
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error reading file: {str(e)}"
        )
    
    # Import transactions
    try:
        transactions = crud.import_transactions_from_csv(
            session, csv_content, portfolio_id
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error parsing CSV: {str(e)}"
        )
    
    return BulkImportResponse(
        imported_count=len(transactions),
        transactions=transactions
    )


@app.put("/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    transaction: TransactionUpdate,
    session: Session = Depends(get_session)
):
    """Update a transaction"""
    updated_transaction = crud.update_transaction(
        session=session,
        transaction_id=transaction_id,
        date_time=transaction.date_time,
        transaction_type=transaction.type,
        ticker=transaction.ticker,
        units=transaction.units,
        price=transaction.price,
        fee=transaction.fee,
        value=transaction.value,
        value_eur=transaction.value_eur,
        split_ratio=transaction.split_ratio,
    )
    if not updated_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return updated_transaction


@app.delete("/transactions/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: int,
    session: Session = Depends(get_session)
):
    """Delete a transaction"""
    success = crud.delete_transaction(session, transaction_id)
    if not success:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return None


# ================== Health Check ==================

@app.get("/")
def root():
    """Health check endpoint"""
    return {"message": "Portfolio Tracker API", "status": "running"}
