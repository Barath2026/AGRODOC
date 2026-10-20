import os
import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc, or_
from ..database import get_db
from ..models.scan import Scan
from ..models.field import Field
from ..models.field_zone import FieldZone
from ..models.user import User
from ..schemas.diagnosis import ScanHistoryResponse, ScanListItem
from ..services.auth_service import get_current_user
from ..services.diagnosis_service import process_diagnosis_and_save
from ..utils.validators import validate_image_file

router = APIRouter(tags=["Diagnosis"])


@router.post("/diagnosis/predict")
@router.post("/predict")
async def predict_endpoint(
    image: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    field_id: Optional[int] = Form(None),
    field_zone_id: Optional[int] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    location_name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    upload = image or file
    if not upload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An image file is required. Please upload a tomato leaf image."
        )

    file_bytes = await upload.read()
    pil_image = validate_image_file(file_bytes, filename=upload.filename, content_type=upload.content_type)

    result = process_diagnosis_and_save(
        db=db,
        user=current_user,
        image=pil_image,
        original_filename=upload.filename or "leaf.jpg",
        field_id=field_id,
        field_zone_id=field_zone_id,
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
    )
    return result


@router.get("/diagnosis/history")
def get_diagnosis_history(
    q: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    disease: Optional[str] = Query(None),
    field_id: Optional[int] = Query(None),
    zone_id: Optional[int] = Query(None),
    sort: Optional[str] = Query("newest"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Scan).filter(Scan.user_id == current_user.id)

    # Search filter
    if q:
        search_pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Scan.prediction.ilike(search_pattern),
                Scan.location_name.ilike(search_pattern),
            )
        )

    # Status filter
    if status_filter and status_filter.lower() != "all":
        if status_filter.lower() == "healthy":
            query = query.filter(Scan.health_status == "Healthy")
        elif status_filter.lower() in ("at risk", "at_risk", "risk"):
            query = query.filter(Scan.health_status != "Healthy")

    # Disease filter
    if disease and disease.lower() != "all":
        query = query.filter(Scan.prediction.ilike(f"%{disease.strip()}%"))

    # Field and zone filter
    if field_id:
        query = query.filter(Scan.field_id == field_id)
    if zone_id:
        query = query.filter(Scan.field_zone_id == zone_id)

    # Sorting
    if sort == "oldest":
        query = query.order_by(asc(Scan.scan_datetime))
    else:
        query = query.order_by(desc(Scan.scan_datetime))

    total = query.count()
    scans = query.offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for s in scans:
        zone_str = s.field_zone.zone_name if s.field_zone else "Zone A"
        items.append({
            "id": s.id,
            "reference": f"AD-{s.id:04d}",
            "created_at": s.scan_datetime,
            "createdAt": s.scan_datetime.isoformat(),
            "location": s.location_name or "Unspecified",
            "field_id": s.field_id,
            "field_zone_id": s.field_zone_id,
            "field_zone": zone_str,
            "fieldZone": zone_str,
            "prediction": s.prediction,
            "confidence": s.confidence,
            "confidence_level": s.confidence_level,
            "health_status": s.health_status,
            "health": s.health_status,
            "thumbnail_url": f"/diagnosis/{s.id}/image",
            "image_url": f"/diagnosis/{s.id}/image",
            "image": f"/diagnosis/{s.id}/image",
        })

    pages = (total + page_size - 1) // page_size if page_size else 1

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


@router.get("/diagnosis/{scan_id}")
def get_diagnosis_detail(
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scan = db.query(Scan).filter(Scan.id == scan_id, Scan.user_id == current_user.id).first()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")

    probs = json.loads(scan.probabilities) if scan.probabilities else {}
    recs = json.loads(scan.recommendations) if scan.recommendations else []
    zone_str = scan.field_zone.zone_name if scan.field_zone else "Zone A"

    return {
        "id": scan.id,
        "reference": f"AD-{scan.id:04d}",
        "created_at": scan.scan_datetime.isoformat(),
        "createdAt": scan.scan_datetime.isoformat(),
        "prediction": scan.prediction,
        "confidence": scan.confidence,
        "confidence_level": scan.confidence_level,
        "health_status": scan.health_status,
        "health": scan.health_status,
        "disease": scan.prediction,
        "location": scan.location_name,
        "field_id": scan.field_id,
        "field_zone_id": scan.field_zone_id,
        "field_zone": zone_str,
        "fieldZone": zone_str,
        "analysis": scan.analysis,
        "recommendations": recs,
        "probabilities": probs,
        "image_url": f"/diagnosis/{scan.id}/image",
        "image": f"/diagnosis/{scan.id}/image",
    }


@router.get("/diagnosis/{scan_id}/image")
def get_diagnosis_image(
    scan_id: int,
    db: Session = Depends(get_db),
):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan or not os.path.exists(scan.image_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    return FileResponse(scan.image_path, media_type="image/jpeg")


@router.delete("/diagnosis/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_diagnosis(
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scan = db.query(Scan).filter(Scan.id == scan_id, Scan.user_id == current_user.id).first()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")

    if os.path.exists(scan.image_path):
        try:
            os.remove(scan.image_path)
        except Exception:
            pass

    db.delete(scan)
    db.commit()
    return None
