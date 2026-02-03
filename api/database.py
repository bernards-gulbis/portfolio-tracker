from sqlmodel import SQLModel, create_engine, Session
from typing import Generator

# SQLite database URL
DATABASE_URL = "sqlite:///./portfolio_tracker.db"

# Create engine
engine = create_engine(
    DATABASE_URL,
    echo=True,  # Set to False in production
    connect_args={
        "check_same_thread": False,  # Needed for SQLite
        "timeout": 30  # Set timeout for SQLite
    }
)

# Enable foreign key support for SQLite
from sqlalchemy import event

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
