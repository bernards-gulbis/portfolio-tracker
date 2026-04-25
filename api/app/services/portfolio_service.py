"""Portfolio service — CRUD operations + delegation to calculation modules."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlmodel import Session

from app.core.exceptions import (
    InvalidPortfolioNameException,
    PortfolioNotFoundException,
)
from app.models import Portfolio
from app.repositories.portfolio_repository import PortfolioRepository
from app.repositories.transaction_repository import TransactionRepository
from app.schemas import PortfolioStatusResponse
from app.services.portfolio_perf import calculate_performance
from app.services.portfolio_status import calculate_status
from app.services.price_service import PriceService

_DEFAULT_TAX_RATE = Decimal("0.255")


class PortfolioService:
    """Service for portfolio business logic"""

    def __init__(self, session: Session):
        self.portfolio_repo = PortfolioRepository(session)
        self.transaction_repo = TransactionRepository(session)

    @staticmethod
    def _validate_name(name: str) -> str:
        """Validate and return stripped portfolio name."""
        stripped = name.strip() if name else ""
        if not stripped:
            raise InvalidPortfolioNameException("Portfolio name cannot be empty")
        if len(stripped) > 255:
            raise InvalidPortfolioNameException(
                "Portfolio name cannot exceed 255 characters"
            )
        return stripped

    def create_portfolio(self, name: str, user_id: uuid.UUID) -> Portfolio:
        """Create a new portfolio with validation"""
        return self.portfolio_repo.create(self._validate_name(name), user_id)

    def get_portfolio(self, portfolio_id: int, user_id: uuid.UUID) -> Portfolio:
        """Get a portfolio by ID (user-scoped)"""
        portfolio = self.portfolio_repo.get_by_id_and_user(portfolio_id, user_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)
        return portfolio

    def get_all_portfolios(self, user_id: uuid.UUID) -> list[Portfolio]:
        """Get all portfolios for user"""
        return self.portfolio_repo.get_all_for_user(user_id)

    def update_portfolio(
        self, portfolio_id: int, name: str, user_id: uuid.UUID
    ) -> Portfolio:
        """Update a portfolio (user-scoped)"""
        portfolio = self.portfolio_repo.update(
            portfolio_id, self._validate_name(name), user_id
        )
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)
        return portfolio

    def delete_portfolio(self, portfolio_id: int, user_id: uuid.UUID) -> None:
        """Delete a portfolio (user-scoped)"""
        if not self.portfolio_repo.delete(portfolio_id, user_id):
            raise PortfolioNotFoundException(portfolio_id)

    def copy_portfolio(
        self, portfolio_id: int, new_name: str, user_id: uuid.UUID
    ) -> Portfolio:
        """Copy a portfolio with all its transactions (user-scoped)"""
        copied_portfolio = self.portfolio_repo.copy_with_transactions(
            portfolio_id, self._validate_name(new_name), user_id
        )

        if not copied_portfolio:
            raise PortfolioNotFoundException(portfolio_id)

        return copied_portfolio

    def calculate_portfolio_status(
        self,
        portfolio_id: int,
        user_id: uuid.UUID,
        tax_rate: Decimal = _DEFAULT_TAX_RATE,
    ) -> PortfolioStatusResponse:
        """Calculate comprehensive portfolio status including holdings, cash, and performance metrics."""
        portfolio = self.portfolio_repo.get_by_id_and_user(portfolio_id, user_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)

        transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)
        usd_to_eur_rate = PriceService.get_usd_to_eur_rate_safe()

        return calculate_status(
            transactions=transactions,
            usd_to_eur_rate=usd_to_eur_rate,
            tax_rate=tax_rate,
            portfolio_id=portfolio.id,
            portfolio_name=portfolio.name,
        )

    def get_portfolio_performance(
        self,
        portfolio_id: int,
        user_id: uuid.UUID,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        num_points: int = 60,
    ) -> tuple[str, list[dict], list[str]]:
        """Get portfolio performance over time. Returns
        ``(portfolio_name, data_points, cost_basis_fallback_tickers)``."""
        portfolio = self.portfolio_repo.get_by_id_and_user(portfolio_id, user_id)
        if not portfolio:
            raise PortfolioNotFoundException(portfolio_id)

        transactions = self.transaction_repo.get_by_portfolio_id(portfolio_id)

        data_points, cost_basis_fallback_tickers = calculate_performance(
            transactions=transactions,
            start_date=start_date,
            end_date=end_date,
            num_points=num_points,
        )
        return portfolio.name, data_points, cost_basis_fallback_tickers
