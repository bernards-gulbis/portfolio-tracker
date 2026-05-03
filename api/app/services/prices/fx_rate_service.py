"""USD→EUR exchange-rate service.

Live rates: derived from Yahoo's ``EURUSD=X`` ticker via
``LivePriceService``; we publish ``USD→EUR`` (EUR per USD) to match the
rest of the app.

Historical rates: fetched in batch via ``HistoricalPriceService`` for
``EURUSD=X`` and inverted at the boundary.
"""

import logging
from datetime import date as date_type
from datetime import timedelta
from typing import Literal

import requests

from .historical_price_service import HistoricalPriceService
from .live_price_service import LivePriceService

logger = logging.getLogger(__name__)

FxRateSource = Literal["live", "historical", "unavailable"]


class FxRateService:
    """USD→EUR exchange rate (EUR per USD)."""

    @classmethod
    def get_rate_for_date(cls, target: date_type) -> tuple[float | None, FxRateSource]:
        """Return ``(rate, source)`` for ``target`` (USD→EUR; EUR per USD).

        For today and future dates, returns the current live rate. For past
        dates, looks up the historical rate with up to 7 days of back-padding
        to absorb weekends and exchange holidays. Returns
        ``(None, "unavailable")`` if no rate can be determined — callers
        should treat that as a soft 404 rather than a hard error.
        """
        today = date_type.today()
        if target >= today:
            rate = cls.get_usd_to_eur_rate_safe()
            return (rate, "live") if rate else (None, "unavailable")

        start = target - timedelta(days=7)
        rates = cls.get_historical_usd_to_eur_rates(start, target)
        target_str = target.strftime("%Y-%m-%d")
        for d in sorted(rates.keys(), reverse=True):
            if d <= target_str and rates[d] > 0:
                return rates[d], "historical"
        return None, "unavailable"

    @classmethod
    def get_usd_to_eur_rate(cls) -> float | None:
        """Fetch the current USD→EUR rate.

        ``EURUSD=X`` quotes USD per EUR; we invert to get EUR per USD.
        Returns ``None`` if the underlying live fetch fails or the rate
        is non-positive.
        """
        eur_usd_rate = LivePriceService.get_current_price("EURUSD=X")
        if eur_usd_rate and eur_usd_rate > 0:
            return 1.0 / eur_usd_rate
        return None

    @classmethod
    def get_usd_to_eur_rate_safe(cls) -> float | None:
        """Like ``get_usd_to_eur_rate`` but returns ``None`` on any exception.

        ``LivePriceService.get_current_price`` already swallows network
        errors, but this guard exists for callers that must never raise
        (e.g. building a status response).
        """
        try:
            return cls.get_usd_to_eur_rate()
        except requests.exceptions.RequestException as e:
            logger.warning("Network error fetching USD/EUR rate: %s", e)
            return None
        except Exception as e:
            logger.error("Unexpected error fetching USD/EUR rate: %s", e, exc_info=True)
            return None

    @classmethod
    def get_historical_usd_to_eur_rates(cls, start_date, end_date) -> dict[str, float]:
        """Historical USD→EUR rates for a date range, inverted from EURUSD=X."""
        eur_usd_rates = HistoricalPriceService.get_historical_prices(
            "EURUSD=X", start_date, end_date
        )
        # Belt-and-suspenders: ``_get_cached_historical_prices`` already
        # coerces Decimal → float at the DB boundary, but ``1.0 / Decimal``
        # raises TypeError, so guard the cast at the inversion point too.
        return {
            date_str: 1.0 / float(rate)
            for date_str, rate in eur_usd_rates.items()
            if rate and rate > 0
        }
