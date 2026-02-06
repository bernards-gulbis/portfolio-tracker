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
    date: datetime
    type: TransactionType
    ticker: Optional[str] = Field(default=None)
    quantity: Optional[float] = Field(default=None, decimal_places=8)
    price_per_share: Optional[float] = Field(default=None)
    fee: Optional[float] = Field(default=None)
    total_amount: float = Field(default=0.0)
    eur_amount: Optional[float] = Field(default=None)
    split_ratio: Optional[float] = Field(default=None)
    
    # Relationship
    portfolio: "Portfolio" = Relationship(back_populates="transactions")
