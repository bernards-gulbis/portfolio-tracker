"""FX rate API routes."""

from datetime import date as date_type
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import current_active_user
from app.models.user import User
from app.services.prices.fx_rate_service import FxRateService

router = APIRouter(prefix="/fx-rates", tags=["fx-rates"])


class FxRateResponse(BaseModel):
    date: str
    usd_to_eur_rate: float
    source: Literal["live", "historical"]


@router.get("/{date_str}", response_model=FxRateResponse)
def get_fx_rate(
    date_str: str,
    _user: Annotated[User, Depends(current_active_user)],
):
    """Return the USD→EUR rate (EUR per USD) for the given date.

    Today/future → live rate. Past → historical, with up to 7 days of
    back-padding for weekends and exchange holidays. ``404`` if no rate
    is available within the lookback window.
    """
    try:
        target = date_type.fromisoformat(date_str)
    except ValueError as e:
        raise HTTPException(400, "Invalid date format; expected YYYY-MM-DD") from e

    rate, source = FxRateService.get_rate_for_date(target)
    if rate is None or source == "unavailable":
        raise HTTPException(404, f"No FX rate available for {date_str}")
    return FxRateResponse(date=date_str, usd_to_eur_rate=rate, source=source)
