"""
Models for historical price caching.

Monetary and rate fields use Decimal/NUMERIC for ledger-grade precision —
float binary drift is not acceptable for values fed into P&L calculations.
"""

from datetime import UTC, datetime
from decimal import Decimal

from sqlmodel import Field, SQLModel


class HistoricalPrice(SQLModel, table=True):
    """Historical stock prices cache"""

    __tablename__ = "historical_prices"

    ticker: str = Field(primary_key=True, index=True)
    date: str = Field(primary_key=True, index=True)  # YYYY-MM-DD format
    price: Decimal = Field(max_digits=20, decimal_places=6)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class FxRate(SQLModel, table=True):
    """Historical FX rates cache"""

    __tablename__ = "fx_rates"

    date: str = Field(primary_key=True, index=True)  # YYYY-MM-DD format
    usd_to_eur_rate: Decimal = Field(max_digits=12, decimal_places=6)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
