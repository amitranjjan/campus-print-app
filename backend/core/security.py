import json
import base64
import os
import firebase_admin
from firebase_admin import credentials, auth
from fastapi import HTTPException, status

from core.config import settings


def init_firebase():
    """
    Initialize Firebase Admin SDK using the service account JSON key or env var.
    Call this once at application startup.
    """
    if not firebase_admin._apps:
        cred = None

        # 1. Check if raw JSON string or base64 is in environment variables
        raw_json_env = (
            os.getenv("FIREBASE_SERVICE_ACCOUNT")
            or os.getenv("FIREBASE_CREDENTIALS_JSON")
            or os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
            or settings.FIREBASE_SERVICE_ACCOUNT
            or settings.FIREBASE_CREDENTIALS_JSON
        )

        if raw_json_env and raw_json_env.strip():
            raw_str = raw_json_env.strip()
            try:
                # If not starting with '{', attempt base64 decode
                if not raw_str.startswith("{"):
                    try:
                        raw_str = base64.b64decode(raw_str).decode("utf-8")
                    except Exception:
                        pass
                cert_dict = json.loads(raw_str)
                cred = credentials.Certificate(cert_dict)
                print("[INFO] Firebase initialized from environment variable")
            except Exception as e:
                print(f"[WARN] Failed to parse service account JSON from environment variable: {e}")

        # 2. If not loaded from env var, try file path
        if not cred:
            file_path = settings.FIREBASE_CREDENTIALS_PATH
            if os.path.exists(file_path):
                try:
                    cred = credentials.Certificate(file_path)
                    print(f"[INFO] Firebase initialized from file '{file_path}'")
                except Exception as e:
                    print(f"[WARN] Failed to load Firebase credentials from file '{file_path}': {e}")
            else:
                # Also check common locations
                alt_paths = [
                    "./firebase-service-account.json",
                    "../firebase-service-account.json",
                    os.path.join(os.path.dirname(__file__), "..", "firebase-service-account.json"),
                ]
                for p in alt_paths:
                    if os.path.exists(p):
                        try:
                            cred = credentials.Certificate(p)
                            print(f"[INFO] Firebase initialized from alternate file '{p}'")
                            break
                        except Exception as e:
                            print(f"[WARN] Failed to load Firebase credentials from '{p}': {e}")

        # 3. Initialize Firebase app if credentials found
        if cred:
            try:
                app_options = {}
                if settings.FIREBASE_STORAGE_BUCKET:
                    app_options["storageBucket"] = settings.FIREBASE_STORAGE_BUCKET
                firebase_admin.initialize_app(cred, app_options if app_options else None)
                print("[INFO] Firebase Admin SDK successfully connected")
            except Exception as e:
                print(f"[ERROR] Error initializing Firebase Admin: {e}")
        else:
            print("[WARN] Firebase service account credentials not found. Please set FIREBASE_SERVICE_ACCOUNT (JSON string) or place firebase-service-account.json in backend/.")


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
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing.",
        )

    # Check if Firebase Admin is initialized
    if not firebase_admin._apps:
        print("[ERROR] verify_firebase_token called but Firebase Admin is not initialized!")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase Admin is not configured on the backend. Please add FIREBASE_SERVICE_ACCOUNT or firebase-service-account.json.",
        )

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
    except Exception as e:
        print(f"[ERROR] Authentication verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
        )

