from sqlmodel import SQLModel, create_engine, Session
from typing import Generator
import logging
from sqlalchemy import event, text

from app.core.config import DATABASE_URL, DB_POOL_SIZE, DB_MAX_OVERFLOW, DATABASE_ECHO

logger = logging.getLogger(__name__)

# Determine if we're using PostgreSQL (supports both postgresql:// and postgres:// schemes)
is_postgresql = DATABASE_URL.startswith(("postgresql://", "postgres://"))

try:
    # Configure connection arguments based on database type
    if is_postgresql:
        # PostgreSQL configuration with SSL support
        connect_args = {
            "sslmode": "require",  # Enforce SSL for security
        }

        engine = create_engine(
            DATABASE_URL,
            echo=DATABASE_ECHO,
            connect_args=connect_args,
            pool_pre_ping=True,  # Verify connections before using
            pool_size=DB_POOL_SIZE,
            max_overflow=DB_MAX_OVERFLOW,
        )
        logger.info("PostgreSQL engine created (pool_size=%d, max_overflow=%d)", DB_POOL_SIZE, DB_MAX_OVERFLOW)
    else:
        # SQLite configuration
        connect_args = {
            "check_same_thread": False,  # Needed for SQLite
            "timeout": 30  # Set timeout for SQLite
        }
        engine = create_engine(
            DATABASE_URL,
            echo=DATABASE_ECHO,
            connect_args=connect_args,
        )
        logger.info("SQLite engine created")
        
        # Enable foreign key support for SQLite only
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_conn, connection_record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
except Exception as e:
    logger.error("Failed to create database engine: %s", e)
    raise RuntimeError(f"Database configuration error: {e}") from e


def create_db_and_tables():
    """Create database tables"""
    try:
        SQLModel.metadata.create_all(engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error("Failed to create database tables: %s", e)
        raise


def verify_connection():
    """Verify database connection is working"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection verified")
        return True
    except Exception as e:
        logger.error("Database connection failed: %s", e)
        return False


def get_session() -> Generator[Session, None, None]:
    """Dependency to get database session"""
    with Session(engine) as session:
        yield session
