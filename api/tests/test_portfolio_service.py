"""Tests for app.services.portfolio_service."""

import pytest
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

import app.models  # noqa: F401


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


class TestPortfolioServiceValidation:
    """Cover portfolio_service.py line 38: name > 255 chars raises."""

    def test_validate_name_too_long_raises(self, session: Session):
        from app.core.exceptions import InvalidPortfolioNameException
        from app.services.portfolio_service import PortfolioService

        svc = PortfolioService(session)
        long_name = "A" * 256
        with pytest.raises(InvalidPortfolioNameException, match="cannot exceed 255"):
            svc._validate_name(long_name)
