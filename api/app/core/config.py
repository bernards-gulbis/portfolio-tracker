"""
Centralized configuration — validated at import time.

All environment variables are read here so missing or malformed values
fail loudly at startup rather than silently at runtime.
"""

import logging
import os
import sys

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_errors: list[str] = []
_warnings: list[str] = []


def _get(name: str, default: str) -> str:
    return os.getenv(name, default)


def _get_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).lower() == "true"


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        return int(raw)
    except ValueError:
        _errors.append(f"{name}={raw!r} is not a valid integer")
        return default


# ── Database ──────────────────────────────────────────────

DATABASE_URL: str = _get("DATABASE_URL", "sqlite:///./portfolio_tracker.db")
DB_POOL_SIZE: int = _get_int("DB_POOL_SIZE", 5)
DB_MAX_OVERFLOW: int = _get_int("DB_MAX_OVERFLOW", 10)
DATABASE_ECHO: bool = _get_bool("DATABASE_ECHO")

# ── Auth ──────────────────────────────────────────────────

COOKIE_SECURE: bool = _get_bool("COOKIE_SECURE")

_DEFAULT_SECRET = "CHANGE-ME-IN-PRODUCTION"
SECRET_KEY: str = _get("SECRET_KEY", _DEFAULT_SECRET)
OAUTH_STATE_SECRET: str = _get("OAUTH_STATE_SECRET", _DEFAULT_SECRET)
GOOGLE_CLIENT_ID: str = _get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET: str = _get("GOOGLE_CLIENT_SECRET", "")
FRONTEND_URL: str = _get("FRONTEND_URL", "http://localhost:3000")

if COOKIE_SECURE:
    if SECRET_KEY == _DEFAULT_SECRET:
        _errors.append(
            "SECRET_KEY must be set when COOKIE_SECURE=true. "
            'Generate one with: python -c "import secrets; print(secrets.token_hex(32))"'
        )
    if OAUTH_STATE_SECRET == _DEFAULT_SECRET:
        _errors.append(
            "OAUTH_STATE_SECRET must be set when COOKIE_SECURE=true. "
            'Generate one with: python -c "import secrets; print(secrets.token_hex(32))"'
        )
else:
    if SECRET_KEY == _DEFAULT_SECRET:
        _warnings.append(
            "SECRET_KEY is using insecure default — set it in .env before deploying"
        )
    if OAUTH_STATE_SECRET == _DEFAULT_SECRET:
        _warnings.append(
            "OAUTH_STATE_SECRET is using insecure default — set it in .env before deploying"
        )

# ── CORS ──────────────────────────────────────────────────

CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in _get(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173",
    ).split(",")
]

# ── Misc ──────────────────────────────────────────────────

PRICE_CACHE_TTL_MINUTES: int = _get_int("PRICE_CACHE_TTL", 15)
LOG_LEVEL: str = _get("LOG_LEVEL", "INFO").upper()

# ── Emit warnings / abort on errors ──────────────────────

for _w in _warnings:
    logger.warning(_w)

if _errors:
    # Logging may not be configured yet, so also write to stderr
    msg = "Environment validation failed:\n" + "\n".join(f"  - {e}" for e in _errors)
    print(f"FATAL: {msg}", file=sys.stderr)
    raise SystemExit(1)
