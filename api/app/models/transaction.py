"""Transaction database model"""
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from .transaction_type import TransactionType

if TYPE_CHECKING:
    from .portfolio import Portfolio


class Transaction(SQLModel, table=True):
    """Transaction model"""
    id: Optional[int] = Field(default=None, primary_key=True)
    portfolio_id: int = Field(foreign_key="portfolio.id", index=True, ondelete="CASCADE")
    date_time: datetime
    type: TransactionType
    ticker: Optional[str] = Field(default=None)
    units: Optional[float] = Field(default=None, decimal_places=8)
    price: Optional[float] = Field(default=None)
    fee: float = Field(default=0.0)
    value: float
    value_eur: Optional[float] = Field(default=None)
    split_ratio: Optional[float] = Field(default=None)
    
    # Relationship
    portfolio: "Portfolio" = Relationship(back_populates="transactions")
