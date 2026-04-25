"""Transaction database model"""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Index
from sqlmodel import Field, Relationship, SQLModel

from .transaction_type import TransactionType

if TYPE_CHECKING:
    from .portfolio import Portfolio


# Enforces the ledger's sign semantics on total_amount: DEPOSIT/SELL/DIVIDEND
# are money IN (> 0); WITHDRAW/BUY/FEE are money OUT (< 0); SPLIT is a
# share-count-only event with no cash flow. Any new transaction type added
# must extend this expression. Mirrored by Alembic migration
# ``a7b9c2e1f8d4_transaction_sign_checks`` for databases that predate the
# current model.
#
# The ``type`` column stores enum NAMES (uppercase), not values — SQLAlchemy's
# default ``Enum`` binding uses the member name. See baseline migration
# ``6559d87f9f56`` which declares ``sa.Enum("DEPOSIT", "BUY", ...)``.
_TRANSACTION_SIGN_CHECK = (
    "(type = 'DEPOSIT' AND total_amount > 0) OR "
    "(type = 'WITHDRAW' AND total_amount < 0) OR "
    "(type = 'BUY' AND total_amount < 0) OR "
    "(type = 'SELL' AND total_amount > 0) OR "
    "(type = 'DIVIDEND' AND total_amount > 0) OR "
    "(type = 'FEE' AND total_amount < 0) OR "
    "(type = 'SPLIT' AND total_amount = 0)"
)


class Transaction(SQLModel, table=True):
    """Transaction model.

    Monetary fields use Decimal with SQLModel max_digits/decimal_places so that
    SQLAlchemy emits NUMERIC columns and returns Decimal to Python. Float
    binary-precision drift is not acceptable in a ledger.
    """

    __table_args__ = (
        Index("ix_transaction_portfolio_date", "portfolio_id", "date"),
        CheckConstraint(_TRANSACTION_SIGN_CHECK, name="ck_transaction_sign"),
    )

    id: int | None = Field(default=None, primary_key=True)
    portfolio_id: int = Field(
        foreign_key="portfolio.id", index=True, ondelete="CASCADE"
    )
    date: datetime
    type: TransactionType
    ticker: str | None = Field(default=None)
    quantity: Decimal | None = Field(default=None, max_digits=28, decimal_places=8)
    price_per_share: Decimal | None = Field(
        default=None, max_digits=20, decimal_places=4
    )
    fee: Decimal | None = Field(default=None, max_digits=20, decimal_places=4)
    total_amount: Decimal = Field(default=Decimal("0"), max_digits=20, decimal_places=4)
    eur_amount: Decimal | None = Field(default=None, max_digits=20, decimal_places=4)
    split_ratio: Decimal | None = Field(default=None, max_digits=20, decimal_places=8)
    currency: str | None = Field(default=None, max_length=3)
    fx_rate: Decimal | None = Field(default=None, max_digits=12, decimal_places=6)

    # Relationship
    portfolio: "Portfolio" = Relationship(back_populates="transactions")
