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
        raw = os.getenv("SUPABASE_URL", "").strip()
        if not raw:
            return ""
        # Strip trailing slashes and redundant /rest/v1 paths
        url = raw.rstrip("/")
        if url.endswith("/rest/v1"):
            url = url[:-len("/rest/v1")].rstrip("/")
        return url

    @property
    def SUPABASE_KEY(self) -> str:
        return (
            os.getenv("SUPABASE_KEY")
            or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            or os.getenv("SUPABASE_ANON_KEY")
            or ""
        ).strip()

    SUPABASE_STORAGE_BUCKET: str = os.getenv("SUPABASE_STORAGE_BUCKET", "print-jobs").strip()

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

