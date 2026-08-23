from pydantic import BaseModel
from typing import Optional


class FirebaseUser(BaseModel):
    """User data extracted from a verified Firebase ID token."""
    uid: str
    email: str = ""
    name: Optional[str] = None
    picture: Optional[str] = None


class AdminCheckResponse(BaseModel):
    """Response for the admin verification endpoint."""
    isAdmin: bool
    email: str

