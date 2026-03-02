"""Portfolio database model"""
import uuid
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey
import sqlalchemy as sa
from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING

if TYPE_CHECKING:
    from .transaction import Transaction


class Portfolio(SQLModel, table=True):
    """Portfolio model"""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, max_length=255)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: uuid.UUID = Field(
        sa_column=Column(sa.Uuid, ForeignKey("user.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    )
    include_in_aggregation: bool = Field(default=True)

    # Relationship
    transactions: List["Transaction"] = Relationship(back_populates="portfolio", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
