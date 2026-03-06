"""Portfolio database model"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import Column, ForeignKey
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .transaction import Transaction


class Portfolio(SQLModel, table=True):
    """Portfolio model"""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, max_length=255)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    user_id: uuid.UUID = Field(
        sa_column=Column(
            sa.Uuid,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )

    # Relationship
    transactions: list["Transaction"] = Relationship(
        back_populates="portfolio",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
