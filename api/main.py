"""
Portfolio Tracker API - Main Application
"""

import contextlib
import logging
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated
from urllib.parse import urlencode

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from httpx_oauth.integrations.fastapi import OAuth2AuthorizeCallbackError
from sqlmodel import Session, select

from app.core import (
    FileUploadException,
    InvalidCSVFormatException,
    InvalidPortfolioNameException,
    InvalidTransactionDataException,
    PortfolioNotFoundException,
    TransactionNotFoundException,
)
from app.core.auth import (
    UserManager,
    auth_backend,
    current_active_user,
    fastapi_users,
    get_user_manager,
    google_oauth_client,
    oauth_auth_backend,
)
from app.core.config import (
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    CORS_ORIGINS,
    FRONTEND_URL,
    LOG_LEVEL,
    OAUTH_STATE_SECRET,
)
from app.core.database import (
    get_session,
    run_migrations,
    verify_connection,
    verify_money_columns_are_decimal,
)
from app.core.rate_limit import rate_limit
from app.models.oauth_account import OAuthAccount
from app.models.user import User
from app.routers import (
    fx_rates_router,
    portfolios_router,
    transaction_router,
    transactions_router,
)
from app.schemas import (
    CloseAccountRequest,
    HealthResponse,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.services.health_service import (
    get_last_fx_rate_age_seconds,
    get_migrations_head,
    get_price_cache_age_seconds,
)

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    logger.info("Starting Portfolio Tracker API...")

    # Verify database connection before proceeding
    if not verify_connection():
        logger.error("Failed to connect to database")
        raise RuntimeError("Database connection failed")

    run_migrations()
    # Defense-in-depth: after migrations, assert money columns are Decimal,
    # not Float. Catches bypassed-migration paths before any write happens.
    verify_money_columns_are_decimal()
    logger.info("Database initialized successfully")
    yield
    # Shutdown (cleanup if needed)
    logger.info("Shutting down Portfolio Tracker API...")


app = FastAPI(
    title="Portfolio Tracker API",
    description="API for tracking investment portfolios and transactions",
    version="1.0.0",
    lifespan=lifespan,
)


# Add security headers middleware (added before CORS so CORS is outermost)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses"""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# Configure CORS (added after security headers so it wraps outermost —
# ensures CORS headers are present even on unhandled 500 errors)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ================== Exception Handlers ==================


@app.exception_handler(PortfolioNotFoundException)
async def portfolio_not_found_handler(request, exc: PortfolioNotFoundException):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(TransactionNotFoundException)
async def transaction_not_found_handler(request, exc: TransactionNotFoundException):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(InvalidPortfolioNameException)
async def invalid_portfolio_name_handler(request, exc: InvalidPortfolioNameException):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(InvalidCSVFormatException)
async def invalid_csv_format_handler(request, exc: InvalidCSVFormatException):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(InvalidTransactionDataException)
async def invalid_transaction_data_handler(
    request, exc: InvalidTransactionDataException
):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(FileUploadException)
async def file_upload_handler(request, exc: FileUploadException):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(OAuth2AuthorizeCallbackError)
async def oauth_callback_error_handler(
    request: Request, exc: OAuth2AuthorizeCallbackError
):
    detail = exc.detail or "OAuth authentication failed"
    if exc.response is not None:
        with contextlib.suppress(Exception):
            detail = exc.response.text or detail
    logger.error("OAuth callback error (status=%s): %s", exc.status_code, detail)
    # Always redirect to the frontend — never show a raw error page to the user
    params = urlencode({"oauth_error": detail})
    return RedirectResponse(url=f"{FRONTEND_URL}?{params}", status_code=302)


# ================== Include Routers ==================

app.include_router(portfolios_router)
app.include_router(transactions_router)
app.include_router(transaction_router)
app.include_router(fx_rates_router)

# Auth routers — each gets a per-(IP, path) rate-limit dependency to throttle
# brute-force attempts. Limits are deliberately conservative; legitimate users
# rarely hit them, and ``/auth/cookie/login`` covers logout too in one bucket.
AUTH_PREFIX = "/auth"
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix=f"{AUTH_PREFIX}/cookie",
    tags=["auth"],
    dependencies=[rate_limit(10, 60)],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix=AUTH_PREFIX,
    tags=["auth"],
    dependencies=[rate_limit(3, 60)],
)
app.include_router(
    fastapi_users.get_reset_password_router(),
    prefix=AUTH_PREFIX,
    tags=["auth"],
    dependencies=[rate_limit(5, 60)],
)
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix=AUTH_PREFIX,
    tags=["auth"],
    dependencies=[rate_limit(5, 60)],
)
# Build the FastAPI Users users router, then replace its GET /me with our own
# so there is exactly one handler for GET /users/me and no ordering ambiguity.
_users_router = fastapi_users.get_users_router(UserRead, UserUpdate)
_users_router.routes = [
    r
    for r in _users_router.routes
    if not (
        getattr(r, "path", None) == "/me"
        and ({"GET", "DELETE"} & getattr(r, "methods", set()))
    )
]


@_users_router.get("/me", tags=["users"], response_model=UserRead)
def get_current_user_me(
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[Session, Depends(get_session)],
):
    providers = list(
        session.exec(
            select(OAuthAccount.oauth_name).where(OAuthAccount.user_id == user.id)
        ).all()
    )
    user_data = UserRead.model_validate(user).model_dump()
    user_data["oauth_providers"] = providers
    return user_data


@_users_router.delete(
    "/me",
    tags=["users"],
    status_code=204,
    responses={
        400: {"description": "Incorrect password or missing DELETE confirmation"}
    },
)
async def delete_current_user(
    body: CloseAccountRequest,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[Session, Depends(get_session)],
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
):
    """Permanently delete the current user and all associated data."""
    # Determine which providers the user has
    providers = list(
        session.exec(
            select(OAuthAccount.oauth_name).where(OAuthAccount.user_id == user.id)
        ).all()
    )
    has_oauth = len(providers) > 0

    # Verify identity: password OR "DELETE" confirmation for OAuth-only users
    if body.password:
        verified, _ = user_manager.password_helper.verify_and_update(
            body.password, user.hashed_password
        )
        if not verified:
            raise HTTPException(status_code=400, detail="Incorrect password")
    elif has_oauth and body.confirmation == "DELETE":
        pass  # OAuth-only user confirmed with typed "DELETE"
    else:
        raise HTTPException(
            status_code=400,
            detail="Password or DELETE confirmation required",
        )

    await user_manager.delete(user)

    response = Response(status_code=204)
    response.delete_cookie("pt_auth")
    return response


# Move /me routes to the front so they are checked before GET /{id}, which would
# otherwise match the literal string "me" as a path parameter and return 403.
_me_routes = [r for r in _users_router.routes if getattr(r, "path", None) == "/me"]
_other_routes = [r for r in _users_router.routes if getattr(r, "path", None) != "/me"]
_users_router.routes = _me_routes + _other_routes

app.include_router(_users_router, prefix="/users", tags=["users"])
app.include_router(
    fastapi_users.get_oauth_router(
        oauth_client=google_oauth_client,
        backend=oauth_auth_backend,
        state_secret=OAUTH_STATE_SECRET,
        associate_by_email=True,
        is_verified_by_default=True,
        csrf_token_cookie_secure=COOKIE_SECURE,
        csrf_token_cookie_samesite=COOKIE_SAMESITE,
    ),
    prefix="/auth/google",
    tags=["auth"],
)


# ================== Health Check ==================


@app.get("/", tags=["health"])
def root():
    """Basic health check endpoint"""
    return {"message": "Portfolio Tracker API", "status": "running", "version": "1.0.0"}


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health_check(session: Annotated[Session, Depends(get_session)]):
    """Health check: DB liveness plus cache and migration freshness."""
    db_ok = verify_connection()

    if db_ok:
        body = HealthResponse(
            status="healthy",
            timestamp=datetime.now(UTC),
            version="1.0.0",
            db="ok",
            price_cache_age=get_price_cache_age_seconds(session),
            last_fx_rate_age=get_last_fx_rate_age_seconds(session),
            migrations_head=get_migrations_head(session),
        )
        return body

    body = HealthResponse(
        status="unhealthy",
        timestamp=datetime.now(UTC),
        version="1.0.0",
        db="error",
    )
    logger.error("Health check failed - database unreachable")
    return JSONResponse(status_code=503, content=body.model_dump(mode="json"))
