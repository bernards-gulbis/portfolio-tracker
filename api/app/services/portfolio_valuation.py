"""Historical FX-rate resolution.

Consults the FX-rate service to turn a date into a USD→EUR rate, falling
back to the nearest earlier date or the current live rate when no historical
value is available for the target date.
"""

import logging
from datetime import datetime, timedelta

from app.services.portfolio_types import _lookup_historical_rate
from app.services.prices import FxRateService

logger = logging.getLogger(__name__)


def _resolve_usd_to_eur_rate(target_date: datetime) -> float | None:
    """Resolve USD→EUR rate at *target_date*, falling back to nearest earlier date or current rate."""
    start_date = target_date - timedelta(days=5)
    end_date = target_date + timedelta(days=1)
    fx_rates = FxRateService.get_historical_usd_to_eur_rates(start_date, end_date)
    target_date_str = target_date.strftime("%Y-%m-%d")
    rate = _lookup_historical_rate(fx_rates, target_date_str)
    if rate is not None:
        return rate
    return FxRateService.get_usd_to_eur_rate_safe()
