import os
import uuid
import json
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any
from PIL import Image
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from ..models.scan import Scan
from ..models.report import Report
from ..models.field import Field
from ..models.field_zone import FieldZone
from ..models.user import User
from ..ml.predictor import predict_image
from ..config import settings
from .pdf_service import generate_crop_health_pdf



def process_diagnosis_and_save(
    db: Session,
    user: User,
    image: Image.Image,
    original_filename: str = "leaf.jpg",
    field_id: Optional[int] = None,
    field_zone_id: Optional[int] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    location_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Core workflow:
    1. Save original image privately to backend/uploads
    2. Execute real deep learning model prediction
    3. Persist scan record and report to database
    4. Auto-generate PDF report
    5. Return consolidated diagnostic payload
    """
    field_obj = None
    zone_obj = None
    if field_id:
        field_obj = db.query(Field).filter(Field.id == field_id, Field.user_id == user.id).first()
        if not field_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")
    if field_zone_id:
        zone_obj = db.query(FieldZone).join(Field).filter(
            FieldZone.id == field_zone_id,
            Field.user_id == user.id,
        ).first()
        if not zone_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field zone not found")
        if field_obj and zone_obj.field_id != field_obj.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Field zone does not belong to the selected field")
        field_obj = field_obj or zone_obj.field

    # 1. Save image privately
    os.makedirs(settings.upload_dir, exist_ok=True)
    file_id = uuid.uuid4().hex
    saved_filename = f"{file_id}.jpg"
    image_path = os.path.join(settings.upload_dir, saved_filename)
    
    # Save optimized JPEG
    image.save(image_path, format="JPEG", quality=92)
    
    # Calculate hash
    with open(image_path, "rb") as f:
        image_hash = hashlib.sha256(f.read()).hexdigest()

    # 2. Run real ML prediction
    try:
        prediction_result = predict_image(image)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI model inference failed: {str(e)}. Please try again."
        )

    # 3. Resolve location and zone names if not supplied
    resolved_location = location_name
    if not resolved_location and field_obj:
        resolved_location = field_obj.field_name
        if zone_obj:
            resolved_location = f"{field_obj.field_name} · {zone_obj.zone_name}"
    elif not resolved_location:
        resolved_location = "North Field · Zone A"

    resolved_zone = zone_obj.zone_name if zone_obj else "Zone A"

    # Default coordinates from field/zone if not supplied
    if latitude is None and zone_obj and zone_obj.center_latitude:
        latitude = zone_obj.center_latitude
    elif latitude is None and field_obj and field_obj.latitude:
        latitude = field_obj.latitude

    if longitude is None and zone_obj and zone_obj.center_longitude:
        longitude = zone_obj.center_longitude
    elif longitude is None and field_obj and field_obj.longitude:
        longitude = field_obj.longitude

    # 4. Save Scan in Database
    scan_record = Scan(
        user_id=user.id,
        field_id=field_obj.id if field_obj else None,
        field_zone_id=zone_obj.id if zone_obj else None,
        image_path=image_path,
        image_hash=image_hash,
        scan_datetime=datetime.utcnow(),
        latitude=latitude,
        longitude=longitude,
        location_name=resolved_location,
        prediction=prediction_result["prediction"],
        confidence=prediction_result["confidence"],
        confidence_level=prediction_result["confidence_level"],
        health_status=prediction_result["health_status"],
        model_version=prediction_result["model_version"],
        probabilities=json.dumps(prediction_result["probabilities"]),
        analysis=prediction_result["analysis"],
        recommendations=json.dumps(prediction_result["recommendations"]),
    )
    db.add(scan_record)
    db.flush()

    # 5. Create Report Record
    report_record = Report(
        scan_id=scan_record.id,
        user_id=user.id,
        crop_name="Tomato",
        disease=prediction_result["disease"],
        health_status=prediction_result["health_status"],
        ai_analysis=prediction_result["analysis"],
        recommendations=json.dumps({
            "general": prediction_result["recommendations"],
            "organic": prediction_result["organic_solutions"],
            "chemical": prediction_result["chemical_treatments"]
        }),
    )
    db.add(report_record)
    db.flush()

    # 6. Generate PDF report
    try:
        pdf_path = generate_crop_health_pdf(
            report_id=report_record.id,
            scan_date=scan_record.scan_datetime,
            field_location=resolved_location,
            prediction=prediction_result["prediction"],
            health_status=prediction_result["health_status"],
            confidence=prediction_result["confidence"],
            confidence_level=prediction_result["confidence_level"],
            analysis_text=prediction_result["analysis"],
            recommendations=prediction_result["recommendations"],
            image_path=image_path,
        )
        report_record.report_path = pdf_path
    except Exception:
        pass

    db.commit()
    db.refresh(scan_record)
    db.refresh(report_record)

    reference = f"AD-{scan_record.id:04d}"

    return {
        "id": scan_record.id,
        "scan_id": scan_record.id,
        "field_id": scan_record.field_id,
        "field_zone_id": scan_record.field_zone_id,
        "report_id": report_record.id,
        "reference": reference,
        "created_at": scan_record.scan_datetime.isoformat(),
        "createdAt": scan_record.scan_datetime.isoformat(),
        "prediction": scan_record.prediction,
        "confidence": scan_record.confidence,
        "confidence_level": scan_record.confidence_level,
        "health_status": scan_record.health_status,
        "health": scan_record.health_status,
        "disease": prediction_result["disease"],
        "specimen": prediction_result["specimen"],
        "field_zone": resolved_zone,
        "fieldZone": resolved_zone,
        "location": resolved_location,
        "pest_vector": prediction_result["pest_vector"],
        "pestVector": prediction_result["pest_vector"],
        "nutritional_status": prediction_result["nutritional_status"],
        "nutritionalStatus": prediction_result["nutritional_status"],
        "fruit_quality": prediction_result["fruit_quality"],
        "fruitQuality": prediction_result["fruit_quality"],
        "analysis": prediction_result["analysis"],
        "organic_solutions": prediction_result["organic_solutions"],
        "organicSolutions": prediction_result["organic_solutions"],
        "chemical_treatments": prediction_result["chemical_treatments"],
        "chemicalTreatments": prediction_result["chemical_treatments"],
        "recommendations": prediction_result["recommendations"],
        "warning": prediction_result["warning"],
        "model_version": prediction_result["model_version"],
        "probabilities": prediction_result["probabilities"],
        "image_url": f"/diagnosis/{scan_record.id}/image",
        "image": f"/diagnosis/{scan_record.id}/image",
        "pdf_url": f"/reports/{report_record.id}/pdf",
        "isDemo": False,
        "saved": True,
    }
