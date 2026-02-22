"""FastAPI Users authentication configuration"""
import os
import uuid
import logging
from typing import Optional

from fastapi import Depends
from fastapi.responses import RedirectResponse
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users import exceptions
from fastapi_users.authentication import AuthenticationBackend, CookieTransport, JWTStrategy
from fastapi_users.db import BaseUserDatabase
from httpx_oauth.clients.google import GoogleOAuth2
from sqlmodel import Session, select
from sqlalchemy import func as sa_func

from app.core.database import get_session
from app.models.user import User
from app.models.oauth_account import OAuthAccount

logger = logging.getLogger(__name__)

_DEFAULT_SECRET = "CHANGE-ME-IN-PRODUCTION"

SECRET_KEY = os.getenv("SECRET_KEY", _DEFAULT_SECRET)
OAUTH_STATE_SECRET = os.getenv("OAUTH_STATE_SECRET", _DEFAULT_SECRET)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

if SECRET_KEY == _DEFAULT_SECRET:
    if COOKIE_SECURE:
        raise RuntimeError("SECRET_KEY must be set when COOKIE_SECURE=true. Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\"")
    logger.warning("SECRET_KEY is not set — using insecure default. Set SECRET_KEY in .env before deploying.")
if OAUTH_STATE_SECRET == _DEFAULT_SECRET:
    if COOKIE_SECURE:
        raise RuntimeError("OAUTH_STATE_SECRET must be set when COOKIE_SECURE=true. Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\"")
    logger.warning("OAUTH_STATE_SECRET is not set — using insecure default. Set OAUTH_STATE_SECRET in .env before deploying.")


# ================== Cookie Transport ==================

cookie_transport = CookieTransport(
    cookie_name="pt_auth",
    cookie_max_age=604800,  # 7 days
    cookie_httponly=True,
    cookie_samesite="lax",
    cookie_secure=COOKIE_SECURE,
)


class OAuthRedirectCookieTransport(CookieTransport):
    """
    CookieTransport for OAuth: sets the auth cookie then redirects the browser
    to the frontend instead of returning 200.  Used only by the OAuth router.
    """

    def __init__(self, redirect_url: str, **kwargs):
        super().__init__(**kwargs)
        self._redirect_url = redirect_url

    async def get_login_response(self, token: str):
        response = RedirectResponse(url=self._redirect_url, status_code=302)
        response.set_cookie(
            self.cookie_name,
            token,
            max_age=self.cookie_max_age,
            path=self.cookie_path,
            domain=self.cookie_domain,
            secure=self.cookie_secure,
            httponly=self.cookie_httponly,
            samesite=self.cookie_samesite,
        )
        return response


oauth_cookie_transport = OAuthRedirectCookieTransport(
    redirect_url=FRONTEND_URL,
    cookie_name="pt_auth",
    cookie_max_age=604800,  # 7 days
    cookie_httponly=True,
    cookie_samesite="lax",
    cookie_secure=COOKIE_SECURE,
)


# ================== JWT Strategy ==================

def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=SECRET_KEY, lifetime_seconds=604800)


# ================== Auth Backends ==================

# Used for email/password login — returns 200 with cookie
auth_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)

# Used for Google OAuth — sets cookie then redirects to frontend
oauth_auth_backend = AuthenticationBackend(
    name="oauth_cookie",
    transport=oauth_cookie_transport,
    get_strategy=get_jwt_strategy,
)


# ================== Custom Sync User Database Adapter ==================

class SyncSQLAlchemyUserDatabase(BaseUserDatabase[User, uuid.UUID]):
    """
    Custom sync adapter bridging SQLModel sync sessions to FastAPI Users.

    FastAPI Users v15 dropped SQLAlchemySyncUserDatabase. This adapter implements
    the BaseUserDatabase interface using synchronous SQLModel sessions by wrapping
    all required methods as `async def` (which are still awaitable but execute
    synchronously — valid in Python's async model).
    """

    def __init__(self, session: Session):
        self.session = session

    async def get(self, id: uuid.UUID) -> Optional[User]:
        return self.session.get(User, id)

    async def get_by_email(self, email: str) -> Optional[User]:
        statement = select(User).where(sa_func.lower(User.email) == email.lower())
        return self.session.exec(statement).first()

    async def get_by_oauth_account(self, oauth: str, account_id: str) -> Optional[User]:
        statement = (
            select(User)
            .join(OAuthAccount, OAuthAccount.user_id == User.id)
            .where(OAuthAccount.oauth_name == oauth, OAuthAccount.account_id == account_id)
        )
        return self.session.exec(statement).first()

    async def create(self, create_dict: dict) -> User:
        user = User(**create_dict)
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user

    async def update(self, user: User, update_dict: dict) -> User:
        for key, value in update_dict.items():
            setattr(user, key, value)
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user

    async def delete(self, user: User) -> None:
        self.session.delete(user)
        self.session.commit()

    async def add_oauth_account(self, user: User, create_dict: dict) -> User:
        oauth_account = OAuthAccount(**create_dict, user_id=user.id)
        self.session.add(oauth_account)
        self.session.commit()
        self.session.refresh(user)
        return user

    async def update_oauth_account(self, user: User, oauth_account: OAuthAccount, update_dict: dict) -> User:
        for key, value in update_dict.items():
            setattr(oauth_account, key, value)
        self.session.add(oauth_account)
        self.session.commit()
        self.session.refresh(user)
        return user

    async def update_oauth_account_by_ids(
        self, user: User, oauth_name: str, account_id: str, update_dict: dict
    ) -> User:
        """Update an OAuth account by oauth_name + account_id without needing user.oauth_accounts."""
        statement = select(OAuthAccount).where(
            OAuthAccount.user_id == user.id,
            OAuthAccount.oauth_name == oauth_name,
            OAuthAccount.account_id == account_id,
        )
        oauth_account = self.session.exec(statement).first()
        if oauth_account:
            return await self.update_oauth_account(user, oauth_account, update_dict)
        return user


# ================== User Database Dependency ==================

def get_user_db(session: Session = Depends(get_session)):
    yield SyncSQLAlchemyUserDatabase(session)


# ================== User Manager ==================

class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = SECRET_KEY
    verification_token_secret = SECRET_KEY

    async def on_after_register(self, user: User, request=None):
        logger.info(f"User {user.id} registered with email {user.email}")

    async def oauth_callback(
        self,
        oauth_name: str,
        access_token: str,
        account_id: str,
        account_email: str,
        expires_at: Optional[int] = None,
        refresh_token: Optional[str] = None,
        request=None,
        *,
        associate_by_email: bool = False,
        is_verified_by_default: bool = False,
    ) -> User:
        """
        Override the default oauth_callback to avoid accessing user.oauth_accounts.

        The default implementation iterates user.oauth_accounts (an ORM relationship)
        on re-login to update tokens. Our User model has no such relationship, so we
        use update_oauth_account_by_ids instead.
        """
        oauth_account_dict = {
            "oauth_name": oauth_name,
            "access_token": access_token,
            "account_id": account_id,
            "account_email": account_email,
            "expires_at": expires_at,
            "refresh_token": refresh_token,
        }

        try:
            user = await self.get_by_oauth_account(oauth_name, account_id)
        except exceptions.UserNotExists:
            try:
                # Try to associate with existing account by email
                user = await self.get_by_email(account_email)
                if not associate_by_email:
                    raise exceptions.UserAlreadyExists()
                user = await self.user_db.add_oauth_account(user, oauth_account_dict)
            except exceptions.UserNotExists:
                # Create new user
                password = self.password_helper.generate()
                user_dict = {
                    "email": account_email,
                    "hashed_password": self.password_helper.hash(password),
                    "is_verified": is_verified_by_default,
                }
                user = await self.user_db.create(user_dict)
                user = await self.user_db.add_oauth_account(user, oauth_account_dict)
                await self.on_after_register(user, request)
        else:
            # Re-login: update stored tokens without touching user.oauth_accounts
            user = await self.user_db.update_oauth_account_by_ids(
                user, oauth_name, account_id, oauth_account_dict
            )

        return user


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)


# ================== FastAPI Users ==================

# Only auth_backend (email/password) is registered here. oauth_auth_backend shares the
# same CookieTransport cookie name ("pt_auth") and JWTStrategy, so tokens issued by the
# OAuth flow are valid against current_active_user without needing to register it here.
fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)


# ================== Google OAuth ==================

google_oauth_client = GoogleOAuth2(
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
)
