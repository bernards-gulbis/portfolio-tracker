from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum


class TransactionType(str, Enum):
    """Transaction type enumeration"""
    DEPOSIT = "Deposit"
    BUY = "Buy"
    FEE = "Fee"
    SELL = "Sell"
    WITHDRAW = "Withdraw"
    SPLIT = "Split"
    DIVIDEND = "Dividend"


class Portfolio(SQLModel, table=True):
    """Portfolio model"""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Relationship
    transactions: List["Transaction"] = Relationship(back_populates="portfolio", sa_relationship_kwargs={"cascade": "all, delete-orphan"})


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
    portfolio: Portfolio = Relationship(back_populates="transactions")
