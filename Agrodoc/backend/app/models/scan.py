from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from ..database import Base


class Scan(Base):
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    field_id = Column(Integer, ForeignKey("fields.id", ondelete="SET NULL"), nullable=True, index=True)
    field_zone_id = Column(Integer, ForeignKey("field_zones.id", ondelete="SET NULL"), nullable=True, index=True)
    
    image_path = Column(String(500), nullable=False)
    image_hash = Column(String(64), nullable=True)
    scan_datetime = Column(DateTime, default=datetime.utcnow, index=True)
    
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_name = Column(String(255), nullable=True)
    
    prediction = Column(String(100), nullable=False)
    confidence = Column(Float, nullable=False)
    confidence_level = Column(String(50), default="high", nullable=False)  # high, moderate, uncertain
    health_status = Column(String(50), default="Healthy", nullable=False)  # Healthy, At risk, Diseased
    
    model_version = Column(String(50), default="tomato-mobilenetv3-v1", nullable=False)
    probabilities = Column(Text, nullable=True)  # JSON-encoded dict of class -> score
    analysis = Column(Text, nullable=True)
    recommendations = Column(Text, nullable=True)  # JSON-encoded list of strings
    
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="scans")
    field = relationship("Field", back_populates="scans")
    field_zone = relationship("FieldZone", back_populates="scans")
    report = relationship("Report", back_populates="scan", uselist=False, cascade="all, delete-orphan")
