import json
import math

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, HTTPException, status
from supabase import Client

from api.dependencies import get_current_user, get_db
from core.config import settings
from models.user import FirebaseUser
from models.job import JobCreateResponse, JobDetail, JobCompleteResponse, JobCancelResponse
from services import db_service, pdf_service, storage_service

router = APIRouter(prefix="/api/jobs", tags=["Print Jobs"])


RATES = {
    "A4": {"color": {"single": 10, "double": 20}, "bw": {"single": 2, "double": 4}},
    "A3": {"color": {"single": 15, "double": 30}, "bw": {"single": 4, "double": 8}},
}


def _calculate_cost(
    color_count: int,
    bw_count: int,
    paper_size: str,
    color_double_sided: bool,
    bw_double_sided: bool,
    binding: bool,
    copies: int,
) -> int:
    """
    Calculate total cost using the pricing rules:

      | Paper | Type  | Single-sided | Double-sided |
      |-------|-------|-------------|-------------|
      | A4    | Color | ₹10/page    | ₹20/page    |
      | A4    | B&W   | ₹2/page     | ₹4/page     |
      | A3    | Color | ₹15/page    | ₹30/page    |
      | A3    | B&W   | ₹4/page     | ₹8/page     |

      Binding: +₹20 flat (per copy)
    """
    rates = RATES.get(paper_size, RATES["A4"])
    color_rate = rates["color"]["double"] if color_double_sided else rates["color"]["single"]
    bw_rate = rates["bw"]["double"] if bw_double_sided else rates["bw"]["single"]

    # Double-sided → 2 pages per sheet, so sheets = ceil(pages / 2)
    color_sheets = math.ceil(color_count / 2) if color_double_sided else color_count
    bw_sheets = math.ceil(bw_count / 2) if bw_double_sided else bw_count

    binding_cost = 20 if binding else 0
    subtotal = (color_sheets * color_rate) + (bw_sheets * bw_rate) + binding_cost
    return subtotal * copies


# ──────────────────────────────────────────────────────────────
# POST /api/jobs  –  Student submits a new print job (up to 5 PDFs)
# ──────────────────────────────────────────────────────────────
@router.post("", response_model=JobCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    files: list[UploadFile] = File(...),
    files_settings: str = Form("[]"),
    payment_method: str = Form("online"),
    user: FirebaseUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """
    Create a new print job supporting up to 5 PDF files.

    - Accepts up to 5 PDF files.
    - Each file has its own print configuration.
    - Splits each PDF into COLOR and BW parts.
    - Merges all color pages and all BW pages into master print files.
    - Supports payment_method: "online" or "offline" (Pay at Counter).
    - Saves all files and records job in MongoDB.
    - Returns token and grand total cost.
    """
    if not files or len(files) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 1 PDF file is required",
        )

    if len(files) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 5 PDF files allowed per print job",
        )

    # Parse files settings JSON
    try:
        settings_list = json.loads(files_settings)
        if not isinstance(settings_list, list):
            settings_list = []
    except (json.JSONDecodeError, TypeError):
        settings_list = []

    files_data = []
    files_summary = []
    total_pages_all = 0
    grand_total_cost = 0

    all_color_bytes_list = []
    all_bw_bytes_list = []

    try:
        for idx, uploaded_file in enumerate(files, start=1):
            filename = uploaded_file.filename or f"document_{idx}.pdf"
            file_bytes = await uploaded_file.read()

            if len(file_bytes) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File '{filename}' is empty",
                )

            # Check PDF validity (extension, content-type, or %PDF magic header)
            is_pdf_ext = filename.lower().endswith(".pdf")
            is_pdf_magic = len(file_bytes) >= 4 and file_bytes.startswith(b"%PDF")
            is_pdf_mime = bool(
                uploaded_file.content_type
                and any(t in uploaded_file.content_type.lower() for t in ["pdf", "octet-stream", "binary"])
            )

            if not (is_pdf_ext or is_pdf_magic or is_pdf_mime):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File '{filename}' is not a valid PDF",
                )

            try:
                actual_pages = pdf_service.get_page_count(file_bytes)
            except Exception as pdf_err:
                print(f"[ERROR] Failed to count pages for '{filename}': {pdf_err}")
                actual_pages = 0

            if actual_pages == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Could not read pages from PDF '{filename}'. Please ensure it is a valid, uncorrupted PDF.",
                )

            # Get settings for this file (fallback to default)
            file_conf = settings_list[idx - 1] if idx - 1 < len(settings_list) else {}
            color_pages = file_conf.get("color_pages", [])
            if not isinstance(color_pages, list):
                color_pages = []
            color_pages = [p for p in color_pages if isinstance(p, int) and 1 <= p <= actual_pages]

            paper_size = file_conf.get("paper_size", "A4")
            if paper_size not in ("A4", "A3"):
                paper_size = "A4"

            color_double_sided = bool(file_conf.get("color_double_sided", False))
            bw_double_sided = bool(file_conf.get("bw_double_sided", False))
            binding = bool(file_conf.get("binding", False))
            copies = max(1, int(file_conf.get("copies", 1)))

            color_count = len(color_pages)
            bw_count = actual_pages - color_count
            file_cost = _calculate_cost(
                color_count,
                bw_count,
                paper_size,
                color_double_sided,
                bw_double_sided,
                binding,
                copies,
            )

            total_pages_all += actual_pages
            grand_total_cost += file_cost

            # Split this PDF into Color and B&W
            try:
                color_bytes, bw_bytes = pdf_service.split_pdf(file_bytes, color_pages, actual_pages)
            except Exception as split_err:
                print(f"[ERROR] PDF splitting failed for '{filename}': {split_err}")
                color_bytes, bw_bytes = None, file_bytes

            if color_bytes:
                all_color_bytes_list.append(color_bytes)
            if bw_bytes:
                all_bw_bytes_list.append(bw_bytes)

            files_data.append({
                "index": idx,
                "filename": filename,
                "original_bytes": file_bytes,
                "color_bytes": color_bytes,
                "bw_bytes": bw_bytes,
            })

            files_summary.append({
                "filename": filename,
                "totalPages": actual_pages,
                "colorPages": color_pages,
                "paperSize": paper_size,
                "colorDoubleSided": color_double_sided,
                "bwDoubleSided": bw_double_sided,
                "binding": binding,
                "copies": copies,
                "fileCost": file_cost,
            })

        # Merge master PDFs
        try:
            combined_color_bytes = pdf_service.merge_pdf_bytes(all_color_bytes_list)
            combined_bw_bytes = pdf_service.merge_pdf_bytes(all_bw_bytes_list)
        except Exception as merge_err:
            print(f"[WARN] PDF merge error: {merge_err}")
            combined_color_bytes, combined_bw_bytes = None, None

        # Save to storage
        token = await db_service.generate_unique_token(db)
        storage_result = storage_service.upload_multi_job_files(
            token=token,
            files_data=files_data,
            combined_color_bytes=combined_color_bytes,
            combined_bw_bytes=combined_bw_bytes,
        )

        # Link saved URLs to files_summary
        for i, saved in enumerate(storage_result["saved_files"]):
            files_summary[i]["originalFileUrl"] = saved["originalUrl"]
            files_summary[i]["colorFileUrl"] = saved["colorUrl"]
            files_summary[i]["bwFileUrl"] = saved["bwUrl"]

        # Generate Razorpay Order ID for online payments
        amount_paise = grand_total_cost * 100
        razorpay_order_id = None

        is_live_key = (
            settings.RAZORPAY_KEY_ID
            and not settings.RAZORPAY_KEY_ID.startswith("rzp_test_mock")
            and not "your_razorpay_key" in settings.RAZORPAY_KEY_ID.lower()
            and settings.RAZORPAY_KEY_SECRET
            and not "your_razorpay_secret" in settings.RAZORPAY_KEY_SECRET.lower()
        )

        if payment_method == "online":
            if is_live_key:
                try:
                    import razorpay
                    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
                    order_data = {
                        "amount": int(amount_paise),
                        "currency": "INR",
                        "receipt": f"job_{token}",
                        "notes": {
                            "token": str(token),
                            "student_email": str(user.email or ""),
                        },
                    }
                    rzp_order = client.order.create(data=order_data)
                    razorpay_order_id = rzp_order.get("id")
                    print(f"[INFO] Razorpay order created: {razorpay_order_id} for token {token} (Amount: {amount_paise} paise)")
                except Exception as e:
                    print(f"[ERROR] Razorpay order creation failed: {e}")
                    razorpay_order_id = None
            else:
                razorpay_order_id = None

        initial_payment_status = "pending" if payment_method == "online" else "offline_cash"

        # Save to MongoDB
        await db_service.create_job(
            db=db,
            token=token,
            user_email=user.email,
            user_name=user.name,
            total_files=len(files),
            total_pages=total_pages_all,
            total_cost=grand_total_cost,
            files=files_summary,
            combined_color_url=storage_result["combined_color_url"],
            combined_bw_url=storage_result["combined_bw_url"],
            razorpay_order_id=razorpay_order_id,
            payment_status=initial_payment_status,
        )

        return JobCreateResponse(
            token=token,
            totalCost=grand_total_cost,
            amountPaise=amount_paise,
            razorpayOrderId=razorpay_order_id,
            razorpayKeyId=settings.RAZORPAY_KEY_ID,
            paymentStatus=initial_payment_status,
        )

    except HTTPException:
        raise
    except Exception as exc:
        print(f"[ERROR] Exception during create_job: {exc}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit print job: {str(exc)}",
        )


# ──────────────────────────────────────────────────────────────
# GET /api/jobs/my-history  –  Student transaction & print history
# ──────────────────────────────────────────────────────────────
@router.get("/my-history", response_model=list[JobDetail])
async def get_my_history(
    request: Request,
    limit: int = 50,
    user: FirebaseUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """
    Retrieve print jobs and payment history for the logged-in student.
    """
    raw_jobs = await db_service.get_user_jobs(db, user.email, limit=limit)
    base = str(request.base_url).rstrip("/")

    def full_url(path):
        if not path:
            return None
        return f"{base}{path}"

    results = []
    for job in raw_jobs:
        files_list = []
        if "files" in job and isinstance(job["files"], list) and len(job["files"]) > 0:
            for f in job["files"]:
                files_list.append({
                    "filename": f.get("filename", "document.pdf"),
                    "totalPages": f.get("totalPages", 0),
                    "colorPages": f.get("colorPages", []),
                    "paperSize": f.get("paperSize", "A4"),
                    "colorDoubleSided": f.get("colorDoubleSided", False),
                    "bwDoubleSided": f.get("bwDoubleSided", False),
                    "binding": f.get("binding", False),
                    "copies": f.get("copies", 1),
                    "fileCost": f.get("fileCost", 0),
                    "originalFileUrl": full_url(f.get("originalFileUrl")),
                    "colorFileUrl": full_url(f.get("colorFileUrl")),
                    "bwFileUrl": full_url(f.get("bwFileUrl")),
                })
        else:
            files_list.append({
                "filename": "document.pdf",
                "totalPages": job.get("totalPages", 0),
                "colorPages": job.get("colorPages", []),
                "paperSize": job.get("paperSize", "A4"),
                "colorDoubleSided": job.get("colorDoubleSided", False),
                "bwDoubleSided": job.get("bwDoubleSided", False),
                "binding": job.get("binding", False),
                "copies": job.get("copies", 1),
                "fileCost": job.get("totalCost", 0),
                "originalFileUrl": full_url(job.get("originalFileUrl")),
                "colorFileUrl": full_url(job.get("colorFileUrl")),
                "bwFileUrl": full_url(job.get("bwFileUrl")),
            })

        results.append(
            JobDetail(
                token=job["token"],
                userEmail=job["userEmail"],
                userName=job.get("userName"),
                totalFiles=job.get("totalFiles", len(files_list)),
                totalPages=job.get("totalPages", 0),
                totalCost=job.get("totalCost", 0),
                status=job.get("status", "pending"),
                paymentStatus=job.get("paymentStatus", "pending"),
                razorpayOrderId=job.get("razorpayOrderId"),
                razorpayPaymentId=job.get("razorpayPaymentId"),
                paidAt=job.get("paidAt"),
                files=files_list,
                combinedColorFileUrl=full_url(job.get("combinedColorFileUrl") or job.get("colorFileUrl")),
                combinedBwFileUrl=full_url(job.get("combinedBwFileUrl") or job.get("bwFileUrl")),
                createdAt=job.get("createdAt"),
            )
        )

    return results


# ──────────────────────────────────────────────────────────────
# GET /api/jobs/queue  –  Admin live print queue
# ──────────────────────────────────────────────────────────────
@router.get("/queue", response_model=list[JobDetail])
async def get_print_queue(
    request: Request,
    limit: int = 50,
    user: FirebaseUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """
    Retrieve active pending jobs in real time for the admin live print feed.
    """
    raw_jobs = await db_service.get_queue_jobs(db, limit=limit)
    base = str(request.base_url).rstrip("/")

    def full_url(path):
        if not path:
            return None
        return f"{base}{path}"

    results = []
    for job in raw_jobs:
        files_list = []
        if "files" in job and isinstance(job["files"], list) and len(job["files"]) > 0:
            for f in job["files"]:
                files_list.append({
                    "filename": f.get("filename", "document.pdf"),
                    "totalPages": f.get("totalPages", 0),
                    "colorPages": f.get("colorPages", []),
                    "paperSize": f.get("paperSize", "A4"),
                    "colorDoubleSided": f.get("colorDoubleSided", False),
                    "bwDoubleSided": f.get("bwDoubleSided", False),
                    "binding": f.get("binding", False),
                    "copies": f.get("copies", 1),
                    "fileCost": f.get("fileCost", 0),
                    "originalFileUrl": full_url(f.get("originalFileUrl")),
                    "colorFileUrl": full_url(f.get("colorFileUrl")),
                    "bwFileUrl": full_url(f.get("bwFileUrl")),
                })
        else:
            files_list.append({
                "filename": "document.pdf",
                "totalPages": job.get("totalPages", 0),
                "colorPages": job.get("colorPages", []),
                "paperSize": job.get("paperSize", "A4"),
                "colorDoubleSided": job.get("colorDoubleSided", False),
                "bwDoubleSided": job.get("bwDoubleSided", False),
                "binding": job.get("binding", False),
                "copies": job.get("copies", 1),
                "fileCost": job.get("totalCost", 0),
                "originalFileUrl": full_url(job.get("originalFileUrl")),
                "colorFileUrl": full_url(job.get("colorFileUrl")),
                "bwFileUrl": full_url(job.get("bwFileUrl")),
            })

        results.append(
            JobDetail(
                token=job["token"],
                userEmail=job["userEmail"],
                userName=job.get("userName"),
                totalFiles=job.get("totalFiles", len(files_list)),
                totalPages=job.get("totalPages", 0),
                totalCost=job.get("totalCost", 0),
                status=job.get("status", "pending"),
                paymentStatus=job.get("paymentStatus", "pending"),
                razorpayOrderId=job.get("razorpayOrderId"),
                razorpayPaymentId=job.get("razorpayPaymentId"),
                paidAt=job.get("paidAt"),
                files=files_list,
                combinedColorFileUrl=full_url(job.get("combinedColorFileUrl") or job.get("colorFileUrl")),
                combinedBwFileUrl=full_url(job.get("combinedBwFileUrl") or job.get("bwFileUrl")),
                createdAt=job.get("createdAt"),
            )
        )

    return results


# ──────────────────────────────────────────────────────────────
# GET /api/jobs/{token}  –  Admin looks up a job by token
# ──────────────────────────────────────────────────────────────
@router.get("/{token}", response_model=JobDetail)
async def get_job(
    token: str,
    request: Request,
    user: FirebaseUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """
    Retrieve a print job by its 5-digit token.
    Returns all file breakdowns, payment status, and download URLs.
    """
    job = await db_service.get_job_by_token(db, token.upper())

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No job found for token '{token.upper()}'",
        )

    base = str(request.base_url).rstrip("/")

    def full_url(path):
        if not path:
            return None
        return f"{base}{path}"

    files_list = []
    if "files" in job and isinstance(job["files"], list) and len(job["files"]) > 0:
        for f in job["files"]:
            files_list.append({
                "filename": f.get("filename", "document.pdf"),
                "totalPages": f.get("totalPages", 0),
                "colorPages": f.get("colorPages", []),
                "paperSize": f.get("paperSize", "A4"),
                "colorDoubleSided": f.get("colorDoubleSided", False),
                "bwDoubleSided": f.get("bwDoubleSided", False),
                "binding": f.get("binding", False),
                "copies": f.get("copies", 1),
                "fileCost": f.get("fileCost", 0),
                "originalFileUrl": full_url(f.get("originalFileUrl")),
                "colorFileUrl": full_url(f.get("colorFileUrl")),
                "bwFileUrl": full_url(f.get("bwFileUrl")),
            })
    else:
        files_list.append({
            "filename": "document.pdf",
            "totalPages": job.get("totalPages", 0),
            "colorPages": job.get("colorPages", []),
            "paperSize": job.get("paperSize", "A4"),
            "colorDoubleSided": job.get("colorDoubleSided", False),
            "bwDoubleSided": job.get("bwDoubleSided", False),
            "binding": job.get("binding", False),
            "copies": job.get("copies", 1),
            "fileCost": job.get("totalCost", 0),
            "originalFileUrl": full_url(job.get("originalFileUrl")),
            "colorFileUrl": full_url(job.get("colorFileUrl")),
            "bwFileUrl": full_url(job.get("bwFileUrl")),
        })

    return JobDetail(
        token=job["token"],
        userEmail=job["userEmail"],
        userName=job.get("userName"),
        totalFiles=job.get("totalFiles", len(files_list)),
        totalPages=job.get("totalPages", 0),
        totalCost=job.get("totalCost", 0),
        status=job.get("status", "pending"),
        paymentStatus=job.get("paymentStatus", "pending"),
        razorpayOrderId=job.get("razorpayOrderId"),
        razorpayPaymentId=job.get("razorpayPaymentId"),
        paidAt=job.get("paidAt"),
        files=files_list,
        combinedColorFileUrl=full_url(job.get("combinedColorFileUrl") or job.get("colorFileUrl")),
        combinedBwFileUrl=full_url(job.get("combinedBwFileUrl") or job.get("bwFileUrl")),
        createdAt=job.get("createdAt"),
    )


# ──────────────────────────────────────────────────────────────
# PATCH /api/jobs/{token}/complete  –  Admin marks job done
# ──────────────────────────────────────────────────────────────
@router.patch("/{token}/complete", response_model=JobCompleteResponse)
async def complete_job(
    token: str,
    user: FirebaseUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """
    Mark a print job as completed.
    Only callable by admins (frontend restricts access to the admin dashboard).
    """
    # Verify caller is an admin
    if user.email.lower() not in settings.ADMIN_EMAILS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can mark jobs as completed",
        )

    success = await db_service.mark_job_completed(db, token.upper())

    if not success:
        # Either the job doesn't exist or it's already completed
        job = await db_service.get_job_by_token(db, token.upper())
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No job found for token '{token.upper()}'",
            )
        if job.get("status") == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This job is already marked as completed",
            )

    return JobCompleteResponse(token=token.upper())


# ──────────────────────────────────────────────────────────────
# PATCH /api/jobs/{token}/cancel  –  Student cancels print order
# ──────────────────────────────────────────────────────────────
@router.patch("/{token}/cancel", response_model=JobCancelResponse)
async def cancel_job(
    token: str,
    user: FirebaseUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """
    Cancel an active print order by the student who created it.
    Can only cancel if status is 'pending'.
    """
    success, message = await db_service.cancel_job(db, token.upper(), user.email)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    return JobCancelResponse(token=token.upper(), message=message)


