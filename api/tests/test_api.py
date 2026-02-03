"""
Comprehensive test suite for Portfolio Tracker API
"""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool
from datetime import datetime
from io import BytesIO

from database import get_session
from main import app
from models import Portfolio, Transaction, TransactionType


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


@pytest.fixture(name="client")
def client_fixture(session: Session):
    """Create a test client with dependency override"""
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override
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
    assert "transactions" in data


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
            "date_time": "2020-12-02T20:14:40",
            "type": "Deposit",
            "value": 3000.00,
            "fee": 0.0,
            "value_eur": 2760.27
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["type"] == "Deposit"
    assert data["value"] == 3000.00
    assert data["value_eur"] == 2760.27
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
            "date_time": "2020-12-02T20:16:10",
            "type": "Buy",
            "ticker": "MSFT",
            "units": 15.00000001,
            "price": 183.69,
            "fee": 0.0,
            "value": -2755.35,
            "value_eur": None,
            "split_ratio": None
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["type"] == "Buy"
    assert data["ticker"] == "MSFT"
    assert data["units"] == 15.00000001
    assert data["price"] == 183.69
    assert data["value"] == -2755.35


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
            "date_time": "2020-12-02T20:14:40",
            "type": "Deposit",
            "value": 3000.00,
            "fee": 0.0
        }
    )
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date_time": "2020-12-02T20:16:10",
            "type": "Buy",
            "ticker": "MSFT",
            "value": -2755.35,
            "fee": 0.0
        }
    )
    
    # Get transactions
    response = client.get(f"/portfolios/{portfolio_id}/transactions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["type"] == "Deposit"
    assert data[1]["type"] == "Buy"


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
            "date_time": "2020-12-02T20:14:40",
            "type": "Deposit",
            "value": 3000.00,
            "fee": 0.0
        }
    )
    transaction_id = transaction_response.json()["id"]
    
    # Update transaction
    response = client.put(
        f"/transactions/{transaction_id}",
        json={
            "value": 3500.00,
            "fee": 10.0
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["value"] == 3500.00
    assert data["fee"] == 10.0


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
            "date_time": "2020-12-02T20:14:40",
            "type": "Deposit",
            "value": 3000.00,
            "fee": 0.0
        }
    )
    transaction_id = transaction_response.json()["id"]
    
    # Delete transaction
    response = client.delete(f"/transactions/{transaction_id}")
    assert response.status_code == 204
    
    # Verify it's gone from portfolio (portfolio should still exist with 0 transactions)
    response = client.get(f"/portfolios/{portfolio_id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data["transactions"]) == 0


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
            "date_time": "2020-12-02T20:14:40",
            "type": "Deposit",
            "value": 3000.00,
            "fee": 0.0
        }
    )
    client.post(
        f"/portfolios/{portfolio_id}/transactions/",
        json={
            "date_time": "2020-12-02T20:16:10",
            "type": "Buy",
            "ticker": "MSFT",
            "value": -2755.35,
            "fee": 0.0
        }
    )
    
    # Verify transactions exist
    response = client.get(f"/portfolios/{portfolio_id}/transactions")
    assert len(response.json()) == 2
    
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
    csv_content = """date_time,type,ticker,units,price,fee,value,EUR,split_ratio
2/12/2020 20:14:40,Deposit,,,,,"3,000.00","2,760.27",
2/12/2020 20:16:10,Buy,MSFT,15.00000001,183.69,0.00,"-2,755.35",,
"""
    
    # Upload CSV
    files = {"file": ("transactions.csv", BytesIO(csv_content.encode()), "text/csv")}
    response = client.post(
        f"/portfolios/{portfolio_id}/upload",
        files=files
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["imported_count"] == 2
    assert len(data["transactions"]) == 2
    
    # Verify first transaction (Deposit)
    transaction1 = data["transactions"][0]
    assert transaction1["type"] == "Deposit"
    assert transaction1["value"] == 3000.00
    assert transaction1["value_eur"] == 2760.27
    
    # Verify second transaction (Buy)
    transaction2 = data["transactions"][1]
    assert transaction2["type"] == "Buy"
    assert transaction2["ticker"] == "MSFT"
    assert transaction2["units"] == 15.00000001
    assert transaction2["price"] == 183.69
    assert transaction2["value"] == -2755.35


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
        f"/portfolios/{portfolio_id}/upload",
        files=files
    )
    
    assert response.status_code == 400
    assert "CSV" in response.json()["detail"]


def test_csv_upload_nonexistent_portfolio(client: TestClient):
    """Test uploading CSV to a portfolio that doesn't exist"""
    csv_content = """date_time,type,ticker,units,price,fee,value,EUR,split_ratio
2/12/2020 20:14:40,Deposit,,,,,"3,000.00","2,760.27",
"""
    
    files = {"file": ("transactions.csv", BytesIO(csv_content.encode()), "text/csv")}
    response = client.post(
        "/portfolios/999/upload",
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
    csv_content = """date_time,type,ticker,units,price,fee,value,EUR,split_ratio
1/15/2020 10:00:00,Deposit,,,,,5000.00,4600.00,
1/16/2020 11:30:00,Buy,AAPL,10.5,150.00,5.00,-1580.00,,
2/20/2020 14:00:00,Dividend,AAPL,,,0.00,50.00,46.00,
3/10/2020 09:00:00,Split,AAPL,,,,0.00,,2.0
4/15/2020 16:00:00,Sell,AAPL,5.0,200.00,5.00,995.00,,
5/20/2020 10:00:00,Fee,,,,,10.00,9.20,
6/30/2020 17:00:00,Withdraw,,,,,"-1,000.00",-920.00,
"""
    
    files = {"file": ("transactions.csv", BytesIO(csv_content.encode()), "text/csv")}
    response = client.post(
        f"/portfolios/{portfolio_id}/upload",
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
    assert transactions[3]["split_ratio"] == 2.0
    assert transactions[4]["type"] == "Sell"
    assert transactions[5]["type"] == "Fee"
    assert transactions[6]["type"] == "Withdraw"


# ================== Health Check Test ==================

def test_root_endpoint(client: TestClient):
    """Test the root health check endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Portfolio Tracker API"
    assert data["status"] == "running"
