from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from ..database import Base


class FieldZone(Base):
    __tablename__ = "field_zones"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    field_id = Column(Integer, ForeignKey("fields.id", ondelete="CASCADE"), nullable=False, index=True)
    zone_name = Column(String(100), nullable=False)
    color = Column(String(50), default="#4ade80", nullable=True)
    polygon = Column(Text, nullable=True)  # JSON-encoded array of {lat, lng}
    center_latitude = Column(Float(precision=53), nullable=True)
    center_longitude = Column(Float(precision=53), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    field = relationship("Field", back_populates="zones")
    scans = relationship("Scan", back_populates="field_zone")
