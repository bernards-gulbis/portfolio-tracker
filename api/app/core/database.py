from sqlmodel import SQLModel, create_engine, Session
from typing import Generator
import os
from sqlalchemy import event

# Get database URL from environment variable
# Default to SQLite for local development
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./portfolio_tracker.db"
)

# Determine if we're using PostgreSQL
is_postgresql = DATABASE_URL.startswith("postgresql://")

# Configure connection arguments based on database type
if is_postgresql:
    # PostgreSQL configuration
    connect_args = {}
    engine = create_engine(
        DATABASE_URL,
        echo=os.getenv("DATABASE_ECHO", "false").lower() == "true",
        pool_pre_ping=True,  # Verify connections before using
        pool_size=10,
        max_overflow=20
    )
else:
    # SQLite configuration
    connect_args = {
        "check_same_thread": False,  # Needed for SQLite
        "timeout": 30  # Set timeout for SQLite
    }
    engine = create_engine(
        DATABASE_URL,
        echo=os.getenv("DATABASE_ECHO", "false").lower() == "true",
        connect_args=connect_args
    )
    
    # Enable foreign key support for SQLite only
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def create_db_and_tables():
    """Create database tables"""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """Dependency to get database session"""
    with Session(engine) as session:
        yield session
