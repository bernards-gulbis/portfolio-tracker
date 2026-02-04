"""Transaction API routes"""
from fastapi import APIRouter, Depends, UploadFile, File
from sqlmodel import Session
from typing import List

from app.core import get_session
from app.core.exceptions import FileUploadException
from app.schemas import (
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
    BulkImportResponse,
)
from app.services import TransactionService

router = APIRouter(prefix="/portfolios/{portfolio_id}", tags=["transactions"])


@router.post("/transactions/", response_model=TransactionResponse, status_code=201)
def create_transaction(
    portfolio_id: int,
    transaction: TransactionCreate,
    session: Session = Depends(get_session)
):
    """Create a new transaction for a portfolio"""
    service = TransactionService(session)
    return service.create_transaction(
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


@router.get("/transactions", response_model=List[TransactionResponse])
def list_transactions(
    portfolio_id: int,
    session: Session = Depends(get_session)
):
    """Get all transactions for a specific portfolio"""
    service = TransactionService(session)
    return service.get_transactions_by_portfolio(portfolio_id)


@router.post("/upload", response_model=BulkImportResponse, status_code=201)
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
        raise FileUploadException("File must be a CSV file")
    
    # Read file content
    try:
        content = await file.read()
        csv_content = content.decode('utf-8')
    except Exception as e:
        raise FileUploadException(f"Error reading file: {str(e)}")
    
    # Import transactions
    service = TransactionService(session)
    transactions = service.import_from_csv(csv_content, portfolio_id)
    
    return BulkImportResponse(
        imported_count=len(transactions),
        transactions=transactions
    )


# Individual transaction operations (not portfolio-specific)
transaction_router = APIRouter(prefix="/transactions", tags=["transactions"])


@transaction_router.put("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    transaction: TransactionUpdate,
    session: Session = Depends(get_session)
):
    """Update a transaction"""
    service = TransactionService(session)
    return service.update_transaction(
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


@transaction_router.delete("/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: int,
    session: Session = Depends(get_session)
):
    """Delete a transaction"""
    service = TransactionService(session)
    service.delete_transaction(transaction_id)
    return None
