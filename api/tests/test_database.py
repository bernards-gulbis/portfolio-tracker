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

    def test_money_columns_guardrail_passes_on_current_schema(self, tmp_path):
        """SQLModel.metadata.create_all declares Decimal for money columns;
        the guardrail must accept such a schema."""
        from sqlalchemy import create_engine
        from sqlmodel import SQLModel

        import app.models  # noqa: F401 — register tables on metadata

        engine = create_engine(f"sqlite:///{tmp_path / 'numeric.db'}")
        SQLModel.metadata.create_all(engine)

        from app.core import database as db_module

        # Should not raise — all money columns are NUMERIC/Decimal.
        db_module.verify_money_columns_are_decimal(target_engine=engine)

    def test_money_columns_guardrail_raises_on_float_schema(self, tmp_path):
        """A DB that was created from the old baseline (Float money columns)
        and then NOT upgraded to the Decimal revision must fail the guardrail
        with a message pointing the operator at the fix."""
        from sqlalchemy import (
            Column,
            Float,
            Integer,
            MetaData,
            String,
            Table,
            create_engine,
        )

        engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
        md = MetaData()
        # Minimal legacy-shape tables — only the money columns matter here.
        Table(
            "transaction",
            md,
            Column("id", Integer, primary_key=True),
            Column("total_amount", Float, nullable=False),
            Column("fx_rate", Float, nullable=True),
        )
        Table(
            "historical_prices",
            md,
            Column("ticker", String, primary_key=True),
            Column("date", String, primary_key=True),
            Column("price", Float, nullable=False),
        )
        Table(
            "fx_rates",
            md,
            Column("date", String, primary_key=True),
            Column("usd_to_eur_rate", Float, nullable=False),
        )
        md.create_all(engine)

        from app.core import database as db_module

        with pytest.raises(RuntimeError) as exc:
            db_module.verify_money_columns_are_decimal(target_engine=engine)
        msg = str(exc.value)
        assert "transaction.total_amount" in msg
        assert "historical_prices.price" in msg
        assert "fx_rates.usd_to_eur_rate" in msg
        assert "alembic upgrade head" in msg

    def test_money_columns_guardrail_skips_missing_tables(self, tmp_path):
        """A completely empty DB (no tables) must not fail the guardrail —
        migrations will create the tables. The check is only meaningful
        when tables exist."""
        from sqlalchemy import create_engine

        engine = create_engine(f"sqlite:///{tmp_path / 'empty.db'}")
        from app.core import database as db_module

        # No tables at all → nothing to check → no raise.
        db_module.verify_money_columns_are_decimal(target_engine=engine)

    def test_transaction_sign_check_constraint_rejects_violations(self, tmp_path):
        """The ``ck_transaction_sign`` CHECK constraint enforces the ledger's
        sign semantics at the DB level. A DEPOSIT with a negative amount (or
        any other sign mismatch) must raise ``IntegrityError`` — turning a
        silent ledger-corrupting write into an immediate failure even when
        the Pydantic schema is bypassed (direct SQL, mis-imports, hand-rolled
        scripts)."""
        from datetime import datetime
        from decimal import Decimal

        from sqlalchemy.exc import IntegrityError
        from sqlmodel import Session, SQLModel, create_engine

        from app.models import Portfolio, Transaction, TransactionType, User

        engine = create_engine(f"sqlite:///{tmp_path / 'check.db'}")
        SQLModel.metadata.create_all(engine)

        # Seed a user + portfolio so we can attempt transaction inserts.
        with Session(engine) as session:
            user = User(email="t@t.t", hashed_password="x")
            session.add(user)
            session.commit()
            session.refresh(user)
            portfolio = Portfolio(name="P", user_id=user.id)
            session.add(portfolio)
            session.commit()
            session.refresh(portfolio)
            pid = portfolio.id

        # Valid rows must insert fine (baseline — guards against a false-positive
        # constraint that rejects everything).
        with Session(engine) as session:
            session.add(
                Transaction(
                    portfolio_id=pid,
                    date=datetime(2025, 1, 1),
                    type=TransactionType.DEPOSIT,
                    total_amount=Decimal("100.00"),
                )
            )
            session.add(
                Transaction(
                    portfolio_id=pid,
                    date=datetime(2025, 1, 1),
                    type=TransactionType.REWARD,
                    total_amount=Decimal("12.34"),
                )
            )
            session.commit()

        # Now exercise every sign-violation class.
        violations: list[tuple[TransactionType, Decimal]] = [
            (TransactionType.DEPOSIT, Decimal("-1.00")),  # deposit must be > 0
            (TransactionType.WITHDRAW, Decimal("1.00")),  # withdraw must be < 0
            (TransactionType.BUY, Decimal("1.00")),  # buy must be < 0
            (TransactionType.SELL, Decimal("-1.00")),  # sell must be > 0
            (TransactionType.DIVIDEND, Decimal("-1.00")),  # dividend must be > 0
            (TransactionType.FEE, Decimal("1.00")),  # fee must be < 0
            (TransactionType.SPLIT, Decimal("1.00")),  # split must be exactly 0
            (TransactionType.REWARD, Decimal("-1.00")),  # reward must be > 0
        ]
        for tx_type, bad_amount in violations:
            with Session(engine) as session, pytest.raises(IntegrityError):
                session.add(
                    Transaction(
                        portfolio_id=pid,
                        date=datetime(2025, 1, 2),
                        type=tx_type,
                        total_amount=bad_amount,
                    )
                )
                session.commit()

    def test_run_migrations_refuses_to_stamp_when_multiple_bases(self):
        """Defensive check: if the migration tree has >1 root revision we
        refuse to guess which one to stamp on a pre-Alembic DB."""
        from app.core import database as db_module

        with (
            patch("alembic.config.Config") as mock_config_cls,
            patch("app.core.database.sa_inspect") as mock_inspect,
            patch("app.core.database.create_engine") as mock_engine,
            patch("alembic.script.ScriptDirectory.from_config") as mock_from_config,
        ):
            mock_inspector = MagicMock()
            # Existing tables → triggers the stamp path.
            mock_inspector.get_table_names.return_value = ["portfolio"]
            mock_inspect.return_value = mock_inspector
            mock_engine.return_value = MagicMock()
            mock_config_cls.return_value = MagicMock()
            # Two base revisions — ambiguous, must raise.
            mock_script_dir = MagicMock()
            mock_script_dir.get_bases.return_value = ["rev_a", "rev_b"]
            mock_from_config.return_value = mock_script_dir

            with pytest.raises(RuntimeError, match="exactly one base revision"):
                db_module.run_migrations()
