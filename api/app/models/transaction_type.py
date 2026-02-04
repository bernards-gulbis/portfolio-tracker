"""Transaction type enumeration"""
from enum import Enum


class TransactionType(str, Enum):
    """Transaction type enumeration"""
    DEPOSIT = "Deposit"
    BUY = "Buy"
    FEE = "Fee"
    SELL = "Sell"
    WITHDRAW = "Withdraw"
    SPLIT = "Split"
    DIVIDEND = "Dividend"
