from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from ..database import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    scan_id = Column(Integer, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    crop_name = Column(String(100), default="Tomato", nullable=False)
    disease = Column(String(150), nullable=False)
    health_status = Column(String(50), nullable=False)
    ai_analysis = Column(Text, nullable=False)
    recommendations = Column(Text, nullable=False)  # JSON-encoded list or structured dict
    report_path = Column(String(500), nullable=True)  # Path to generated PDF
    created_at = Column(DateTime, default=datetime.utcnow)

    scan = relationship("Scan", back_populates="report")
    user = relationship("User", back_populates="reports")
