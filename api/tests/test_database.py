"""Tests for app/core/database.py — utility functions."""

from unittest.mock import MagicMock, patch

import pytest


class TestDatabaseUtilities:
    def test_verify_connection_success(self):
        from app.core import database as db_module

        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)

        with patch.object(db_module.engine, "connect", return_value=mock_conn):
            assert db_module.verify_connection() is True

    def test_verify_connection_failure_returns_false(self):
        from app.core import database as db_module

        with patch.object(
            db_module.engine,
            "connect",
            side_effect=Exception("connection refused"),
        ):
            result = db_module.verify_connection()
        assert result is False

    def test_create_db_and_tables_success(self):
        from app.core import database as db_module

        with patch("app.core.database.SQLModel.metadata.create_all") as mock_create:
            db_module.create_db_and_tables()
        mock_create.assert_called_once_with(db_module.engine)

    def test_create_db_and_tables_reraises_on_error(self):
        from app.core import database as db_module

        with (
            patch(
                "app.core.database.SQLModel.metadata.create_all",
                side_effect=RuntimeError("schema error"),
            ),
            pytest.raises(RuntimeError, match="schema error"),
        ):
            db_module.create_db_and_tables()

    def test_get_session_yields_session(self):
        from sqlmodel import Session as SqSession

        from app.core.database import get_session

        gen = get_session()
        s = next(gen)
        assert isinstance(s, SqSession)
        import contextlib

        with contextlib.suppress(StopIteration):
            next(gen)
