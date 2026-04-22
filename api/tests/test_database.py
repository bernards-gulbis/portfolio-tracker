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

    def test_run_migrations_invokes_alembic_upgrade_head(self):
        from app.core import database as db_module

        with (
            patch("alembic.command.upgrade") as mock_upgrade,
            patch("alembic.command.stamp") as mock_stamp,
            patch("alembic.config.Config") as mock_config_cls,
            patch("app.core.database.sa_inspect") as mock_inspect,
            patch("app.core.database.create_engine") as mock_engine,
        ):
            # Simulate empty DB: no stamping path taken.
            mock_inspector = MagicMock()
            mock_inspector.get_table_names.return_value = []
            mock_inspect.return_value = mock_inspector
            mock_engine.return_value = MagicMock()
            mock_cfg = MagicMock()
            mock_config_cls.return_value = mock_cfg
            db_module.run_migrations()

        mock_config_cls.assert_called_once()
        # env.py supplies sqlalchemy.url; run_migrations no longer sets it.
        mock_cfg.set_main_option.assert_not_called()
        mock_stamp.assert_not_called()
        mock_upgrade.assert_called_once_with(mock_cfg, "head")

    def test_run_migrations_auto_stamps_pre_alembic_db(self, tmp_path):
        """A DB populated by legacy create_db_and_tables (tables exist, no
        alembic_version) must be stamped to baseline before upgrade runs."""
        from sqlalchemy import create_engine
        from sqlmodel import SQLModel

        import app.models  # noqa: F401 — register tables on metadata

        db_path = tmp_path / "legacy.db"
        db_url = f"sqlite:///{db_path}"

        legacy = create_engine(db_url)
        SQLModel.metadata.create_all(legacy)
        legacy.dispose()

        from app.core import config as config_module
        from app.core import database as db_module

        with (
            patch.object(db_module, "DATABASE_URL", db_url),
            patch.object(config_module, "DATABASE_URL", db_url),
            patch.object(db_module, "engine", create_engine(db_url)),
        ):
            db_module.run_migrations()  # must not raise

        import sqlite3

        with sqlite3.connect(str(db_path)) as conn:
            tables = {
                r[0]
                for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            assert "alembic_version" in tables
            version = conn.execute(
                "SELECT version_num FROM alembic_version"
            ).fetchone()[0]
            assert version is not None and len(version) > 0

    def test_run_migrations_raises_when_ini_missing(self, tmp_path, monkeypatch):
        from app.core import database as db_module

        monkeypatch.setattr(
            db_module,
            "__file__",
            str(tmp_path / "a" / "b" / "c" / "database.py"),
        )
        with pytest.raises(RuntimeError, match=r"alembic\.ini not found"):
            db_module.run_migrations()
