from fastapi import APIRouter, Depends

from api.dependencies import get_current_user
from core.config import settings
from models.user import FirebaseUser, AdminCheckResponse

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.get("/verify-admin", response_model=AdminCheckResponse)
async def verify_admin(user: FirebaseUser = Depends(get_current_user)):
    """
    Check if the currently authenticated user is an admin.
    Compares the user's email against the ADMIN_EMAILS list in .env.
    """
    is_admin = user.email.lower() in settings.ADMIN_EMAILS

    return AdminCheckResponse(
        isAdmin=is_admin,
        email=user.email,
    )

