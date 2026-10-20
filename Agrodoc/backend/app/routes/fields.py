import json
from collections import Counter
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.field import Field
from ..models.field_zone import FieldZone
from ..models.scan import Scan
from ..models.user import User
from ..schemas.field import FieldCreate, FieldUpdate, FieldResponse, ZoneCreate, ZoneResponse
from ..services.auth_service import get_current_user

router = APIRouter(prefix="/fields", tags=["Fields and Zones"])


@router.get("", response_model=List[FieldResponse])
def get_fields(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    fields = db.query(Field).filter(Field.user_id == current_user.id).all()
    # Format zone polygon
    for f in fields:
        for z in f.zones:
            if z.polygon and isinstance(z.polygon, str):
                try:
                    z.polygon = json.loads(z.polygon)
                except Exception:
                    pass
    return fields


@router.get("/{field_id}/summary")
def get_field_summary(field_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    field = db.query(Field).filter(Field.id == field_id, Field.user_id == current_user.id).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    scans = db.query(Scan).filter(
        Scan.field_id == field.id,
        Scan.user_id == current_user.id,
    ).order_by(desc(Scan.scan_datetime)).all()
    healthy_scans = sum(scan.health_status.lower() == "healthy" for scan in scans)
    total_plants = max(field.plant_count or 0, 0)
    has_scan_estimate = bool(scans)
    healthy_plants = round(total_plants * healthy_scans / len(scans)) if has_scan_estimate else None
    unhealthy_plants = total_plants - healthy_plants if healthy_plants is not None else None
    health_percent = round(healthy_plants / total_plants * 100, 1) if total_plants > 0 and healthy_plants is not None else None

    disease_counts = Counter(
        scan.prediction for scan in scans
        if scan.health_status.lower() != "healthy"
    )
    recent_scans = []
    for scan in scans[:20]:
        try:
            recommendations = json.loads(scan.recommendations) if scan.recommendations else []
        except (TypeError, json.JSONDecodeError):
            recommendations = []
        recent_scans.append({
            "id": scan.id,
            "created_at": scan.scan_datetime.isoformat() if scan.scan_datetime else None,
            "prediction": scan.prediction,
            "health_status": scan.health_status,
            "confidence": scan.confidence,
            "location": scan.location_name,
            "recommendations": recommendations,
        })

    return {
        "field": {
            "id": field.id,
            "name": field.field_name,
            "location": field.location_name,
            "latitude": field.latitude,
            "longitude": field.longitude,
            "area": field.area,
            "plant_count": total_plants,
        },
        "completed_ai_scans": len(scans),
        "healthy_plant_count": healthy_plants,
        "unhealthy_plant_count": unhealthy_plants,
        "plant_health_percent": health_percent,
        "plant_counts_are_estimates": True,
        "plant_count_note": (
            "Healthy and unhealthy plant counts are estimates based on linked AI scan results; "
            "individual plant identities are not currently recorded."
            if has_scan_estimate else "No linked AI scans yet; plant health counts are unavailable."
        ),
        "last_monitoring_at": scans[0].scan_datetime.isoformat() if scans and scans[0].scan_datetime else None,
        "recent_diseases": [
            {"name": name, "scan_count": count}
            for name, count in disease_counts.most_common(5)
        ],
        "recent_scans": recent_scans,
    }


@router.post("", response_model=FieldResponse, status_code=status.HTTP_201_CREATED)
def create_field(data: FieldCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    field = Field(
        user_id=current_user.id,
        field_name=data.name.strip(),
        location_name=data.location_name.strip(),
        plant_count=data.plants,
        latitude=data.latitude,
        longitude=data.longitude,
        area=data.area,
    )
    db.add(field)
    db.flush()

    # Create default registered zones (Zone A to Zone F)
    default_zones = [
        ("Zone A", "#22c55e"),
        ("Zone B", "#eab308"),
        ("Zone C", "#3b82f6"),
        ("Zone D", "#a855f7"),
        ("Zone E", "#ec4899"),
        ("Zone F", "#14b8a6"),
    ]
    for z_name, col in default_zones:
        z = FieldZone(
            field_id=field.id,
            zone_name=z_name,
            color=col,
        )
        db.add(z)

    db.commit()
    db.refresh(field)
    return field


@router.patch("/{field_id}", response_model=FieldResponse)
def update_field(field_id: int, data: FieldUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    field = db.query(Field).filter(Field.id == field_id, Field.user_id == current_user.id).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    if data.name is not None:
        field.field_name = data.name.strip()
    if data.plants is not None:
        field.plant_count = data.plants
    if data.location_name is not None:
        field.location_name = data.location_name.strip()
    if data.latitude is not None:
        field.latitude = data.latitude
    if data.longitude is not None:
        field.longitude = data.longitude
    if data.area is not None:
        field.area = data.area

    db.commit()
    db.refresh(field)
    return field


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field(field_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    field = db.query(Field).filter(Field.id == field_id, Field.user_id == current_user.id).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    db.delete(field)
    db.commit()
    return None


@router.get("/{field_id}/zones", response_model=List[ZoneResponse])
def get_zones(field_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    field = db.query(Field).filter(Field.id == field_id, Field.user_id == current_user.id).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    zones = db.query(FieldZone).filter(FieldZone.field_id == field_id).all()
    for z in zones:
        if z.polygon and isinstance(z.polygon, str):
            try:
                z.polygon = json.loads(z.polygon)
            except Exception:
                pass
    return zones


@router.post("/{field_id}/zones", response_model=ZoneResponse, status_code=status.HTTP_201_CREATED)
def create_zone(field_id: int, data: ZoneCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    field = db.query(Field).filter(Field.id == field_id, Field.user_id == current_user.id).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    # Check unique zone name per field
    existing = db.query(FieldZone).filter(FieldZone.field_id == field_id, FieldZone.zone_name == data.name.strip()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Zone name already exists in this field")

    poly_str = json.dumps(data.polygon) if data.polygon else None

    zone = FieldZone(
        field_id=field_id,
        zone_name=data.name.strip(),
        color=data.color or "#4ade80",
        polygon=poly_str,
        center_latitude=data.center_latitude,
        center_longitude=data.center_longitude,
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)
    if zone.polygon and isinstance(zone.polygon, str):
        try:
            zone.polygon = json.loads(zone.polygon)
        except Exception:
            pass
    return zone


@router.delete("/{field_id}/zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_zone(field_id: int, zone_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    zone = db.query(FieldZone).filter(FieldZone.id == zone_id, FieldZone.field_id == field_id).first()
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")

    db.delete(zone)
    db.commit()
    return None
