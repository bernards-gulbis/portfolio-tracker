"""User database model"""
import uuid
from typing import Optional
from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    """
    User model with fields required by FastAPI Users.
    Defined as a pure SQLModel (no SQLAlchemyBaseUserTableUUID mixin) for
    compatibility with Pydantic v2 / SQLModel.
    """
    __tablename__ = "user"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=320)
    hashed_password: str = Field(max_length=1024)
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    is_verified: bool = Field(default=False)
    name: Optional[str] = Field(default=None, max_length=255)
    picture: Optional[str] = Field(default=None, max_length=2048)
