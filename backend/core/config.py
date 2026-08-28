import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    DB_NAME: str = os.getenv("DB_NAME", "campus_print")

    # Supabase Settings
    @property
    def SUPABASE_URL(self) -> str:
        load_dotenv(override=True)
        raw = os.getenv("SUPABASE_URL", "").strip().strip("'\"")
        if not raw:
            return ""
        # Strip trailing slashes and any /rest/v1 or /rest or /v1 suffix
        url = raw.rstrip("/")
        for suffix in ["/rest/v1", "/rest/v1/", "/rest", "/v1"]:
            if url.endswith(suffix):
                url = url[:-len(suffix)].rstrip("/")
        return url

    @property
    def SUPABASE_KEY(self) -> str:
        load_dotenv(override=True)
        return (
            os.getenv("SUPABASE_KEY")
            or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            or os.getenv("SUPABASE_ANON_KEY")
            or ""
        ).strip().strip("'\"")

    SUPABASE_STORAGE_BUCKET: str = os.getenv("SUPABASE_STORAGE_BUCKET", "print-jobs").strip().strip("'\"")

    FIREBASE_CREDENTIALS_PATH: str = os.getenv(
        "FIREBASE_CREDENTIALS_PATH", "./firebase-service-account.json"
    )
    FIREBASE_STORAGE_BUCKET: str = os.getenv(
        "FIREBASE_STORAGE_BUCKET", ""
    )
    FIREBASE_SERVICE_ACCOUNT: str = os.getenv(
        "FIREBASE_SERVICE_ACCOUNT", ""
    )
    FIREBASE_CREDENTIALS_JSON: str = os.getenv(
        "FIREBASE_CREDENTIALS_JSON", ""
    )

    # Comma-separated list of admin email addresses
    ADMIN_EMAILS: list[str] = [
        email.strip().lower()
        for email in os.getenv("ADMIN_EMAILS", "").split(",")
        if email.strip()
    ]

    @property
    def RAZORPAY_KEY_ID(self) -> str:
        load_dotenv(override=True)
        return os.getenv("RAZORPAY_KEY_ID", "rzp_test_mockkey12345").strip()

    @property
    def RAZORPAY_KEY_SECRET(self) -> str:
        load_dotenv(override=True)
        return os.getenv("RAZORPAY_KEY_SECRET", "").strip()


settings = Settings()

