from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field


class ZoneCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: Optional[str] = "#4ade80"
    polygon: Optional[List[dict]] = None
    center_latitude: Optional[float] = None
    center_longitude: Optional[float] = None


class ZoneResponse(BaseModel):
    id: int
    field_id: int
    zone_name: str
    color: Optional[str] = None
    polygon: Optional[Any] = None
    center_latitude: Optional[float] = None
    center_longitude: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


class FieldCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    plants: int = Field(..., ge=1)
    location_name: str = Field(..., min_length=1, max_length=255)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    area: Optional[float] = None


class FieldUpdate(BaseModel):
    name: Optional[str] = None
    plants: Optional[int] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    area: Optional[float] = None


class FieldResponse(BaseModel):
    id: int
    user_id: int
    field_name: str
    location_name: str
    plant_count: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    area: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    zones: List[ZoneResponse] = []

    class Config:
        from_attributes = True
