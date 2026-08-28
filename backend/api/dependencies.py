from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client

from core.config import settings
from core.security import verify_firebase_token
from models.user import FirebaseUser


# ---------- Database (Supabase) ----------

_supabase_client: Client | None = None


async def connect_db():
    """Initialize Supabase client. Called at startup."""
    global _supabase_client
    if settings.SUPABASE_URL and settings.SUPABASE_KEY:
        try:
            _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
            print(f"[INFO] Supabase connected successfully ({settings.SUPABASE_URL})")
        except Exception as e:
            print(f"[ERROR] Failed to initialize Supabase client: {e}")
            _supabase_client = None
    else:
        print("[WARN] SUPABASE_URL and SUPABASE_KEY not set in environment. Set them in your .env file.")


async def close_db():
    """Cleanup db resources at shutdown."""
    pass


def get_db() -> Client:
    """FastAPI dependency – returns the Supabase client."""
    global _supabase_client
    if _supabase_client is None:
        if settings.SUPABASE_URL and settings.SUPABASE_KEY:
            try:
                _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Supabase connection error: {str(e)}",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase credentials (SUPABASE_URL, SUPABASE_KEY) not configured on backend.",
            )
    return _supabase_client


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

