"""Tests for app/core/config.py — private helper functions."""

import importlib
import os
from unittest.mock import patch

import pytest

# Env that satisfies every validation rule, so each test can flip exactly one
# thing and know the resulting error came from that change. ``load_dotenv`` does
# not override already-set variables, so these also shield the tests from
# whatever happens to be in a developer's api/.env.
_VALID_ENV = {
    "DATABASE_URL": "postgresql://u:p@example.invalid/db",
    "COOKIE_SECURE": "true",
    "COOKIE_SAMESITE": "lax",
    "SECRET_KEY": "not-the-default",
    "OAUTH_STATE_SECRET": "not-the-default",
    "API_ROOT_PATH": "",
    "OAUTH_REDIRECT_URL": "",
    "RUN_MIGRATIONS_ON_STARTUP": "true",
}


def _reload_config(**overrides):
    """Re-import config with a controlled environment and return the module.

    Config validates at import time and aborts with ``SystemExit``, so the only
    way to exercise a rule is to re-execute the module.
    """
    from app.core import config as cfg

    env = {**_VALID_ENV, **overrides}
    with patch.dict(os.environ, env, clear=False):
        return importlib.reload(cfg)


@pytest.fixture(autouse=True)
def _restore_config():
    """Reload config from the real environment after any test that reloaded it.

    Without this a test's synthetic environment would leak into every later
    test that reads ``app.core.config``.
    """
    yield
    from app.core import config as cfg

    importlib.reload(cfg)


class TestConfigHelpers:
    def test_get_bool_unrecognized_value_logs_warning(self):
        import os

        from app.core import config as cfg_module

        initial_len = len(cfg_module._warnings)
        with patch.dict(os.environ, {"DATABASE_ECHO": "maybe"}):
            result = cfg_module._get_bool("DATABASE_ECHO")
        assert result is False
        assert len(cfg_module._warnings) > initial_len
        assert "maybe" in cfg_module._warnings[-1]
        cfg_module._warnings.pop()

    def test_get_int_invalid_value_returns_default(self):
        import os

        from app.core import config as cfg_module

        with patch.dict(os.environ, {"DB_POOL_SIZE": "notanint"}):
            result = cfg_module._get_int("DB_POOL_SIZE", 5)
        assert result == 5

    def test_get_bool_true_values(self):
        import os

        from app.core import config as cfg_module

        for val in ("true", "1", "yes"):
            with patch.dict(os.environ, {"DATABASE_ECHO": val}):
                assert cfg_module._get_bool("DATABASE_ECHO") is True

    def test_get_bool_false_values(self):
        import os

        from app.core import config as cfg_module

        for val in ("false", "0", "no", ""):
            with patch.dict(os.environ, {"DATABASE_ECHO": val}, clear=False):
                assert cfg_module._get_bool("DATABASE_ECHO") is False


class TestConfigValidationErrorPaths:
    """Cover config.py lines 55, 59, 73-79, 96, 100-102."""

    def test_get_int_records_error_and_returns_default(self):
        """_get_int with non-integer value records error entry (lines 38-40)."""
        import os

        from app.core import config as cfg

        with patch.dict(os.environ, {"DB_MAX_OVERFLOW": "bad"}):
            result = cfg._get_int("DB_MAX_OVERFLOW", 10)
        assert result == 10
        assert any("DB_MAX_OVERFLOW" in e for e in cfg._errors)
        cfg._errors.clear()


class TestDatabaseUrlProductionGuard:
    """A production deployment must never fall back to the local SQLite file."""

    def test_default_sqlite_url_is_fatal_when_cookie_secure(self):
        with pytest.raises(SystemExit):
            _reload_config(DATABASE_URL="sqlite:///./portfolio_tracker.db")

    def test_default_sqlite_url_is_allowed_when_not_cookie_secure(self):
        cfg = _reload_config(
            DATABASE_URL="sqlite:///./portfolio_tracker.db",
            COOKIE_SECURE="false",
            COOKIE_SAMESITE="lax",
        )
        assert cfg.DATABASE_URL == "sqlite:///./portfolio_tracker.db"

    def test_explicit_database_url_passes_in_production(self):
        cfg = _reload_config()
        assert cfg.DATABASE_URL.startswith("postgresql://")


class TestRunMigrationsOnStartup:
    def test_defaults_to_true(self):
        env = dict(_VALID_ENV)
        del env["RUN_MIGRATIONS_ON_STARTUP"]
        with patch.dict(os.environ, env, clear=True):
            from app.core import config as cfg

            reloaded = importlib.reload(cfg)
        assert reloaded.RUN_MIGRATIONS_ON_STARTUP is True

    def test_can_be_disabled(self):
        cfg = _reload_config(RUN_MIGRATIONS_ON_STARTUP="false")
        assert cfg.RUN_MIGRATIONS_ON_STARTUP is False


class TestApiRootPath:
    def test_defaults_to_empty(self):
        cfg = _reload_config()
        assert cfg.API_ROOT_PATH == ""

    def test_trailing_slash_is_stripped(self):
        cfg = _reload_config(API_ROOT_PATH="/api/")
        assert cfg.API_ROOT_PATH == "/api"

    def test_must_start_with_slash(self):
        with pytest.raises(SystemExit):
            _reload_config(API_ROOT_PATH="api")


class TestOauthRedirectUrl:
    def test_defaults_to_empty(self):
        cfg = _reload_config()
        assert cfg.OAUTH_REDIRECT_URL == ""

    def test_reads_explicit_value(self):
        url = "https://example.test/api/auth/google/callback"
        cfg = _reload_config(OAUTH_REDIRECT_URL=url)
        assert url == cfg.OAUTH_REDIRECT_URL
