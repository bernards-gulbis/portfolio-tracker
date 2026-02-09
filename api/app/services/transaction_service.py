"""
Transaction service for business logic
"""
from typing import List, Optional
from datetime import datetime
import csv
from io import StringIO

from sqlmodel import Session
from app.models import Transaction, TransactionType
from app.repositories.portfolio_repository import PortfolioRepository
from app.repositories.transaction_repository import TransactionRepository
from app.core.exceptions import (
    PortfolioNotFoundException,
    TransactionNotFoundException,
    InvalidCSVFormatException,
    InvalidTransactionDataException,
)


class TransactionService:
    """Service for transaction business logic"""
    
    def __init__(self, session: Session):
        self.transaction_repo = TransactionRepository(session)
        self.portfolio_repo = PortfolioRepository(session)
    
    def create_transaction(
        self,
        portfolio_id: int,
        date: datetime,
        transaction_type: TransactionType,
        total_amount: float,
        ticker: Optional[str] = None,
        quantity: Optional[float] = None,
        price_per_share: Optional[float] = None,
        fee: Optional[float] = None,
        eur_amount: Optional[float] = None,
        split_ratio: Optional[float] = None,
        currency: Optional[str] = None,
        fx_rate: Optional[float] = None,
    ) -> Transaction:
        """Create a new transaction with validation"""
        # Verify portfolio exists
        if not self.portfolio_repo.exists(portfolio_id):
            raise PortfolioNotFoundException(portfolio_id)
        
        # Business validation
        self._validate_transaction_data(
            transaction_type, ticker, quantity, price_per_share, total_amount, fee
        )
        
        transaction = Transaction(
            portfolio_id=portfolio_id,
            date=date,
            type=transaction_type,
            ticker=ticker,
            quantity=quantity,
            price_per_share=price_per_share,
            fee=fee,
            total_amount=total_amount,
            eur_amount=eur_amount,
            split_ratio=split_ratio,
            currency=currency,
            fx_rate=fx_rate,
        )
        
        return self.transaction_repo.create(transaction)
    
    def get_transaction(self, transaction_id: int) -> Transaction:
        """Get a transaction by ID"""
        transaction = self.transaction_repo.get_by_id(transaction_id)
        if not transaction:
            raise TransactionNotFoundException(transaction_id)
        return transaction
    
    def get_transactions_by_portfolio(self, portfolio_id: int) -> List[Transaction]:
        """Get all transactions for a portfolio"""
        # Verify portfolio exists
        if not self.portfolio_repo.exists(portfolio_id):
            raise PortfolioNotFoundException(portfolio_id)
        
        return self.transaction_repo.get_by_portfolio_id(portfolio_id)
    
    def get_transactions_by_portfolio_paginated(
        self, portfolio_id: int, page: int = 1, page_size: int = 20
    ) -> tuple[List[Transaction], int]:
        """Get paginated transactions for a portfolio"""
        # Verify portfolio exists
        if not self.portfolio_repo.exists(portfolio_id):
            raise PortfolioNotFoundException(portfolio_id)
        
        return self.transaction_repo.get_by_portfolio_id_paginated(portfolio_id, page, page_size)
    
    def export_transactions_to_csv(self, portfolio_id: int) -> str:
        """Export all transactions for a portfolio to CSV format"""
        # Verify portfolio exists
        if not self.portfolio_repo.exists(portfolio_id):
            raise PortfolioNotFoundException(portfolio_id)
        
        transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)
        
        # Create CSV in memory
        output = StringIO()
        writer = csv.writer(output)
        
        # Write header - must match import format
        writer.writerow([
            'date',
            'type',
            'ticker',
            'quantity',
            'price_per_share',
            'fee',
            'total_amount',
            'EUR',
            'split_ratio',
            'currency',
            'fx_rate'
        ])
        
        # Write transaction data
        for transaction in transactions:
            writer.writerow([
                transaction.date.strftime('%m/%d/%Y %H:%M:%S'),
                transaction.type.value,
                transaction.ticker or '',
                transaction.quantity if transaction.quantity is not None else '',
                transaction.price_per_share if transaction.price_per_share is not None else '',
                transaction.fee if transaction.fee is not None else '',
                transaction.total_amount,
                transaction.eur_amount if transaction.eur_amount is not None else '',
                transaction.split_ratio if transaction.split_ratio is not None else '',
                transaction.currency if transaction.currency is not None else '',
                transaction.fx_rate if transaction.fx_rate is not None else '',
            ])
        
        return output.getvalue()
    
    def update_transaction(
        self,
        transaction_id: int,
        date: Optional[datetime] = None,
        transaction_type: Optional[TransactionType] = None,
        ticker: Optional[str] = None,
        quantity: Optional[float] = None,
        price_per_share: Optional[float] = None,
        fee: Optional[float] = None,
        total_amount: Optional[float] = None,
        eur_amount: Optional[float] = None,
        split_ratio: Optional[float] = None,
        currency: Optional[str] = None,
        fx_rate: Optional[float] = None,
    ) -> Transaction:
        """Update a transaction"""
        transaction = self.transaction_repo.get_by_id(transaction_id)
        if not transaction:
            raise TransactionNotFoundException(transaction_id)
        
        # Create a copy of current values for validation
        val_type = transaction_type if transaction_type is not None else transaction.type
        val_ticker = ticker if ticker is not None else transaction.ticker
        val_quantity = quantity if quantity is not None else transaction.quantity
        val_price_per_share = price_per_share if price_per_share is not None else transaction.price_per_share
        val_total_amount = total_amount if total_amount is not None else transaction.total_amount
        val_fee = fee if fee is not None else transaction.fee
        
        # Validate before applying changes
        self._validate_transaction_data(
            val_type,
            val_ticker,
            val_quantity,
            val_price_per_share,
            val_total_amount,
            val_fee
        )
        
        # Update fields after validation passes
        if date is not None:
            transaction.date = date
        if transaction_type is not None:
            transaction.type = transaction_type
        if ticker is not None:
            transaction.ticker = ticker
        if quantity is not None:
            transaction.quantity = quantity
        if price_per_share is not None:
            transaction.price_per_share = price_per_share
        if fee is not None:
            transaction.fee = fee
        if total_amount is not None:
            transaction.total_amount = total_amount
        if eur_amount is not None:
            transaction.eur_amount = eur_amount
        if split_ratio is not None:
            transaction.split_ratio = split_ratio
        if currency is not None:
            transaction.currency = currency
        if fx_rate is not None:
            transaction.fx_rate = fx_rate
        
        return self.transaction_repo.update(transaction)
    
    def delete_transaction(self, transaction_id: int) -> None:
        """Delete a transaction"""
        if not self.transaction_repo.delete(transaction_id):
            raise TransactionNotFoundException(transaction_id)
    
    def import_from_csv(self, csv_content: str, portfolio_id: int) -> List[Transaction]:
        """Import transactions from CSV with transaction atomicity"""
        # Verify portfolio exists
        if not self.portfolio_repo.exists(portfolio_id):
            raise PortfolioNotFoundException(portfolio_id)
        
        # Parse CSV (may raise InvalidCSVFormatException)
        transactions = self._parse_csv(csv_content, portfolio_id)
        
        # Bulk create transactions with atomicity
        # Let database exceptions propagate (they indicate system/data issues, not CSV format problems)
        return self.transaction_repo.bulk_create(transactions)
    
    def _validate_transaction_data(
        self,
        transaction_type: TransactionType,
        ticker: Optional[str],
        quantity: Optional[float],
        price_per_share: Optional[float],
        total_amount: float,
        fee: Optional[float],
    ) -> None:
        """Validate transaction data based on business rules"""
        # Validate quantity
        if quantity is not None and quantity <= 0:
            raise InvalidTransactionDataException("Quantity must be greater than 0")
        
        # Validate price
        if price_per_share is not None and price_per_share <= 0:
            raise InvalidTransactionDataException("Price must be greater than 0")
        
        # Validate fee is positive
        if fee is not None and fee < 0:
            raise InvalidTransactionDataException("Fee must be positive")
        
        # Transaction type-specific validation
        if transaction_type in (TransactionType.BUY, TransactionType.SELL):
            # Buy and Sell require ticker, quantity, and price
            if not ticker:
                raise InvalidTransactionDataException(
                    f"{transaction_type.value} transactions require a ticker symbol"
                )
            if quantity is None:
                raise InvalidTransactionDataException(
                    f"{transaction_type.value} transactions require quantity"
                )
            if price_per_share is None:
                raise InvalidTransactionDataException(
                    f"{transaction_type.value} transactions require a price"
                )
            
            # Validate value consistency (allowing 1% margin for rounding)
            if transaction_type == TransactionType.BUY:
                # For BUY: total_amount should be negative (cost)
                expected_value = -(quantity * price_per_share + (fee or 0))
            else:  # SELL
                # For SELL: total_amount should be positive (proceeds)
                expected_value = quantity * price_per_share - (fee or 0)
            
            if abs(total_amount - expected_value) > abs(expected_value) * 0.01:
                raise InvalidTransactionDataException(
                    f"Value inconsistency: expected ~{expected_value:.2f} based on quantity * price_per_share {'+ fee' if transaction_type == TransactionType.BUY else '- fee'}, got {total_amount}"
                )
        
        elif transaction_type in (TransactionType.DEPOSIT, TransactionType.WITHDRAW):
            # Deposit and Withdraw should not have trading details
            if ticker or quantity is not None or price_per_share is not None:
                raise InvalidTransactionDataException(
                    f"{transaction_type.value} transactions should not have ticker, quantity, or price"
                )
        
        elif transaction_type == TransactionType.SPLIT:
            # Split requires ticker (quantity and split_ratio validated elsewhere)
            if not ticker:
                raise InvalidTransactionDataException(
                    "Split transactions require a ticker symbol"
                )
        
        elif transaction_type == TransactionType.DIVIDEND:
            # Dividend requires ticker
            if not ticker:
                raise InvalidTransactionDataException(
                    "Dividend transactions require a ticker symbol"
                )
    
    def _parse_csv(self, csv_content: str, portfolio_id: int) -> List[Transaction]:
        """Parse CSV content and create Transaction objects"""
        transactions = []
        csv_file = StringIO(csv_content)
        
        try:
            reader = csv.DictReader(csv_file)
            
            # Validate headers
            required_headers = {"date", "type", "total_amount"}
            if not required_headers.issubset(set(reader.fieldnames or [])):
                raise InvalidCSVFormatException(
                    f"CSV must contain headers: {', '.join(required_headers)}"
                )
            
            for line_num, row in enumerate(reader, start=2):  # Start at 2 (header is line 1)
                try:
                    transaction = self._parse_csv_row(row, portfolio_id)
                    transactions.append(transaction)
                except (ValueError, InvalidTransactionDataException, KeyError, InvalidCSVFormatException) as e:
                    # Wrap known CSV/validation errors with line number
                    raise InvalidCSVFormatException(str(e), line_num)
            
        except InvalidCSVFormatException:
            # Already formatted, re-raise as-is
            raise
        except csv.Error as e:
            raise InvalidCSVFormatException(f"Invalid CSV format: {str(e)}")
        
        if not transactions:
            raise InvalidCSVFormatException("CSV file is empty or contains no valid transactions")
        
        return transactions
    
    def _parse_csv_row(self, row: dict, portfolio_id: int) -> Transaction:
        """Parse a single CSV row into a Transaction object"""
        try:
            # Parse date (format: M/D/YYYY H:M:S)
            date = datetime.strptime(row["date"].strip(), "%m/%d/%Y %H:%M:%S")
        except ValueError as e:
            raise ValueError(f"Invalid date format: {row['date']}. Expected MM/DD/YYYY HH:MM:SS")
        
        # Parse transaction type
        try:
            transaction_type = TransactionType(row["type"].strip())
        except ValueError:
            raise ValueError(f"Invalid transaction type: {row['type']}. Must be one of: {', '.join([t.value for t in TransactionType])}")
        
        # Parse optional fields
        ticker = row.get("ticker", "").strip().upper() or None
        quantity = self._clean_csv_number(row.get("quantity", ""), "quantity")
        price_per_share = self._clean_csv_number(row.get("price_per_share", ""), "price_per_share")
        fee = self._clean_csv_number(row.get("fee", ""), "fee")
        
        # Parse required value field
        total_amount_str = row.get("total_amount", "").strip()
        if not total_amount_str:
            raise ValueError("total_amount field is required")
        total_amount = self._clean_csv_number(total_amount_str, "total_amount")
        if total_amount is None:
            raise ValueError(f"Invalid total_amount: {total_amount_str}")
        
        # Validate sign matches transaction type
        # BUY, WITHDRAW, FEE should be negative; DEPOSIT, SELL, DIVIDEND should be positive; SPLIT should be 0
        if transaction_type in [TransactionType.BUY, TransactionType.WITHDRAW, TransactionType.FEE]:
            if total_amount > 0:
                raise ValueError(f"{transaction_type.value} transactions must have negative total_amount in CSV, got {total_amount}")
        elif transaction_type in [TransactionType.DEPOSIT, TransactionType.SELL, TransactionType.DIVIDEND]:
            if total_amount < 0:
                raise ValueError(f"{transaction_type.value} transactions must have positive total_amount in CSV, got {total_amount}")
        elif transaction_type == TransactionType.SPLIT:
            if total_amount != 0:
                raise ValueError(f"SPLIT transactions must have total_amount of 0 in CSV, got {total_amount}")
        
        # Parse optional EUR value field
        eur_amount = self._clean_csv_number(row.get("EUR", ""), "EUR")
        if eur_amount is not None:
            # Validate EUR amount sign matches total_amount sign (except for SPLIT)
            if transaction_type != TransactionType.SPLIT:
                if (total_amount > 0 and eur_amount < 0) or (total_amount < 0 and eur_amount > 0):
                    raise ValueError(f"EUR amount sign must match total_amount sign: total_amount={total_amount}, eur_amount={eur_amount}")
        
        # Parse optional split_ratio field
        split_ratio = self._clean_csv_number(row.get("split_ratio", ""), "split_ratio")
        
        # Parse optional currency field (3 letter code)
        currency = row.get("currency", "").strip().upper() or None
        if currency and len(currency) != 3:
            raise ValueError(f"Currency must be a 3-letter code, got: {currency}")
        
        # Parse optional fx_rate field (4 decimal places)
        fx_rate = self._clean_csv_number(row.get("fx_rate", ""), "fx_rate")
        
        return Transaction(
            portfolio_id=portfolio_id,
            date=date,
            type=transaction_type,
            ticker=ticker,
            quantity=quantity,
            price_per_share=price_per_share,
            fee=fee,
            total_amount=total_amount,
            eur_amount=eur_amount,
            split_ratio=split_ratio,
            currency=currency,
            fx_rate=fx_rate,
        )
    
    @staticmethod
    def _clean_csv_number(value: str, field_name: str = "field") -> Optional[float]:
        """Clean CSV number by removing thousand separators and converting to float"""
        if not value or value.strip() == "":
            return None
        # Remove commas used as thousand separators
        cleaned = value.replace(",", "")
        try:
            return float(cleaned)
        except ValueError:
            raise ValueError(f"Invalid number format for {field_name}: {value}")
