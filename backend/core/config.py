import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    DB_NAME: str = os.getenv("DB_NAME", "campus_print")

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

