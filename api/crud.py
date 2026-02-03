from sqlmodel import Session, select
from typing import List, Optional
from datetime import datetime
import csv
from io import StringIO

from models import Portfolio, Transaction, TransactionType


# ================== Portfolio Operations ==================

def create_portfolio(session: Session, name: str) -> Portfolio:
    """Create a new portfolio"""
    portfolio = Portfolio(name=name)
    session.add(portfolio)
    session.commit()
    session.refresh(portfolio)
    return portfolio


def get_portfolio(session: Session, portfolio_id: int) -> Optional[Portfolio]:
    """Get a single portfolio by ID"""
    return session.get(Portfolio, portfolio_id)


def get_all_portfolios(session: Session) -> List[Portfolio]:
    """Get all portfolios"""
    statement = select(Portfolio)
    return list(session.exec(statement).all())


def update_portfolio(session: Session, portfolio_id: int, name: str) -> Optional[Portfolio]:
    """Update a portfolio's name"""
    portfolio = session.get(Portfolio, portfolio_id)
    if portfolio:
        portfolio.name = name
        session.add(portfolio)
        session.commit()
        session.refresh(portfolio)
    return portfolio


def delete_portfolio(session: Session, portfolio_id: int) -> bool:
    """Delete a portfolio and all its transactions"""
    portfolio = session.get(Portfolio, portfolio_id)
    if portfolio:
        session.delete(portfolio)
        session.commit()
        return True
    return False


# ================== Transaction Operations ==================

def add_transaction(
    session: Session,
    portfolio_id: int,
    date_time: datetime,
    transaction_type: TransactionType,
    value: float,
    ticker: Optional[str] = None,
    units: Optional[float] = None,
    price: Optional[float] = None,
    fee: float = 0.0,
    value_eur: Optional[float] = None,
    split_ratio: Optional[float] = None,
) -> Optional[Transaction]:
    """Add a transaction to a portfolio"""
    # Verify portfolio exists
    portfolio = session.get(Portfolio, portfolio_id)
    if not portfolio:
        return None
    
    transaction = Transaction(
        portfolio_id=portfolio_id,
        date_time=date_time,
        type=transaction_type,
        ticker=ticker,
        units=units,
        price=price,
        fee=fee,
        value=value,
        value_eur=value_eur,
        split_ratio=split_ratio,
    )
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    return transaction


def get_transactions_for_portfolio(session: Session, portfolio_id: int) -> List[Transaction]:
    """Get all transactions for a specific portfolio"""
    statement = select(Transaction).where(Transaction.portfolio_id == portfolio_id)
    return list(session.exec(statement).all())


def update_transaction(
    session: Session,
    transaction_id: int,
    date_time: Optional[datetime] = None,
    transaction_type: Optional[TransactionType] = None,
    ticker: Optional[str] = None,
    units: Optional[float] = None,
    price: Optional[float] = None,
    fee: Optional[float] = None,
    value: Optional[float] = None,
    value_eur: Optional[float] = None,
    split_ratio: Optional[float] = None,
) -> Optional[Transaction]:
    """Update a transaction"""
    transaction = session.get(Transaction, transaction_id)
    if not transaction:
        return None
    
    if date_time is not None:
        transaction.date_time = date_time
    if transaction_type is not None:
        transaction.type = transaction_type
    if ticker is not None:
        transaction.ticker = ticker
    if units is not None:
        transaction.units = units
    if price is not None:
        transaction.price = price
    if fee is not None:
        transaction.fee = fee
    if value is not None:
        transaction.value = value
    if value_eur is not None:
        transaction.value_eur = value_eur
    if split_ratio is not None:
        transaction.split_ratio = split_ratio
    
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    return transaction


def delete_transaction(session: Session, transaction_id: int) -> bool:
    """Delete a transaction"""
    transaction = session.get(Transaction, transaction_id)
    if transaction:
        session.delete(transaction)
        session.commit()
        return True
    return False


# ================== CSV Parser ==================

def clean_csv_number(value: str) -> Optional[float]:
    """
    Clean CSV number by removing thousand separators (commas) and converting to float.
    Returns None for empty strings.
    """
    if not value or value.strip() == "":
        return None
    # Remove commas used as thousand separators
    cleaned = value.replace(",", "")
    return float(cleaned)


def parse_csv_transactions(csv_content: str, portfolio_id: int) -> List[Transaction]:
    """
    Parse CSV content and create Transaction objects.
    
    CSV format:
    date_time,type,ticker,units,price,fee,value,EUR,split_ratio
    2/12/2020 20:14:40,Deposit,,,,,"3,000.00","2,760.27",
    2/12/2020 20:16:10,Buy,MSFT,15.00000001,183.69,0.00,"-2,755.35",,
    
    Args:
        csv_content: CSV string content
        portfolio_id: ID of the portfolio to associate transactions with
    
    Returns:
        List of Transaction objects (not yet added to database)
    """
    transactions = []
    csv_file = StringIO(csv_content)
    reader = csv.DictReader(csv_file)
    
    for row in reader:
        # Parse date_time (format: M/D/YYYY H:M:S)
        date_time = datetime.strptime(row["date_time"].strip(), "%m/%d/%Y %H:%M:%S")
        
        # Parse transaction type
        transaction_type = TransactionType(row["type"].strip())
        
        # Parse optional fields
        ticker = row["ticker"].strip() if row["ticker"].strip() else None
        units = clean_csv_number(row["units"])
        price = clean_csv_number(row["price"])
        fee = clean_csv_number(row["fee"]) or 0.0
        
        # Parse required value field
        value = clean_csv_number(row["value"])
        
        # Parse optional EUR value field
        value_eur = clean_csv_number(row["EUR"])
        
        # Parse optional split_ratio field
        split_ratio = clean_csv_number(row["split_ratio"])
        
        transaction = Transaction(
            portfolio_id=portfolio_id,
            date_time=date_time,
            type=transaction_type,
            ticker=ticker,
            units=units,
            price=price,
            fee=fee,
            value=value,
            value_eur=value_eur,
            split_ratio=split_ratio,
        )
        transactions.append(transaction)
    
    return transactions


def import_transactions_from_csv(
    session: Session, 
    csv_content: str, 
    portfolio_id: int
) -> List[Transaction]:
    """
    Parse CSV and import transactions into the database.
    
    Args:
        session: Database session
        csv_content: CSV string content
        portfolio_id: ID of the portfolio to associate transactions with
    
    Returns:
        List of created Transaction objects
    """
    # Verify portfolio exists
    portfolio = session.get(Portfolio, portfolio_id)
    if not portfolio:
        raise ValueError(f"Portfolio with ID {portfolio_id} does not exist")
    
    # Parse transactions
    transactions = parse_csv_transactions(csv_content, portfolio_id)
    
    # Add all transactions to database
    for transaction in transactions:
        session.add(transaction)
    
    session.commit()
    
    # Refresh all transactions
    for transaction in transactions:
        session.refresh(transaction)
    
    return transactions
