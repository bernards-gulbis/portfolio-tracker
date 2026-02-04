"""
Portfolio Tracker API - Main Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    create_db_and_tables()
    yield
    # Shutdown (cleanup if needed)


app = FastAPI(
    title="Portfolio Tracker API",
    description="API for tracking investment portfolios and transactions",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173"],
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
async def invalid_transaction_data_handler(request, exc: InvalidTransactionDataException):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(FileUploadException)
async def file_upload_handler(request, exc: FileUploadException):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


# ================== Include Routers ==================

app.include_router(portfolios_router)
app.include_router(transactions_router)
app.include_router(transaction_router)


# ================== Health Check ==================

@app.get("/", tags=["health"])
def root():
    """Health check endpoint"""
    return {"message": "Portfolio Tracker API", "status": "running"}
