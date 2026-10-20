import os
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from ..database import get_db
from ..models.report import Report
from ..models.scan import Scan
from ..models.user import User
from ..services.auth_service import get_current_user
from ..services.pdf_service import generate_crop_health_pdf

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("")
def list_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reports = db.query(Report).filter(Report.user_id == current_user.id).order_by(desc(Report.created_at)).all()
    results = []
    for r in reports:
        scan = r.scan
        recs_data = json.loads(r.recommendations) if r.recommendations else {}
        if isinstance(recs_data, dict):
            recs_list = recs_data.get("general", [])
        elif isinstance(recs_data, list):
            recs_list = recs_data
        else:
            recs_list = []

        results.append({
            "id": r.id,
            "scan_id": r.scan_id,
            "reference": f"AD-{r.scan_id:04d}",
            "crop_name": r.crop_name,
            "crop": r.crop_name,
            "disease": r.disease,
            "prediction": r.disease,
            "health_status": r.health_status,
            "health": r.health_status,
            "confidence": scan.confidence if scan else 90.0,
            "confidence_level": scan.confidence_level if scan else "high",
            "location": scan.location_name if scan else "Unspecified",
            "field_zone": scan.field_zone.zone_name if scan and scan.field_zone else "Zone A",
            "fieldZone": scan.field_zone.zone_name if scan and scan.field_zone else "Zone A",
            "analysis": r.ai_analysis,
            "recommendations": recs_list,
            "image_url": f"/diagnosis/{r.scan_id}/image",
            "image": f"/diagnosis/{r.scan_id}/image",
            "pdf_url": f"/reports/{r.id}/pdf",
            "created_at": r.created_at.isoformat(),
            "createdAt": r.created_at.isoformat(),
        })
    return results


@router.get("/{report_id}")
def get_report_detail(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(Report).filter(Report.id == report_id, Report.user_id == current_user.id).first()
    if not report:
        # Check by scan_id as well
        report = db.query(Report).filter(Report.scan_id == report_id, Report.user_id == current_user.id).first()
        if not report:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    scan = report.scan
    recs_data = json.loads(report.recommendations) if report.recommendations else {}
    if isinstance(recs_data, dict):
        general_recs = recs_data.get("general", [])
        organic_recs = recs_data.get("organic", [])
        chemical_recs = recs_data.get("chemical", [])
    elif isinstance(recs_data, list):
        general_recs = recs_data
        organic_recs = []
        chemical_recs = []
    else:
        general_recs = []
        organic_recs = []
        chemical_recs = []

    zone_name = scan.field_zone.zone_name if scan and scan.field_zone else "Zone A"
    loc_name = scan.location_name if scan else "Unspecified location"

    return {
        "id": report.id,
        "scan_id": report.scan_id,
        "reference": f"AD-{report.scan_id:04d}",
        "crop_name": report.crop_name,
        "crop": report.crop_name,
        "disease": report.disease,
        "prediction": report.disease,
        "health_status": report.health_status,
        "health": report.health_status,
        "confidence": scan.confidence if scan else 90.0,
        "confidence_level": scan.confidence_level if scan else "high",
        "location": loc_name,
        "field_zone": zone_name,
        "fieldZone": zone_name,
        "ai_analysis": report.ai_analysis,
        "analysis": report.ai_analysis,
        "recommendations": general_recs,
        "organic_solutions": organic_recs,
        "organicSolutions": organic_recs,
        "chemical_treatments": chemical_recs,
        "chemicalTreatments": chemical_recs,
        "image_url": f"/diagnosis/{report.scan_id}/image",
        "image": f"/diagnosis/{report.scan_id}/image",
        "pdf_url": f"/reports/{report.id}/pdf",
        "created_at": report.created_at.isoformat(),
        "createdAt": report.created_at.isoformat(),
    }


@router.get("/{report_id}/pdf")
def download_report_pdf(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(Report).filter(Report.id == report_id, Report.user_id == current_user.id).first()
    if not report:
        report = db.query(Report).filter(Report.scan_id == report_id, Report.user_id == current_user.id).first()
        if not report:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    scan = report.scan

    # If PDF is not yet generated or missing on disk, generate on the fly
    if not report.report_path or not os.path.exists(report.report_path):
        recs_data = json.loads(report.recommendations) if report.recommendations else {}
        if isinstance(recs_data, dict):
            recs_list = recs_data.get("general", [])
        else:
            recs_list = recs_data if isinstance(recs_data, list) else []

        pdf_path = generate_crop_health_pdf(
            report_id=report.id,
            scan_date=report.created_at,
            field_location=scan.location_name if scan else "Unspecified",
            prediction=report.disease,
            health_status=report.health_status,
            confidence=scan.confidence if scan else 90.0,
            confidence_level=scan.confidence_level if scan else "high",
            analysis_text=report.ai_analysis,
            recommendations=recs_list,
            image_path=scan.image_path if scan else None,
        )
        report.report_path = pdf_path
        db.commit()

    return FileResponse(
        report.report_path,
        media_type="application/pdf",
        filename=f"agrodoc_report_AD{report.scan_id:04d}.pdf"
    )
