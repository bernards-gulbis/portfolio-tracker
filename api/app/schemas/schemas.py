from pydantic import BaseModel, ConfigDict, Field, field_validator
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


class PortfolioCopy(BaseModel):
    """Schema for copying a portfolio"""
    new_name: str


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
    ticker: Optional[str] = Field(None, max_length=20)
    units: Optional[float] = None
    price: Optional[float] = None
    fee: float = 0.0
    value: float
    value_eur: Optional[float] = None
    split_ratio: Optional[float] = None
    
    @field_validator('ticker')
    @classmethod
    def validate_ticker(cls, v: Optional[str]) -> Optional[str]:
        """Validate and normalize ticker symbol"""
        if v is not None:
            v = v.strip().upper()
            if not v:
                return None
            # Basic ticker validation: alphanumeric and common symbols
            if not all(c.isalnum() or c in '.-' for c in v):
                raise ValueError('Ticker must contain only alphanumeric characters, dots, or hyphens')
        return v
    
    @field_validator('split_ratio')
    @classmethod
    def validate_split_ratio(cls, v: Optional[float]) -> Optional[float]:
        """Validate split ratio is positive"""
        if v is not None and v <= 0:
            raise ValueError('Split ratio must be greater than 0')
        return v
    
    @field_validator('value')
    @classmethod
    def validate_value(cls, v: float) -> float:
        """Validate value is positive (stored as positive, signed on display)"""
        if v < 0:
            raise ValueError('Value must be stored as positive (sign applied on display)')
        return v
    
    @field_validator('fee')
    @classmethod
    def validate_fee(cls, v: float) -> float:
        """Validate fee is positive"""
        if v < 0:
            raise ValueError('Fee must be positive')
        return v


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


class PaginatedTransactionResponse(BaseModel):
    """Schema for paginated transaction response"""
    transactions: List[TransactionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ================== Portfolio Status Schemas ==================

class HoldingResponse(BaseModel):
    """Schema for a single holding"""
    ticker: str
    units: float
    average_cost: float
    total_cost: float
    current_price: Optional[float] = None
    current_value: Optional[float] = None
    unrealized_gain_loss: Optional[float] = None
    unrealized_gain_loss_percent: Optional[float] = None
    
    model_config = ConfigDict(from_attributes=True)


class PortfolioStatusResponse(BaseModel):
    """Schema for portfolio status with calculated metrics"""
    portfolio_id: int
    portfolio_name: str
    cash_balance: float
    total_invested: float  # Deposits - Withdrawals
    dividends_received: float
    realized_gains: float  # Gains/losses from sells
    total_value_eur: float  # Sum of all value_eur fields
    holdings: List[HoldingResponse]
    total_holdings_cost: float  # Sum of all holdings cost basis
    total_current_value: float  # Sum of current market value of all holdings
    unrealized_gains: float  # Total unrealized gains/losses
    total_portfolio_value: float  # Cash + Holdings current value
    
    model_config = ConfigDict(from_attributes=True)
