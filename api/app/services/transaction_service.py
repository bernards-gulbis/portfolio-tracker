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
        date_time: datetime,
        transaction_type: TransactionType,
        value: float,
        ticker: Optional[str] = None,
        units: Optional[float] = None,
        price: Optional[float] = None,
        fee: float = 0.0,
        value_eur: Optional[float] = None,
        split_ratio: Optional[float] = None,
    ) -> Transaction:
        """Create a new transaction with validation"""
        # Verify portfolio exists
        if not self.portfolio_repo.exists(portfolio_id):
            raise PortfolioNotFoundException(portfolio_id)
        
        # Business validation
        self._validate_transaction_data(
            transaction_type, ticker, units, price, value, fee
        )
        
        transaction = Transaction(
            portfolio_id=portfolio_id,
            date_time=date_time,
            type=transaction_type,
            ticker=ticker,
            units=units,
            price=price,
            fee=fee,
            value=value,
            value_eur=value_eur,
            split_ratio=split_ratio,
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
            'date_time',
            'type',
            'ticker',
            'units',
            'price',
            'fee',
            'value',
            'value_eur',
            'split_ratio'
        ])
        
        # Write transaction data
        for transaction in transactions:
            writer.writerow([
                transaction.date_time.strftime('%m/%d/%Y %H:%M:%S'),
                transaction.type.value,
                transaction.ticker or '',
                transaction.units if transaction.units is not None else '',
                transaction.price if transaction.price is not None else '',
                transaction.fee,
                transaction.value,
                transaction.value_eur if transaction.value_eur is not None else '',
                transaction.split_ratio if transaction.split_ratio is not None else '',
            ])
        
        return output.getvalue()
    
    def update_transaction(
        self,
        transaction_id: int,
        date_time: Optional[datetime] = None,
        transaction_type: Optional[TransactionType] = None,
        ticker: Optional[str] = None,
        units: Optional[float] = None,
        price: Optional[float] = None,
        fee: Optional[float] = None,
        value: Optional[float] = None,
        value_eur: Optional[float] = None,
        split_ratio: Optional[float] = None,
    ) -> Transaction:
        """Update a transaction"""
        transaction = self.transaction_repo.get_by_id(transaction_id)
        if not transaction:
            raise TransactionNotFoundException(transaction_id)
        
        # Update fields
        if date_time is not None:
            transaction.date_time = date_time
        if transaction_type is not None:
            transaction.type = transaction_type
        if ticker is not None:
            transaction.ticker = ticker
        if units is not None:
            transaction.units = units
        if price is not None:
            transaction.price = price
        if fee is not None:
            transaction.fee = fee
        if value is not None:
            transaction.value = value
        if value_eur is not None:
            transaction.value_eur = value_eur
        if split_ratio is not None:
            transaction.split_ratio = split_ratio
        
        # Validate updated transaction
        self._validate_transaction_data(
            transaction.type,
            transaction.ticker,
            transaction.units,
            transaction.price,
            transaction.value,
            transaction.fee
        )
        
        return self.transaction_repo.update(transaction)
    
    def delete_transaction(self, transaction_id: int) -> None:
        """Delete a transaction"""
        if not self.transaction_repo.delete(transaction_id):
            raise TransactionNotFoundException(transaction_id)
    
    def import_from_csv(self, csv_content: str, portfolio_id: int) -> List[Transaction]:
        """Import transactions from CSV"""
        # Verify portfolio exists
        if not self.portfolio_repo.exists(portfolio_id):
            raise PortfolioNotFoundException(portfolio_id)
        
        # Parse CSV
        transactions = self._parse_csv(csv_content, portfolio_id)
        
        # Bulk create transactions
        return self.transaction_repo.bulk_create(transactions)
    
    def _validate_transaction_data(
        self,
        transaction_type: TransactionType,
        ticker: Optional[str],
        units: Optional[float],
        price: Optional[float],
        value: float,
        fee: float,
    ) -> None:
        """Validate transaction data based on business rules"""
        # Validate units
        if units is not None and units < 0:
            raise InvalidTransactionDataException("Units cannot be negative")
        
        # Validate price
        if price is not None and price < 0:
            raise InvalidTransactionDataException("Price cannot be negative")
        
        # Validate fee
        if fee < 0:
            raise InvalidTransactionDataException("Fee cannot be negative")
        
        # Note: We don't enforce strict validation for Buy/Sell to allow flexibility
        # Some systems may track buy/sell without full details initially
    
    def _parse_csv(self, csv_content: str, portfolio_id: int) -> List[Transaction]:
        """Parse CSV content and create Transaction objects"""
        transactions = []
        csv_file = StringIO(csv_content)
        
        try:
            reader = csv.DictReader(csv_file)
            
            # Validate headers
            required_headers = {"date_time", "type", "value"}
            if not required_headers.issubset(set(reader.fieldnames or [])):
                raise InvalidCSVFormatException(
                    f"CSV must contain headers: {', '.join(required_headers)}"
                )
            
            for line_num, row in enumerate(reader, start=2):  # Start at 2 (header is line 1)
                try:
                    transaction = self._parse_csv_row(row, portfolio_id)
                    transactions.append(transaction)
                except Exception as e:
                    raise InvalidCSVFormatException(str(e), line_num)
            
        except csv.Error as e:
            raise InvalidCSVFormatException(f"Invalid CSV format: {str(e)}")
        
        if not transactions:
            raise InvalidCSVFormatException("CSV file is empty or contains no valid transactions")
        
        return transactions
    
    def _parse_csv_row(self, row: dict, portfolio_id: int) -> Transaction:
        """Parse a single CSV row into a Transaction object"""
        try:
            # Parse date_time (format: M/D/YYYY H:M:S)
            date_time = datetime.strptime(row["date_time"].strip(), "%m/%d/%Y %H:%M:%S")
        except ValueError as e:
            raise ValueError(f"Invalid date format: {row['date_time']}. Expected MM/DD/YYYY HH:MM:SS")
        
        # Parse transaction type
        try:
            transaction_type = TransactionType(row["type"].strip())
        except ValueError:
            raise ValueError(f"Invalid transaction type: {row['type']}. Must be one of: {', '.join([t.value for t in TransactionType])}")
        
        # Parse optional fields
        ticker = row.get("ticker", "").strip() or None
        units = self._clean_csv_number(row.get("units"))
        price = self._clean_csv_number(row.get("price"))
        fee = self._clean_csv_number(row.get("fee")) or 0.0
        
        # Parse required value field
        value_str = row.get("value", "").strip()
        if not value_str:
            raise ValueError("Value field is required")
        value = self._clean_csv_number(value_str)
        if value is None:
            raise ValueError(f"Invalid value: {value_str}")
        
        # Parse optional EUR value field
        value_eur = self._clean_csv_number(row.get("EUR"))
        
        # Parse optional split_ratio field
        split_ratio = self._clean_csv_number(row.get("split_ratio"))
        
        return Transaction(
            portfolio_id=portfolio_id,
            date_time=date_time,
            type=transaction_type,
            ticker=ticker,
            units=units,
            price=price,
            fee=fee,
            value=value,
            value_eur=value_eur,
            split_ratio=split_ratio,
        )
    
    @staticmethod
    def _clean_csv_number(value: str) -> Optional[float]:
        """Clean CSV number by removing thousand separators and converting to float"""
        if not value or value.strip() == "":
            return None
        # Remove commas used as thousand separators
        cleaned = value.replace(",", "")
        try:
            return float(cleaned)
        except ValueError:
            raise ValueError(f"Invalid number format: {value}")
