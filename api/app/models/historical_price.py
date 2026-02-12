"""
Models for historical price caching
"""
from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional


class HistoricalPrice(SQLModel, table=True):
    """Historical stock prices cache"""
    __tablename__ = "historical_prices"
    
    ticker: str = Field(primary_key=True, index=True)
    date: str = Field(primary_key=True, index=True)  # YYYY-MM-DD format
    price: float
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())


class FxRate(SQLModel, table=True):
    """Historical FX rates cache"""
    __tablename__ = "fx_rates"
    
    date: str = Field(primary_key=True, index=True)  # YYYY-MM-DD format
    usd_to_eur_rate: float
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
