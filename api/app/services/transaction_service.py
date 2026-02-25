"""
Transaction service for business logic
"""
import uuid
from typing import List, Optional, Tuple
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


def _csv_field(value):
    """Convert None to empty string for CSV export."""
    return value if value is not None else ''


def _coalesce(new, existing):
    """Return *new* if provided (not None), otherwise keep *existing*."""
    return new if new is not None else existing


class TransactionService:
    """Service for transaction business logic"""

    def __init__(self, session: Session):
        self.transaction_repo = TransactionRepository(session)
        self.portfolio_repo = PortfolioRepository(session)

    def create_transaction(
        self,
        portfolio_id: int,
        user_id: uuid.UUID,
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
        # Verify portfolio exists and belongs to user
        if not self.portfolio_repo.exists_for_user(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)

        # Validate fx_rate
        if fx_rate is not None and fx_rate <= 0:
            raise InvalidTransactionDataException("fx_rate must be positive")

        # Validate eur_amount sign matches total_amount sign
        if eur_amount is not None and transaction_type != TransactionType.SPLIT:
            if (total_amount > 0 and eur_amount < 0) or (total_amount < 0 and eur_amount > 0):
                raise InvalidTransactionDataException(
                    "eur_amount sign must match total_amount sign"
                )

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

    def get_transactions_by_portfolio(self, portfolio_id: int, user_id: uuid.UUID) -> List[Transaction]:
        """Get all transactions for a portfolio (user-scoped)"""
        if not self.portfolio_repo.exists_for_user(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)
        return self.transaction_repo.get_by_portfolio_id(portfolio_id)

    def get_transactions_by_portfolio_paginated(
        self, portfolio_id: int, user_id: uuid.UUID, page: int = 1, page_size: int = 20,
        ticker: Optional[str] = None, transaction_types: Optional[List[str]] = None,
        sort_order: str = "desc"
    ) -> Tuple[List[Transaction], int]:
        """Get paginated transactions for a portfolio (user-scoped)"""
        if not self.portfolio_repo.exists_for_user(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)
        return self.transaction_repo.get_by_portfolio_id_paginated(
            portfolio_id, page, page_size, ticker=ticker, transaction_types=transaction_types,
            sort_order=sort_order
        )

    def export_transactions_to_csv(self, portfolio_id: int, user_id: uuid.UUID) -> str:
        """Export all transactions for a portfolio to CSV format (user-scoped)"""
        if not self.portfolio_repo.exists_for_user(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)

        transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)

        output = StringIO()
        writer = csv.writer(output)

        writer.writerow([
            'date',
            'type',
            'ticker',
            'quantity',
            'price_per_share',
            'fee',
            'total_amount',
            'eur',
            'split_ratio',
            'currency',
            'fx_rate'
        ])

        for transaction in transactions:
            writer.writerow([
                transaction.date.strftime('%m/%d/%Y %H:%M:%S'),
                transaction.type.value,
                transaction.ticker or '',
                _csv_field(transaction.quantity),
                _csv_field(transaction.price_per_share),
                _csv_field(transaction.fee),
                transaction.total_amount,
                _csv_field(transaction.eur_amount),
                _csv_field(transaction.split_ratio),
                _csv_field(transaction.currency),
                _csv_field(transaction.fx_rate),
            ])

        return output.getvalue()

    def update_transaction(
        self,
        transaction_id: int,
        user_id: uuid.UUID,
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
        """Update a transaction (user-scoped via portfolio ownership)"""
        transaction = self.transaction_repo.get_by_id_and_user(transaction_id, user_id)
        if not transaction:
            raise TransactionNotFoundException(transaction_id)

        val_type = _coalesce(transaction_type, transaction.type)
        val_ticker = _coalesce(ticker, transaction.ticker)
        val_quantity = _coalesce(quantity, transaction.quantity)
        val_price_per_share = _coalesce(price_per_share, transaction.price_per_share)
        val_total_amount = _coalesce(total_amount, transaction.total_amount)
        val_fee = _coalesce(fee, transaction.fee)
        val_eur_amount = _coalesce(eur_amount, transaction.eur_amount)

        if fx_rate is not None and fx_rate <= 0:
            raise InvalidTransactionDataException("fx_rate must be positive")

        # Validate eur_amount sign matches total_amount sign
        if val_eur_amount is not None and val_type != TransactionType.SPLIT:
            if (val_total_amount > 0 and val_eur_amount < 0) or (val_total_amount < 0 and val_eur_amount > 0):
                raise InvalidTransactionDataException(
                    "eur_amount sign must match total_amount sign"
                )

        self._validate_transaction_data(
            val_type,
            val_ticker,
            val_quantity,
            val_price_per_share,
            val_total_amount,
            val_fee
        )

        provided = {
            'date': date, 'type': transaction_type, 'ticker': ticker,
            'quantity': quantity, 'price_per_share': price_per_share,
            'fee': fee, 'total_amount': total_amount, 'eur_amount': eur_amount,
            'split_ratio': split_ratio, 'currency': currency, 'fx_rate': fx_rate,
        }
        for field, value in provided.items():
            if value is not None:
                setattr(transaction, field, value)

        return self.transaction_repo.update(transaction)

    def delete_transaction(self, transaction_id: int, user_id: uuid.UUID) -> None:
        """Delete a transaction (user-scoped via portfolio ownership)"""
        transaction = self.transaction_repo.get_by_id_and_user(transaction_id, user_id)
        if not transaction:
            raise TransactionNotFoundException(transaction_id)
        self.transaction_repo.delete(transaction_id)

    def import_from_csv(self, csv_content: str, portfolio_id: int, user_id: uuid.UUID) -> List[Transaction]:
        """Import transactions from CSV with transaction atomicity (user-scoped)"""
        if not self.portfolio_repo.exists_for_user(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)

        transactions = self._parse_csv(csv_content, portfolio_id)
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
        if quantity is not None and quantity <= 0:
            raise InvalidTransactionDataException("Quantity must be greater than 0")

        if price_per_share is not None and price_per_share <= 0:
            raise InvalidTransactionDataException("Price must be greater than 0")

        if fee is not None and fee < 0:
            raise InvalidTransactionDataException("Fee must be positive")

        if transaction_type in (TransactionType.BUY, TransactionType.SELL):
            self._validate_buy_sell(transaction_type, ticker, quantity, price_per_share, total_amount, fee)

        elif transaction_type in (TransactionType.DEPOSIT, TransactionType.WITHDRAW):
            if ticker or quantity is not None or price_per_share is not None:
                raise InvalidTransactionDataException(
                    f"{transaction_type.value} transactions should not have ticker, quantity, or price"
                )

        elif transaction_type in (TransactionType.SPLIT, TransactionType.DIVIDEND):
            if not ticker:
                raise InvalidTransactionDataException(
                    f"{transaction_type.value} transactions require a ticker symbol"
                )

    @staticmethod
    def _validate_buy_sell(
        transaction_type: TransactionType,
        ticker: Optional[str],
        quantity: Optional[float],
        price_per_share: Optional[float],
        total_amount: float,
        fee: Optional[float],
    ) -> None:
        """Validate fields specific to BUY/SELL transactions."""
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

        if transaction_type == TransactionType.BUY:
            expected_value = -(quantity * price_per_share + (fee or 0))
        else:
            expected_value = quantity * price_per_share - (fee or 0)

        if abs(total_amount - expected_value) > abs(expected_value) * 0.01:
            raise InvalidTransactionDataException(
                f"Value inconsistency: expected ~{expected_value:.2f} based on quantity * price_per_share "
                f"{'+ fee' if transaction_type == TransactionType.BUY else '- fee'}, got {total_amount}"
            )

    def _parse_csv(self, csv_content: str, portfolio_id: int) -> List[Transaction]:
        """Parse CSV content and create Transaction objects"""
        transactions = []
        csv_file = StringIO(csv_content)

        try:
            reader = csv.DictReader(csv_file)

            required_headers = {"date", "type", "total_amount"}
            if not required_headers.issubset(set(reader.fieldnames or [])):
                raise InvalidCSVFormatException(
                    f"CSV must contain headers: {', '.join(required_headers)}"
                )

            for line_num, row in enumerate(reader, start=2):
                try:
                    transaction = self._parse_csv_row(row, portfolio_id)
                    transactions.append(transaction)
                except (ValueError, InvalidTransactionDataException, KeyError, InvalidCSVFormatException) as e:
                    raise InvalidCSVFormatException(str(e), line_num)

        except InvalidCSVFormatException:
            raise
        except csv.Error as e:
            raise InvalidCSVFormatException(f"Invalid CSV format: {str(e)}")

        if not transactions:
            raise InvalidCSVFormatException("CSV file is empty or contains no valid transactions")

        return transactions

    def _parse_csv_row(self, row: dict, portfolio_id: int) -> Transaction:
        """Parse a single CSV row into a Transaction object"""
        try:
            date = datetime.strptime(row["date"].strip(), "%m/%d/%Y %H:%M:%S")
        except ValueError:
            raise ValueError(f"Invalid date format: {row['date']}. Expected MM/DD/YYYY HH:MM:SS")

        try:
            transaction_type = TransactionType(row["type"].strip())
        except ValueError:
            raise ValueError(f"Invalid transaction type: {row['type']}. Must be one of: {', '.join([t.value for t in TransactionType])}")

        ticker = row.get("ticker", "").strip().upper() or None
        quantity = self._clean_csv_number(row.get("quantity", ""), "quantity")
        price_per_share = self._clean_csv_number(row.get("price_per_share", ""), "price_per_share")
        fee = self._clean_csv_number(row.get("fee", ""), "fee")

        total_amount_str = row.get("total_amount", "").strip()
        if not total_amount_str:
            raise ValueError("total_amount field is required")
        total_amount = self._clean_csv_number(total_amount_str, "total_amount")
        if total_amount is None:
            raise ValueError(f"Invalid total_amount: {total_amount_str}")

        if transaction_type in [TransactionType.BUY, TransactionType.WITHDRAW, TransactionType.FEE]:
            if total_amount > 0:
                raise ValueError(f"{transaction_type.value} transactions must have negative total_amount in CSV, got {total_amount}")
        elif transaction_type in [TransactionType.DEPOSIT, TransactionType.SELL, TransactionType.DIVIDEND]:
            if total_amount < 0:
                raise ValueError(f"{transaction_type.value} transactions must have positive total_amount in CSV, got {total_amount}")
        elif transaction_type == TransactionType.SPLIT:
            if total_amount != 0:
                raise ValueError(f"SPLIT transactions must have total_amount of 0 in CSV, got {total_amount}")

        eur_amount = self._clean_csv_number(row.get("eur", ""), "eur")
        if eur_amount is not None:
            if transaction_type != TransactionType.SPLIT:
                if (total_amount > 0 and eur_amount < 0) or (total_amount < 0 and eur_amount > 0):
                    raise ValueError(f"EUR amount sign must match total_amount sign: total_amount={total_amount}, eur_amount={eur_amount}")

        split_ratio = self._clean_csv_number(row.get("split_ratio", ""), "split_ratio")

        currency_raw = row.get("currency", "").strip().upper()
        currency = currency_raw or None
        if currency and len(currency) != 3:
            raise ValueError(f"Currency must be a 3-letter code, got: {currency}")

        fx_rate = self._clean_csv_number(row.get("fx_rate", ""), "fx_rate")
        if fx_rate is not None and fx_rate <= 0:
            raise ValueError(f"fx_rate must be positive, got: {fx_rate}")

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
        cleaned = value.replace(",", "")
        try:
            return float(cleaned)
        except ValueError:
            raise ValueError(f"Invalid number format for {field_name}: {value}")
