import os
from typing import Optional
from core.config import settings

# Base directory for all uploaded files (fallback)
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")

_supabase_client = None


def _get_supabase_client():
    """Lazy initialize Supabase client for storage."""
    global _supabase_client
    if _supabase_client is None and settings.SUPABASE_URL and settings.SUPABASE_KEY:
        try:
            from supabase import create_client
            _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
            print("[INFO] Supabase Storage client initialized")
        except Exception as e:
            print(f"[WARN] Failed to initialize Supabase Storage client: {e}")
            _supabase_client = None
    return _supabase_client


def _ensure_dir(path: str):
    """Create directory if it doesn't exist."""
    os.makedirs(path, exist_ok=True)


def _save_file_locally(file_bytes: bytes, file_path: str) -> str:
    """
    Save raw bytes to a local file and return the relative URL path.
    """
    _ensure_dir(os.path.dirname(file_path))
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    rel_path = os.path.relpath(file_path, UPLOADS_DIR).replace("\\", "/")
    return rel_path


def upload_file(file_bytes: bytes, destination_path: str) -> str:
    """
    Upload a file to Supabase Storage (or fallback to local disk).
    Returns the public download URL or relative path.
    """
    # 1. Try Supabase Storage
    supabase = _get_supabase_client()
    bucket_name = settings.SUPABASE_STORAGE_BUCKET or "print-jobs"

    if supabase:
        try:
            clean_path = destination_path.lstrip("/")
            # Upload or overwrite file in Supabase bucket
            supabase.storage.from_(bucket_name).upload(
                path=clean_path,
                file=file_bytes,
                file_options={"content-type": "application/pdf", "upsert": "true"},
            )
            # Retrieve public URL
            public_url = supabase.storage.from_(bucket_name).get_public_url(clean_path)
            if public_url:
                return public_url
        except Exception as e:
            print(f"[WARN] Supabase storage upload failed for '{destination_path}': {e}. Falling back to local storage.")

    # 2. Local File Storage Fallback
    full_path = os.path.join(UPLOADS_DIR, destination_path)
    rel_path = _save_file_locally(file_bytes, full_path)
    return f"/files/{rel_path}"


def upload_job_files(
    token: str,
    original_bytes: bytes,
    color_bytes: Optional[bytes],
    bw_bytes: Optional[bytes],
) -> tuple[str, Optional[str], Optional[str]]:
    """
    Save the original, color-split, and BW-split PDFs for a print job.
    """
    folder = f"jobs/{token}"

    # Save original
    original_url = upload_file(
        original_bytes,
        f"{folder}/{token}_ORIGINAL.pdf",
    )

    # Save color split
    color_url = None
    if color_bytes:
        color_url = upload_file(
            color_bytes,
            f"{folder}/{token}_COLOR.pdf",
        )

    # Save BW split
    bw_url = None
    if bw_bytes:
        bw_url = upload_file(
            bw_bytes,
            f"{folder}/{token}_BW.pdf",
        )

    return original_url, color_url, bw_url


def upload_multi_job_files(
    token: str,
    files_data: list[dict],
    combined_color_bytes: Optional[bytes] = None,
    combined_bw_bytes: Optional[bytes] = None,
) -> dict:
    """
    Save multiple PDF files and their splits for a print job, along with merged master PDFs.
    """
    folder = f"jobs/{token}"
    saved_files = []

    for item in files_data:
        idx = item["index"]
        clean_name = "".join(c for c in item.get("filename", f"file_{idx}") if c.isalnum() or c in "._- ")
        if not clean_name.lower().endswith(".pdf"):
            clean_name += ".pdf"
        base_name = clean_name[:-4]

        orig_url = upload_file(
            item["original_bytes"],
            f"{folder}/{idx}_{base_name}_ORIGINAL.pdf",
        )

        col_url = None
        if item.get("color_bytes"):
            col_url = upload_file(
                item["color_bytes"],
                f"{folder}/{idx}_{base_name}_COLOR.pdf",
            )

        bw_url = None
        if item.get("bw_bytes"):
            bw_url = upload_file(
                item["bw_bytes"],
                f"{folder}/{idx}_{base_name}_BW.pdf",
            )

        saved_files.append({
            "originalUrl": orig_url,
            "colorUrl": col_url,
            "bwUrl": bw_url,
        })

    combined_color_url = None
    if combined_color_bytes:
        combined_color_url = upload_file(
            combined_color_bytes,
            f"{folder}/{token}_ALL_COLOR.pdf",
        )

    combined_bw_url = None
    if combined_bw_bytes:
        combined_bw_url = upload_file(
            combined_bw_bytes,
            f"{folder}/{token}_ALL_BW.pdf",
        )

    return {
        "saved_files": saved_files,
        "combined_color_url": combined_color_url,
        "combined_bw_url": combined_bw_url,
    }
