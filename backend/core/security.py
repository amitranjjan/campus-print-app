import firebase_admin
from firebase_admin import credentials, auth
from fastapi import HTTPException, status

from core.config import settings


def init_firebase():
    """
    Initialize Firebase Admin SDK using the service account JSON key.
    Call this once at application startup.
    """
    if not firebase_admin._apps:
        try:
            cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred, {
                "storageBucket": settings.FIREBASE_STORAGE_BUCKET,
            })
            print("[INFO] Firebase initialized")
        except FileNotFoundError:
            print(f"[WARN] Firebase credentials file not found at '{settings.FIREBASE_CREDENTIALS_PATH}'. Place your service account JSON file to enable Firebase Auth & Storage.")
        except Exception as e:
            print(f"[WARN] Error initializing Firebase: {e}")


async def verify_firebase_token(token: str) -> dict:
    """
    Verify a Firebase ID token (JWT) and return the decoded claims.

    Args:
        token: The raw Bearer token string from the Authorization header.

    Returns:
        Decoded token dict containing uid, email, name, picture, etc.

    Raises:
        HTTPException 401 if the token is invalid, expired, or revoked.
    """
    try:
        decoded = auth.verify_id_token(token)
        return decoded
    except auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please sign in again.",
        )
    except auth.RevokedIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked. Please sign in again.",
        )
    except auth.InvalidIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials.",
        )

