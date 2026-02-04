"""
Transaction repository for data access
"""
from sqlmodel import Session, select
from typing import List, Optional
from app.models import Transaction


class TransactionRepository:
    """Repository for Transaction data access"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def create(self, transaction: Transaction) -> Transaction:
        """Create a new transaction"""
        self.session.add(transaction)
        self.session.commit()
        self.session.refresh(transaction)
        return transaction
    
    def bulk_create(self, transactions: List[Transaction]) -> List[Transaction]:
        """Create multiple transactions"""
        for transaction in transactions:
            self.session.add(transaction)
        self.session.commit()
        for transaction in transactions:
            self.session.refresh(transaction)
        return transactions
    
    def get_by_id(self, transaction_id: int) -> Optional[Transaction]:
        """Get a transaction by ID"""
        return self.session.get(Transaction, transaction_id)
    
    def get_by_portfolio_id(self, portfolio_id: int) -> List[Transaction]:
        """Get all transactions for a specific portfolio"""
        statement = select(Transaction).where(Transaction.portfolio_id == portfolio_id)
        return list(self.session.exec(statement).all())
    
    def update(self, transaction: Transaction) -> Transaction:
        """Update a transaction"""
        self.session.add(transaction)
        self.session.commit()
        self.session.refresh(transaction)
        return transaction
    
    def delete(self, transaction_id: int) -> bool:
        """Delete a transaction"""
        transaction = self.get_by_id(transaction_id)
        if transaction:
            self.session.delete(transaction)
            self.session.commit()
            return True
        return False
    
    def exists(self, transaction_id: int) -> bool:
        """Check if a transaction exists"""
        return self.get_by_id(transaction_id) is not None
