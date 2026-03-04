"""
Comprehensive test suite for Portfolio Tracker API
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool
from datetime import datetime, timedelta
from io import BytesIO
from unittest.mock import patch, Mock

from app.core import get_session
from app.core.auth import current_active_user
from main import app
from decimal import Decimal
from app.models import Portfolio, Transaction, TransactionType
from app.models.user import User
from app.models.historical_price import HistoricalPrice, FxRate  # noqa: F401 — ensures tables exist in test DB
from app.services.portfolio_service import _apply_transaction, _TxState


@pytest.fixture(name="session")
def session_fixture():
    """Create an in-memory SQLite database for testing"""
    from sqlalchemy import event

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Enable foreign key support for SQLite
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="test_user")
def test_user_fixture(session: Session):
    """Create and persist a test user"""
    user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="client")
def client_fixture(session: Session, test_user: User):
    """Create a test client with dependency overrides for session and auth"""
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[current_active_user] = lambda: test_user
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


# ================== Portfolio Tests ==================

def test_create_portfolio(client: TestClient):
    """Test creating a portfolio"""
    response = client.post(
        "/portfolios/",
        json={"name": "My Investment Portfolio"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Investment Portfolio"
    assert "id" in data
    assert "created_at" in data


def test_list_portfolios(client: TestClient):
    """Test listing portfolios"""
    # Create two portfolios
    client.post("/portfolios/", json={"name": "Portfolio 1"})
    client.post("/portfolios/", json={"name": "Portfolio 2"})
    
    # Get list
    response = client.get("/portfolios/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["name"] == "Portfolio 1"
    assert data[1]["name"] == "Portfolio 2"


def test_get_portfolio(client: TestClient):
    """Test getting a specific portfolio"""
    # Create portfolio
    create_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = create_response.json()["id"]
    
    # Get portfolio
    response = client.get(f"/portfolios/{portfolio_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Portfolio"
    assert data["id"] == portfolio_id


def test_get_nonexistent_portfolio(client: TestClient):
    """Test getting a portfolio that doesn't exist"""
    response = client.get("/portfolios/999")
    assert response.status_code == 404


def test_update_portfolio(client: TestClient):
    """Test updating a portfolio"""
    # Create portfolio
    create_response = client.post(
        "/portfolios/",
        json={"name": "Original Name"}
    )
    portfolio_id = create_response.json()["id"]
    
    # Update portfolio
    response = client.put(
        f"/portfolios/{portfolio_id}",
        json={"name": "Updated Name"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["id"] == portfolio_id


def test_delete_portfolio(client: TestClient):
    """Test deleting a portfolio"""
    # Create portfolio
    create_response = client.post(
        "/portfolios/",
        json={"name": "To Delete"}
    )
    portfolio_id = create_response.json()["id"]
    
    # Delete portfolio
    response = client.delete(f"/portfolios/{portfolio_id}")
    assert response.status_code == 204
    
    # Verify it's gone
    response = client.get(f"/portfolios/{portfolio_id}")
    assert response.status_code == 404


# ================== Transaction Tests ==================

def test_create_transaction(client: TestClient):
    """Test adding a transaction manually"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Add transaction
    response = client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2020-12-02T20:14:40",
            "type": "Deposit",
            "total_amount": 3000.00,
            "fee": 0.0,
            "eur_amount": 2760.27
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["type"] == "Deposit"
    assert data["total_amount"] == pytest.approx(3000.00)
    assert data["eur_amount"] == pytest.approx(2760.27)
    assert data["portfolio_id"] == portfolio_id
    assert "id" in data


def test_create_transaction_with_all_fields(client: TestClient):
    """Test adding a transaction with all optional fields"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Add buy transaction
    response = client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2020-12-02T20:16:10",
            "type": "Buy",
            "ticker": "MSFT",
            "quantity": 15.00000001,
            "price_per_share": 183.69,
            "fee": 0.0,
            "total_amount": -2755.35,
            "eur_amount": None,
            "split_ratio": None
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["type"] == "Buy"
    assert data["ticker"] == "MSFT"
    assert data["quantity"] == pytest.approx(15.00000001)
    assert data["price_per_share"] == pytest.approx(183.69)
    assert data["total_amount"] == pytest.approx(-2755.35)


def test_list_transactions(client: TestClient):
    """Test listing transactions for a portfolio"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Add two transactions
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2020-12-02T20:14:40",
            "type": "Deposit",
            "total_amount": 3000.00,
            "fee": 0.0
        }
    )
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2020-12-02T20:16:10",
            "type": "Buy",
            "ticker": "MSFT",
            "quantity": 15.0,
            "price_per_share": 183.69,
            "total_amount": -2755.35,
            "fee": 0.0
        }
    )
    
    # Get transactions
    response = client.get(f"/portfolios/{portfolio_id}/transactions")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["transactions"]) == 2
    # Transactions are ordered by date DESC, so Buy (20:16:10) comes before Deposit (20:14:40)
    assert data["transactions"][0]["type"] == "Buy"
    assert data["transactions"][1]["type"] == "Deposit"


def test_list_transactions_filter_by_ticker(client: TestClient):
    """Test filtering transactions by ticker (partial, case-insensitive)"""
    portfolio_response = client.post("/portfolios/", json={"name": "Filter Test"})
    portfolio_id = portfolio_response.json()["id"]

    client.post(f"/portfolios/{portfolio_id}/transactions/", json={
        "date": "2020-12-02T20:14:40", "type": "Buy", "ticker": "MSFT",
        "quantity": 10, "price_per_share": 200, "total_amount": -2000, "fee": 0
    })
    client.post(f"/portfolios/{portfolio_id}/transactions/", json={
        "date": "2020-12-02T20:15:00", "type": "Buy", "ticker": "AAPL",
        "quantity": 5, "price_per_share": 150, "total_amount": -750, "fee": 0
    })
    client.post(f"/portfolios/{portfolio_id}/transactions/", json={
        "date": "2020-12-02T20:16:00", "type": "Deposit", "total_amount": 5000, "fee": 0
    })

    # Exact ticker match
    response = client.get(f"/portfolios/{portfolio_id}/transactions", params={"ticker": "MSFT"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["transactions"][0]["ticker"] == "MSFT"

    # Case-insensitive partial match
    response = client.get(f"/portfolios/{portfolio_id}/transactions", params={"ticker": "ms"})
    data = response.json()
    assert data["total"] == 1
    assert data["transactions"][0]["ticker"] == "MSFT"

    # No match
    response = client.get(f"/portfolios/{portfolio_id}/transactions", params={"ticker": "GOOG"})
    data = response.json()
    assert data["total"] == 0
    assert len(data["transactions"]) == 0


def test_list_transactions_filter_by_type(client: TestClient):
    """Test filtering transactions by type"""
    portfolio_response = client.post("/portfolios/", json={"name": "Type Filter Test"})
    portfolio_id = portfolio_response.json()["id"]

    client.post(f"/portfolios/{portfolio_id}/transactions/", json={
        "date": "2020-12-02T20:14:40", "type": "Deposit", "total_amount": 5000, "fee": 0
    })
    client.post(f"/portfolios/{portfolio_id}/transactions/", json={
        "date": "2020-12-02T20:15:00", "type": "Buy", "ticker": "MSFT",
        "quantity": 10, "price_per_share": 200, "total_amount": -2000, "fee": 0
    })
    client.post(f"/portfolios/{portfolio_id}/transactions/", json={
        "date": "2020-12-02T20:16:00", "type": "Deposit", "total_amount": 3000, "fee": 0
    })

    # Filter by Buy
    response = client.get(f"/portfolios/{portfolio_id}/transactions", params={"type": "Buy"})
    data = response.json()
    assert data["total"] == 1
    assert data["transactions"][0]["type"] == "Buy"

    # Filter by Deposit
    response = client.get(f"/portfolios/{portfolio_id}/transactions", params={"type": "Deposit"})
    data = response.json()
    assert data["total"] == 2
    assert all(t["type"] == "Deposit" for t in data["transactions"])


def test_list_transactions_filter_combined(client: TestClient):
    """Test filtering transactions by ticker and type together"""
    portfolio_response = client.post("/portfolios/", json={"name": "Combined Filter Test"})
    portfolio_id = portfolio_response.json()["id"]

    client.post(f"/portfolios/{portfolio_id}/transactions/", json={
        "date": "2020-12-02T20:14:40", "type": "Buy", "ticker": "MSFT",
        "quantity": 10, "price_per_share": 200, "total_amount": -2000, "fee": 0
    })
    client.post(f"/portfolios/{portfolio_id}/transactions/", json={
        "date": "2020-12-02T20:15:00", "type": "Dividend", "ticker": "MSFT",
        "total_amount": 50
    })
    client.post(f"/portfolios/{portfolio_id}/transactions/", json={
        "date": "2020-12-02T20:16:00", "type": "Buy", "ticker": "AAPL",
        "quantity": 5, "price_per_share": 150, "total_amount": -750, "fee": 0
    })

    # Filter by ticker MSFT + type Buy
    response = client.get(f"/portfolios/{portfolio_id}/transactions", params={"ticker": "MSFT", "type": "Buy"})
    data = response.json()
    assert data["total"] == 1
    assert data["transactions"][0]["ticker"] == "MSFT"
    assert data["transactions"][0]["type"] == "Buy"

    # Filter by ticker MSFT (both types)
    response = client.get(f"/portfolios/{portfolio_id}/transactions", params={"ticker": "MSFT"})
    data = response.json()
    assert data["total"] == 2


def test_update_transaction(client: TestClient):
    """Test updating a transaction"""
    # Create portfolio and transaction
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    transaction_response = client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2020-12-02T20:14:40",
            "type": "Deposit",
            "total_amount": 3000.00,
            "fee": 0.0
        }
    )
    transaction_id = transaction_response.json()["id"]
    
    # Update transaction
    response = client.put(
        f"/transactions/{transaction_id}",
        json={
            "total_amount": 3500.00,
            "fee": 10.0
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_amount"] == pytest.approx(3500.00)
    assert data["fee"] == pytest.approx(10.0)


def test_delete_transaction(client: TestClient):
    """Test deleting a transaction"""
    # Create portfolio and transaction
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    transaction_response = client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2020-12-02T20:14:40",
            "type": "Deposit",
            "total_amount": 3000.00,
            "fee": 0.0
        }
    )
    transaction_id = transaction_response.json()["id"]
    
    # Delete transaction
    response = client.delete(f"/transactions/{transaction_id}")
    assert response.status_code == 204
    
    # Verify it's gone via paginated transactions endpoint
    response = client.get(f"/portfolios/{portfolio_id}/transactions")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0


def test_export_transactions_csv(client: TestClient):
    """Test exporting transactions to CSV"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Export Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Add multiple transactions
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2023-01-15T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.00,
            "eur_amount": 5000.00
        }
    )
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2023-01-16T11:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 10,
            "price_per_share": 150.00,
            "total_amount": -1500.00,
            "eur_amount": -1400.00,
            "fee": 2.50
        }
    )
    
    # Export to CSV
    response = client.get(f"/portfolios/{portfolio_id}/transactions/export")
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert "attachment" in response.headers["content-disposition"]
    
    # Verify CSV content
    csv_content = response.text
    lines = csv_content.strip().split('\n')
    assert len(lines) == 3  # Header + 2 transactions
    
    # Check header - must match import format
    header = lines[0]
    assert "date" in header
    assert "type" in header
    assert "ticker" in header
    assert "quantity" in header
    assert "price_per_share" in header
    assert "total_amount" in header
    assert "currency" in header
    assert "fx_rate" in header
    
    # Check first transaction (Deposit)
    assert "Deposit" in lines[1]
    assert "5000" in lines[1]
    
    # Check second transaction (Buy)
    assert "Buy" in lines[2]
    assert "AAPL" in lines[2]
    assert "10" in lines[2]
    assert "150" in lines[2]


def test_export_and_reimport_csv(client: TestClient):
    """Test that exported CSV can be re-imported"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Export-Import Test"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Add transactions
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2023-01-15T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.00,
            "eur_amount": 5000.00
        }
    )
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2023-01-16T11:30:45",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 10,
            "price_per_share": 150.00,
            "total_amount": -1500.00,
            "eur_amount": -1400.00,
            "fee": 2.50
        }
    )
    
    # Export CSV
    export_response = client.get(f"/portfolios/{portfolio_id}/transactions/export")
    assert export_response.status_code == 200
    csv_content = export_response.text
    
    # Create new portfolio for import
    portfolio2_response = client.post(
        "/portfolios/",
        json={"name": "Imported Portfolio"}
    )
    portfolio2_id = portfolio2_response.json()["id"]
    
    # Re-import the CSV
    from io import BytesIO
    csv_file = BytesIO(csv_content.encode('utf-8'))
    files = {"file": ("transactions.csv", csv_file, "text/csv")}
    import_response = client.post(
        f"/portfolios/{portfolio2_id}/transactions/import",
        files=files
    )
    
    assert import_response.status_code == 201
    import_data = import_response.json()
    assert import_data["imported_count"] == 2
    
    # Verify imported transactions match originals
    transactions_response = client.get(f"/portfolios/{portfolio2_id}/transactions").json()
    transactions = transactions_response["transactions"]
    assert len(transactions) == 2
    # Transactions are ordered by date DESC, so Buy (2023-01-16) comes before Deposit (2023-01-15)
    assert transactions[0]["type"] == "Buy"
    assert transactions[0]["ticker"] == "AAPL"
    assert transactions[0]["quantity"] == 10
    assert transactions[1]["type"] == "Deposit"
    assert transactions[1]["total_amount"] == pytest.approx(5000.00)


def test_export_transactions_csv_empty(client: TestClient):
    """Test exporting transactions when portfolio has no transactions"""
    # Create portfolio without transactions
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Empty Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Export to CSV
    response = client.get(f"/portfolios/{portfolio_id}/transactions/export")
    assert response.status_code == 200
    
    # Should have header only
    csv_content = response.text
    lines = csv_content.strip().split('\n')
    assert len(lines) == 1  # Header only


def test_export_transactions_csv_nonexistent_portfolio(client: TestClient):
    """Test exporting transactions for non-existent portfolio"""
    response = client.get("/portfolios/999/transactions/export")
    assert response.status_code == 404


def test_delete_portfolio_cascades_transactions(client: TestClient):
    """Test that deleting a portfolio also deletes its transactions"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Add transactions
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2020-12-02T20:14:40",
            "type": "Deposit",
            "total_amount": 3000.00,
            "fee": 0.0
        }
    )
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2020-12-02T20:16:10",
            "type": "Buy",
            "ticker": "MSFT",
            "quantity": 15.0,
            "price_per_share": 183.69,
            "total_amount": -2755.35,
            "fee": 0.0
        }
    )
    
    # Verify transactions exist
    response = client.get(f"/portfolios/{portfolio_id}/transactions")
    assert response.json()["total"] == 2
    
    # Delete portfolio
    response = client.delete(f"/portfolios/{portfolio_id}")
    assert response.status_code == 204
    
    # Verify portfolio is gone
    response = client.get(f"/portfolios/{portfolio_id}")
    assert response.status_code == 404


# ================== CSV Upload Tests ==================

def test_csv_upload(client: TestClient):
    """Test uploading a CSV file with transactions"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "CSV Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Create CSV content
    csv_content = """date,type,ticker,quantity,price_per_share,fee,total_amount,eur,split_ratio,currency,fx_rate
2/12/2020 20:14:40,Deposit,,,,,"3,000.00","2,760.27",,USD,1.0871
2/12/2020 20:16:10,Buy,MSFT,15.00000001,183.69,0.00,"-2,755.35",,,
"""
    
    # Upload CSV
    files = {"file": ("transactions.csv", BytesIO(csv_content.encode()), "text/csv")}
    response = client.post(
        f"/portfolios/{portfolio_id}/transactions/import",
        files=files
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["imported_count"] == 2
    assert len(data["transactions"]) == 2
    
    # Verify first transaction (Deposit)
    transaction1 = data["transactions"][0]
    assert transaction1["type"] == "Deposit"
    assert transaction1["total_amount"] == pytest.approx(3000.00)
    assert transaction1["eur_amount"] == pytest.approx(2760.27)
    assert transaction1["currency"] == "USD"
    assert transaction1["fx_rate"] == pytest.approx(1.0871)
    
    # Verify second transaction (Buy)
    transaction2 = data["transactions"][1]
    assert transaction2["type"] == "Buy"
    assert transaction2["ticker"] == "MSFT"
    assert transaction2["quantity"] == pytest.approx(15.00000001)
    assert transaction2["price_per_share"] == pytest.approx(183.69)
    assert transaction2["total_amount"] == pytest.approx(-2755.35)
    assert transaction2["currency"] is None
    assert transaction2["fx_rate"] is None


def test_csv_upload_invalid_file_type(client: TestClient):
    """Test uploading a non-CSV file"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Try to upload a .txt file
    files = {"file": ("transactions.txt", BytesIO(b"test"), "text/plain")}
    response = client.post(
        f"/portfolios/{portfolio_id}/transactions/import",
        files=files
    )
    
    assert response.status_code == 400
    assert "CSV" in response.json()["detail"]


def test_csv_upload_nonexistent_portfolio(client: TestClient):
    """Test uploading CSV to a portfolio that doesn't exist"""
    csv_content = """date,type,ticker,quantity,price_per_share,fee,total_amount,eur,split_ratio,currency,fx_rate
2/12/2020 20:14:40,Deposit,,,,,"3,000.00","2,760.27",,USD,1.0871
"""
    
    files = {"file": ("transactions.csv", BytesIO(csv_content.encode()), "text/csv")}
    response = client.post(
        "/portfolios/999/transactions/import",
        files=files
    )
    
    assert response.status_code == 404


def test_csv_with_complex_transactions(client: TestClient):
    """Test CSV with various transaction types including splits and dividends"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Complex CSV Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Create CSV with multiple transaction types (M/D/YYYY format required)
    csv_content = """date,type,ticker,quantity,price_per_share,fee,total_amount,eur,split_ratio,currency,fx_rate
1/15/2020 10:00:00,Deposit,,,,,5000.00,4600.00,,,
1/16/2020 11:30:00,Buy,AAPL,10.5,150.00,5.00,-1580.00,,,
2/20/2020 14:00:00,Dividend,AAPL,,,0.00,50.00,46.00,,,
3/10/2020 09:00:00,Split,AAPL,,,,0.00,,2.0,,
4/15/2020 16:00:00,Sell,AAPL,5.0,200.00,5.00,995.00,,,
5/20/2020 10:00:00,Fee,,,,,-10.00,-9.20,,,
6/30/2020 17:00:00,Withdraw,,,,,-1000.00,-920.00,,,
"""
    
    files = {"file": ("transactions.csv", BytesIO(csv_content.encode()), "text/csv")}
    response = client.post(
        f"/portfolios/{portfolio_id}/transactions/import",
        files=files
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["imported_count"] == 7
    
    # Verify transaction types
    transactions = data["transactions"]
    assert transactions[0]["type"] == "Deposit"
    assert transactions[1]["type"] == "Buy"
    assert transactions[2]["type"] == "Dividend"
    assert transactions[3]["type"] == "Split"
    assert transactions[3]["split_ratio"] == pytest.approx(2.0)
    assert transactions[4]["type"] == "Sell"
    assert transactions[5]["type"] == "Fee"
    assert transactions[6]["type"] == "Withdraw"


def test_csv_upload_invalid_fx_rate(client: TestClient):
    """Test CSV upload with invalid fx_rate values"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "FX Rate Validation Test"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Test with zero fx_rate
    csv_content_zero = """date,type,ticker,quantity,price_per_share,fee,total_amount,eur,split_ratio,currency,fx_rate
1/15/2020 10:00:00,Deposit,,,,,5000.00,4600.00,,USD,0.0
"""
    files = {"file": ("transactions.csv", BytesIO(csv_content_zero.encode()), "text/csv")}
    response = client.post(
        f"/portfolios/{portfolio_id}/transactions/import",
        files=files
    )
    assert response.status_code == 400
    assert "fx_rate must be positive" in response.json()["detail"].lower()
    
    # Test with negative fx_rate
    csv_content_negative = """date,type,ticker,quantity,price_per_share,fee,total_amount,eur,split_ratio,currency,fx_rate
1/15/2020 10:00:00,Deposit,,,,,5000.00,4600.00,,USD,-1.5
"""
    files = {"file": ("transactions.csv", BytesIO(csv_content_negative.encode()), "text/csv")}
    response = client.post(
        f"/portfolios/{portfolio_id}/transactions/import",
        files=files
    )
    assert response.status_code == 400
    assert "fx_rate must be positive" in response.json()["detail"].lower()


def test_copy_portfolio_with_transactions(client: TestClient):
    """Test copying a portfolio with all its transactions"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Original Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Add multiple transactions
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2023-01-15T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.00,
            "eur_amount": 5000.00
        }
    )
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2023-01-16T11:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 10,
            "price_per_share": 150.00,
            "total_amount": -1500.00,
            "eur_amount": -1500.00
        }
    )
    
    # Copy the portfolio
    copy_response = client.post(
        f"/portfolios/{portfolio_id}/copy",
        json={"new_name": "Copied Portfolio"}
    )
    assert copy_response.status_code == 201
    copied_data = copy_response.json()
    assert copied_data["name"] == "Copied Portfolio"
    copied_portfolio_id = copied_data["id"]
    assert copied_portfolio_id != portfolio_id
    
    # Verify original portfolio still has transactions
    original_tx_resp = client.get(f"/portfolios/{portfolio_id}/transactions", params={"sort_order": "asc"})
    original_transactions = original_tx_resp.json()["transactions"]
    assert len(original_transactions) == 2

    # Verify copied portfolio has all transactions
    copied_tx_resp = client.get(f"/portfolios/{copied_portfolio_id}/transactions", params={"sort_order": "asc"})
    copied_transactions = copied_tx_resp.json()["transactions"]
    assert len(copied_transactions) == 2

    # Verify transaction data matches (but with different IDs and portfolio_id)
    assert original_transactions[0]["type"] == copied_transactions[0]["type"]
    assert original_transactions[0]["total_amount"] == copied_transactions[0]["total_amount"]
    assert original_transactions[1]["ticker"] == copied_transactions[1]["ticker"]
    assert original_transactions[1]["quantity"] == copied_transactions[1]["quantity"]
    assert copied_transactions[0]["portfolio_id"] == copied_portfolio_id
    assert copied_transactions[1]["portfolio_id"] == copied_portfolio_id


def test_copy_portfolio_not_found(client: TestClient):
    """Test copying a non-existent portfolio"""
    response = client.post(
        "/portfolios/999/copy",
        json={"new_name": "Copy of Missing"}
    )
    assert response.status_code == 404


def test_copy_portfolio_invalid_name(client: TestClient):
    """Test copying with invalid name"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Original"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Try to copy with empty name
    response = client.post(
        f"/portfolios/{portfolio_id}/copy",
        json={"new_name": "   "}
    )
    assert response.status_code == 400


# ================== Portfolio Status Tests ==================

def test_portfolio_status_empty_portfolio(client: TestClient):
    """Test portfolio status with no transactions"""
    # Create empty portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Empty Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Get portfolio status
    response = client.get(f"/portfolios/{portfolio_id}/status")
    assert response.status_code == 200
    data = response.json()
    
    assert data["portfolio_id"] == portfolio_id
    assert data["portfolio_name"] == "Empty Portfolio"
    assert data["principal"] == pytest.approx(0.0)
    assert data["principal_eur"] == pytest.approx(0.0)
    assert data["dividends"] == pytest.approx(0.0)
    assert data["cash"] == pytest.approx(0.0)
    assert data["holdings"] == []
    assert data["realized_gains"] == pytest.approx(0.0)
    assert data["holdings_cost"] == pytest.approx(0.0)


def test_portfolio_status_with_deposit(client: TestClient):
    """Test portfolio status with deposit"""
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Add deposit
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 1000.0,
            "fee": 0.0
        }
    )
    
    # Get status
    response = client.get(f"/portfolios/{portfolio_id}/status")
    assert response.status_code == 200
    data = response.json()
    
    assert data["cash"] == pytest.approx(1000.0)
    assert data["principal"] == pytest.approx(1000.0)
    assert data["holdings"] == []


def test_portfolio_status_with_buy_transactions(client: TestClient):
    """Test portfolio status with stock purchases"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Investment Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Deposit money
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.0,
            "fee": 0.0
        }
    )
    
    # Buy AAPL
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 10.0,
            "price_per_share": 150.0,
            "total_amount": -1500.0,
            "fee": 1.0
        }
    )
    
    # Buy MSFT
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-03T10:00:00",
            "type": "Buy",
            "ticker": "MSFT",
            "quantity": 5.0,
            "price_per_share": 300.0,
            "total_amount": -1500.0,
            "fee": 1.0
        }
    )
    
    # Get status
    response = client.get(f"/portfolios/{portfolio_id}/status")
    assert response.status_code == 200
    data = response.json()
    
    assert data["cash"] == pytest.approx(2000.0)  # 5000 - 1500 - 1500 (fees included in values)
    assert data["principal"] == pytest.approx(5000.0)
    assert len(data["holdings"]) == 2
    
    # Check AAPL holding
    aapl_holding = next(h for h in data["holdings"] if h["ticker"] == "AAPL")
    assert aapl_holding["quantity"] == pytest.approx(10.0)
    assert aapl_holding["average_cost"] == pytest.approx(150.0)
    assert aapl_holding["total_cost"] == pytest.approx(1500.0)
    
    # Check MSFT holding
    msft_holding = next(h for h in data["holdings"] if h["ticker"] == "MSFT")
    assert msft_holding["quantity"] == pytest.approx(5.0)
    assert msft_holding["average_cost"] == pytest.approx(300.0)
    assert msft_holding["total_cost"] == pytest.approx(1500.0)
    
    assert data["holdings_cost"] == pytest.approx(3000.0)


def test_portfolio_status_with_sell_transactions(client: TestClient):
    """Test portfolio status with stock sales and realized gains"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Trading Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Deposit
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "fee": 0.0
        }
    )
    
    # Buy AAPL
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 20.0,
            "price_per_share": 100.0,
            "total_amount": -2000.0,
            "fee": 1.0
        }
    )
    
    # Sell half at a profit
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-10T10:00:00",
            "type": "Sell",
            "ticker": "AAPL",
            "quantity": 10.0,
            "price_per_share": 150.0,
            "total_amount": 1500.0,
            "fee": 1.0
        }
    )
    
    # Get status
    response = client.get(f"/portfolios/{portfolio_id}/status")
    assert response.status_code == 200
    data = response.json()
    
    assert data["cash"] == pytest.approx(9500.0)  # 10000 - 2000 + 1500 (fees included in values)
    assert data["principal"] == pytest.approx(10000.0)
    
    # Should have 10 AAPL left
    assert len(data["holdings"]) == 1
    aapl_holding = data["holdings"][0]
    assert aapl_holding["ticker"] == "AAPL"
    assert aapl_holding["quantity"] == pytest.approx(10.0)
    assert aapl_holding["average_cost"] == pytest.approx(100.0)
    assert aapl_holding["total_cost"] == pytest.approx(1000.0)
    
    # Realized gains: sold 10 shares at 1500 (includes -1 fee) - cost basis 10*100 (1000) = 500
    assert data["realized_gains"] == pytest.approx(500.0)


def test_portfolio_status_with_dividends(client: TestClient):
    """Test portfolio status with dividend income"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Dividend Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Deposit
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.0,
            "fee": 0.0
        }
    )
    
    # Buy stock
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 10.0,
            "price_per_share": 150.0,
            "total_amount": -1500.0,
            "fee": 1.0
        }
    )
    
    # Receive dividends
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-02-01T10:00:00",
            "type": "Dividend",
            "ticker": "AAPL",
            "total_amount": 50.0,
            "fee": 0.0
        }
    )
    
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-03-01T10:00:00",
            "type": "Dividend",
            "ticker": "AAPL",
            "total_amount": 50.0,
            "fee": 0.0
        }
    )
    
    # Get status
    response = client.get(f"/portfolios/{portfolio_id}/status")
    assert response.status_code == 200
    data = response.json()
    
    assert data["cash"] == pytest.approx(3600.0)  # 5000 - 1500 + 50 + 50 (fees included in values)
    assert data["dividends"] == pytest.approx(100.0)
    assert len(data["holdings"]) == 1


def test_portfolio_status_with_stock_split(client: TestClient):
    """Test portfolio status with stock split"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Split Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Deposit
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.0,
            "fee": 0.0
        }
    )
    
    # Buy stock
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 10.0,
            "price_per_share": 400.0,
            "total_amount": -4000.0,
            "fee": 1.0
        }
    )
    
    # 2:1 stock split
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-02-01T10:00:00",
            "type": "Split",
            "ticker": "AAPL",
            "split_ratio": 2.0,
            "total_amount": 0.0,
            "fee": 0.0
        }
    )
    
    # Get status
    response = client.get(f"/portfolios/{portfolio_id}/status")
    assert response.status_code == 200
    data = response.json()
    
    # After 2:1 split, should have 20 shares
    assert len(data["holdings"]) == 1
    aapl_holding = data["holdings"][0]
    assert aapl_holding["ticker"] == "AAPL"
    assert aapl_holding["quantity"] == pytest.approx(20.0)
    # Average cost per share after split: original cost basis $4000 / 20 shares = $200/share
    assert aapl_holding["average_cost"] == pytest.approx(200.0)
    assert aapl_holding["total_cost"] == pytest.approx(4000.0)


def test_portfolio_status_with_withdrawal(client: TestClient):
    """Test portfolio status with withdrawal"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Withdrawal Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Deposit
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.0,
            "fee": 0.0
        }
    )
    
    # Withdraw some cash
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-02-01T10:00:00",
            "type": "Withdraw",
            "total_amount": -2000.0,
            "fee": 0.0
        }
    )
    
    # Get status
    response = client.get(f"/portfolios/{portfolio_id}/status")
    assert response.status_code == 200
    data = response.json()
    
    assert data["cash"] == pytest.approx(3000.0)  # 5000 - 2000
    assert data["principal"] == pytest.approx(3000.0)  # 5000 - 2000


def test_portfolio_status_nonexistent_portfolio(client: TestClient):
    """Test portfolio status for a non-existent portfolio"""
    response = client.get("/portfolios/999/status")
    assert response.status_code == 404


# ================== Portfolio Status Validation Tests ==================

def test_portfolio_status_sell_without_holdings(client: TestClient):
    """Selling a ticker not in holdings produces a warning and skips the sell"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.0,
            "fee": 0.0
        }
    )

    # Try to sell AAPL without owning it
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Sell",
            "ticker": "AAPL",
            "quantity": 10.0,
            "price_per_share": 150.0,
            "total_amount": 1500.0,
            "fee": 1.0
        }
    )

    # Get status - should return 200 with a warning
    response = client.get(f"/portfolios/{portfolio_id}/status")
    assert response.status_code == 200
    data = response.json()
    assert any(w["code"] == "sellNotInHoldings" for w in data["warnings"])
    # Cash should not be inflated by the skipped sell
    assert data["cash"] == 5000.0


def test_portfolio_status_overselling(client: TestClient):
    """Overselling produces a warning and performs a partial sell of the held quantity"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit and buy
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.0,
            "fee": 0.0
        }
    )

    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 10.0,
            "price_per_share": 150.0,
            "total_amount": -1501.0,
            "fee": 1.0
        }
    )

    # Try to sell more than owned
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-03T10:00:00",
            "type": "Sell",
            "ticker": "AAPL",
            "quantity": 20.0,
            "price_per_share": 150.0,
            "total_amount": 3000.0,
            "fee": 1.0
        }
    )

    # Get status - should return 200 with a warning and partial sell
    response = client.get(f"/portfolios/{portfolio_id}/status")
    assert response.status_code == 200
    data = response.json()
    assert any(w["code"] == "sellOversell" for w in data["warnings"])
    # AAPL should be fully sold (partial sell of held 10 shares)
    assert len(data["holdings"]) == 0


def test_portfolio_status_floating_point_precision(client: TestClient):
    """Test portfolio status handles floating-point precision errors in sell validation"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Deposit
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "fee": 0.0
        }
    )
    
    # Buy 3.3 units
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "GOOGL",
            "quantity": 3.3,
            "price_per_share": 150.0,
            "total_amount": -495.0,
            "fee": 0.0
        }
    )
    
    # Buy another 3.4 units (total should be 6.7, but may be 6.699999999999999 due to float)
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-03T10:00:00",
            "type": "Buy",
            "ticker": "GOOGL",
            "quantity": 3.4,
            "price_per_share": 150.0,
            "total_amount": -510.0,
            "fee": 0.0
        }
    )
    
    # Sell exactly 6.7 units - should NOT fail due to floating-point precision
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-04T10:00:00",
            "type": "Sell",
            "ticker": "GOOGL",
            "quantity": 6.7,
            "price_per_share": 160.0,
            "total_amount": 1072.0,
            "fee": 0.0
        }
    )
    
    # Get status - should succeed without validation error
    response = client.get(f"/portfolios/{portfolio_id}/status")
    assert response.status_code == 200
    data = response.json()
    # Should have no holdings after selling all
    assert len(data["holdings"]) == 0 or data["holdings"][0]["quantity"] < 1e-8


def test_portfolio_status_invalid_split_ratio(client: TestClient):
    """Test portfolio status validation: split ratio must be positive"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Deposit and buy
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.0,
            "fee": 0.0
        }
    )
    
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 10.0,
            "price_per_share": 150.0,
            "total_amount": -1500.0,
            "fee": 1.0
        }
    )
    
    # Try split with invalid ratio - should fail at creation
    split_response = client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-03T10:00:00",
            "type": "Split",
            "ticker": "AAPL",
            "split_ratio": -2.0,
            "total_amount": 0.0,
            "fee": 0.0
        }
    )
    
    # Transaction creation should fail with validation error
    assert split_response.status_code == 422  # Unprocessable Entity (Pydantic validation error)
    assert "Split ratio must be greater than 0" in split_response.text




# ================== EUR Conversion and Tax Tests ==================

def test_portfolio_status_with_eur_conversion(client: TestClient):
    """Test portfolio status passes live FX rate and principal_eur to frontend"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "EUR Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit $10,000 with fx_rate = 1.1111 (meaning 1 EUR = 1.1111 USD)
    # This converts to: 10000 / 1.1111 = 9000 EUR
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "fx_rate": 1.1111,
            "fee": 0.0
        }
    )

    # Buy AAPL at $100 (10 shares = $1000)
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 10.0,
            "price_per_share": 100.0,
            "total_amount": -1000.0,
            "fee": 0.0
        }
    )

    # Mock USD to EUR rate: 0.85 (meaning 1 USD = 0.85 EUR)
    with patch('app.services.price_service.PriceService.get_usd_to_eur_rate', return_value=0.85):
        response = client.get(f"/portfolios/{portfolio_id}/status")

    assert response.status_code == 200
    data = response.json()

    # USD values (transaction-derived only)
    assert data["cash"] == pytest.approx(9000.0)
    assert data["principal"] == pytest.approx(10000.0)

    # Historical EUR values (unchanged)
    assert abs(data["principal_eur"] - 9000.0) < 0.1  # 10000 / 1.1111 ≈ 9000

    assert data["usd_to_eur_rate"] == pytest.approx(0.85)

    assert data["capital_gains_tax_rate"] == pytest.approx(0.255)


def test_portfolio_status_with_positive_capital_gains_tax(client: TestClient):
    """Test that live rate and principal_eur are returned for frontend tax computation"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Tax Test Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit $10,000 with EUR conversion at 1.0 (for simplicity)
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "fx_rate": 1.0,
            "fee": 0.0
        }
    )

    # Buy AAPL at $100 (100 shares = $10,000)
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 100.0,
            "price_per_share": 100.0,
            "total_amount": -10000.0,
            "fee": 0.0
        }
    )

    # Mock FX rate 1.0
    with patch('app.services.price_service.PriceService.get_usd_to_eur_rate', return_value=1.0):
        response = client.get(f"/portfolios/{portfolio_id}/status")

    assert response.status_code == 200
    data = response.json()

    # Transaction-derived values
    assert data["principal"] == pytest.approx(10000.0)

    # Historical EUR
    assert data["principal_eur"] == pytest.approx(10000.0)

    assert data["usd_to_eur_rate"] == pytest.approx(1.0)
    assert data["capital_gains_tax_rate"] == pytest.approx(0.255)


def test_portfolio_status_tax_excludes_dividends(client: TestClient):
    """Test that dividends_eur is returned for frontend dividend-aware tax computation"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Dividend Tax Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit $10,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "fx_rate": 1.0,
            "fee": 0.0
        }
    )

    # Buy AAPL
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 100.0,
            "price_per_share": 100.0,
            "total_amount": -10000.0,
            "fee": 0.0
        }
    )

    # Receive $2,000 dividend
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-06-01T10:00:00",
            "type": "Dividend",
            "ticker": "AAPL",
            "total_amount": 2000.0,
            "fx_rate": 1.0,
            "fee": 0.0
        }
    )
    
    with patch('app.services.price_service.PriceService.get_usd_to_eur_rate', return_value=1.0):
        response = client.get(f"/portfolios/{portfolio_id}/status")

    assert response.status_code == 200
    data = response.json()

    # Transaction-derived values
    assert data["cash"] == pytest.approx(2000.0)
    assert data["principal"] == pytest.approx(10000.0)
    assert data["dividends"] == pytest.approx(2000.0)
    # dividends_eur comes from historical per-transaction rate (fx_rate=1.0 → 2000 EUR)
    assert data["dividends_eur"] == pytest.approx(2000.0)
    assert data["capital_gains_tax_rate"] == pytest.approx(0.255)

    assert data["usd_to_eur_rate"] == pytest.approx(1.0)


def test_portfolio_status_dividend_eur_fallback_to_current_rate(client: TestClient):
    """Test that dividends without fx_rate fall back to current USD→EUR rate"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Dividend EUR Fallback Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit $10,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "fx_rate": 1.0,
            "fee": 0.0
        }
    )

    # Buy AAPL
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 100.0,
            "price_per_share": 100.0,
            "total_amount": -10000.0,
            "fee": 0.0
        }
    )

    # Receive dividend WITHOUT fx_rate — should fall back to current rate
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-06-01T10:00:00",
            "type": "Dividend",
            "ticker": "AAPL",
            "total_amount": 1000.0,
            "fee": 0.0
        }
    )

    with patch('app.services.price_service.PriceService.get_usd_to_eur_rate', return_value=0.92):
        response = client.get(f"/portfolios/{portfolio_id}/status")

    assert response.status_code == 200
    data = response.json()

    # Dividends exist in USD
    assert data["dividends"] == pytest.approx(1000.0)

    # dividends_eur computed via fallback rate (1000 * 0.92 = 920)
    assert data["dividends_eur"] == pytest.approx(920.0)

    # Live rate available for frontend tax computation
    assert data["usd_to_eur_rate"] == pytest.approx(0.92)


def test_portfolio_status_tax_none_when_dividend_eur_unavailable(client: TestClient):
    """Test that tax_eur is None when dividends exist and EUR fallback rate is also unavailable"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Missing Dividend EUR Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit $10,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "fx_rate": 1.0,
            "fee": 0.0
        }
    )

    # Buy AAPL
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 100.0,
            "price_per_share": 100.0,
            "total_amount": -10000.0,
            "fee": 0.0
        }
    )

    # Receive dividend WITHOUT fx_rate (EUR conversion unavailable)
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-06-01T10:00:00",
            "type": "Dividend",
            "ticker": "AAPL",
            "total_amount": 1000.0,
            "fee": 0.0
        }
    )

    # USD→EUR rate returns None (unavailable)
    with patch('app.services.price_service.PriceService.get_usd_to_eur_rate', return_value=None):
        response = client.get(f"/portfolios/{portfolio_id}/status")

    assert response.status_code == 200
    data = response.json()

    # Dividends exist in USD
    assert data["dividends"] == pytest.approx(1000.0)

    # dividends_eur is None (no fx_rate and fallback rate unavailable)
    assert data["dividends_eur"] is None

    # usd_to_eur_rate is None — frontend knows EUR conversion is unavailable
    assert data["usd_to_eur_rate"] is None


def test_portfolio_status_eur_none_when_exchange_rate_unavailable(client: TestClient):
    """Test that usd_to_eur_rate is None when exchange rate is unavailable"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "No Exchange Rate Test"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Deposit $10,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "fx_rate": 1.0,
            "fee": 0.0
        }
    )
    
    # Buy AAPL
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 100.0,
            "price_per_share": 100.0,
            "total_amount": -10000.0,
            "fee": 0.0
        }
    )
    
    # No exchange rate available
    with patch('app.services.price_service.PriceService.get_usd_to_eur_rate', return_value=None):
        response = client.get(f"/portfolios/{portfolio_id}/status")

    assert response.status_code == 200
    data = response.json()

    # Transaction-derived values
    assert data["principal"] == pytest.approx(10000.0)

    # usd_to_eur_rate is None — frontend shows '-' for all EUR-derived values
    assert data["usd_to_eur_rate"] is None

    # Historical EUR values should still be available
    assert data["principal_eur"] == pytest.approx(10000.0)  # Converted at historical rate


def test_portfolio_status_eur_conversion_with_different_rates(client: TestClient):
    """Test EUR conversion uses correct rates (historical for transactions, current for valuation)"""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Rate Difference Test"}
    )
    portfolio_id = portfolio_response.json()["id"]
    
    # Deposit $10,000 at historical fx_rate 1.10 (1 EUR = 1.10 USD)
    # Converts to: 10000 / 1.10 = 9090.91 EUR
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "fx_rate": 1.10,
            "fee": 0.0
        }
    )
    
    # Deposit another $5,000 at different historical fx_rate 1.05 (1 EUR = 1.05 USD)
    # Converts to: 5000 / 1.05 = 4761.90 EUR
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-02-01T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.0,
            "fx_rate": 1.05,
            "fee": 0.0
        }
    )
    
    # Mock current USD to EUR rate: 0.85 (meaning 1 USD = 0.85 EUR)
    with patch('app.services.price_service.PriceService.get_usd_to_eur_rate', return_value=0.85):
        response = client.get(f"/portfolios/{portfolio_id}/status")
    
    assert response.status_code == 200
    data = response.json()

    # Principal in USD
    assert data["principal"] == pytest.approx(15000.0)

    # Principal in EUR (using historical fx_rates)
    # 10000 / 1.10 + 5000 / 1.05 = 9090.91 + 4761.90 = 13852.81
    expected_principal_eur = 10000.0 / 1.10 + 5000.0 / 1.05
    assert abs(data["principal_eur"] - expected_principal_eur) < 0.01

    # Live rate passed to frontend for client-side EUR conversion
    assert data["usd_to_eur_rate"] == pytest.approx(0.85)

    # principal_eur = sum of all deposit EUR amounts at historical rates (no withdrawals)
    assert abs(data["principal_eur"] - expected_principal_eur) < 0.01


# ================== Health Check Test ==================

def test_root_endpoint(client: TestClient):
    """Test the root health check endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Portfolio Tracker API"
    assert data["status"] == "running"


# ================== Auth Tests ==================

def test_unauthenticated_returns_401(session: Session):
    """Endpoints without auth override should return 401"""
    # Only override session, not auth — so requests have no user
    app.dependency_overrides[get_session] = lambda: session
    try:
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/portfolios/")
        assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_cross_user_portfolio_returns_404(session: Session):
    """Accessing another user's portfolio should return 404"""
    from sqlalchemy import event

    # Create two users
    user_a = User(
        id=uuid.uuid4(),
        email="user_a@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    user_b = User(
        id=uuid.uuid4(),
        email="user_b@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    session.add(user_a)
    session.add(user_b)
    session.commit()

    # Create a portfolio owned by user_a
    portfolio = Portfolio(name="User A Portfolio", user_id=user_a.id)
    session.add(portfolio)
    session.commit()
    session.refresh(portfolio)
    portfolio_id = portfolio.id

    # Make request as user_b — should get 404 (not 403)
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[current_active_user] = lambda: user_b
    try:
        client = TestClient(app)
        response = client.get(f"/portfolios/{portfolio_id}")
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_cross_user_portfolio_write_returns_404(session: Session):
    """Updating or deleting another user's portfolio also returns 404"""
    user_a = User(
        id=uuid.uuid4(), email="ua@example.com", hashed_password="x",
        is_active=True, is_superuser=False, is_verified=True,
    )
    user_b = User(
        id=uuid.uuid4(), email="ub@example.com", hashed_password="x",
        is_active=True, is_superuser=False, is_verified=True,
    )
    session.add(user_a)
    session.add(user_b)
    session.commit()

    portfolio = Portfolio(name="User A Portfolio", user_id=user_a.id)
    session.add(portfolio)
    session.commit()
    session.refresh(portfolio)

    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[current_active_user] = lambda: user_b
    try:
        client = TestClient(app)
        assert client.put(f"/portfolios/{portfolio.id}", json={"name": "Renamed"}).status_code == 404
        assert client.delete(f"/portfolios/{portfolio.id}").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_register_new_user(session: Session):
    """POST /auth/register creates a new user and returns UserRead"""
    app.dependency_overrides[get_session] = lambda: session
    try:
        client = TestClient(app)
        response = client.post(
            "/auth/register",
            json={"email": "newuser@example.com", "password": "securepassword123"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert "id" in data
        assert data["is_active"] is True
        assert "hashed_password" not in data
    finally:
        app.dependency_overrides.clear()


def test_register_duplicate_email_returns_400(session: Session):
    """Registering with an already-registered email returns 400"""
    app.dependency_overrides[get_session] = lambda: session
    try:
        client = TestClient(app)
        client.post("/auth/register", json={"email": "dup@example.com", "password": "password123"})
        response = client.post(
            "/auth/register", json={"email": "dup@example.com", "password": "different123"}
        )
        assert response.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_register_sets_user_active_by_default(session: Session):
    """Newly registered users are active and not superusers"""
    app.dependency_overrides[get_session] = lambda: session
    try:
        client = TestClient(app)
        response = client.post(
            "/auth/register",
            json={"email": "active@example.com", "password": "securepassword123"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["is_active"] is True
        assert data["is_superuser"] is False
    finally:
        app.dependency_overrides.clear()


# ================== Performance Chart with Stock Split Tests ==================

def test_performance_chart_split_adjusted_prices(client: TestClient):
    """
    Verify the performance chart correctly handles Yahoo Finance split-adjusted
    prices.  Yahoo returns close prices divided by the cumulative split ratio
    for all dates, so pre-split date points would be drastically undervalued
    without the forward-split-factor correction.

    Scenario:
      - 2024-01-01: Deposit $6 000
      - 2024-01-02: Buy 10 shares of AAPL at $600 (total = -$6 000)
      - 2024-06-01: 4:1 stock split (quantity 10 → 40, total_amount = 0)

    Yahoo split-adjusted prices: $150 on every date (600 / 4).

    Without the fix, the pre-split value = 10 × $150 = $1 500 instead of $6 000.
    With the fix, the forward factor of 4 compensates: 10 × $150 × 4 = $6 000.
    """
    # Create portfolio
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Split Performance Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit $6 000 with EUR conversion at 1.0 for simplicity
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 6000.0,
            "eur_amount": 6000.0,
            "fee": 0.0,
        }
    )

    # Buy 10 shares of AAPL at $600 each
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 10.0,
            "price_per_share": 600.0,
            "total_amount": -6000.0,
            "fee": 0.0,
        }
    )

    # 4:1 stock split on 2024-06-01
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-06-01T10:00:00",
            "type": "Split",
            "ticker": "AAPL",
            "split_ratio": 4.0,
            "total_amount": 0.0,
            "fee": 0.0,
        }
    )

    # Mock Yahoo prices: split-adjusted $150 on all dates, EURUSD=X ≈ 1.0
    # (close price is always the post-split equivalent)
    def mock_historical_prices(tickers, start_date, end_date, max_workers=5, per_ticker_start=None):
        result = {}
        for ticker in tickers:
            prices = {}
            current = start_date
            while current <= end_date:
                date_str = current.strftime('%Y-%m-%d')
                if current.weekday() < 5:  # trading days only
                    if ticker == 'EURUSD=X':
                        prices[date_str] = 1.0  # 1 EUR = 1 USD
                    else:
                        prices[date_str] = 150.0  # split-adjusted price
                current += timedelta(days=1)
            result[ticker] = prices
        return result

    with patch(
        'app.services.price_service.PriceService.get_historical_prices_for_multiple_tickers',
        side_effect=mock_historical_prices,
    ):
        response = client.get(
            f"/portfolios/{portfolio_id}/performance",
            params={"num_points": 10},
        )

    assert response.status_code == 200
    data = response.json()
    points = data["data_points"]

    # There should be data points spanning 2024-01 through today
    assert len(points) > 0

    for pt in points:
        val = pt["current_value"]
        if val is None:
            continue
        # Portfolio is fully invested in one stock — value should always
        # equal the deposit amount ($6 000) regardless of whether the date
        # is before or after the split.  Any value far below deposit
        # would indicate the split-adjustment bug.
        assert val == pytest.approx(6000.0, rel=0.01), (
            f"date={pt['date']}: current_value={val}, expected ≈6000 "
            f"(return_pct={pt['return_pct']})"
        )


def test_performance_chart_multiple_splits(client: TestClient):
    """Verify forward-split-factor works with two successive splits."""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Multi-Split Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 12000.0,
            "eur_amount": 12000.0,
            "fee": 0.0,
        }
    )

    # Buy 10 shares at $1 200
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "TSLA",
            "quantity": 10.0,
            "price_per_share": 1200.0,
            "total_amount": -12000.0,
            "fee": 0.0,
        }
    )

    # First split 3:1 on 2024-04-01  (10 → 30 shares)
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-04-01T10:00:00",
            "type": "Split",
            "ticker": "TSLA",
            "split_ratio": 3.0,
            "total_amount": 0.0,
            "fee": 0.0,
        }
    )

    # Second split 2:1 on 2024-08-01  (30 → 60 shares)
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-08-01T10:00:00",
            "type": "Split",
            "ticker": "TSLA",
            "split_ratio": 2.0,
            "total_amount": 0.0,
            "fee": 0.0,
        }
    )

    # Yahoo price: split-adjusted = 1200 / 3 / 2 = $200 on all dates
    def mock_historical_prices(tickers, start_date, end_date, max_workers=5, per_ticker_start=None):
        result = {}
        for ticker in tickers:
            prices = {}
            current = start_date
            while current <= end_date:
                date_str = current.strftime('%Y-%m-%d')
                if current.weekday() < 5:
                    if ticker == 'EURUSD=X':
                        prices[date_str] = 1.0
                    else:
                        prices[date_str] = 200.0  # 1200 / 6
                current += timedelta(days=1)
            result[ticker] = prices
        return result

    with patch(
        'app.services.price_service.PriceService.get_historical_prices_for_multiple_tickers',
        side_effect=mock_historical_prices,
    ):
        response = client.get(
            f"/portfolios/{portfolio_id}/performance",
            params={"num_points": 10},
        )

    assert response.status_code == 200
    points = response.json()["data_points"]

    for pt in points:
        val = pt["current_value"]
        if val is None:
            continue
        # 10 × $200 × 6 = 12 000 before both splits
        # 30 × $200 × 2 = 12 000 between splits
        # 60 × $200 × 1 = 12 000 after both splits
        assert val == pytest.approx(12000.0, rel=0.01), (
            f"date={pt['date']}: current_value={val}, expected ≈12000"
        )


def test_performance_chart_no_splits(client: TestClient):
    """Verify that the forward-split-factor is a no-op when there are no splits."""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "No Split Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 5000.0,
            "eur_amount": 5000.0,
            "fee": 0.0,
        }
    )

    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "MSFT",
            "quantity": 20.0,
            "price_per_share": 250.0,
            "total_amount": -5000.0,
            "fee": 0.0,
        }
    )

    # Yahoo price: $250 (no split, just the actual price)
    def mock_historical_prices(tickers, start_date, end_date, max_workers=5, per_ticker_start=None):
        result = {}
        for ticker in tickers:
            prices = {}
            current = start_date
            while current <= end_date:
                date_str = current.strftime('%Y-%m-%d')
                if current.weekday() < 5:
                    if ticker == 'EURUSD=X':
                        prices[date_str] = 1.0
                    else:
                        prices[date_str] = 250.0
                current += timedelta(days=1)
            result[ticker] = prices
        return result

    with patch(
        'app.services.price_service.PriceService.get_historical_prices_for_multiple_tickers',
        side_effect=mock_historical_prices,
    ):
        response = client.get(
            f"/portfolios/{portfolio_id}/performance",
            params={"num_points": 5},
        )

    assert response.status_code == 200
    points = response.json()["data_points"]

    for pt in points:
        val = pt["current_value"]
        if val is None:
            continue
        # 20 × $250 = $5 000 — no split factor needed
        assert val == pytest.approx(5000.0, rel=0.01), (
            f"date={pt['date']}: current_value={val}, expected ≈5000"
        )


def test_performance_chart_missing_price_fallback(client: TestClient):
    """When Yahoo has no price data for a ticker (delisted/pre-IPO), fall back to cost basis
    instead of valuing the holding at $0."""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Missing Price Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit $10 000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "eur_amount": 10000.0,
            "fee": 0.0,
        }
    )

    # Buy 50 shares of GOOD at $100 = $5 000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "GOOD",
            "quantity": 50.0,
            "price_per_share": 100.0,
            "total_amount": -5000.0,
            "fee": 0.0,
        }
    )

    # Buy 25 shares of DELIST at $200 = $5 000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-03T10:00:00",
            "type": "Buy",
            "ticker": "DELIST",
            "quantity": 25.0,
            "price_per_share": 200.0,
            "total_amount": -5000.0,
            "fee": 0.0,
        }
    )

    # Mock: GOOD has prices ($100), DELIST has NO prices (empty dict — simulates delisted ticker)
    def mock_historical_prices(tickers, start_date, end_date, max_workers=5, per_ticker_start=None):
        result = {}
        for ticker in tickers:
            prices = {}
            current = start_date
            while current <= end_date:
                date_str = current.strftime('%Y-%m-%d')
                if current.weekday() < 5:
                    if ticker == 'EURUSD=X':
                        prices[date_str] = 1.0  # 1:1 USD/EUR
                    elif ticker == 'GOOD':
                        prices[date_str] = 100.0
                    # DELIST: no prices — empty dict
                current += timedelta(days=1)
            result[ticker] = prices
        return result

    with patch(
        'app.services.price_service.PriceService.get_historical_prices_for_multiple_tickers',
        side_effect=mock_historical_prices,
    ), patch(
        'app.services.price_service.PriceService.get_last_known_price',
        return_value=None,
    ):
        response = client.get(
            f"/portfolios/{portfolio_id}/performance",
            params={"num_points": 5},
        )

    assert response.status_code == 200
    points = response.json()["data_points"]

    for pt in points:
        val = pt["current_value"]
        if val is None:
            continue
        # GOOD: 50 × $100 = $5 000
        # DELIST: no price → cost basis fallback = $5 000
        # Total = $10 000 ≈ principal
        # Without the fallback, DELIST would be $0, giving $5 000 — a 50% loss
        assert val == pytest.approx(10000.0, rel=0.01), (
            f"date={pt['date']}: current_value={val}, expected ≈10000 "
            f"(cost basis fallback for DELIST)"
        )
        # return_pct should be ~0% (no gain/loss)
        ret = pt["return_pct"]
        if ret is not None:
            assert abs(ret) < 5.0, (
                f"date={pt['date']}: return_pct={ret}%, expected ≈0% with cost basis fallback"
            )


# ================== Sell Bug Tests (non-strict mode) ==================

def test_sell_non_strict_unknown_ticker():
    """Invalid sell of unknown ticker in non-strict mode should NOT inflate cash."""
    state = _TxState()
    state.cash = Decimal('5000')

    tx = Transaction(
        id=1,
        portfolio_id=1,
        date=datetime(2024, 1, 2),
        type=TransactionType.SELL,
        ticker="UNKNOWN",
        quantity=10.0,
        total_amount=1500.0,
    )
    _apply_transaction(state, tx, strict=False)

    # Cash should remain unchanged — the sell was skipped entirely
    assert state.cash == Decimal('5000')


def test_sell_non_strict_oversell():
    """Oversell in non-strict mode should NOT inflate cash."""
    state = _TxState()
    state.cash = Decimal('5000')
    state.holdings['AAPL'] = {'quantity': Decimal('5'), 'total_cost': Decimal('500')}

    tx = Transaction(
        id=1,
        portfolio_id=1,
        date=datetime(2024, 1, 2),
        type=TransactionType.SELL,
        ticker="AAPL",
        quantity=20.0,
        total_amount=3000.0,
    )
    _apply_transaction(state, tx, strict=False)

    # Cash should remain unchanged — the oversell was skipped entirely
    assert state.cash == Decimal('5000')
    # Holdings should remain untouched
    assert state.holdings['AAPL']['quantity'] == Decimal('5')


def test_sell_without_ticker():
    """Sell with no ticker should still credit cash (cash-only adjustment)."""
    state = _TxState()
    state.cash = Decimal('5000')

    tx = Transaction(
        id=1,
        portfolio_id=1,
        date=datetime(2024, 1, 2),
        type=TransactionType.SELL,
        ticker=None,
        quantity=None,
        total_amount=1500.0,
    )
    _apply_transaction(state, tx, strict=False)

    # Cash should increase by total_amount
    assert state.cash == Decimal('6500')


# ================== Performance Last Known Price Fallback Tests ==================

def test_performance_last_known_price_gap(client: TestClient):
    """CRC-type gap: ticker has some Yahoo data, then a gap period.
    The gap period should use last known price, not cost basis."""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Price Gap Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit $10,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "eur_amount": 10000.0,
            "fee": 0.0,
        }
    )

    # Buy 100 shares of CRC at $50 = $5,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "CRC",
            "quantity": 100.0,
            "price_per_share": 50.0,
            "total_amount": -5000.0,
            "fee": 0.0,
        }
    )

    # Buy 50 shares of GOOD at $100 = $5,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-03T10:00:00",
            "type": "Buy",
            "ticker": "GOOD",
            "quantity": 50.0,
            "price_per_share": 100.0,
            "total_amount": -5000.0,
            "fee": 0.0,
        }
    )

    # Mock: CRC has prices Jan-Mar ($60), then gap Apr onward.
    # GOOD has prices throughout ($100).
    gap_start = datetime(2024, 4, 1)

    def mock_historical_prices(tickers, start_date, end_date, max_workers=5, per_ticker_start=None):
        result = {}
        for ticker in tickers:
            prices = {}
            current = start_date
            while current <= end_date:
                date_str = current.strftime('%Y-%m-%d')
                if current.weekday() < 5:
                    if ticker == 'EURUSD=X':
                        prices[date_str] = 1.0
                    elif ticker == 'GOOD':
                        prices[date_str] = 100.0
                    elif ticker == 'CRC' and current < gap_start:
                        prices[date_str] = 60.0  # $60 before gap
                    # CRC after gap_start: no data (simulates Yahoo 400)
                current += timedelta(days=1)
            result[ticker] = prices
        return result

    with patch(
        'app.services.price_service.PriceService.get_historical_prices_for_multiple_tickers',
        side_effect=mock_historical_prices,
    ), patch(
        'app.services.price_service.PriceService.get_last_known_price',
        return_value=None,  # No DB cache either
    ):
        response = client.get(
            f"/portfolios/{portfolio_id}/performance",
            params={"start_date": "2024-01-01", "end_date": "2024-06-01", "num_points": 6},
        )

    assert response.status_code == 200
    points = response.json()["data_points"]

    for pt in points:
        val = pt["current_value"]
        if val is None:
            continue
        date_str = pt["date"]
        # Skip points before all buys are applied (buys on Jan 2 and Jan 3)
        if date_str < "2024-01-04":
            continue
        if date_str < "2024-04-01":
            # CRC at $60 (100 shares = $6000) + GOOD at $100 (50 shares = $5000) = $11,000
            assert val == pytest.approx(11000.0, rel=0.01), (
                f"date={date_str}: value={val}, expected ≈11000 (CRC has Yahoo data)"
            )
        else:
            # CRC gap: last known price from loop = $60, so still $11,000
            # (last known price is stored during the Jan-Mar iteration)
            assert val == pytest.approx(11000.0, rel=0.01), (
                f"date={date_str}: value={val}, expected ≈11000 (CRC using last known price)"
            )


def test_performance_delisted_db_fallback(client: TestClient):
    """TWTR-type ticker: Yahoo returns zero data. DB has a cached price.
    Should use DB-cached price instead of cost basis."""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Delisted DB Fallback Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit $10,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "eur_amount": 10000.0,
            "fee": 0.0,
        }
    )

    # Buy 100 shares of TWTR at $50 = $5,000 (cost basis)
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "TWTR",
            "quantity": 100.0,
            "price_per_share": 50.0,
            "total_amount": -5000.0,
            "fee": 0.0,
        }
    )

    # Buy 50 shares of GOOD at $100 = $5,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-03T10:00:00",
            "type": "Buy",
            "ticker": "GOOD",
            "quantity": 50.0,
            "price_per_share": 100.0,
            "total_amount": -5000.0,
            "fee": 0.0,
        }
    )

    # Mock: TWTR has NO Yahoo data at all, GOOD has prices ($100)
    # DB has a cached last known price for TWTR of $54.20
    def mock_historical_prices(tickers, start_date, end_date, max_workers=5, per_ticker_start=None):
        result = {}
        for ticker in tickers:
            prices = {}
            current = start_date
            while current <= end_date:
                date_str = current.strftime('%Y-%m-%d')
                if current.weekday() < 5:
                    if ticker == 'EURUSD=X':
                        prices[date_str] = 1.0
                    elif ticker == 'GOOD':
                        prices[date_str] = 100.0
                    # TWTR: empty — no Yahoo data at all
                current += timedelta(days=1)
            result[ticker] = prices
        return result

    with patch(
        'app.services.price_service.PriceService.get_historical_prices_for_multiple_tickers',
        side_effect=mock_historical_prices,
    ), patch(
        'app.services.price_service.PriceService.get_last_known_price',
        side_effect=lambda t: 54.20 if t == 'TWTR' else None,
    ):
        response = client.get(
            f"/portfolios/{portfolio_id}/performance",
            params={"num_points": 5},
        )

    assert response.status_code == 200
    points = response.json()["data_points"]

    for pt in points:
        val = pt["current_value"]
        if val is None:
            continue
        # Skip points before all buys are applied (buys on Jan 2 and Jan 3)
        if pt["date"] < "2024-01-04":
            continue
        # TWTR: 100 × $54.20 = $5,420 (DB-cached price)
        # GOOD: 50 × $100 = $5,000
        # Total = $10,420
        assert val == pytest.approx(10420.0, rel=0.01), (
            f"date={pt['date']}: value={val}, expected ≈10420 (TWTR using DB-cached $54.20)"
        )


def test_performance_delisted_no_cache(client: TestClient):
    """Fully missing ticker: no Yahoo data, no DB cache.
    Should gracefully fall back to cost basis."""
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "No Cache Fallback Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit $10,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "eur_amount": 10000.0,
            "fee": 0.0,
        }
    )

    # Buy 100 shares of GONE at $50 = $5,000 (cost basis)
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "GONE",
            "quantity": 100.0,
            "price_per_share": 50.0,
            "total_amount": -5000.0,
            "fee": 0.0,
        }
    )

    # Buy 50 shares of GOOD at $100 = $5,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-03T10:00:00",
            "type": "Buy",
            "ticker": "GOOD",
            "quantity": 50.0,
            "price_per_share": 100.0,
            "total_amount": -5000.0,
            "fee": 0.0,
        }
    )

    # Mock: GONE has NO Yahoo data, NO DB cache. GOOD has prices.
    def mock_historical_prices(tickers, start_date, end_date, max_workers=5, per_ticker_start=None):
        result = {}
        for ticker in tickers:
            prices = {}
            current = start_date
            while current <= end_date:
                date_str = current.strftime('%Y-%m-%d')
                if current.weekday() < 5:
                    if ticker == 'EURUSD=X':
                        prices[date_str] = 1.0
                    elif ticker == 'GOOD':
                        prices[date_str] = 100.0
                    # GONE: empty
                current += timedelta(days=1)
            result[ticker] = prices
        return result

    with patch(
        'app.services.price_service.PriceService.get_historical_prices_for_multiple_tickers',
        side_effect=mock_historical_prices,
    ), patch(
        'app.services.price_service.PriceService.get_last_known_price',
        return_value=None,  # No DB cache
    ):
        response = client.get(
            f"/portfolios/{portfolio_id}/performance",
            params={"num_points": 5},
        )

    assert response.status_code == 200
    points = response.json()["data_points"]

    for pt in points:
        val = pt["current_value"]
        if val is None:
            continue
        # Skip points before all buys are applied (buys on Jan 2 and Jan 3)
        if pt["date"] < "2024-01-04":
            continue
        # GONE: no price → cost basis $5,000
        # GOOD: 50 × $100 = $5,000
        # Total = $10,000
        assert val == pytest.approx(10000.0, rel=0.01), (
            f"date={pt['date']}: value={val}, expected ≈10000 (GONE using cost basis)"
        )


# ================== Time-Weighted Return Tests ==================

def test_performance_twr_mid_period_deposit(client: TestClient):
    """TWR should not be inflated by a mid-period deposit.

    Scenario:
      - Day 1: Deposit $10,000, buy 100 shares at $100
      - Day 5: Deposit another $10,000 (cash only)
      - All days: price stays at $100

    Expected: return_pct ≈ 0% throughout (no price change → no return).
    A naive return formula would show ~0% early but jump when the deposit
    inflates the denominator. TWR chains sub-period returns and stays at 0%.
    """
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "TWR Mid-Deposit Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Day 1: Deposit + Buy
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "eur_amount": 10000.0,
            "fee": 0.0,
        }
    )
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Buy",
            "ticker": "FLAT",
            "quantity": 100.0,
            "price_per_share": 100.0,
            "total_amount": -10000.0,
            "fee": 0.0,
        }
    )

    # Day 5: Another deposit (cash only, no buy)
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-05T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "eur_amount": 10000.0,
            "fee": 0.0,
        }
    )

    # Mock: FLAT always $100
    def mock_historical_prices(tickers, start_date, end_date, max_workers=5, per_ticker_start=None):
        result = {}
        for ticker in tickers:
            prices = {}
            current = start_date
            while current <= end_date:
                date_str = current.strftime('%Y-%m-%d')
                if current.weekday() < 5:
                    if ticker == 'EURUSD=X':
                        prices[date_str] = 1.0
                    else:
                        prices[date_str] = 100.0
                current += timedelta(days=1)
            result[ticker] = prices
        return result

    with patch(
        'app.services.price_service.PriceService.get_historical_prices_for_multiple_tickers',
        side_effect=mock_historical_prices,
    ):
        response = client.get(
            f"/portfolios/{portfolio_id}/performance",
            params={"num_points": 10},
        )

    assert response.status_code == 200
    points = response.json()["data_points"]
    assert len(points) > 0

    for pt in points:
        rp = pt["return_pct"]
        if rp is None:
            continue
        # TWR should be ~0% everywhere since price never changed
        assert rp == pytest.approx(0.0, abs=0.1), (
            f"date={pt['date']}: return_pct={rp}, expected ≈0%"
        )


def test_performance_twr_price_gain(client: TestClient):
    """TWR correctly reflects pure price appreciation.

    Scenario:
      - Day 1: Deposit $10,000, buy 100 shares at $100
      - All days after: price = $110 (10% gain)
    """
    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "TWR Gain Test"}
    )
    portfolio_id = portfolio_response.json()["id"]

    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "eur_amount": 10000.0,
            "fee": 0.0,
        }
    )
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Buy",
            "ticker": "GAIN",
            "quantity": 100.0,
            "price_per_share": 100.0,
            "total_amount": -10000.0,
            "fee": 0.0,
        }
    )

    def mock_historical_prices(tickers, start_date, end_date, max_workers=5, per_ticker_start=None):
        result = {}
        for ticker in tickers:
            prices = {}
            current = start_date
            while current <= end_date:
                date_str = current.strftime('%Y-%m-%d')
                if current.weekday() < 5:
                    if ticker == 'EURUSD=X':
                        prices[date_str] = 1.0
                    elif date_str == '2024-01-01':
                        prices[date_str] = 100.0
                    else:
                        prices[date_str] = 110.0
                current += timedelta(days=1)
            result[ticker] = prices
        return result

    with patch(
        'app.services.price_service.PriceService.get_historical_prices_for_multiple_tickers',
        side_effect=mock_historical_prices,
    ):
        response = client.get(
            f"/portfolios/{portfolio_id}/performance",
            params={"num_points": 10},
        )

    assert response.status_code == 200
    points = response.json()["data_points"]

    # Check last few points — all should show ~10% TWR
    for pt in points:
        rp = pt["return_pct"]
        if rp is None or pt["date"] <= "2024-01-01":
            continue
        assert rp == pytest.approx(10.0, abs=0.5), (
            f"date={pt['date']}: return_pct={rp}, expected ≈10%"
        )


# ================== Tax Rate Tests ==================

def test_user_default_tax_rate(session: Session):
    """New users should have default tax_rate of 0.255"""
    user = User(
        id=uuid.uuid4(),
        email="taxdefault@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    assert float(user.tax_rate) == pytest.approx(0.255)


def test_user_custom_tax_rate(session: Session):
    """Users can have a custom tax_rate"""
    user = User(
        id=uuid.uuid4(),
        email="taxcustom@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        tax_rate=Decimal('0.15'),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    assert float(user.tax_rate) == pytest.approx(0.15)


def test_portfolio_status_uses_custom_tax_rate(client: TestClient, test_user: User, session: Session):
    """Portfolio status should use the user's custom tax_rate"""
    # Set a custom tax rate on the test user
    test_user.tax_rate = Decimal('0.15')
    session.add(test_user)
    session.commit()
    session.refresh(test_user)

    portfolio_response = client.post(
        "/portfolios/",
        json={"name": "Custom Tax Portfolio"}
    )
    portfolio_id = portfolio_response.json()["id"]

    # Deposit $10,000
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 10000.0,
            "fx_rate": 1.0,
            "fee": 0.0
        }
    )

    # Buy AAPL at $100 (100 shares)
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-02T10:00:00",
            "type": "Buy",
            "ticker": "AAPL",
            "quantity": 100.0,
            "price_per_share": 100.0,
            "total_amount": -10000.0,
            "fee": 0.0
        }
    )

    # Mock FX rate 1.0
    with patch('app.services.price_service.PriceService.get_usd_to_eur_rate', return_value=1.0):
        response = client.get(f"/portfolios/{portfolio_id}/status")

    assert response.status_code == 200
    data = response.json()

    # Custom tax rate is returned for frontend computation
    assert data["capital_gains_tax_rate"] == pytest.approx(0.15)
    # Live rate for frontend
    assert data["usd_to_eur_rate"] == pytest.approx(1.0)


# ==================== TransactionUpdate Validation ====================

def test_transaction_update_validates_invalid_ticker(client: TestClient):
    """TransactionUpdate should reject tickers with invalid characters"""
    from pydantic import ValidationError
    from app.schemas.schemas import TransactionUpdate

    with pytest.raises(ValidationError, match="Ticker must contain only alphanumeric"):
        TransactionUpdate(ticker="AAPL$$$")


def test_transaction_update_validates_negative_fee(client: TestClient):
    """TransactionUpdate should reject negative fees"""
    from pydantic import ValidationError
    from app.schemas.schemas import TransactionUpdate

    with pytest.raises(ValidationError, match="Fee must be positive"):
        TransactionUpdate(fee=-5.0)


def test_transaction_update_validates_zero_split_ratio(client: TestClient):
    """TransactionUpdate should reject zero split_ratio"""
    from pydantic import ValidationError
    from app.schemas.schemas import TransactionUpdate

    with pytest.raises(ValidationError, match="Split ratio must be greater than 0"):
        TransactionUpdate(split_ratio=0.0)


def test_transaction_update_validates_negative_split_ratio(client: TestClient):
    """TransactionUpdate should reject negative split_ratio"""
    from pydantic import ValidationError
    from app.schemas.schemas import TransactionUpdate

    with pytest.raises(ValidationError, match="Split ratio must be greater than 0"):
        TransactionUpdate(split_ratio=-2.0)


def test_transaction_update_normalizes_ticker(client: TestClient):
    """TransactionUpdate should normalize ticker to uppercase"""
    from app.schemas.schemas import TransactionUpdate

    update = TransactionUpdate(ticker="aapl")
    assert update.ticker == "AAPL"


def test_transaction_update_valid_fields_pass(client: TestClient):
    """TransactionUpdate should accept valid field values"""
    from app.schemas.schemas import TransactionUpdate

    update = TransactionUpdate(ticker="AAPL", fee=1.5, split_ratio=2.0)
    assert update.ticker == "AAPL"
    assert update.fee == pytest.approx(1.5)
    assert update.split_ratio == pytest.approx(2.0)


def test_transaction_update_api_rejects_invalid_ticker(client: TestClient):
    """PUT /transactions/:id should reject invalid ticker via TransactionUpdate validation"""
    portfolio_response = client.post("/portfolios/", json={"name": "Validation Test"})
    portfolio_id = portfolio_response.json()["id"]

    tx_response = client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 1000.0,
            "fee": 0.0,
        },
    )
    tx_id = tx_response.json()["id"]

    response = client.put(f"/transactions/{tx_id}", json={"ticker": "BAD$TICK"})
    assert response.status_code == 422


def test_transaction_update_api_rejects_negative_fee(client: TestClient):
    """PUT /transactions/:id should reject negative fee via TransactionUpdate validation"""
    portfolio_response = client.post("/portfolios/", json={"name": "Validation Test 2"})
    portfolio_id = portfolio_response.json()["id"]

    tx_response = client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date": "2024-01-01T10:00:00",
            "type": "Deposit",
            "total_amount": 1000.0,
            "fee": 0.0,
        },
    )
    tx_id = tx_response.json()["id"]

    response = client.put(f"/transactions/{tx_id}", json={"fee": -10.0})
    assert response.status_code == 422


# ================== Transaction Warning Unit Tests ==================

def test_warning_sell_unknown_ticker_strict():
    """Strict sell of unknown ticker appends a warning and skips."""
    state = _TxState()
    state.cash = Decimal('5000')

    tx = Transaction(
        id=1,
        portfolio_id=1,
        date=datetime(2024, 1, 2),
        type=TransactionType.SELL,
        ticker="UNKNOWN",
        quantity=10.0,
        total_amount=1500.0,
    )
    _apply_transaction(state, tx, strict=True)

    assert state.cash == Decimal('5000')  # sell skipped
    assert len(state.warnings) == 1
    assert state.warnings[0]['code'] == 'sellNotInHoldings'
    assert state.warnings[0]['date'] == '2024-01-02T00:00:00'
    assert state.warnings[0]['params']['ticker'] == 'UNKNOWN'


def test_warning_oversell_partial_strict():
    """Strict oversell appends a warning and executes a partial sell."""
    state = _TxState()
    state.cash = Decimal('5000')
    state.holdings['AAPL'] = {'quantity': Decimal('5'), 'total_cost': Decimal('500')}

    tx = Transaction(
        id=1,
        portfolio_id=1,
        date=datetime(2024, 1, 2),
        type=TransactionType.SELL,
        ticker="AAPL",
        quantity=20.0,
        total_amount=3000.0,
    )
    _apply_transaction(state, tx, strict=True)

    assert len(state.warnings) == 1
    assert state.warnings[0]['code'] == 'sellOversell'
    assert state.warnings[0]['date'] == '2024-01-02T00:00:00'
    assert state.warnings[0]['params']['ticker'] == 'AAPL'
    # Holdings should be cleared (partial sell of all 5 shares)
    assert 'AAPL' not in state.holdings
    # Cash should increase by proportional total: 3000 * (5/20) = 750
    assert state.cash == Decimal('5750')
    # Realized gains: 750 proceeds - 500 cost basis = 250
    assert state.realized_gains == Decimal('250')


def test_warning_withdraw_negative_cash():
    """Withdrawal causing negative cash appends a warning but still applies."""
    state = _TxState()
    state.cash = Decimal('100')

    tx = Transaction(
        id=1,
        portfolio_id=1,
        date=datetime(2024, 1, 2),
        type=TransactionType.WITHDRAW,
        total_amount=-500.0,
    )
    _apply_transaction(state, tx, strict=True)

    assert state.cash == Decimal('-400')
    assert state.principal == Decimal('-500')
    assert len(state.warnings) == 1
    assert state.warnings[0]['code'] == 'withdrawNegativeCash'
    assert state.warnings[0]['date'] == '2024-01-02T00:00:00'


def test_no_warnings_in_non_strict_mode():
    """Non-strict mode should never append warnings, only skip silently."""
    state = _TxState()
    state.cash = Decimal('5000')
    state.holdings['AAPL'] = {'quantity': Decimal('5'), 'total_cost': Decimal('500')}

    # Oversell in non-strict mode
    tx = Transaction(
        id=1,
        portfolio_id=1,
        date=datetime(2024, 1, 2),
        type=TransactionType.SELL,
        ticker="AAPL",
        quantity=20.0,
        total_amount=3000.0,
    )
    _apply_transaction(state, tx, strict=False)

    assert len(state.warnings) == 0
    assert state.cash == Decimal('5000')
    assert state.holdings['AAPL']['quantity'] == Decimal('5')


# ================== Live Prices Tests ==================

def test_live_prices_with_tickers(client: TestClient):
    """Test /prices/live returns prices and FX rate for given tickers"""
    with patch("app.routers.portfolios.PriceService") as mock_ps:
        mock_ps.get_current_prices.return_value = {"AAPL": 192.5, "MSFT": 410.0}
        mock_ps.get_usd_to_eur_rate_safe.return_value = 0.91

        response = client.get("/portfolios/prices/live", params={"tickers": ["AAPL", "MSFT"]})

    assert response.status_code == 200
    data = response.json()
    assert data["prices"] == {"AAPL": 192.5, "MSFT": 410.0}
    assert data["usd_to_eur_rate"] == 0.91
    assert "timestamp" in data
    mock_ps.get_current_prices.assert_called_once_with(["AAPL", "MSFT"])


def test_live_prices_empty_tickers(client: TestClient):
    """Test /prices/live with no tickers returns empty prices dict"""
    with patch("app.routers.portfolios.PriceService") as mock_ps:
        mock_ps.get_usd_to_eur_rate_safe.return_value = 0.92

        response = client.get("/portfolios/prices/live")

    assert response.status_code == 200
    data = response.json()
    assert data["prices"] == {}
    assert data["usd_to_eur_rate"] == 0.92
    mock_ps.get_current_prices.assert_not_called()


def test_live_prices_fx_rate_failure(client: TestClient):
    """Test /prices/live gracefully handles FX rate fetch failure"""
    with patch("app.routers.portfolios.PriceService") as mock_ps:
        mock_ps.get_current_prices.return_value = {"AAPL": 192.5}
        mock_ps.get_usd_to_eur_rate_safe.return_value = None

        response = client.get("/portfolios/prices/live", params={"tickers": ["AAPL"]})

    assert response.status_code == 200
    data = response.json()
    assert data["prices"] == {"AAPL": 192.5}
    assert data["usd_to_eur_rate"] is None
