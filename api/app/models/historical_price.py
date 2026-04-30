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

    # Primary key columns already get an index from the PK constraint; adding
    # index=True here would emit a duplicate ix_* index.
    ticker: str = Field(primary_key=True)
    date: str = Field(primary_key=True)  # YYYY-MM-DD format
    price: Decimal = Field(max_digits=20, decimal_places=6)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class FxRate(SQLModel, table=True):
    """Historical FX rates cache"""

    __tablename__ = "fx_rates"

    date: str = Field(primary_key=True)  # YYYY-MM-DD format
    usd_to_eur_rate: Decimal = Field(max_digits=12, decimal_places=6)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class HistoricalPriceCoverage(SQLModel, table=True):
    """Tracks date ranges that were successfully fetched from upstream.

    The ``historical_prices`` table only stores point rows for trading days, so
    min/max of cached dates cannot prove that the inner range is contiguous —
    two earlier disjoint fetches would falsely look like full coverage. This
    table records each successful fetch interval so coverage can be computed
    as the union of recorded intervals.
    """

    __tablename__ = "historical_price_coverage"

    ticker: str = Field(primary_key=True)
    period_start: str = Field(primary_key=True)  # YYYY-MM-DD inclusive
    period_end: str = Field(primary_key=True)  # YYYY-MM-DD inclusive
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
