import uuid
from datetime import date, datetime
from typing import Literal

from fastapi_users import schemas as fu_schemas
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import TransactionType

PriceSource = Literal["live", "last_known", "missing"]

# ================== User Schemas ==================


class UserRead(fu_schemas.BaseUser[uuid.UUID]):
    name: str | None = None
    picture: str | None = None
    oauth_providers: list[str] = Field(default_factory=list)
    tax_rate: float = 0.255


class UserCreate(fu_schemas.BaseUserCreate):
    name: str | None = None


class UserUpdate(fu_schemas.BaseUserUpdate):
    name: str | None = None
    picture: str | None = None
    tax_rate: float | None = Field(None, ge=0, le=1)


class CloseAccountRequest(BaseModel):
    password: str | None = None
    confirmation: str | None = None


# ================== Portfolio Schemas ==================


class PortfolioBase(BaseModel):
    """Base portfolio schema"""

    name: str = Field(min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate portfolio name is not empty or whitespace"""
        if not v or not v.strip():
            raise ValueError("Portfolio name cannot be empty or whitespace")
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

    transactions: list["TransactionResponse"] = []

    model_config = ConfigDict(from_attributes=True)


# ================== Transaction Schemas ==================


class TransactionBase(BaseModel):
    """Base transaction schema"""

    date: datetime
    type: TransactionType
    ticker: str | None = Field(None, max_length=20)
    quantity: float | None = None
    price_per_share: float | None = None
    fee: float | None = None
    total_amount: float
    eur_amount: float | None = None
    split_ratio: float | None = None
    currency: str | None = Field(None, max_length=3)
    fx_rate: float | None = None

    @field_validator("ticker")
    @classmethod
    def validate_ticker(cls, v: str | None) -> str | None:
        """Validate and normalize ticker symbol"""
        if v is not None:
            v = v.strip().upper()
            if not v:
                return None
            # Basic ticker validation: alphanumeric and common symbols
            if not all(c.isalnum() or c in ".-" for c in v):
                raise ValueError(
                    "Ticker must contain only alphanumeric characters, dots, or hyphens"
                )
        return v

    @field_validator("split_ratio")
    @classmethod
    def validate_split_ratio(cls, v: float | None) -> float | None:
        """Validate split ratio is positive"""
        if v is not None and v <= 0:
            raise ValueError("Split ratio must be greater than 0")
        return v

    @field_validator("fee")
    @classmethod
    def validate_fee(cls, v: float | None) -> float | None:
        """Validate fee is positive"""
        if v is not None and v < 0:
            raise ValueError("Fee must be positive")
        return v


class TransactionCreate(TransactionBase):
    """Schema for creating a transaction"""

    @model_validator(mode="after")
    def validate_total_amount_sign(self):
        """Validate total_amount has correct sign based on transaction type"""
        tx_type = self.type
        amount = self.total_amount

        # Split must have exactly 0 amount
        if tx_type == TransactionType.SPLIT:
            if amount != 0:
                raise ValueError("Split transactions must have total_amount of 0")

        # Buy, Withdraw, Fee must be negative (money leaving account)
        elif tx_type in [
            TransactionType.BUY,
            TransactionType.WITHDRAW,
            TransactionType.FEE,
        ]:
            if amount >= 0:
                raise ValueError(
                    f"{tx_type.value} transactions must have negative total_amount (money leaving account)"
                )

        # Deposit, Sell, Dividend must be positive (money entering account)
        elif (
            tx_type
            in [TransactionType.DEPOSIT, TransactionType.SELL, TransactionType.DIVIDEND]
            and amount <= 0
        ):
            raise ValueError(
                f"{tx_type.value} transactions must have positive total_amount (money entering account)"
            )

        return self


class TransactionUpdate(BaseModel):
    """Schema for updating a transaction (all fields optional)"""

    date: datetime | None = None
    type: TransactionType | None = None
    ticker: str | None = None
    quantity: float | None = None
    price_per_share: float | None = None
    fee: float | None = None
    total_amount: float | None = None
    eur_amount: float | None = None
    split_ratio: float | None = None
    currency: str | None = None
    fx_rate: float | None = None

    @field_validator("ticker")
    @classmethod
    def validate_ticker(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip().upper()
            if not v:
                return None
            if not all(c.isalnum() or c in ".-" for c in v):
                raise ValueError(
                    "Ticker must contain only alphanumeric characters, dots, or hyphens"
                )
        return v

    @field_validator("split_ratio")
    @classmethod
    def validate_split_ratio(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("Split ratio must be greater than 0")
        return v

    @field_validator("fee")
    @classmethod
    def validate_fee(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Fee must be positive")
        return v


class TransactionResponse(TransactionBase):
    """Schema for transaction response"""

    id: int
    portfolio_id: int

    model_config = ConfigDict(from_attributes=True)


class BulkImportResponse(BaseModel):
    """Schema for CSV bulk import response"""

    imported_count: int
    skipped_count: int
    transactions: list[TransactionResponse]


class PaginatedTransactionResponse(BaseModel):
    """Schema for paginated transaction response"""

    transactions: list[TransactionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ================== Portfolio Status Schemas ==================


class HoldingResponse(BaseModel):
    """Schema for a single holding (transaction-derived only)"""

    ticker: str
    quantity: float
    average_cost: float
    total_cost: float
    first_buy_date: date

    model_config = ConfigDict(from_attributes=True)


class TransactionWarning(BaseModel):
    """Structured warning from transaction processing, for frontend i18n."""

    code: str  # i18n key suffix, e.g. "sellNotInHoldings"
    date: str  # ISO datetime YYYY-MM-DDTHH:MM:SS of the transaction
    params: dict[str, str] = Field(default_factory=dict)  # interpolation values


class RealizedSaleResponse(BaseModel):
    """Schema for a single realized sale record."""

    ticker: str
    date: str
    quantity: float
    quantity_before: float
    proceeds: float
    cost_basis: float
    realized_gain: float
    first_buy_date: str


class DividendReceivedResponse(BaseModel):
    """Schema for a single dividend payment record."""

    ticker: str
    date: str
    amount: float
    amount_eur: float | None = None


class WithdrawalFxResponse(BaseModel):
    """Schema for a single withdrawal with realized FX gain/loss."""

    date: str
    amount: float  # USD withdrawal amount (positive)
    amount_eur_avg: float  # EUR cost basis at average rate
    amount_eur: float  # EUR at historical withdrawal rate
    realized_fx_gain: float  # amount_eur - amount_eur_avg


class PortfolioStatusResponse(BaseModel):
    """Schema for portfolio status (transaction-derived metrics only)"""

    portfolio_id: int
    portfolio_name: str
    principal: float  # Deposits - Withdrawals
    principal_eur: float  # Sum of all eur_amount fields (historical rates)
    principal_eur_avg: float  # EUR principal (average cost method for withdrawals)
    dividends: float
    dividends_eur: float | None = None  # Dividends in EUR (historical rates)
    cash: float
    holdings: list[HoldingResponse]
    holdings_cost: float  # Sum of all holdings cost basis
    realized_gains: float  # Gains/losses from sells
    realized_sales: list[RealizedSaleResponse] = Field(default_factory=list)
    dividends_received: list[DividendReceivedResponse] = Field(default_factory=list)
    realized_withdrawals: list[WithdrawalFxResponse] = Field(default_factory=list)
    capital_gains_tax_rate: (
        float  # Tax rate applied to capital gains (e.g., 0.25 for 25%)
    )
    warnings: list[TransactionWarning] = Field(
        default_factory=list
    )  # Transaction processing warnings
    usd_to_eur_rate: float | None = None  # Live USD→EUR rate; None when unavailable

    model_config = ConfigDict(from_attributes=True)


class LivePriceInfo(BaseModel):
    """Per-ticker live-price result with provenance.

    ``source`` distinguishes a fresh Yahoo Finance fetch (``live``) from a
    stale fallback pulled from the HistoricalPrice cache (``last_known``) and
    from the "no data at all" case (``missing``). ``as_of`` is the timestamp
    of the price — now for live, the cached date for last_known, None for missing.

    Invariants:
      * ``price is None`` iff ``source == 'missing'``.
      * ``as_of is None`` iff ``source == 'missing'``. A priced result always
        carries a timestamp; "missing" carries neither.
    """

    price: float | None = None
    source: PriceSource = "missing"
    as_of: datetime | None = None

    @model_validator(mode="after")
    def _source_invariants(self) -> "LivePriceInfo":
        if self.source == "missing":
            if self.price is not None:
                raise ValueError(
                    "LivePriceInfo with source='missing' must have price=None"
                )
            if self.as_of is not None:
                raise ValueError(
                    "LivePriceInfo with source='missing' must have as_of=None"
                )
        else:
            if self.price is None:
                raise ValueError(
                    f"LivePriceInfo with source='{self.source}' must have a non-None price"
                )
            if self.as_of is None:
                raise ValueError(
                    f"LivePriceInfo with source='{self.source}' must have a non-None as_of timestamp"
                )
        return self


class LivePricesResponse(BaseModel):
    """Schema for live price polling (no transaction replay)"""

    prices: dict[str, LivePriceInfo]
    usd_to_eur_rate: float | None = None
    timestamp: datetime


class PerformanceDataPoint(BaseModel):
    """Schema for a single performance data point"""

    date: str  # YYYY-MM-DD format
    principal: float = 0.0
    principal_eur: float | None = (
        None  # Cumulative net deposits in EUR at historical rates
    )
    current_value: float | None = None
    fx_rate: float | None = None  # Historical USD→EUR rate at this date
    return_pct: float | None = None  # Time-weighted return (TWR) %
    sp500_return_pct: float | None = None  # S&P 500 USD return % from first data point

    model_config = ConfigDict(from_attributes=True)


class PortfolioPerformanceResponse(BaseModel):
    """Schema for portfolio performance over time"""

    portfolio_id: int
    portfolio_name: str
    data_points: list[PerformanceDataPoint]
    # Tickers whose historical prices were unavailable and which were
    # therefore valued at cost basis for some or all of the series.
    # Non-empty means the chart is lying flat for those symbols.
    cost_basis_fallback_tickers: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
