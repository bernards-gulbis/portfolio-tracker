"""
Portfolio Tracker API - Main Application
"""
import logging
import sys
import os
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from contextlib import asynccontextmanager

from app.core import (
    create_db_and_tables,
    PortfolioNotFoundException,
    TransactionNotFoundException,
    InvalidPortfolioNameException,
    InvalidCSVFormatException,
    InvalidTransactionDataException,
    FileUploadException,
)
from app.routers import portfolios_router, transactions_router, transaction_router
from app.core.database import engine
from app.core.auth import fastapi_users, auth_backend, oauth_auth_backend, google_oauth_client, OAUTH_STATE_SECRET, COOKIE_SECURE, FRONTEND_URL
from app.schemas import UserRead, UserCreate, UserUpdate
from sqlalchemy import text
from httpx_oauth.integrations.fastapi import OAuth2AuthorizeCallbackError

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    logger.info("Starting Portfolio Tracker API...")

    # Verify database connection before proceeding
    from app.core.database import verify_connection
    if not verify_connection():
        logger.error("Failed to connect to database")
        raise RuntimeError("Database connection failed")

    create_db_and_tables()
    logger.info("Database initialized successfully")
    yield
    # Shutdown (cleanup if needed)
    logger.info("Shutting down Portfolio Tracker API...")


app = FastAPI(
    title="Portfolio Tracker API",
    description="API for tracking investment portfolios and transactions",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses"""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


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
async def invalid_transaction_data_handler(request, exc: InvalidTransactionDataException):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(FileUploadException)
async def file_upload_handler(request, exc: FileUploadException):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(OAuth2AuthorizeCallbackError)
async def oauth_callback_error_handler(request: Request, exc: OAuth2AuthorizeCallbackError):
    detail = exc.detail or "OAuth authentication failed"
    if exc.response is not None:
        try:
            detail = exc.response.text or detail
        except Exception:
            pass
    logger.error("OAuth callback error (status=%s): %s", exc.status_code, detail)
    # Always redirect to the frontend — never show a raw error page to the user
    from urllib.parse import urlencode
    params = urlencode({"oauth_error": detail})
    return RedirectResponse(url=f"{FRONTEND_URL}?{params}", status_code=302)


# ================== Include Routers ==================

app.include_router(portfolios_router)
app.include_router(transactions_router)
app.include_router(transaction_router)

# Auth routers
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/auth/cookie",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["users"],
)
app.include_router(
    fastapi_users.get_oauth_router(
        oauth_client=google_oauth_client,
        backend=oauth_auth_backend,
        state_secret=OAUTH_STATE_SECRET,
        associate_by_email=True,
        is_verified_by_default=True,
        csrf_token_cookie_secure=COOKIE_SECURE,
    ),
    prefix="/auth/google",
    tags=["auth"],
)


# ================== Health Check ==================

@app.get("/", tags=["health"])
def root():
    """Basic health check endpoint"""
    return {"message": "Portfolio Tracker API", "status": "running", "version": "1.0.0"}


@app.get("/health", tags=["health"])
def health_check():
    """
    Comprehensive health check endpoint
    Checks database connectivity
    """
    health_status = {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "database": "unknown"
    }

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        health_status["database"] = "connected"
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["database"] = "error"
        logger.error(f"Health check failed - database error: {e}", exc_info=True)
        return JSONResponse(status_code=503, content=health_status)

    return health_status
