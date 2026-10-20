from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class Field(Base):
    __tablename__ = "fields"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    field_name = Column(String(150), nullable=False)
    location_name = Column(String(255), nullable=False)
    plant_count = Column(Integer, default=10, nullable=False)
    latitude = Column(Float(precision=53), nullable=True)
    longitude = Column(Float(precision=53), nullable=True)
    area = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="fields")
    zones = relationship("FieldZone", back_populates="field", cascade="all, delete-orphan")
    scans = relationship("Scan", back_populates="field")
