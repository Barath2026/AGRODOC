import io
from PIL import Image
from fastapi import HTTPException, status
from ..config import settings

ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def validate_image_file(file_bytes: bytes, filename: str = "", content_type: str = "") -> Image.Image:
    # 1. Size check
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image file exceeds maximum allowed size of {settings.max_upload_mb} MB."
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )

    # 2. Content-type check if provided
    if content_type and content_type.lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image format. Please upload JPG, PNG, or WEBP."
        )

    # 3. Decode & content verification
    try:
        image = Image.open(io.BytesIO(file_bytes))
        image.verify()  # verify format/integrity
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content is not a valid or readable image."
        )

    # Re-open after verify() (Pillow closes after verify)
    try:
        image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to decode image data."
        )

    # 4. Dimension check
    width, height = image.size
    if width < 50 or height < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image resolution too low ({width}x{height}). Minimum required is 50x50 pixels."
        )

    return image
