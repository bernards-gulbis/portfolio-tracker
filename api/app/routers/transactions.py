"""Transaction API routes"""
from fastapi import APIRouter, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session
from typing import List
from io import BytesIO
import math

from app.core import get_session
from app.core.exceptions import FileUploadException
from app.schemas import (
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
    BulkImportResponse,
    PaginatedTransactionResponse,
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


@router.get("/transactions", response_model=PaginatedTransactionResponse)
def list_transactions(
    portfolio_id: int,
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    session: Session = Depends(get_session)
):
    """Get paginated transactions for a specific portfolio"""
    service = TransactionService(session)
    transactions, total = service.get_transactions_by_portfolio_paginated(
        portfolio_id, page, page_size
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 1
    
    return PaginatedTransactionResponse(
        transactions=transactions,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )

@router.get("/transactions/export")
def export_transactions(
    portfolio_id: int,
    session: Session = Depends(get_session)
):
    """Export all transactions for a portfolio as CSV"""
    service = TransactionService(session)
    csv_content = service.export_transactions_to_csv(portfolio_id)
    
    # Create a file-like object from the CSV string
    csv_bytes = BytesIO(csv_content.encode('utf-8'))
    
    return StreamingResponse(
        csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=portfolio_{portfolio_id}_transactions.csv"
        }
    )

@router.post("/transactions/import", response_model=BulkImportResponse, status_code=201)
async def import_transactions_csv(
    portfolio_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    """
    Import a CSV file to bulk import transactions.
    
    Expected CSV format:
    date_time,type,ticker,units,price,fee,value,EUR,split_ratio
    2/12/2020 20:14:40,Deposit,,,,,"3,000.00","2,760.27",
    2/12/2020 20:16:10,Buy,MSFT,15.00000001,183.69,0.00,"-2,755.35",,
    """
    # Verify file is CSV
    if not file.filename.endswith('.csv'):
        raise FileUploadException("File must be a CSV file")
    
    # Read file content with size limit (5MB)
    MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
    try:
        content = await file.read(MAX_FILE_SIZE + 1)
        if len(content) > MAX_FILE_SIZE:
            raise FileUploadException(f"File size exceeds maximum allowed size of {MAX_FILE_SIZE // (1024*1024)}MB")
        csv_content = content.decode('utf-8')
    except UnicodeDecodeError:
        raise FileUploadException("File must be a valid UTF-8 encoded CSV file")
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
