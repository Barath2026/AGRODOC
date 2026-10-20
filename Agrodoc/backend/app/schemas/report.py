from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class ReportResponse(BaseModel):
    id: int
    scan_id: int
    reference: str
    crop_name: str = "Tomato"
    disease: str
    health_status: str
    confidence: float
    confidence_level: str
    location: str
    field_zone: str
    image_url: str
    ai_analysis: str
    recommendations: List[str]
    organic_solutions: List[str]
    chemical_treatments: List[str]
    pdf_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReportListItem(BaseModel):
    id: int
    scan_id: int
    reference: str
    crop_name: str
    disease: str
    health_status: str
    confidence: float
    location: str
    image_url: str
    created_at: datetime

    class Config:
        from_attributes = True
