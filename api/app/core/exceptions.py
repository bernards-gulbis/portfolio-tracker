"""
Custom exception classes for Portfolio Tracker API
"""
from typing import Optional


class PortfolioTrackerException(Exception):
    """Base exception for all portfolio tracker errors"""


class PortfolioNotFoundException(PortfolioTrackerException):
    """Raised when a portfolio is not found"""
    def __init__(self, portfolio_id: int):
        self.portfolio_id = portfolio_id
        super().__init__(f"Portfolio with ID {portfolio_id} not found")


class TransactionNotFoundException(PortfolioTrackerException):
    """Raised when a transaction is not found"""
    def __init__(self, transaction_id: int):
        self.transaction_id = transaction_id
        super().__init__(f"Transaction with ID {transaction_id} not found")


class InvalidPortfolioNameException(PortfolioTrackerException):
    """Raised when portfolio name is invalid"""
    def __init__(self, message: str = "Portfolio name cannot be empty"):
        super().__init__(message)


class InvalidCSVFormatException(PortfolioTrackerException):
    """Raised when CSV format is invalid"""
    def __init__(self, message: str, line_number: Optional[int] = None):
        if line_number:
            super().__init__(f"CSV error on line {line_number}: {message}")
        else:
            super().__init__(f"CSV error: {message}")
        self.line_number = line_number


class InvalidTransactionDataException(PortfolioTrackerException):
    """Raised when transaction data is invalid"""
    def __init__(self, message: str):
        super().__init__(message)


class FileUploadException(PortfolioTrackerException):
    """Raised when file upload fails"""
    def __init__(self, message: str):
        super().__init__(message)
