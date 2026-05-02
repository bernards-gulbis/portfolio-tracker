"""
Transaction service for business logic
"""

import csv
import math
import uuid
from collections import Counter
from datetime import datetime
from decimal import Decimal
from io import StringIO

from sqlmodel import Session

from app.core.exceptions import (
    InvalidCSVFormatException,
    InvalidTransactionDataException,
    PortfolioNotFoundException,
    TransactionNotFoundException,
)
from app.models import Transaction, TransactionType
from app.repositories.portfolio_repository import PortfolioRepository
from app.repositories.transaction_repository import TransactionRepository
from app.services.portfolio_types import _to_decimal


def _dedup_key(t: Transaction) -> tuple:
    """Build a fingerprint tuple for deduplication."""
    return (
        t.date,
        t.type,
        t.ticker,
        t.total_amount,
        t.quantity,
        t.price_per_share,
        t.fee,
        t.eur_amount,
        t.split_ratio,
        t.currency,
        t.fx_rate,
    )


# Rejecting at parse time bounds memory and DB-roundtrip cost. 5000 rows
# covers ~14 years of daily-trader activity and decades of buy-and-hold.
MAX_CSV_ROWS = 5000


_ERR_EUR_AMOUNT_SIGN_MISMATCH = "eur_amount sign must match total_amount sign"

# Update fields requiring float→Decimal coercion before assignment to a
# table=True model. SQLModel doesn't run Pydantic validation on assignment,
# so a raw float would stay a float and mix with DB-loaded Decimals on
# subsequent arithmetic.
_NUMERIC_UPDATE_FIELDS = frozenset(
    {
        "quantity",
        "price_per_share",
        "fee",
        "total_amount",
        "eur_amount",
        "split_ratio",
        "fx_rate",
    }
)

_NEGATIVE_TX_TYPES = frozenset(
    {TransactionType.BUY, TransactionType.WITHDRAW, TransactionType.FEE}
)
_POSITIVE_TX_TYPES = frozenset(
    {TransactionType.DEPOSIT, TransactionType.SELL, TransactionType.DIVIDEND}
)


def _csv_field(value):
    """Convert None to empty string for CSV export."""
    return value if value is not None else ""


class _UnsetType:
    """Singleton sentinel type for ``update_transaction`` kwargs.

    Distinguishes "field omitted by the client" (``_UNSET``) from "client
    explicitly sent null to clear the field" (``None``). Without this,
    ``None`` collapses both meanings and clients can never clear nullable
    columns via PUT.
    """


_UNSET = _UnsetType()


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
        ticker: str | None = None,
        quantity: float | None = None,
        price_per_share: float | None = None,
        fee: float | None = None,
        eur_amount: float | None = None,
        split_ratio: float | None = None,
        currency: str | None = None,
        fx_rate: float | None = None,
    ) -> Transaction:
        """Create a new transaction with validation"""
        if not self.portfolio_repo.exists_for_user(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)

        self._validate_numeric_constraints(
            transaction_type, total_amount, fx_rate, split_ratio, eur_amount
        )
        self._validate_transaction_data(
            transaction_type, ticker, quantity, price_per_share, total_amount, fee
        )

        # model_validate runs Pydantic coercion (unlike the __init__ path for
        # table=True models), so float inputs become Decimals via str-roundtrip.
        # This keeps attribute types consistent with DB-loaded rows.
        transaction = Transaction.model_validate(
            {
                "portfolio_id": portfolio_id,
                "date": date,
                "type": transaction_type,
                "ticker": ticker,
                "quantity": quantity,
                "price_per_share": price_per_share,
                "fee": fee,
                "total_amount": total_amount,
                "eur_amount": eur_amount,
                "split_ratio": split_ratio,
                "currency": currency,
                "fx_rate": fx_rate,
            }
        )

        return self.transaction_repo.create(transaction)

    def get_transaction(self, transaction_id: int) -> Transaction:
        """Get a transaction by ID"""
        transaction = self.transaction_repo.get_by_id(transaction_id)
        if not transaction:
            raise TransactionNotFoundException(transaction_id)
        return transaction

    def get_transactions_by_portfolio(
        self, portfolio_id: int, user_id: uuid.UUID
    ) -> list[Transaction]:
        """Get all transactions for a portfolio (user-scoped)"""
        if not self.portfolio_repo.exists_for_user(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)
        return self.transaction_repo.get_by_portfolio_id(portfolio_id)

    def get_transactions_by_portfolio_paginated(
        self,
        portfolio_id: int,
        user_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
        ticker: str | None = None,
        transaction_types: list[str] | None = None,
        sort_order: str = "desc",
    ) -> tuple[list[Transaction], int]:
        """Get paginated transactions for a portfolio (user-scoped)"""
        if not self.portfolio_repo.exists_for_user(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)
        return self.transaction_repo.get_by_portfolio_id_paginated(
            portfolio_id,
            page,
            page_size,
            ticker=ticker,
            transaction_types=transaction_types,
            sort_order=sort_order,
        )

    def export_transactions_to_csv(self, portfolio_id: int, user_id: uuid.UUID) -> str:
        """Export all transactions for a portfolio to CSV format (user-scoped)"""
        if not self.portfolio_repo.exists_for_user(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)

        transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)

        output = StringIO()
        writer = csv.writer(output)

        writer.writerow(
            [
                "date",
                "type",
                "ticker",
                "quantity",
                "price_per_share",
                "fee",
                "total_amount",
                "eur",
                "split_ratio",
                "currency",
                "fx_rate",
            ]
        )

        for transaction in transactions:
            writer.writerow(
                [
                    transaction.date.strftime("%m/%d/%Y %H:%M:%S"),
                    transaction.type.value,
                    transaction.ticker or "",
                    _csv_field(transaction.quantity),
                    _csv_field(transaction.price_per_share),
                    _csv_field(transaction.fee),
                    transaction.total_amount,
                    _csv_field(transaction.eur_amount),
                    _csv_field(transaction.split_ratio),
                    _csv_field(transaction.currency),
                    _csv_field(transaction.fx_rate),
                ]
            )

        return output.getvalue()

    def update_transaction(
        self,
        transaction_id: int,
        user_id: uuid.UUID,
        date: datetime | None | _UnsetType = _UNSET,
        transaction_type: TransactionType | None | _UnsetType = _UNSET,
        ticker: str | None | _UnsetType = _UNSET,
        quantity: float | None | _UnsetType = _UNSET,
        price_per_share: float | None | _UnsetType = _UNSET,
        fee: float | None | _UnsetType = _UNSET,
        total_amount: float | None | _UnsetType = _UNSET,
        eur_amount: float | None | _UnsetType = _UNSET,
        split_ratio: float | None | _UnsetType = _UNSET,
        currency: str | None | _UnsetType = _UNSET,
        fx_rate: float | None | _UnsetType = _UNSET,
    ) -> Transaction:
        """Update a transaction (user-scoped via portfolio ownership).

        Each field has three states:
          * ``_UNSET`` — caller did not pass the field; preserve current value.
          * ``None`` — caller explicitly sent ``null`` to clear the column.
          * any other value — overwrite with that value.
        """
        transaction = self.transaction_repo.get_by_id_and_user(transaction_id, user_id)
        if not transaction:
            raise TransactionNotFoundException(transaction_id)

        updates = {
            "date": date,
            "type": transaction_type,
            "ticker": ticker,
            "currency": currency,
            "quantity": quantity,
            "price_per_share": price_per_share,
            "fee": fee,
            "total_amount": total_amount,
            "eur_amount": eur_amount,
            "split_ratio": split_ratio,
            "fx_rate": fx_rate,
        }

        def _effective(field: str, new):
            """Existing value when *new* is _UNSET (omitted); otherwise *new*
            (which may be ``None`` to clear the column)."""
            return getattr(transaction, field) if isinstance(new, _UnsetType) else new

        self._validate_numeric_constraints(
            _effective("type", transaction_type),
            _effective("total_amount", total_amount),
            _effective("fx_rate", fx_rate),
            _effective("split_ratio", split_ratio),
            _effective("eur_amount", eur_amount),
        )
        self._validate_transaction_data(
            _effective("type", transaction_type),
            _effective("ticker", ticker),
            _effective("quantity", quantity),
            _effective("price_per_share", price_per_share),
            _effective("total_amount", total_amount),
            _effective("fee", fee),
        )

        for field, value in updates.items():
            if isinstance(value, _UnsetType):
                continue
            if value is None or field not in _NUMERIC_UPDATE_FIELDS:
                setattr(transaction, field, value)
            else:
                setattr(transaction, field, _to_decimal(value))

        return self.transaction_repo.update(transaction)

    def delete_transaction(self, transaction_id: int, user_id: uuid.UUID) -> None:
        """Delete a transaction (user-scoped via portfolio ownership)"""
        transaction = self.transaction_repo.get_by_id_and_user(transaction_id, user_id)
        if not transaction:
            raise TransactionNotFoundException(transaction_id)
        self.transaction_repo.delete(transaction_id)

    def import_from_csv(
        self,
        csv_content: str,
        portfolio_id: int,
        user_id: uuid.UUID,
        *,
        dry_run: bool = False,
    ) -> tuple[list[Transaction], int]:
        """Import transactions from CSV with deduplication (user-scoped).

        Parses + dedups against existing transactions in the date range
        covered by the CSV. When ``dry_run=True``, returns the would-be
        new-transactions list without persisting; the returned objects are
        un-persisted ``Transaction`` instances with ``id=None``.

        The dedup query is scoped to the CSV's [min_date, max_date] window
        rather than loading the full portfolio history — a 50k-row history
        no longer needs to enter memory to dedup a 100-row import.

        Returns ``(transactions, skipped_count)``.
        """
        if not self.portfolio_repo.exists_for_user(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)

        parsed = self._parse_csv(csv_content, portfolio_id)

        # Dedup scope: only existing rows whose date falls in the parsed
        # CSV's range. ``parsed`` is non-empty by ``_parse_csv`` invariant.
        min_date = min(t.date for t in parsed)
        max_date = max(t.date for t in parsed)
        existing = self.transaction_repo.get_by_portfolio_id_in_date_range(
            portfolio_id, min_date, max_date
        )
        remaining = Counter(_dedup_key(t) for t in existing)

        new_transactions: list[Transaction] = []
        for t in parsed:
            key = _dedup_key(t)
            if remaining[key] > 0:
                remaining[key] -= 1
            else:
                new_transactions.append(t)
        skipped_count = len(parsed) - len(new_transactions)

        if dry_run or not new_transactions:
            return new_transactions, skipped_count

        created = self.transaction_repo.bulk_create(new_transactions)
        return created, skipped_count

    @staticmethod
    def _validate_numeric_constraints(
        transaction_type: TransactionType,
        total_amount: float,
        fx_rate: float | None,
        split_ratio: float | None,
        eur_amount: float | None,
    ) -> None:
        """Validate fx_rate / split_ratio positivity and the eur_amount-vs-total_amount sign agreement."""
        if fx_rate is not None and fx_rate <= 0:
            raise InvalidTransactionDataException("fx_rate must be positive")
        if split_ratio is not None and split_ratio <= 0:
            raise InvalidTransactionDataException("split_ratio must be positive")
        if (
            eur_amount is not None
            and transaction_type != TransactionType.SPLIT
            and (
                (total_amount > 0 and eur_amount < 0)
                or (total_amount < 0 and eur_amount > 0)
            )
        ):
            raise InvalidTransactionDataException(_ERR_EUR_AMOUNT_SIGN_MISMATCH)

    def _validate_transaction_data(
        self,
        transaction_type: TransactionType,
        ticker: str | None,
        quantity: float | None,
        price_per_share: float | None,
        total_amount: float,
        fee: float | None,
    ) -> None:
        """Validate transaction data based on business rules"""
        if quantity is not None and quantity <= 0:
            raise InvalidTransactionDataException("Quantity must be greater than 0")

        if price_per_share is not None and price_per_share <= 0:
            raise InvalidTransactionDataException("Price must be greater than 0")

        if fee is not None and fee < 0:
            raise InvalidTransactionDataException("Fee must be positive")

        if transaction_type in (TransactionType.BUY, TransactionType.SELL):
            self._validate_buy_sell(
                transaction_type, ticker, quantity, price_per_share, total_amount, fee
            )

        elif transaction_type in (TransactionType.DEPOSIT, TransactionType.WITHDRAW):
            if ticker or quantity is not None or price_per_share is not None:
                raise InvalidTransactionDataException(
                    f"{transaction_type.value} transactions should not have ticker, quantity, or price"
                )

        elif (
            transaction_type in (TransactionType.SPLIT, TransactionType.DIVIDEND)
            and not ticker
        ):
            raise InvalidTransactionDataException(
                f"{transaction_type.value} transactions require a ticker symbol"
            )

    @staticmethod
    def _validate_buy_sell(
        transaction_type: TransactionType,
        ticker: str | None,
        quantity: float | Decimal | None,
        price_per_share: float | Decimal | None,
        total_amount: float | Decimal,
        fee: float | Decimal | None,
    ) -> None:
        """Validate fields specific to BUY/SELL transactions.

        Inputs may arrive as ``float`` (newly-submitted update args) or
        ``Decimal`` (DB-loaded values). Coerce through ``Decimal(str(...))``
        before arithmetic so we never mix the two (Python raises ``TypeError``
        on ``Decimal + float``).
        """
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

        q = _to_decimal(quantity)
        p = _to_decimal(price_per_share)
        f = _to_decimal(fee) if fee is not None else Decimal("0")
        t = _to_decimal(total_amount)

        expected_value = (
            -(q * p + f) if transaction_type == TransactionType.BUY else q * p - f
        )

        if abs(t - expected_value) > abs(expected_value) * Decimal("0.01"):
            raise InvalidTransactionDataException(
                f"Value inconsistency: expected ~{float(expected_value):.2f} based on quantity * price_per_share "
                f"{'+ fee' if transaction_type == TransactionType.BUY else '- fee'}, got {float(t)}"
            )

    def _parse_csv(self, csv_content: str, portfolio_id: int) -> list[Transaction]:
        """Parse CSV content and create Transaction objects.

        Rejects imports exceeding ``MAX_CSV_ROWS`` early so a malicious or
        accidental upload can't load 100k rows into memory or burn the DB
        connection on a single user's request.
        """
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
                if len(transactions) >= MAX_CSV_ROWS:
                    raise InvalidCSVFormatException(
                        f"CSV exceeds the {MAX_CSV_ROWS}-row import limit. "
                        "Split the file into smaller imports."
                    )
                try:
                    transaction = self._parse_csv_row(row, portfolio_id)
                    transactions.append(transaction)
                except (
                    ValueError,
                    InvalidTransactionDataException,
                    KeyError,
                    InvalidCSVFormatException,
                ) as e:
                    raise InvalidCSVFormatException(str(e), line_num) from e

        except InvalidCSVFormatException:
            raise
        except csv.Error as e:
            raise InvalidCSVFormatException(f"Invalid CSV format: {e!s}") from e

        if not transactions:
            raise InvalidCSVFormatException(
                "CSV file is empty or contains no valid transactions"
            )

        return transactions

    def _parse_csv_row(self, row: dict, portfolio_id: int) -> Transaction:
        """Parse a single CSV row into a Transaction object"""
        try:
            date = datetime.strptime(row["date"].strip(), "%m/%d/%Y %H:%M:%S")
        except ValueError as exc:
            raise ValueError(
                f"Invalid date format: {row['date']}. Expected MM/DD/YYYY HH:MM:SS"
            ) from exc

        try:
            transaction_type = TransactionType(row["type"].strip())
        except ValueError as exc:
            raise ValueError(
                f"Invalid transaction type: {row['type']}. Must be one of: {', '.join([t.value for t in TransactionType])}"
            ) from exc

        ticker = row.get("ticker", "").strip().upper() or None
        quantity = self._clean_csv_number(row.get("quantity", ""), "quantity")
        price_per_share = self._clean_csv_number(
            row.get("price_per_share", ""), "price_per_share"
        )
        fee = self._clean_csv_number(row.get("fee", ""), "fee")

        total_amount_str = row.get("total_amount", "").strip()
        if not total_amount_str:
            raise ValueError("total_amount field is required")
        total_amount = self._clean_csv_number(total_amount_str, "total_amount")
        if total_amount is None:
            raise ValueError(f"Invalid total_amount: {total_amount_str}")

        total_amount = self._apply_csv_total_amount_sign(transaction_type, total_amount)

        eur_amount = self._clean_csv_number(row.get("eur", ""), "eur")
        eur_amount = self._apply_csv_eur_sign(
            transaction_type, total_amount, eur_amount
        )

        split_ratio = self._clean_csv_number(row.get("split_ratio", ""), "split_ratio")
        if split_ratio is not None and split_ratio <= 0:
            raise ValueError(f"split_ratio must be positive, got: {split_ratio}")

        currency_raw = row.get("currency", "").strip().upper()
        currency = currency_raw or None
        if currency and len(currency) != 3:
            raise ValueError(f"Currency must be a 3-letter code, got: {currency}")

        fx_rate = self._clean_csv_number(row.get("fx_rate", ""), "fx_rate")
        if fx_rate is not None and fx_rate <= 0:
            raise ValueError(f"fx_rate must be positive, got: {fx_rate}")

        # See create_transaction: model_validate coerces float → Decimal.
        return Transaction.model_validate(
            {
                "portfolio_id": portfolio_id,
                "date": date,
                "type": transaction_type,
                "ticker": ticker,
                "quantity": quantity,
                "price_per_share": price_per_share,
                "fee": fee,
                "total_amount": total_amount,
                "eur_amount": eur_amount,
                "split_ratio": split_ratio,
                "currency": currency,
                "fx_rate": fx_rate,
            }
        )

    @staticmethod
    def _apply_csv_total_amount_sign(
        transaction_type: TransactionType, total_amount: float
    ) -> float:
        """Return total_amount with the correct sign for the transaction type."""
        if transaction_type in _NEGATIVE_TX_TYPES:
            return -abs(total_amount)
        if transaction_type in _POSITIVE_TX_TYPES:
            return abs(total_amount)
        if transaction_type == TransactionType.SPLIT and total_amount != 0:
            raise ValueError("SPLIT transactions must have total_amount of 0")
        return total_amount

    @staticmethod
    def _apply_csv_eur_sign(
        transaction_type: TransactionType,
        total_amount: float,
        eur_amount: float | None,
    ) -> float | None:
        """Return eur_amount with the same sign as the corrected total_amount."""
        if eur_amount is None:
            return None
        if transaction_type == TransactionType.SPLIT:
            return 0.0
        return math.copysign(abs(eur_amount), total_amount)

    @staticmethod
    def _clean_csv_number(value: str, field_name: str = "field") -> float | None:
        """Clean CSV number by removing thousand separators and converting to float"""
        if not value or value.strip() == "":
            return None
        cleaned = value.replace(",", "")
        try:
            return float(cleaned)
        except ValueError as exc:
            raise ValueError(
                f"Invalid number format for {field_name}: {value}"
            ) from exc
