import random
import string
from datetime import datetime, timezone
from typing import Optional, Any
from supabase import Client


def _format_job_doc(doc: dict) -> dict:
    """
    Format a database row from Supabase into the standard dictionary schema
    matching the JobDetail / frontend expectations (camelCase).
    """
    if not doc:
        return doc

    return {
        "id": doc.get("id"),
        "token": str(doc.get("token", "")).upper(),
        "userEmail": doc.get("user_email") or doc.get("userEmail", ""),
        "userName": doc.get("user_name") or doc.get("userName"),
        "totalFiles": doc.get("total_files") if doc.get("total_files") is not None else doc.get("totalFiles", 1),
        "totalPages": doc.get("total_pages") if doc.get("total_pages") is not None else doc.get("totalPages", 0),
        "totalCost": doc.get("total_cost") if doc.get("total_cost") is not None else doc.get("totalCost", 0),
        "files": doc.get("files") or [],
        "combinedColorFileUrl": doc.get("combined_color_file_url") or doc.get("combinedColorFileUrl"),
        "combinedBwFileUrl": doc.get("combined_bw_file_url") or doc.get("combinedBwFileUrl"),
        "razorpayOrderId": doc.get("razorpay_order_id") or doc.get("razorpayOrderId"),
        "razorpayPaymentId": doc.get("razorpay_payment_id") or doc.get("razorpayPaymentId"),
        "paymentStatus": doc.get("payment_status") or doc.get("paymentStatus", "pending"),
        "status": doc.get("status", "pending"),
        "paidAt": doc.get("paid_at") or doc.get("paidAt"),
        "completedAt": doc.get("completed_at") or doc.get("completedAt"),
        "cancelledAt": doc.get("cancelled_at") or doc.get("cancelledAt"),
        "createdAt": doc.get("created_at") or doc.get("createdAt"),
    }


async def generate_unique_token(db: Client) -> str:
    """
    Generate a unique 5-digit numeric token (e.g. "04821").
    Checks Supabase to ensure no active pending job already uses this token.
    """
    for _ in range(50):
        token = "".join(random.choices(string.digits, k=5))
        try:
            res = db.table("jobs").select("token").eq("token", token).neq("status", "completed").execute()
            if not res.data or len(res.data) == 0:
                return token
        except Exception as e:
            print(f"[WARN] Error querying token in Supabase: {e}")
            # If query fails, return generated token
            return token
    raise RuntimeError("Could not generate a unique token after 50 attempts")


async def create_job(
    db: Client,
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
    Insert a new multi-file print job record into Supabase.
    Returns the formatted inserted job.
    """
    job_row = {
        "token": token.upper(),
        "user_email": (user_email or "").strip().lower(),
        "user_name": user_name or "",
        "total_files": total_files,
        "total_pages": total_pages,
        "total_cost": total_cost,
        "files": files,
        "combined_color_file_url": combined_color_url,
        "combined_bw_file_url": combined_bw_url,
        "razorpay_order_id": razorpay_order_id,
        "payment_status": payment_status,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        res = db.table("jobs").insert(job_row).execute()
        if res.data and len(res.data) > 0:
            return _format_job_doc(res.data[0])
    except Exception as e:
        err_str = str(e)
        print(f"[ERROR] Failed to insert job into Supabase: {e}")
        if "PGRST125" in err_str or "Invalid path" in err_str:
            raise RuntimeError(
                "Supabase 'jobs' table not found or SUPABASE_URL has invalid path. "
                "1) Ensure SUPABASE_URL is 'https://<project-ref>.supabase.co' (without /rest/v1). "
                "2) Run the SQL script from 'backend/supabase_schema.sql' in your Supabase SQL Editor."
            ) from e
        elif "relation" in err_str and "does not exist" in err_str:
            raise RuntimeError(
                "Table 'jobs' does not exist in your Supabase PostgreSQL database. "
                "Please run 'backend/supabase_schema.sql' in your Supabase SQL Editor."
            ) from e
        raise e

    return _format_job_doc(job_row)


async def mark_job_paid(
    db: Client,
    token: str,
    payment_id: str,
    order_id: Optional[str] = None,
) -> bool:
    """
    Update job payment status to 'paid' with Razorpay payment details.
    """
    update_data: dict[str, Any] = {
        "payment_status": "paid",
        "razorpay_payment_id": payment_id,
        "paid_at": datetime.now(timezone.utc).isoformat(),
    }
    if order_id:
        update_data["razorpay_order_id"] = order_id

    try:
        res = db.table("jobs").update(update_data).eq("token", token.upper()).execute()
        return bool(res.data and len(res.data) > 0)
    except Exception as e:
        print(f"[ERROR] Error marking job paid in Supabase: {e}")
        return False


async def get_queue_jobs(db: Client, limit: int = 50) -> list[dict]:
    """
    Fetch active pending print jobs for the admin live queue:
    1. Paid online jobs appear FIRST, sorted by payment time.
    2. Offline/Unpaid jobs appear after paid jobs, sorted by creation time.
    """
    try:
        res = db.table("jobs").select("*").eq("status", "pending").execute()
        raw_jobs = res.data or []
    except Exception as e:
        print(f"[ERROR] Error fetching queue jobs from Supabase: {e}")
        return []

    # Sort in Python: paid first (0), unpaid second (1), then timestamp
    def sort_key(j: dict):
        is_paid = 0 if (j.get("payment_status") or j.get("paymentStatus")) == "paid" else 1
        ts = j.get("paid_at") or j.get("paidAt") or j.get("created_at") or j.get("createdAt") or ""
        return (is_paid, str(ts))

    raw_jobs.sort(key=sort_key)
    return [_format_job_doc(j) for j in raw_jobs[:limit]]


async def get_job_by_token(db: Client, token: str) -> Optional[dict]:
    """
    Find a job by its 5-character token.
    Returns the job document or None if not found.
    """
    try:
        res = db.table("jobs").select("*").eq("token", token.upper()).execute()
        if res.data and len(res.data) > 0:
            return _format_job_doc(res.data[0])
    except Exception as e:
        print(f"[ERROR] Error fetching job by token '{token}' from Supabase: {e}")
    return None


async def mark_job_completed(db: Client, token: str) -> bool:
    """
    Set a job's status to 'completed'.
    Returns True if a document was modified, False otherwise.
    """
    update_data = {
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        res = db.table("jobs").update(update_data).eq("token", token.upper()).eq("status", "pending").execute()
        return bool(res.data and len(res.data) > 0)
    except Exception as e:
        print(f"[ERROR] Error marking job completed in Supabase: {e}")
        return False


async def get_user_jobs(db: Client, user_email: str, limit: int = 50) -> list[dict]:
    """
    Retrieve print and transaction history for a specific student, sorted by newest first.
    """
    try:
        clean_email = (user_email or "").strip().lower()
        res = db.table("jobs").select("*").ilike("user_email", clean_email).order("created_at", desc=True).limit(limit).execute()
        return [_format_job_doc(j) for j in (res.data or [])]
    except Exception as e:
        print(f"[ERROR] Error fetching user jobs for '{user_email}' from Supabase: {e}")
        return []


async def cancel_job(db: Client, token: str, user_email: str) -> tuple[bool, str]:
    """
    Cancel an active print job by the student who created it.
    Returns (success, message).
    """
    job = await get_job_by_token(db, token)
    if not job:
        return False, f"Job #{token} not found"

    # Verify ownership
    job_email = str(job.get("userEmail") or job.get("user_email") or "").strip().lower()
    if job_email != user_email.strip().lower():
        return False, "You can only cancel your own print jobs"

    # Check status
    if job.get("status") == "completed":
        return False, "Cannot cancel an order that has already been printed/completed"

    if job.get("status") == "cancelled":
        return False, "This order is already cancelled"

    # Perform cancellation
    update_data = {
        "status": "cancelled",
        "cancelled_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        res = db.table("jobs").update(update_data).eq("token", token.upper()).eq("status", "pending").execute()
        if res.data and len(res.data) > 0:
            return True, "Order cancelled successfully"
    except Exception as e:
        print(f"[ERROR] Error cancelling job in Supabase: {e}")

    return False, "Could not cancel order"


