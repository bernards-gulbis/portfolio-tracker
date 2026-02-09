"""Check database state"""
from sqlmodel import Session, create_engine, select
from app.models import Portfolio, Transaction

engine = create_engine('sqlite:///./portfolio_tracker.db')
session = Session(engine)

portfolios = session.exec(select(Portfolio)).all()
print(f'Found {len(portfolios)} portfolios')
for p in portfolios:
    print(f'\nPortfolio ID: {p.id}, Name: {p.name}')
    transactions = session.exec(select(Transaction).where(Transaction.portfolio_id == p.id)).all()
    print(f'  Transactions: {len(transactions)}')
    for t in transactions[:3]:  # Show first 3
        print(f'    - {t.date}: {t.type.value} {t.ticker or ""} {t.currency or ""}')
