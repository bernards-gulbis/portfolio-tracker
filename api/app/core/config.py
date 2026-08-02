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

_BOOL_TRUE = {"true", "1", "yes"}
_BOOL_FALSE = {"false", "0", "no", ""}


def _get_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name, str(default)).lower()
    if raw not in _BOOL_TRUE | _BOOL_FALSE:
        _warnings.append(
            f"{name}={raw!r} is not a recognized boolean (expected true/false)"
        )
    return raw in _BOOL_TRUE


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        return int(raw)
    except ValueError:
        _errors.append(f"{name}={raw!r} is not a valid integer")
        return default


# ── Database ──────────────────────────────────────────────

_DEFAULT_DATABASE_URL = "sqlite:///./portfolio_tracker.db"
DATABASE_URL: str = os.getenv("DATABASE_URL", _DEFAULT_DATABASE_URL)
DB_POOL_SIZE: int = _get_int("DB_POOL_SIZE", 5)
DB_MAX_OVERFLOW: int = _get_int("DB_MAX_OVERFLOW", 10)
DATABASE_ECHO: bool = _get_bool("DATABASE_ECHO")

# Apply Alembic migrations from the app's startup hook. True is right for local
# dev and e2e, where the app owns its database. Set false on hosts that scale
# horizontally — there ``alembic upgrade head`` would run on every cold start,
# unlocked, with concurrent starts racing on the same schema. Those deployments
# run ``python -m scripts.migrate`` as a build step instead.
RUN_MIGRATIONS_ON_STARTUP: bool = _get_bool("RUN_MIGRATIONS_ON_STARTUP", True)

# ── Auth ──────────────────────────────────────────────────

COOKIE_SECURE: bool = _get_bool("COOKIE_SECURE")
COOKIE_SAMESITE: str = os.getenv("COOKIE_SAMESITE", "lax").lower()
if COOKIE_SAMESITE not in ("lax", "strict", "none"):
    _errors.append(
        f"COOKIE_SAMESITE={COOKIE_SAMESITE!r} is invalid (expected lax/strict/none)"
    )
if COOKIE_SAMESITE == "none" and not COOKIE_SECURE:
    _errors.append("COOKIE_SECURE must be true when COOKIE_SAMESITE=none")

_DEFAULT_SECRET = "CHANGE-ME-IN-PRODUCTION"
SECRET_KEY: str = os.getenv("SECRET_KEY", _DEFAULT_SECRET)
OAUTH_STATE_SECRET: str = os.getenv("OAUTH_STATE_SECRET", _DEFAULT_SECRET)
GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Absolute URL Google redirects the browser back to after consent. Empty means
# "derive it from the incoming request", which is correct when the API is
# reached at its own root. Set it explicitly when a proxy strips a path prefix
# before the app sees the request — the app cannot reconstruct the public URL
# on its own, and a wrong redirect_uri fails the OAuth exchange outright.
OAUTH_REDIRECT_URL: str = os.getenv("OAUTH_REDIRECT_URL", "")

# Path prefix the API is publicly mounted under, when a proxy strips it before
# routing. Only affects generated URLs (``/docs``, the OpenAPI ``servers``
# entry) — never route matching.
API_ROOT_PATH: str = os.getenv("API_ROOT_PATH", "")
if API_ROOT_PATH and not API_ROOT_PATH.startswith("/"):
    _errors.append(f"API_ROOT_PATH={API_ROOT_PATH!r} must start with '/'")
API_ROOT_PATH = API_ROOT_PATH.rstrip("/")

for _name, _val in [
    ("SECRET_KEY", SECRET_KEY),
    ("OAUTH_STATE_SECRET", OAUTH_STATE_SECRET),
]:
    if _val == _DEFAULT_SECRET:
        if COOKIE_SECURE:
            _errors.append(
                f"{_name} must be set when COOKIE_SECURE=true. "
                'Generate one with: python -c "import secrets; print(secrets.token_hex(32))"'
            )
        else:
            _warnings.append(
                f"{_name} is using insecure default — set it in .env before deploying"
            )

# COOKIE_SECURE=true is the production posture. Falling back to the local SQLite
# file there would yield a *working* API silently backed by ephemeral disk, and
# every deploy would drop the data. Fail at import instead.
if COOKIE_SECURE and DATABASE_URL == _DEFAULT_DATABASE_URL:
    _errors.append(
        "DATABASE_URL must be set when COOKIE_SECURE=true — refusing to run a "
        f"production deployment against the local default ({_DEFAULT_DATABASE_URL})"
    )

# ── CORS ──────────────────────────────────────────────────

_cors_raw = os.getenv("CORS_ORIGINS", "")
CORS_ORIGINS: list[str] = [o.strip() for o in _cors_raw.split(",") if o.strip()]

# ── Misc ──────────────────────────────────────────────────

PRICE_CACHE_TTL_SECONDS: int = max(1, _get_int("PRICE_CACHE_TTL_SECONDS", 55))
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()

# ── Emit warnings / abort on errors ──────────────────────

for _w in _warnings:
    logger.warning(_w)

if _errors:
    # Logging may not be configured yet, so also write to stderr
    msg = "Environment validation failed:\n" + "\n".join(f"  - {e}" for e in _errors)
    sys.stderr.write(f"FATAL: {msg}\n")
    raise SystemExit(1)
