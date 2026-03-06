"""Transaction database model"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Index
from sqlmodel import Field, Relationship, SQLModel

from .transaction_type import TransactionType

if TYPE_CHECKING:
    from .portfolio import Portfolio


class Transaction(SQLModel, table=True):
    """Transaction model"""

    __table_args__ = (Index("ix_transaction_portfolio_date", "portfolio_id", "date"),)

    id: int | None = Field(default=None, primary_key=True)
    portfolio_id: int = Field(
        foreign_key="portfolio.id", index=True, ondelete="CASCADE"
    )
    date: datetime
    type: TransactionType
    ticker: str | None = Field(default=None)
    quantity: float | None = Field(default=None, decimal_places=8)
    price_per_share: float | None = Field(default=None, decimal_places=2)
    fee: float | None = Field(default=None, decimal_places=2)
    total_amount: float = Field(default=0.0, decimal_places=2)
    eur_amount: float | None = Field(default=None, decimal_places=2)
    split_ratio: float | None = Field(default=None)
    currency: str | None = Field(default=None, max_length=3)
    fx_rate: float | None = Field(default=None, decimal_places=4)

    # Relationship
    portfolio: "Portfolio" = Relationship(back_populates="transactions")
