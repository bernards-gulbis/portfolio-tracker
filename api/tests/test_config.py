"""Tests for app/core/config.py — private helper functions."""

from unittest.mock import patch


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
