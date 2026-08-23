import random
import string
from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


async def generate_unique_token(db: AsyncIOMotorDatabase) -> str:
    """
    Generate a unique 5-digit numeric token (e.g. "04821").
    Checks MongoDB to ensure no active job already uses this token.
    """
    for _ in range(50):  # retry up to 50 times
        token = "".join(random.choices(string.digits, k=5))
        existing = await db.jobs.find_one({"token": token, "status": {"$ne": "completed"}})
        if not existing:
            return token
    raise RuntimeError("Could not generate a unique token after 50 attempts")


async def create_job(
    db: AsyncIOMotorDatabase,
    token: str,
    user_email: str,
    user_name: Optional[str],
    total_files: int,
    total_pages: int,
    total_cost: int,
    files: list[dict],
    combined_color_url: Optional[str] = None,
    combined_bw_url: Optional[str] = None,
    razorpay_order_id: Optional[str] = None,
    payment_status: str = "pending",
) -> dict:
    """
    Insert a new multi-file print job document into MongoDB.
    Returns the inserted document.
    """
    job_doc = {
        "token": token,
        "userEmail": user_email,
        "userName": user_name,
        "totalFiles": total_files,
        "totalPages": total_pages,
        "totalCost": total_cost,
        "files": files,
        "combinedColorFileUrl": combined_color_url,
        "combinedBwFileUrl": combined_bw_url,
        "razorpayOrderId": razorpay_order_id,
        "paymentStatus": payment_status,  # "pending", "paid", "failed"
        "razorpayPaymentId": None,
        "paidAt": None,
        "status": "pending",
        "createdAt": datetime.now(timezone.utc),
    }

    await db.jobs.insert_one(job_doc)
    return job_doc


async def mark_job_paid(
    db: AsyncIOMotorDatabase,
    token: str,
    payment_id: str,
    order_id: Optional[str] = None,
) -> bool:
    """
    Update job payment status to 'paid' with Razorpay payment details.
    """
    update_fields = {
        "paymentStatus": "paid",
        "razorpayPaymentId": payment_id,
        "paidAt": datetime.now(timezone.utc),
    }
    if order_id:
        update_fields["razorpayOrderId"] = order_id

    result = await db.jobs.update_one(
        {"token": token.upper()},
        {"$set": update_fields},
    )
    return result.modified_count > 0


async def get_queue_jobs(db: AsyncIOMotorDatabase, limit: int = 50) -> list[dict]:
    """
    Fetch active pending print jobs for the admin live queue:
    1. Paid online jobs appear FIRST, sorted by payment time (whoever paid first appears first).
    2. Offline/Unpaid jobs appear after paid jobs, sorted by creation time.
    """
    pipeline = [
        {"$match": {"status": "pending"}},
        {
            "$addFields": {
                "isPaidOrder": {
                    "$cond": [{"$eq": ["$paymentStatus", "paid"]}, 0, 1]
                },
                "priorityTimestamp": {
                    "$ifNull": ["$paidAt", "$createdAt"]
                },
            }
        },
        {"$sort": {"isPaidOrder": 1, "priorityTimestamp": 1}},
        {"$limit": limit},
    ]
    cursor = db.jobs.aggregate(pipeline)
    jobs = await cursor.to_list(length=limit)
    return jobs


async def get_job_by_token(db: AsyncIOMotorDatabase, token: str) -> Optional[dict]:
    """
    Find a job by its 5-character token.
    Returns the job document or None if not found.
    """
    job = await db.jobs.find_one({"token": token.upper()})
    return job


async def mark_job_completed(db: AsyncIOMotorDatabase, token: str) -> bool:
    """
    Set a job's status to 'completed'.
    Returns True if a document was modified, False otherwise.
    """
    result = await db.jobs.update_one(
        {"token": token.upper(), "status": "pending"},
        {
            "$set": {
                "status": "completed",
                "completedAt": datetime.now(timezone.utc),
            }
        },
    )
    return result.modified_count > 0


async def get_user_jobs(db: AsyncIOMotorDatabase, user_email: str, limit: int = 50) -> list[dict]:
    """
    Retrieve print and transaction history for a specific student, sorted by newest first.
    """
    cursor = db.jobs.find({"userEmail": user_email.lower()}).sort("createdAt", -1).limit(limit)
    jobs = await cursor.to_list(length=limit)
    return jobs


async def cancel_job(db: AsyncIOMotorDatabase, token: str, user_email: str) -> tuple[bool, str]:
    """
    Cancel an active print job by the student who created it.
    Returns (success, message).
    """
    job = await db.jobs.find_one({"token": token.upper()})
    if not job:
        return False, f"Job #{token} not found"

    # Verify ownership (case-insensitive)
    if job.get("userEmail", "").strip().lower() != user_email.strip().lower():
        return False, "You can only cancel your own print jobs"

    # Check status
    if job.get("status") == "completed":
        return False, "Cannot cancel an order that has already been printed/completed"

    if job.get("status") == "cancelled":
        return False, "This order is already cancelled"

    # Perform cancellation
    result = await db.jobs.update_one(
        {"token": token.upper(), "status": "pending"},
        {
            "$set": {
                "status": "cancelled",
                "cancelledAt": datetime.now(timezone.utc),
            }
        },
    )

    if result.modified_count > 0:
        return True, "Order cancelled successfully"
    return False, "Could not cancel order"


