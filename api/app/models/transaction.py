"""Transaction database model"""
from sqlalchemy import Index
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from .transaction_type import TransactionType

if TYPE_CHECKING:
    from .portfolio import Portfolio


class Transaction(SQLModel, table=True):
    """Transaction model"""
    __table_args__ = (
        Index('ix_transaction_portfolio_date', 'portfolio_id', 'date'),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    portfolio_id: int = Field(foreign_key="portfolio.id", index=True, ondelete="CASCADE")
    date: datetime
    type: TransactionType
    ticker: Optional[str] = Field(default=None)
    quantity: Optional[float] = Field(default=None, decimal_places=8)
    price_per_share: Optional[float] = Field(default=None, decimal_places=2)
    fee: Optional[float] = Field(default=None, decimal_places=2)
    total_amount: float = Field(default=0.0, decimal_places=2)
    eur_amount: Optional[float] = Field(default=None, decimal_places=2)
    split_ratio: Optional[float] = Field(default=None)
    currency: Optional[str] = Field(default=None, max_length=3)
    fx_rate: Optional[float] = Field(default=None, decimal_places=4)
    
    # Relationship
    portfolio: "Portfolio" = Relationship(back_populates="transactions")
