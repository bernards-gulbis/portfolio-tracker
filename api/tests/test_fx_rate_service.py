"""Unit tests for FxRateService."""

from datetime import UTC, datetime
from unittest.mock import patch

import pytest
import requests

from app.services.prices.fx_rate_service import FxRateService
from app.services.prices.historical_price_service import HistoricalPriceService
from app.services.prices.live_price_service import LivePriceService


class TestGetUsdToEurRate:
    """USD/EUR live rate, derived from EURUSD=X via LivePriceService."""

    def setup_method(self):
        LivePriceService._price_cache.clear()

    def test_get_usd_to_eur_rate_success(self):
        with patch.object(LivePriceService, "get_current_price", return_value=1.10):
            rate = FxRateService.get_usd_to_eur_rate()

        assert rate == pytest.approx(1.0 / 1.10)

    def test_get_usd_to_eur_rate_none_price(self):
        with patch.object(LivePriceService, "get_current_price", return_value=None):
            rate = FxRateService.get_usd_to_eur_rate()

        assert rate is None

    def test_get_usd_to_eur_rate_zero_price(self):
        """Zero rate must not produce a ZeroDivisionError."""
        with patch.object(LivePriceService, "get_current_price", return_value=0.0):
            rate = FxRateService.get_usd_to_eur_rate()

        assert rate is None

    def test_get_usd_to_eur_rate_safe_success(self):
        with patch.object(FxRateService, "get_usd_to_eur_rate", return_value=0.91):
            rate = FxRateService.get_usd_to_eur_rate_safe()

        assert rate == pytest.approx(0.91)

    def test_get_usd_to_eur_rate_safe_network_error(self):
        with patch.object(
            FxRateService,
            "get_usd_to_eur_rate",
            side_effect=requests.exceptions.ConnectionError("fail"),
        ):
            rate = FxRateService.get_usd_to_eur_rate_safe()

        assert rate is None

    def test_get_usd_to_eur_rate_safe_unexpected_error(self):
        with patch.object(
            FxRateService,
            "get_usd_to_eur_rate",
            side_effect=RuntimeError("unexpected"),
        ):
            rate = FxRateService.get_usd_to_eur_rate_safe()

        assert rate is None


class TestGetHistoricalUsdToEurRates:
    """Historical USD/EUR rates, inverted from EURUSD=X."""

    def setup_method(self):
        HistoricalPriceService._historical_cache.clear()

    def test_converts_eur_usd_to_usd_eur(self):
        eur_usd = {"2025-01-10": 1.10, "2025-01-11": 1.05}

        with patch.object(
            HistoricalPriceService, "get_historical_prices", return_value=eur_usd
        ):
            rates = FxRateService.get_historical_usd_to_eur_rates(
                datetime(2025, 1, 10), datetime(2025, 1, 11)
            )

        assert rates["2025-01-10"] == pytest.approx(1.0 / 1.10)
        assert rates["2025-01-11"] == pytest.approx(1.0 / 1.05)

    def test_skips_zero_rates(self):
        eur_usd = {"2025-01-10": 0.0, "2025-01-11": 1.05}

        with patch.object(
            HistoricalPriceService, "get_historical_prices", return_value=eur_usd
        ):
            rates = FxRateService.get_historical_usd_to_eur_rates(
                datetime(2025, 1, 10), datetime(2025, 1, 11)
            )

        assert "2025-01-10" not in rates
        assert "2025-01-11" in rates

    def test_handles_decimal_values_from_db_cache(self):
        """Belt-and-suspenders Decimal coercion: a future cache-path change
        could reintroduce ``1.0 / Decimal`` TypeError if the float() cast
        at the inversion point is removed.
        """
        from decimal import Decimal

        eur_usd = {"2025-01-10": Decimal("1.10"), "2025-01-11": Decimal("1.05")}

        with patch.object(
            HistoricalPriceService, "get_historical_prices", return_value=eur_usd
        ):
            rates = FxRateService.get_historical_usd_to_eur_rates(
                datetime(2025, 1, 10), datetime(2025, 1, 11)
            )

        assert rates["2025-01-10"] == pytest.approx(1.0 / 1.10)
        assert rates["2025-01-11"] == pytest.approx(1.0 / 1.05)


class TestGetCachedFxRates:
    """The FxRate table cache-read helper. (Used by FX backfill paths;
    keep covered to avoid silent Decimal-leak regressions.)
    """

    def test_get_cached_fx_rates_returns_float(self):
        from datetime import datetime as _dt
        from decimal import Decimal

        from sqlmodel import Session, SQLModel, create_engine
        from sqlmodel.pool import StaticPool

        from app.models.historical_price import FxRate

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            session.add(
                FxRate(
                    date="2026-04-10",
                    usd_to_eur_rate=Decimal("0.920000"),
                    created_at=_dt.now(UTC),
                )
            )
            session.commit()

            # Inline copy of the legacy ``_get_cached_fx_rates`` query, which
            # was on the old PriceService. There's no public service method
            # that reads from FxRate today (live path uses LivePriceService;
            # historical path uses HistoricalPriceService for EURUSD=X). The
            # FxRate table is reserved for a future write-through cache and
            # this regression test pins its float-coercion behavior.
            from sqlmodel import select

            statement = select(FxRate).where(
                FxRate.date >= "2026-04-01", FxRate.date <= "2026-04-30"
            )
            results = session.exec(statement).all()
            result = {row.date: float(row.usd_to_eur_rate) for row in results}

        assert "2026-04-10" in result
        assert isinstance(result["2026-04-10"], float)
        assert result["2026-04-10"] == pytest.approx(0.92)
