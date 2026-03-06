"""OAuth account database model"""

import uuid

import sqlalchemy as sa
from sqlalchemy import Column, ForeignKey
from sqlmodel import Field, SQLModel


class OAuthAccount(SQLModel, table=True):
    """OAuth account model — stores provider tokens linked to a user"""

    __tablename__ = "oauthaccount"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        sa_column=Column(
            sa.Uuid,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    oauth_name: str = Field(max_length=100, index=True)
    access_token: str = Field(max_length=1024)
    expires_at: int | None = Field(default=None, nullable=True)
    refresh_token: str | None = Field(default=None, max_length=1024, nullable=True)
    account_id: str = Field(max_length=320, index=True)
    account_email: str = Field(max_length=320)
