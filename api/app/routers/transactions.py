"""Transaction API routes"""

import math
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.core import get_session
from app.core.auth import current_active_user
from app.core.exceptions import FileUploadException
from app.models.user import User
from app.schemas import (
    BulkImportResponse,
    PaginatedTransactionResponse,
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)
from app.services import TransactionService

router = APIRouter(prefix="/portfolios/{portfolio_id}", tags=["transactions"])


@router.post("/transactions/", response_model=TransactionResponse, status_code=201)
def create_transaction(
    portfolio_id: int,
    transaction: TransactionCreate,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Create a new transaction for a portfolio"""
    service = TransactionService(session)
    return service.create_transaction(
        portfolio_id=portfolio_id,
        user_id=user.id,
        date=transaction.date,
        transaction_type=transaction.type,
        total_amount=transaction.total_amount,
        ticker=transaction.ticker,
        quantity=transaction.quantity,
        price_per_share=transaction.price_per_share,
        fee=transaction.fee,
        eur_amount=transaction.eur_amount,
        split_ratio=transaction.split_ratio,
        currency=transaction.currency,
        fx_rate=transaction.fx_rate,
    )


@router.get("/transactions", response_model=PaginatedTransactionResponse)
def list_transactions(
    portfolio_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
    ticker: Annotated[
        str | None, Query(description="Filter by ticker (partial, case-insensitive)")
    ] = None,
    type: Annotated[
        list[str] | None, Query(description="Filter by transaction type(s)")
    ] = None,
    sort_order: Annotated[
        str, Query(pattern="^(asc|desc)$", description="Sort by date: asc or desc")
    ] = "desc",
):
    """Get paginated transactions for a specific portfolio"""
    service = TransactionService(session)
    transactions, total = service.get_transactions_by_portfolio_paginated(
        portfolio_id,
        user.id,
        page,
        page_size,
        ticker=ticker,
        transaction_types=type,
        sort_order=sort_order,
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    return PaginatedTransactionResponse(
        transactions=transactions,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/transactions/export")
def export_transactions(
    portfolio_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Export all transactions for a portfolio as CSV"""
    service = TransactionService(session)
    csv_content = service.export_transactions_to_csv(portfolio_id, user.id)

    csv_bytes = BytesIO(csv_content.encode("utf-8"))

    return StreamingResponse(
        csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=portfolio_{portfolio_id}_transactions.csv"
        },
    )


@router.post("/transactions/import", response_model=BulkImportResponse, status_code=201)
async def import_transactions_csv(
    portfolio_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
    file: Annotated[UploadFile, File()],
):
    """
    Import a CSV file to bulk import transactions.

    Expected CSV format:
    date,type,ticker,quantity,price_per_share,fee,total_amount,eur,split_ratio,currency,fx_rate
    2/12/2020 20:14:39,Deposit,,,,,3000,2760.27,,USD,1.0871
    2/12/2020 20:16:10,Buy,MSFT,15.00000001,183.69,0.00,"-2,755.35",,,,
    """
    if not file.filename.endswith(".csv"):
        raise FileUploadException("File must be a CSV file")

    max_file_size = 5 * 1024 * 1024  # 5MB
    try:
        content = await file.read(max_file_size + 1)
        if len(content) > max_file_size:
            raise FileUploadException(
                f"File size exceeds maximum allowed size of {max_file_size // (1024 * 1024)}MB"
            )
        csv_content = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise FileUploadException(
            "File must be a valid UTF-8 encoded CSV file"
        ) from exc
    except FileUploadException:
        raise
    except Exception as e:
        raise FileUploadException(f"Error reading file: {e!s}") from e

    service = TransactionService(session)
    transactions, skipped_count = service.import_from_csv(
        csv_content, portfolio_id, user.id
    )

    return BulkImportResponse(
        imported_count=len(transactions),
        skipped_count=skipped_count,
        transactions=transactions,
    )


# Individual transaction operations (not portfolio-specific)
transaction_router = APIRouter(prefix="/transactions", tags=["transactions"])


@transaction_router.put("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    transaction: TransactionUpdate,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Update a transaction"""
    service = TransactionService(session)
    return service.update_transaction(
        transaction_id=transaction_id,
        user_id=user.id,
        date=transaction.date,
        transaction_type=transaction.type,
        ticker=transaction.ticker,
        quantity=transaction.quantity,
        price_per_share=transaction.price_per_share,
        fee=transaction.fee,
        total_amount=transaction.total_amount,
        eur_amount=transaction.eur_amount,
        split_ratio=transaction.split_ratio,
        currency=transaction.currency,
        fx_rate=transaction.fx_rate,
    )


@transaction_router.delete("/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(current_active_user)],
):
    """Delete a transaction"""
    service = TransactionService(session)
    service.delete_transaction(transaction_id, user.id)
    return None
