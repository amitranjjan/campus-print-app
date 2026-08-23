from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from core.config import settings
from core.security import verify_firebase_token
from models.user import FirebaseUser


# ---------- Database ----------

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect_db():
    """Create the Motor client and select the database. Called at startup."""
    global _client, _db
    _client = AsyncIOMotorClient(settings.MONGO_URI)
    _db = _client[settings.DB_NAME]

    # Create index on the token field for fast lookups
    await _db.jobs.create_index("token", unique=True)


async def close_db():
    """Close the Motor client. Called at shutdown."""
    global _client
    if _client:
        _client.close()


def get_db() -> AsyncIOMotorDatabase:
    """FastAPI dependency – returns the database instance."""
    if _db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection not initialized",
        )
    return _db


# ---------- Authentication ----------

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> FirebaseUser:
    """
    FastAPI dependency – verifies the Firebase JWT from the Authorization header
    and returns a FirebaseUser object.
    """
    decoded = await verify_firebase_token(credentials.credentials)
    return FirebaseUser(
        uid=decoded.get("uid", ""),
        email=decoded.get("email", ""),
        name=decoded.get("name"),
        picture=decoded.get("picture"),
    )

