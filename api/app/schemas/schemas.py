import uuid
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from datetime import datetime
from typing import Optional, List
from app.models import TransactionType
from fastapi_users import schemas as fu_schemas


# ================== User Schemas ==================

class UserRead(fu_schemas.BaseUser[uuid.UUID]):
    name: Optional[str] = None
    picture: Optional[str] = None
    oauth_providers: list[str] = Field(default_factory=list)
    tax_rate: float = 0.255


class UserCreate(fu_schemas.BaseUserCreate):
    name: Optional[str] = None


class UserUpdate(fu_schemas.BaseUserUpdate):
    name: Optional[str] = None
    picture: Optional[str] = None
    tax_rate: Optional[float] = Field(None, ge=0, le=1)


class CloseAccountRequest(BaseModel):
    password: Optional[str] = None
    confirmation: Optional[str] = None


# ================== Portfolio Schemas ==================

class PortfolioBase(BaseModel):
    """Base portfolio schema"""
    name: str = Field(min_length=1, max_length=255)
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate portfolio name is not empty or whitespace"""
        if not v or not v.strip():
            raise ValueError('Portfolio name cannot be empty or whitespace')
        return v.strip()


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
    date: datetime
    type: TransactionType
    ticker: Optional[str] = Field(None, max_length=20)
    quantity: Optional[float] = None
    price_per_share: Optional[float] = None
    fee: Optional[float] = None
    total_amount: float
    eur_amount: Optional[float] = None
    split_ratio: Optional[float] = None
    currency: Optional[str] = Field(None, max_length=3)
    fx_rate: Optional[float] = None
    
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
    
    @field_validator('fee')
    @classmethod
    def validate_fee(cls, v: Optional[float]) -> Optional[float]:
        """Validate fee is positive"""
        if v is not None and v < 0:
            raise ValueError('Fee must be positive')
        return v


class TransactionCreate(TransactionBase):
    """Schema for creating a transaction"""
    
    @model_validator(mode='after')
    def validate_total_amount_sign(self):
        """Validate total_amount has correct sign based on transaction type"""
        tx_type = self.type
        amount = self.total_amount
        
        # Split must have exactly 0 amount
        if tx_type == TransactionType.SPLIT:
            if amount != 0:
                raise ValueError('Split transactions must have total_amount of 0')
        
        # Buy, Withdraw, Fee must be negative (money leaving account)
        elif tx_type in [TransactionType.BUY, TransactionType.WITHDRAW, TransactionType.FEE]:
            if amount >= 0:
                raise ValueError(f'{tx_type.value} transactions must have negative total_amount (money leaving account)')
        
        # Deposit, Sell, Dividend must be positive (money entering account)
        elif tx_type in [TransactionType.DEPOSIT, TransactionType.SELL, TransactionType.DIVIDEND]:
            if amount <= 0:
                raise ValueError(f'{tx_type.value} transactions must have positive total_amount (money entering account)')
        
        return self


class TransactionUpdate(BaseModel):
    """Schema for updating a transaction (all fields optional)"""
    date: Optional[datetime] = None
    type: Optional[TransactionType] = None
    ticker: Optional[str] = None
    quantity: Optional[float] = None
    price_per_share: Optional[float] = None
    fee: Optional[float] = None
    total_amount: Optional[float] = None
    eur_amount: Optional[float] = None
    split_ratio: Optional[float] = None
    currency: Optional[str] = None
    fx_rate: Optional[float] = None

    @field_validator('ticker')
    @classmethod
    def validate_ticker(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip().upper()
            if not v:
                return None
            if not all(c.isalnum() or c in '.-' for c in v):
                raise ValueError('Ticker must contain only alphanumeric characters, dots, or hyphens')
        return v

    @field_validator('split_ratio')
    @classmethod
    def validate_split_ratio(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError('Split ratio must be greater than 0')
        return v

    @field_validator('fee')
    @classmethod
    def validate_fee(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError('Fee must be positive')
        return v


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
    quantity: float
    average_cost: float
    total_cost: float
    current_price: Optional[float] = None
    current_value: Optional[float] = None
    unrealized_gain_loss: Optional[float] = None
    unrealized_gain_loss_pct: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class TransactionWarning(BaseModel):
    """Structured warning from transaction processing, for frontend i18n."""
    code: str                                    # i18n key suffix, e.g. "sellNotInHoldings"
    date: str                                    # ISO datetime YYYY-MM-DDTHH:MM:SS of the transaction
    params: dict[str, str] = Field(default_factory=dict)  # interpolation values


class PortfolioStatusResponse(BaseModel):
    """Schema for portfolio status with calculated metrics"""
    portfolio_id: int
    portfolio_name: str
    current_value: float  # Cash + Holdings current value
    principal: float  # Deposits - Withdrawals
    principal_eur: float  # Sum of all eur_amount fields (historical rates)
    dividends: float
    dividends_eur: Optional[float] = None  # Dividends in EUR (historical rates)
    cash: float
    holdings: List[HoldingResponse]
    holdings_cost: float  # Sum of all holdings cost basis
    holdings_value: float  # Sum of current market value of all holdings
    unrealized_gains: float  # Total unrealized gains/losses
    unrealized_gains_pct: Optional[float] = None  # Total unrealized gains/losses percentage
    realized_gains: float  # Gains/losses from sells
    capital_gains_tax_rate: float  # Tax rate applied to capital gains (e.g., 0.25 for 25%)
    missing_prices: List[str] = Field(default_factory=list)  # Tickers for which current price could not be fetched
    warnings: List[TransactionWarning] = Field(default_factory=list)  # Transaction processing warnings
    usd_to_eur_rate: Optional[float] = None  # Live USD→EUR rate; None when unavailable

    model_config = ConfigDict(from_attributes=True)


class PerformanceDataPoint(BaseModel):
    """Schema for a single performance data point"""
    date: str  # YYYY-MM-DD format
    principal: float = 0.0
    principal_eur: Optional[float] = None   # Cumulative net deposits in EUR at historical rates
    current_value: Optional[float] = None
    fx_rate: Optional[float] = None         # Historical USD→EUR rate at this date
    return_pct: Optional[float] = None      # ((current_value - principal) / principal) * 100
    sp500_return_pct: Optional[float] = None  # S&P 500 USD return % from first data point

    model_config = ConfigDict(from_attributes=True)


class PortfolioPerformanceResponse(BaseModel):
    """Schema for portfolio performance over time"""
    portfolio_id: int
    portfolio_name: str
    data_points: List[PerformanceDataPoint]

    model_config = ConfigDict(from_attributes=True)


# ================== Aggregated Portfolio Schemas ==================

class AggregatedStatusRequest(BaseModel):
    """Schema for requesting aggregated status across multiple portfolios"""
    portfolio_ids: List[int] = Field(min_length=1)


# ================== Realized Sales Schemas ==================

class AggregatedSaleResponse(BaseModel):
    """Schema for aggregated realized gain/loss per ticker"""
    ticker: str
    total_gain_loss: float
    win_rate: float  # percentage of sells that resulted in a profit (0-100)
    profit_factor: Optional[float] = None  # total_profit / abs(total_loss); None when no losing trades


class AggregatedSalesResponse(BaseModel):
    """Schema for aggregated realized sales grouped by ticker"""
    sales: List[AggregatedSaleResponse]
    total_realized_gain_loss: float
