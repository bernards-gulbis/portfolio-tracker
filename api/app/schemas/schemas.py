from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List
from app.models import TransactionType


# ================== Portfolio Schemas ==================

class PortfolioBase(BaseModel):
    """Base portfolio schema"""
    name: str


class PortfolioCreate(PortfolioBase):
    """Schema for creating a portfolio"""
    pass


class PortfolioUpdate(PortfolioBase):
    """Schema for updating a portfolio"""
    pass


class PortfolioResponse(PortfolioBase):
    """Schema for portfolio response"""
    id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class PortfolioWithTransactions(PortfolioResponse):
    """Schema for portfolio with transactions"""
    transactions: List["TransactionResponse"] = []
    
    model_config = ConfigDict(from_attributes=True)


# ================== Transaction Schemas ==================

class TransactionBase(BaseModel):
    """Base transaction schema"""
    date_time: datetime
    type: TransactionType
    ticker: Optional[str] = None
    units: Optional[float] = None
    price: Optional[float] = None
    fee: float = 0.0
    value: float
    value_eur: Optional[float] = None
    split_ratio: Optional[float] = None


class TransactionCreate(TransactionBase):
    """Schema for creating a transaction"""
    pass


class TransactionUpdate(BaseModel):
    """Schema for updating a transaction (all fields optional)"""
    date_time: Optional[datetime] = None
    type: Optional[TransactionType] = None
    ticker: Optional[str] = None
    units: Optional[float] = None
    price: Optional[float] = None
    fee: Optional[float] = None
    value: Optional[float] = None
    value_eur: Optional[float] = None
    split_ratio: Optional[float] = None


class TransactionResponse(TransactionBase):
    """Schema for transaction response"""
    id: int
    portfolio_id: int
    
    model_config = ConfigDict(from_attributes=True)


class BulkImportResponse(BaseModel):
    """Schema for CSV bulk import response"""
    imported_count: int
    transactions: List[TransactionResponse]
