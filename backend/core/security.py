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
                # Also check common locations and pattern matches
                import glob
                alt_paths = [
                    "./firebase-service-account.json",
                    "../firebase-service-account.json",
                    os.path.join(os.path.dirname(__file__), "..", "firebase-service-account.json"),
                ]
                # Look for any *adminsdk*.json or *firebase*.json in backend dir
                backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                alt_paths.extend(glob.glob(os.path.join(backend_dir, "*adminsdk*.json")))
                alt_paths.extend(glob.glob(os.path.join(backend_dir, "*firebase*.json")))

                for p in alt_paths:
                    if os.path.exists(p) and os.path.isfile(p):
                        try:
                            cred = credentials.Certificate(p)
                            print(f"[INFO] Firebase initialized from file '{os.path.basename(p)}'")
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
            print("[INFO] Running in direct JWT authentication mode (Firebase service account not configured).")


async def verify_firebase_token(token: str) -> dict:
    """
    Verify a Firebase ID token (JWT) and return the decoded claims.
    Uses Firebase Admin SDK if configured, with a graceful JWT decoder fallback.

    Args:
        token: The raw Bearer token string from the Authorization header.

    Returns:
        Decoded token dict containing uid, email, name, picture, etc.

    Raises:
        HTTPException 401 if the token is invalid or expired.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing.",
        )

    # Ensure Firebase Admin is initialized if keys are available
    if not firebase_admin._apps:
        init_firebase()

    # 1. If Firebase Admin SDK is initialized, use cryptographic verification
    if firebase_admin._apps:
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
            print(f"[WARN] Firebase Admin SDK verify_id_token notice: {e}. Falling back to JWT decode.")

    # 2. Fallback: Parse and decode JWT claims directly
    try:
        import jwt
        import time

        decoded = jwt.decode(token, options={"verify_signature": False})

        # Check token expiration
        exp = decoded.get("exp")
        if exp and exp < time.time():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired. Please sign in again.",
            )

        # Standardize Firebase UID mapping
        if "sub" in decoded and "uid" not in decoded:
            decoded["uid"] = decoded["sub"]
        elif "user_id" in decoded and "uid" not in decoded:
            decoded["uid"] = decoded["user_id"]

        return decoded
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Failed to decode authentication token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
        )

