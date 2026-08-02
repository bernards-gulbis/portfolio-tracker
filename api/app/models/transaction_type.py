"""Transaction type enumeration"""

from enum import StrEnum


class TransactionType(StrEnum):
    """Transaction type enumeration"""

    DEPOSIT = "Deposit"
    BUY = "Buy"
    FEE = "Fee"
    SELL = "Sell"
    WITHDRAW = "Withdraw"
    SPLIT = "Split"
    DIVIDEND = "Dividend"
    REWARD = "Reward"
