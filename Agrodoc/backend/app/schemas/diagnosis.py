from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class PredictionResult(BaseModel):
    id: int
    reference: str
    created_at: str
    prediction: str
    confidence: float
    confidence_level: str
    health_status: str
    disease: str
    specimen: str = "Tomato leaf"
    field_zone: str = "Not specified"
    location: str = "Not specified"
    pest_vector: str = "Not assessed"
    nutritional_status: str = "Not assessed"
    fruit_quality: str = "Not assessed"
    analysis: str
    organic_solutions: List[str] = []
    chemical_treatments: List[str] = []
    warning: Optional[str] = None
    model_version: str = "tomato-mobilenetv3-v1"
    image_url: str
    probabilities: Optional[Dict[str, float]] = None


class ScanListItem(BaseModel):
    id: int
    reference: str
    created_at: datetime
    location: str
    field_zone: str
    prediction: str
    confidence: float
    confidence_level: str
    health_status: str
    thumbnail_url: str
    image_url: str

    class Config:
        from_attributes = True


class ScanHistoryResponse(BaseModel):
    items: List[ScanListItem]
    total: int
    page: int
    page_size: int
    pages: int
