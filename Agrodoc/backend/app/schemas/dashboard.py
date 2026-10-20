from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class DashboardSummaryResponse(BaseModel):
    selected_field_id: Optional[int] = None
    selected_field_name: Optional[str] = None
    selected_location: Optional[str] = None
    scan_count: int
    healthy_count: int
    healthy_percent: float
    flagged_count: int
    field_health: str
    field_health_percent: float
    coverage: float
    monitored_zones: int
    registered_zones: int
    latest_scan_confidence: Optional[float] = None
    latest_scan_date: Optional[str] = None
    most_common_disease: str
    most_common_disease_count: int
    trend_series: List[Dict[str, Any]]
    recent_scans: List[Dict[str, Any]]
    map_markers: List[Dict[str, Any]]
    zone_statuses: List[Dict[str, Any]]
    plant_health_matrix: List[Dict[str, Any]]
