from sqlalchemy import Column, Integer, String, Text
from ..database import Base


class Disease(Base):
    __tablename__ = "diseases"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    class_key = Column(String(100), unique=True, index=True, nullable=False)
    display_name = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    symptoms = Column(Text, nullable=False)
    impact = Column(Text, nullable=False)
    organic_solutions = Column(Text, nullable=False)  # JSON-encoded list
    chemical_treatments = Column(Text, nullable=False)  # JSON-encoded list
    pest_vector = Column(String(200), default="Not assessed", nullable=False)
    nutritional_status = Column(String(200), default="Not assessed", nullable=False)
    fruit_quality = Column(String(200), default="Not assessed", nullable=False)
    monitoring_advice = Column(Text, nullable=False)
