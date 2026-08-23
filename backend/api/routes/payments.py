import hmac
import hashlib
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
import razorpay

from api.dependencies import get_current_user, get_db
from core.config import settings
from models.user import FirebaseUser
from services import db_service

router = APIRouter(prefix="/api/payment", tags=["Payments"])


class CreateOrderRequest(BaseModel):
    token: str


class CreateOrderResponse(BaseModel):
    orderId: str
    amount: int  # in paise
    currency: str = "INR"
    keyId: str
    token: str


class VerifyPaymentRequest(BaseModel):
    token: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: Optional[str] = None


class VerifyPaymentResponse(BaseModel):
    success: bool
    token: str
    paymentId: str
    paymentStatus: str = "paid"
    message: str = "Payment verified successfully"


def _is_live_razorpay():
    return (
        settings.RAZORPAY_KEY_ID
        and not settings.RAZORPAY_KEY_ID.startswith("rzp_test_mock")
        and not "your_razorpay_key" in settings.RAZORPAY_KEY_ID.lower()
        and settings.RAZORPAY_KEY_SECRET
        and not "your_razorpay_secret" in settings.RAZORPAY_KEY_SECRET.lower()
    )


def _get_razorpay_client():
    if _is_live_razorpay():
        try:
            return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        except Exception:
            return None
    return None


@router.post("/create-order", response_model=CreateOrderResponse)
async def create_payment_order(
    req: CreateOrderRequest,
    user: FirebaseUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Create a Razorpay order for a specific print job.
    """
    job = await db_service.get_job_by_token(db, req.token)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Print job '{req.token}' not found",
        )

    total_cost = job.get("totalCost", 0)
    amount_paise = total_cost * 100

    client = _get_razorpay_client()
    order_id = None

    if client:
        try:
            order_data = {
                "amount": amount_paise,
                "currency": "INR",
                "receipt": f"job_{req.token}",
                "notes": {
                    "token": req.token,
                    "student_email": user.email,
                },
            }
            order = client.order.create(data=order_data)
            order_id = order.get("id")
        except Exception as e:
            print(f"[WARN] Razorpay order creation failed: {e}")
            order_id = f"order_demo_{req.token}_{int(amount_paise)}"
    else:
        # Development / Demo mode fallback
        order_id = f"order_demo_{req.token}_{int(amount_paise)}"

    # Save order ID on job in DB
    await db.jobs.update_one(
        {"token": req.token.upper()},
        {"$set": {"razorpayOrderId": order_id}},
    )

    return CreateOrderResponse(
        orderId=order_id,
        amount=amount_paise,
        currency="INR",
        keyId=settings.RAZORPAY_KEY_ID or "rzp_test_mock",
        token=req.token,
    )


@router.post("/verify", response_model=VerifyPaymentResponse)
async def verify_payment(
    req: VerifyPaymentRequest,
    user: FirebaseUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Verify payment signature from Razorpay checkout and mark job as paid.
    """
    job = await db_service.get_job_by_token(db, req.token)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Print job '{req.token}' not found",
        )

    client = _get_razorpay_client()

    # Signature verification for real live keys (bypass simulated or demo payments)
    is_simulated = (
        req.razorpay_payment_id.startswith("pay_demo")
        or req.razorpay_payment_id.startswith("pay_sim")
        or req.razorpay_signature in ("demo_sig", None, "")
    )
    if client and not is_simulated:
        if not req.razorpay_signature:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment signature is required for verification",
            )
        try:
            client.utility.verify_payment_signature({
                "razorpay_order_id": req.razorpay_order_id,
                "razorpay_payment_id": req.razorpay_payment_id,
                "razorpay_signature": req.razorpay_signature,
            })
        except razorpay.errors.SignatureVerificationError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid payment signature",
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Signature verification error: {str(e)}",
            )

    # Mark as paid in MongoDB
    await db_service.mark_job_paid(
        db=db,
        token=req.token,
        payment_id=req.razorpay_payment_id,
        order_id=req.razorpay_order_id,
    )

    return VerifyPaymentResponse(
        success=True,
        token=req.token.upper(),
        paymentId=req.razorpay_payment_id,
        paymentStatus="paid",
        message="Payment verified successfully! Your job is now in the print queue.",
    )

