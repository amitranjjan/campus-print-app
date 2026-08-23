import os
from typing import Optional

# Base directory for all uploaded files
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")


def _ensure_dir(path: str):
    """Create directory if it doesn't exist."""
    os.makedirs(path, exist_ok=True)


def _save_file(file_bytes: bytes, file_path: str) -> str:
    """
    Save raw bytes to a local file and return the relative URL path.

    Args:
        file_bytes: The raw bytes to write.
        file_path: Full filesystem path for the file.

    Returns:
        URL path relative to the /files mount (e.g. "jobs/AB12C/AB12C_COLOR.pdf").
    """
    _ensure_dir(os.path.dirname(file_path))
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    # Return the path relative to UPLOADS_DIR for URL construction
    rel_path = os.path.relpath(file_path, UPLOADS_DIR).replace("\\", "/")
    return rel_path


def upload_file(file_bytes: bytes, destination_path: str) -> str:
    """
    Save a file locally and return its download URL.

    Args:
        file_bytes: The raw bytes of the file to save.
        destination_path: Relative path within uploads/
                          (e.g. "jobs/AB12C/AB12C_COLOR.pdf").

    Returns:
        URL path like "/files/jobs/AB12C/AB12C_COLOR.pdf"
    """
    full_path = os.path.join(UPLOADS_DIR, destination_path)
    rel_path = _save_file(file_bytes, full_path)
    return f"/files/{rel_path}"


def upload_job_files(
    token: str,
    original_bytes: bytes,
    color_bytes: Optional[bytes],
    bw_bytes: Optional[bytes],
) -> tuple[str, Optional[str], Optional[str]]:
    """
    Save the original, color-split, and BW-split PDFs for a print job locally.

    Files are stored under:  uploads/jobs/{token}/

    Args:
        token: The 5-character job token (used as folder name).
        original_bytes: The original uploaded PDF.
        color_bytes: The color-only split PDF (can be None).
        bw_bytes: The B&W-only split PDF (can be None).

    Returns:
        Tuple of (original_url, color_url, bw_url).
        color_url and bw_url can be None if there are no pages of that type.
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

    Files are stored under: uploads/jobs/{token}/

    Args:
        token: 5-digit job token.
        files_data: list of dicts with:
            {
                "index": int,
                "filename": str,
                "original_bytes": bytes,
                "color_bytes": bytes | None,
                "bw_bytes": bytes | None,
            }
        combined_color_bytes: All color pages merged into one PDF.
        combined_bw_bytes: All B&W pages merged into one PDF.

    Returns:
        dict with:
            "saved_files": list of dicts with URLs for each file,
            "combined_color_url": str | None,
            "combined_bw_url": str | None
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
