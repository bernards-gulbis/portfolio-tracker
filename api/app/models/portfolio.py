"""Portfolio database model"""
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING

if TYPE_CHECKING:
    from .transaction import Transaction


class Portfolio(SQLModel, table=True):
    """Portfolio model"""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Relationship
    transactions: List["Transaction"] = Relationship(back_populates="portfolio", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
