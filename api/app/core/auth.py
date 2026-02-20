"""FastAPI Users authentication configuration"""
import os
import uuid
import logging
from typing import Optional

from fastapi import Depends
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import AuthenticationBackend, CookieTransport, JWTStrategy
from fastapi_users.db import BaseUserDatabase
from httpx_oauth.clients.google import GoogleOAuth2
from sqlmodel import Session, select
from sqlalchemy import func as sa_func

from app.core.database import get_session
from app.models.user import User
from app.models.oauth_account import OAuthAccount

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE-ME-IN-PRODUCTION")
OAUTH_STATE_SECRET = os.getenv("OAUTH_STATE_SECRET", "CHANGE-ME-IN-PRODUCTION")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


# ================== Cookie Transport ==================

cookie_transport = CookieTransport(
    cookie_name="pt_auth",
    cookie_max_age=604800,  # 7 days
    cookie_httponly=True,
    cookie_samesite="lax",
    cookie_secure=COOKIE_SECURE,
)


# ================== JWT Strategy ==================

def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=SECRET_KEY, lifetime_seconds=604800)


# ================== Auth Backend ==================

auth_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
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


# ================== User Database Dependency ==================

def get_user_db(session: Session = Depends(get_session)):
    yield SyncSQLAlchemyUserDatabase(session)


# ================== User Manager ==================

class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = SECRET_KEY
    verification_token_secret = SECRET_KEY

    async def on_after_register(self, user: User, request=None):
        logger.info(f"User {user.id} registered with email {user.email}")


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)


# ================== FastAPI Users ==================

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)


# ================== Google OAuth ==================

google_oauth_client = GoogleOAuth2(
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
)
