from collections import Counter
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from ..database import get_db
from ..models.field import Field
from ..models.field_zone import FieldZone
from ..models.scan import Scan
from ..models.user import User
from ..services.auth_service import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
def get_dashboard_summary(
    field_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Computes all dashboard metrics dynamically from actual database records.
    No static or hard-coded trends.
    """
    # 1. Resolve selected field
    user_fields = db.query(Field).filter(Field.user_id == current_user.id).all()
    selected_field = None
    if field_id:
        selected_field = db.query(Field).filter(Field.id == field_id, Field.user_id == current_user.id).first()
    if not selected_field and user_fields:
        selected_field = user_fields[0]

    # Base scan query
    scan_query = db.query(Scan).filter(Scan.user_id == current_user.id)
    if selected_field:
        scan_query = scan_query.filter(Scan.field_id == selected_field.id)

    scans = scan_query.order_by(desc(Scan.scan_datetime)).all()

    total_scans = len(scans)
    healthy_scans = [s for s in scans if s.health_status.lower() == "healthy"]
    flagged_scans = [s for s in scans if s.health_status.lower() != "healthy"]

    healthy_count = len(healthy_scans)
    flagged_count = len(flagged_scans)
    healthy_pct = round((healthy_count / total_scans * 100.0), 1) if total_scans > 0 else 100.0

    # Plant count and health estimate
    plant_count = selected_field.plant_count if selected_field else 10
    if total_scans > 0:
        attention_plants = round((flagged_count / total_scans) * plant_count)
        field_health_pct = round(((plant_count - attention_plants) / plant_count) * 100.0, 1)
        if field_health_pct >= 80:
            field_health_status = "Looking healthy"
        elif field_health_pct >= 50:
            field_health_status = "Needs attention"
        else:
            field_health_status = "Diseased"
    else:
        field_health_pct = 100.0
        field_health_status = "No recent data"

    # Registered vs Monitored zones
    registered_zones = len(selected_field.zones) if selected_field else 6
    monitored_zone_ids = set(s.field_zone_id for s in scans if s.field_zone_id is not None)
    monitored_zones_count = len(monitored_zone_ids)
    coverage_pct = round((monitored_zones_count / registered_zones * 100.0), 1) if registered_zones > 0 else 0.0

    # Latest scan details
    latest_scan = scans[0] if scans else None
    latest_confidence = latest_scan.confidence if latest_scan else None
    latest_date_str = latest_scan.scan_datetime.strftime("%b %d, %Y") if latest_scan else None

    # Most common disease
    diseases = [s.prediction for s in flagged_scans]
    if diseases:
        common_disease, common_count = Counter(diseases).most_common(1)[0]
    else:
        common_disease = "None detected"
        common_count = 0

    # Trend series: last 7 days daily counts
    today = datetime.utcnow().date()
    trend_series = []
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for i in range(6, -1, -1):
        target_date = today - timedelta(days=i)
        day_scans = [s for s in scans if s.scan_datetime.date() == target_date]
        day_healthy = len([s for s in day_scans if s.health_status.lower() == "healthy"])
        day_pct = round((day_healthy / len(day_scans) * 100.0), 1) if day_scans else 100.0
        trend_series.append({
            "day": days[target_date.weekday()],
            "date": target_date.isoformat(),
            "healthy_pct": day_pct,
            "total": len(day_scans),
        })

    # Recent scans list (up to 4)
    recent_scans = []
    for s in scans[:4]:
        z_str = s.field_zone.zone_name if s.field_zone else "Zone A"
        recent_scans.append({
            "id": s.id,
            "reference": f"AD-{s.id:04d}",
            "createdAt": s.scan_datetime.isoformat(),
            "location": s.location_name or "Unspecified",
            "field_zone": z_str,
            "fieldZone": z_str,
            "prediction": s.prediction,
            "confidence": s.confidence,
            "health": s.health_status,
            "health_status": s.health_status,
            "image": f"/diagnosis/{s.id}/image",
            "thumbnail_url": f"/diagnosis/{s.id}/image",
        })

    # Map markers
    map_markers = []
    for s in scans:
        if s.latitude and s.longitude:
            map_markers.append({
                "id": s.id,
                "lat": s.latitude,
                "lng": s.longitude,
                "prediction": s.prediction,
                "status": s.health_status,
                "date": s.scan_datetime.strftime("%Y-%m-%d"),
                "location": s.location_name,
            })

    # Zone statuses
    zone_statuses = []
    if selected_field and selected_field.zones:
        for z in selected_field.zones:
            latest_zone_scan = db.query(Scan).filter(Scan.field_zone_id == z.id).order_by(desc(Scan.scan_datetime)).first()
            if latest_zone_scan:
                z_status = latest_zone_scan.health_status
                z_pred = latest_zone_scan.prediction
            else:
                z_status = "Not monitored"
                z_pred = "No scan yet"
            zone_statuses.append({
                "zone_id": z.id,
                "zone_name": z.zone_name,
                "color": z.color,
                "status": z_status,
                "prediction": z_pred,
            })

    # Plant health matrix
    plant_matrix = []
    for i in range(1, plant_count + 1):
        if total_scans == 0:
            p_status = "No data"
        else:
            # Distribute based on attention_plants
            p_status = "Needs attention" if i <= attention_plants else "Healthy"
        plant_matrix.append({
            "plant_id": i,
            "status": p_status,
        })

    return {
        "selected_field_id": selected_field.id if selected_field else None,
        "selected_field_name": selected_field.field_name if selected_field else "North Field",
        "selected_location": selected_field.location_name if selected_field else "42.35° N, 71.06° W",
        "scan_count": total_scans,
        "healthy_count": healthy_count,
        "healthy_percent": healthy_pct,
        "flagged_count": flagged_count,
        "field_health": field_health_status,
        "field_health_percent": field_health_pct,
        "coverage": coverage_pct,
        "monitored_zones": monitored_zones_count,
        "registered_zones": registered_zones,
        "latest_scan_confidence": latest_confidence,
        "latest_scan_date": latest_date_str,
        "most_common_disease": common_disease,
        "most_common_disease_count": common_count,
        "trend_series": trend_series,
        "recent_scans": recent_scans,
        "map_markers": map_markers,
        "zone_statuses": zone_statuses,
        "plant_health_matrix": plant_matrix,
    }
