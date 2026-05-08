"""
Unit tests for app.core.auth — cookie transports, JWT strategy,
SyncSQLAlchemyUserDatabase, UserManager, CustomGoogleOAuth2,
and fetch_google_profile.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.core.auth import (
    USERINFO_ENDPOINT,
    CustomGoogleOAuth2,
    OAuthRedirectCookieTransport,
    SyncSQLAlchemyUserDatabase,
    UserManager,
    fetch_google_profile,
)
from app.models.user import User

# ── Fixtures ──────────────────────────────────────────────────


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


@pytest.fixture(name="user_db")
def user_db_fixture(session: Session):
    return SyncSQLAlchemyUserDatabase(session)


@pytest.fixture(name="test_user")
def test_user_fixture(session: Session):
    user = User(
        id=uuid.uuid4(),
        email="alice@example.com",
        hashed_password="hashed_pw",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="user_manager")
def user_manager_fixture(user_db):
    return UserManager(user_db)


class TestOAuthRedirectCookieTransport:
    @pytest.mark.anyio
    async def test_get_login_response_redirects(self):
        transport = OAuthRedirectCookieTransport(
            redirect_url="http://localhost:3000",
            cookie_name="pt_auth",
            cookie_max_age=604800,
            cookie_httponly=True,
            cookie_samesite="lax",
            cookie_secure=False,
        )
        response = await transport.get_login_response("test-jwt-token")
        assert response.status_code == 302
        assert response.headers["location"] == "http://localhost:3000"
        # Verify cookie is set in response headers
        set_cookie = response.headers.get("set-cookie", "")
        assert "pt_auth" in set_cookie
        assert "test-jwt-token" in set_cookie


# ── UserManager Tests ─────────────────────────────────────────


class TestUserManager:
    @pytest.mark.anyio
    async def test_on_after_register(self, user_manager: UserManager, test_user: User):
        # Should not raise
        await user_manager.on_after_register(test_user)

    @pytest.mark.anyio
    async def test_create_oauth_user_with_profile(self, user_manager: UserManager):
        oauth_dict = {
            "oauth_name": "google",
            "access_token": "tok",
            "account_id": "gid-1",
            "account_email": "bob@gmail.com",
            "expires_at": None,
            "refresh_token": None,
        }
        profile = {"name": "Bob Smith", "picture": "https://example.com/bob.jpg"}
        user = await user_manager._create_oauth_user(oauth_dict, profile, True, None)
        assert user.email == "bob@gmail.com"
        assert user.name == "Bob Smith"
        assert user.picture == "https://example.com/bob.jpg"
        assert user.is_verified is True

    @pytest.mark.anyio
    async def test_create_oauth_user_without_profile(self, user_manager: UserManager):
        oauth_dict = {
            "oauth_name": "google",
            "access_token": "tok",
            "account_id": "gid-2",
            "account_email": "carol@gmail.com",
            "expires_at": None,
            "refresh_token": None,
        }
        user = await user_manager._create_oauth_user(oauth_dict, {}, False, None)
        assert user.email == "carol@gmail.com"
        assert user.name is None
        assert user.picture is None
        assert user.is_verified is False

    @pytest.mark.anyio
    async def test_backfill_profile_updates_missing_name(
        self, user_manager: UserManager, test_user: User
    ):
        """Should backfill name if user has no name."""
        assert test_user.name is None
        user = await user_manager._backfill_profile(
            test_user, {"name": "Alice", "picture": "pic.jpg"}
        )
        assert user.name == "Alice"
        assert user.picture == "pic.jpg"

    @pytest.mark.anyio
    async def test_backfill_profile_does_not_overwrite_name(
        self, user_manager: UserManager, test_user: User, user_db
    ):
        """Should not overwrite existing name."""
        await user_db.update(test_user, {"name": "Original Name"})
        user = await user_manager._backfill_profile(test_user, {"name": "New Name"})
        assert user.name == "Original Name"

    @pytest.mark.anyio
    async def test_backfill_profile_updates_picture_when_different(
        self, user_manager: UserManager, test_user: User, user_db
    ):
        await user_db.update(test_user, {"picture": "old.jpg"})
        user = await user_manager._backfill_profile(test_user, {"picture": "new.jpg"})
        assert user.picture == "new.jpg"

    @pytest.mark.anyio
    async def test_backfill_profile_no_update_when_same_picture(
        self, user_manager: UserManager, test_user: User, user_db
    ):
        await user_db.update(test_user, {"picture": "same.jpg"})
        user = await user_manager._backfill_profile(test_user, {"picture": "same.jpg"})
        assert user.picture == "same.jpg"

    @pytest.mark.anyio
    async def test_backfill_profile_empty_dict(
        self, user_manager: UserManager, test_user: User
    ):
        user = await user_manager._backfill_profile(test_user, {})
        assert user.id == test_user.id

    @pytest.mark.anyio
    @patch("app.core.auth.fetch_google_profile", new_callable=AsyncMock)
    async def test_oauth_callback_new_user(self, mock_fetch, user_manager: UserManager):
        mock_fetch.return_value = {"name": "New OAuth User", "picture": "pic.jpg"}
        user = await user_manager.oauth_callback(
            oauth_name="google",
            access_token="tok",
            account_id="new-gid",
            account_email="newuser@gmail.com",
            is_verified_by_default=True,
        )
        assert user.email == "newuser@gmail.com"
        assert user.name == "New OAuth User"
        mock_fetch.assert_awaited_once_with("tok")

    @pytest.mark.anyio
    @patch("app.core.auth.fetch_google_profile", new_callable=AsyncMock)
    async def test_oauth_callback_existing_oauth_user(
        self, mock_fetch, user_manager: UserManager
    ):
        """Re-login: existing user found by oauth account."""
        mock_fetch.return_value = {"name": "Alice", "picture": "pic.jpg"}
        # First create the user via oauth
        user = await user_manager.oauth_callback(
            oauth_name="google",
            access_token="tok1",
            account_id="relogin-gid",
            account_email="relogin@gmail.com",
            is_verified_by_default=True,
        )
        # Re-login with same oauth account
        user2 = await user_manager.oauth_callback(
            oauth_name="google",
            access_token="tok2",
            account_id="relogin-gid",
            account_email="relogin@gmail.com",
        )
        assert user2.id == user.id

    @pytest.mark.anyio
    @patch("app.core.auth.fetch_google_profile", new_callable=AsyncMock)
    async def test_oauth_callback_associate_by_email(
        self, mock_fetch, user_manager: UserManager, test_user: User
    ):
        """When associate_by_email=True and email matches, links oauth to existing user."""
        mock_fetch.return_value = {}
        user = await user_manager.oauth_callback(
            oauth_name="google",
            access_token="tok",
            account_id="assoc-gid",
            account_email=test_user.email,
            associate_by_email=True,
        )
        assert user.id == test_user.id

    @pytest.mark.anyio
    @patch("app.core.auth.fetch_google_profile", new_callable=AsyncMock)
    async def test_oauth_callback_existing_email_no_associate_raises(
        self, mock_fetch, user_manager: UserManager, test_user: User
    ):
        """When associate_by_email=False and email matches, raises UserAlreadyExists."""
        from fastapi_users.exceptions import UserAlreadyExists

        mock_fetch.return_value = {}
        with pytest.raises(UserAlreadyExists):
            await user_manager.oauth_callback(
                oauth_name="google",
                access_token="tok",
                account_id="noassoc-gid",
                account_email=test_user.email,
                associate_by_email=False,
            )

    @pytest.mark.anyio
    @patch("app.core.auth.fetch_google_profile", new_callable=AsyncMock)
    async def test_oauth_callback_non_google_no_profile_fetch(
        self, mock_fetch, user_manager: UserManager
    ):
        """For non-google oauth, fetch_google_profile is not called."""
        user = await user_manager.oauth_callback(
            oauth_name="github",
            access_token="tok",
            account_id="gh-123",
            account_email="dev@github.com",
            is_verified_by_default=True,
        )
        assert user.email == "dev@github.com"
        mock_fetch.assert_not_awaited()


# ── fetch_google_profile Tests ───────────────────────────────


class TestFetchGoogleProfile:
    @pytest.mark.anyio
    async def test_success(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "name": "Test User",
            "picture": "https://example.com/pic.jpg",
            "email": "test@gmail.com",
        }

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.core.auth.httpx.AsyncClient", return_value=mock_client):
            result = await fetch_google_profile("valid_token")

        assert result == {"name": "Test User", "picture": "https://example.com/pic.jpg"}
        mock_client.get.assert_awaited_once_with(
            USERINFO_ENDPOINT,
            headers={"Authorization": "Bearer valid_token"},
        )

    @pytest.mark.anyio
    async def test_failure_returns_empty_dict(self):
        mock_response = MagicMock()
        mock_response.status_code = 401

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.core.auth.httpx.AsyncClient", return_value=mock_client):
            result = await fetch_google_profile("bad_token")

        assert result == {}

    @pytest.mark.anyio
    async def test_missing_fields_returns_none(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.core.auth.httpx.AsyncClient", return_value=mock_client):
            result = await fetch_google_profile("tok")

        assert result == {"name": None, "picture": None}


# ── CustomGoogleOAuth2 Tests ─────────────────────────────────


class TestCustomGoogleOAuth2:
    @pytest.mark.anyio
    async def test_get_id_email_success(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"sub": "12345", "email": "user@gmail.com"}

        mock_http_client = AsyncMock()
        mock_http_client.get.return_value = mock_response
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=False)

        client = CustomGoogleOAuth2(client_id="cid", client_secret="csecret")
        with patch.object(client, "get_httpx_client", return_value=mock_http_client):
            sub, email = await client.get_id_email("access_tok")

        assert sub == "12345"
        assert email == "user@gmail.com"

    @pytest.mark.anyio
    async def test_get_id_email_error(self):
        from httpx_oauth.exceptions import GetIdEmailError

        mock_response = MagicMock()
        mock_response.status_code = 400

        mock_http_client = AsyncMock()
        mock_http_client.get.return_value = mock_response
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=False)

        client = CustomGoogleOAuth2(client_id="cid", client_secret="csecret")
        with (
            patch.object(client, "get_httpx_client", return_value=mock_http_client),
            pytest.raises(GetIdEmailError),
        ):
            await client.get_id_email("bad_tok")

    @pytest.mark.anyio
    async def test_get_id_email_missing_email(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"sub": "99999"}

        mock_http_client = AsyncMock()
        mock_http_client.get.return_value = mock_response
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=False)

        client = CustomGoogleOAuth2(client_id="cid", client_secret="csecret")
        with patch.object(client, "get_httpx_client", return_value=mock_http_client):
            sub, email = await client.get_id_email("tok")

        assert sub == "99999"
        assert email is None


# ── Extra coverage paths ─────────────────────────────────────────


class TestSyncSQLAlchemyUserDatabaseExtraPaths:
    """Cover auth.py lines 123 (get), 155-156 (delete), 187 (update_oauth_account_by_ids no-match)."""

    @pytest.mark.anyio
    async def test_get_by_id_returns_user(self, session: Session):
        from app.core.auth import SyncSQLAlchemyUserDatabase
        from app.models.user import User

        user = User(
            id=uuid.uuid4(),
            email="getbyid@example.com",
            hashed_password="x",
            is_active=True,
        )
        session.add(user)
        session.commit()

        db = SyncSQLAlchemyUserDatabase(session)
        fetched = await db.get(user.id)
        assert fetched is not None
        assert fetched.email == "getbyid@example.com"

    @pytest.mark.anyio
    async def test_get_by_id_returns_none_for_unknown(self, session: Session):
        from app.core.auth import SyncSQLAlchemyUserDatabase

        db = SyncSQLAlchemyUserDatabase(session)
        fetched = await db.get(uuid.uuid4())
        assert fetched is None

    @pytest.mark.anyio
    async def test_delete_user(self, session: Session):
        from app.core.auth import SyncSQLAlchemyUserDatabase
        from app.models.user import User

        user = User(
            id=uuid.uuid4(),
            email="todelete@example.com",
            hashed_password="x",
            is_active=True,
        )
        session.add(user)
        session.commit()

        db = SyncSQLAlchemyUserDatabase(session)
        await db.delete(user)

        fetched = await db.get(user.id)
        assert fetched is None

    @pytest.mark.anyio
    async def test_update_oauth_account_by_ids_no_match_returns_user(
        self, session: Session
    ):
        """When no matching OAuthAccount exists, return user unchanged (line 187)."""
        from app.core.auth import SyncSQLAlchemyUserDatabase
        from app.models.user import User

        user = User(
            id=uuid.uuid4(),
            email="nooauth@example.com",
            hashed_password="x",
            is_active=True,
        )
        session.add(user)
        session.commit()

        db = SyncSQLAlchemyUserDatabase(session)
        returned = await db.update_oauth_account_by_ids(
            user, "google", "nonexistent-id", {"access_token": "new_tok"}
        )
        assert returned.id == user.id
