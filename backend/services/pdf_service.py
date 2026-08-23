import io
from PyPDF2 import PdfReader, PdfWriter


def split_pdf(
    file_bytes: bytes,
    color_pages: list[int],
    total_pages: int,
) -> tuple[bytes | None, bytes | None]:
    """
    Split a PDF into two separate PDFs: one containing the color pages
    and one containing the remaining B&W pages.

    Page numbers in color_pages are 1-indexed (matching what the user sees).

    Args:
        file_bytes: The raw bytes of the original PDF.
        color_pages: List of 1-indexed page numbers to go into the color PDF.
        total_pages: Total number of pages in the document.

    Returns:
        A tuple of (color_pdf_bytes, bw_pdf_bytes).
        Either value can be None if there are no pages of that type.
    """
    reader = PdfReader(io.BytesIO(file_bytes))
    actual_pages = len(reader.pages)

    # Use actual page count from the PDF itself
    if total_pages != actual_pages:
        total_pages = actual_pages

    # Convert 1-indexed color pages to a set for O(1) lookup
    color_set = set(color_pages)

    color_writer = PdfWriter()
    bw_writer = PdfWriter()

    for i in range(total_pages):
        page_num = i + 1  # 1-indexed
        page = reader.pages[i]

        if page_num in color_set:
            color_writer.add_page(page)
        else:
            bw_writer.add_page(page)

    # Serialize to bytes
    color_pdf_bytes = None
    if len(color_writer.pages) > 0:
        color_buffer = io.BytesIO()
        color_writer.write(color_buffer)
        color_pdf_bytes = color_buffer.getvalue()

    bw_pdf_bytes = None
    if len(bw_writer.pages) > 0:
        bw_buffer = io.BytesIO()
        bw_writer.write(bw_buffer)
        bw_pdf_bytes = bw_buffer.getvalue()

    return color_pdf_bytes, bw_pdf_bytes


def get_page_count(file_bytes: bytes) -> int:
    """Return the number of pages in a PDF."""
    reader = PdfReader(io.BytesIO(file_bytes))
    return len(reader.pages)


def merge_pdf_bytes(pdf_bytes_list: list[bytes]) -> bytes | None:
    """
    Merge multiple PDF byte streams into a single combined PDF byte stream.
    Returns None if the list is empty or no valid pages.
    """
    valid_bytes = [b for b in pdf_bytes_list if b and len(b) > 0]
    if not valid_bytes:
        return None

    if len(valid_bytes) == 1:
        return valid_bytes[0]

    merged_writer = PdfWriter()
    total_added = 0

    for b in valid_bytes:
        try:
            reader = PdfReader(io.BytesIO(b))
            for page in reader.pages:
                merged_writer.add_page(page)
                total_added += 1
        except Exception as e:
            print(f"Error merging PDF chunk: {e}")

    if total_added == 0:
        return None

    output_buffer = io.BytesIO()
    merged_writer.write(output_buffer)
    return output_buffer.getvalue()

