"""Tests for the deploy-time migration path.

Covers ``scripts/migrate.py`` and the ``RUN_MIGRATIONS_ON_STARTUP`` gate in
``main.lifespan``. Together these decide *where* DDL runs: in the app's startup
hook (local dev, e2e) or once per build (horizontally scaled deployments).
"""

from unittest.mock import MagicMock, patch

import pytest

from scripts import migrate


class TestMigrateScript:
    def test_returns_zero_and_migrates_when_db_reachable(self):
        with (
            patch.object(migrate, "verify_connection", return_value=True),
            patch.object(migrate, "run_migrations") as mock_run,
            patch.object(migrate, "verify_money_columns_are_decimal") as mock_verify,
        ):
            assert migrate.main() == 0
        mock_run.assert_called_once_with()
        mock_verify.assert_called_once_with()

    def test_returns_one_without_migrating_when_db_unreachable(self):
        with (
            patch.object(migrate, "verify_connection", return_value=False),
            patch.object(migrate, "run_migrations") as mock_run,
            patch.object(migrate, "verify_money_columns_are_decimal") as mock_verify,
        ):
            assert migrate.main() == 1
        mock_run.assert_not_called()
        mock_verify.assert_not_called()

    def test_propagates_migration_failure(self):
        """A failed upgrade must abort the build, not be swallowed into a 0."""
        with (
            patch.object(migrate, "verify_connection", return_value=True),
            patch.object(migrate, "run_migrations", side_effect=RuntimeError("boom")),
            patch.object(migrate, "verify_money_columns_are_decimal"),
            pytest.raises(RuntimeError, match="boom"),
        ):
            migrate.main()


class TestLifespanMigrationGate:
    """``main.lifespan`` owns the startup half of the same decision."""

    @pytest.mark.anyio
    async def test_runs_migrations_when_enabled(self):
        import main

        with (
            patch.object(main, "RUN_MIGRATIONS_ON_STARTUP", True),
            patch.object(main, "verify_connection", return_value=True),
            patch.object(main, "run_migrations") as mock_run,
            patch.object(main, "verify_money_columns_are_decimal") as mock_verify,
        ):
            async with main.lifespan(MagicMock()):
                pass
        mock_run.assert_called_once_with()
        mock_verify.assert_called_once_with()

    @pytest.mark.anyio
    async def test_skips_migrations_when_disabled(self):
        import main

        with (
            patch.object(main, "RUN_MIGRATIONS_ON_STARTUP", False),
            patch.object(main, "verify_connection", return_value=True),
            patch.object(main, "run_migrations") as mock_run,
            patch.object(main, "verify_money_columns_are_decimal") as mock_verify,
        ):
            async with main.lifespan(MagicMock()):
                pass
        mock_run.assert_not_called()
        mock_verify.assert_not_called()

    @pytest.mark.anyio
    async def test_still_fails_fast_on_unreachable_db(self):
        """The connection check is not part of the gate — it always runs."""
        import main

        with (
            patch.object(main, "RUN_MIGRATIONS_ON_STARTUP", False),
            patch.object(main, "verify_connection", return_value=False),
            pytest.raises(RuntimeError, match="Database connection failed"),
        ):
            async with main.lifespan(MagicMock()):
                pass


class TestOauthRedirectUrlWiring:
    """The OAuth callback URL must be explicit whenever a proxy rewrites paths.

    Left to derive itself from the request, fastapi-users would hand Google a
    ``redirect_uri`` missing the public prefix and the token exchange would
    fail — a break that only shows up in a deployed environment.
    """

    @pytest.fixture(autouse=True)
    def _restore_main(self):
        """Reloading main rebuilds ``main.app``; put the real one back after."""
        import importlib

        import main

        yield
        importlib.reload(main)

    @staticmethod
    def _reload_main_capturing_oauth_router(redirect_url: str):
        """Re-import main and capture the kwargs it builds the OAuth router with.

        The patch targets ``app.core.config``, not ``main``: main reads the
        value with ``from ... import``, so it re-resolves against the config
        module every time it is executed.
        """
        import importlib

        import main
        from app.core import auth, config

        with (
            patch.object(config, "OAUTH_REDIRECT_URL", redirect_url),
            patch.object(
                auth.fastapi_users,
                "get_oauth_router",
                wraps=auth.fastapi_users.get_oauth_router,
            ) as mock_router,
        ):
            importlib.reload(main)
        return mock_router

    def test_configured_url_is_passed_through(self):
        url = "https://example.test/api/auth/google/callback"
        mock_router = self._reload_main_capturing_oauth_router(url)
        assert mock_router.call_args.kwargs["redirect_url"] == url

    def test_empty_config_falls_back_to_request_derived_url(self):
        """Unset means None, not "" — an empty string is not a valid URL."""
        mock_router = self._reload_main_capturing_oauth_router("")
        assert mock_router.call_args.kwargs["redirect_url"] is None
