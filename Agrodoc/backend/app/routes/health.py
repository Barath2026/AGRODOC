from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..config import settings
from ..ml.model_loader import CLASS_NAMES, get_device

router = APIRouter(tags=["Health and System"])


@router.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "model_version": settings.model_version,
        "status": "online",
        "supported_crops": ["Tomato"],
        "supported_classes": CLASS_NAMES,
    }


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    db_ok = True
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
    except Exception:
        db_ok = False

    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "error",
        "model_loaded": True,
        "device": str(get_device()),
        "model_version": settings.model_version,
    }


@router.get("/config")
def get_public_config():
    return {
        "max_upload_mb": settings.max_upload_mb,
        "allowed_types": ["image/jpeg", "image/png", "image/webp"],
        "confidence_threshold": settings.confidence_threshold,
        "supported_crop": "Tomato",
        "classes": CLASS_NAMES,
    }
