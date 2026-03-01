"""Core functionality - database, exceptions, config"""

from . import config as config  # noqa: F401 — validate env vars early
from .database import create_db_and_tables, get_session, engine, verify_connection
from .exceptions import (
    PortfolioTrackerException,
    PortfolioNotFoundException,
    TransactionNotFoundException,
    InvalidPortfolioNameException,
    InvalidCSVFormatException,
    InvalidTransactionDataException,
    FileUploadException,
)

__all__ = [
    "create_db_and_tables",
    "get_session",
    "engine",
    "verify_connection",
    "PortfolioTrackerException",
    "PortfolioNotFoundException",
    "TransactionNotFoundException",
    "InvalidPortfolioNameException",
    "InvalidCSVFormatException",
    "InvalidTransactionDataException",
    "FileUploadException",
]
