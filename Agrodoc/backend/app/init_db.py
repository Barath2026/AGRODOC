import os
import json
import logging
from datetime import datetime, timedelta
from PIL import Image
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from .database import engine, Base, SessionLocal
from .models.user import User
from .models.field import Field
from .models.field_zone import FieldZone
from .models.disease import Disease
from .models.scan import Scan
from .models.report import Report
from .services.recommendation_service import DISEASE_KNOWLEDGE_BASE
from .services.diagnosis_service import process_diagnosis_and_save
from .utils.security import get_password_hash
from .ml.model_loader import load_model

logger = logging.getLogger("agrodoc.init")


def migrate_coordinate_precision():
    if engine.dialect.name != "mysql":
        return

    coordinate_columns = {
        "fields": ("latitude", "longitude"),
        "field_zones": ("center_latitude", "center_longitude"),
    }
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table_name, column_names in coordinate_columns.items():
            columns = {column["name"]: column["type"] for column in inspector.get_columns(table_name)}
            for column_name in column_names:
                if column_name in columns and "DOUBLE" not in str(columns[column_name]).upper():
                    connection.execute(text(f"ALTER TABLE `{table_name}` MODIFY `{column_name}` DOUBLE NULL"))


def init_database():
    logger.info("Initializing database schema...")
    Base.metadata.create_all(bind=engine)
    migrate_coordinate_precision()

    db: Session = SessionLocal()
    try:
        # 1. Seed Disease Knowledge Base
        for key, info in DISEASE_KNOWLEDGE_BASE.items():
            existing = db.query(Disease).filter(Disease.class_key == key).first()
            if not existing:
                d = Disease(
                    class_key=key,
                    display_name=info["display_name"],
                    description=info["description"],
                    symptoms=info["symptoms"],
                    impact=info["impact"],
                    organic_solutions=json.dumps(info["organic_solutions"]),
                    chemical_treatments=json.dumps(info["chemical_treatments"]),
                    pest_vector=info["pest_vector"],
                    nutritional_status=info["nutritional_status"],
                    fruit_quality=info["fruit_quality"],
                    monitoring_advice=info["monitoring_advice"],
                )
                db.add(d)
        db.commit()

        # 2. Seed Default User if not exists
        default_email = "maya@northfield.farm"
        user = db.query(User).filter(User.email == default_email).first()
        if not user:
            user = User(
                full_name="Barath K",
                email=default_email,
                password_hash=get_password_hash("Agrodoc@2026"),
                phone="+91 9876543210",
                role_title="Farm manager",
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            # Seed fields for this user
            f1 = Field(
                user_id=user.id,
                field_name="North Field",
                location_name="42.35° N, 71.06° W · Parcel A",
                plant_count=10,
                latitude=42.352,
                longitude=-71.062,
                area=2.5,
            )
            f2 = Field(
                user_id=user.id,
                field_name="South Field",
                location_name="42.34° N, 71.07° W · Parcel B",
                plant_count=8,
                latitude=42.348,
                longitude=-71.071,
                area=1.8,
            )
            db.add(f1)
            db.add(f2)
            db.commit()
            db.refresh(f1)
            db.refresh(f2)

            # Seed zones
            z1 = FieldZone(field_id=f1.id, zone_name="Zone A", color="#22c55e", center_latitude=42.353, center_longitude=-71.063)
            z2 = FieldZone(field_id=f1.id, zone_name="Zone B", color="#eab308", center_latitude=42.352, center_longitude=-71.061)
            z3 = FieldZone(field_id=f1.id, zone_name="Zone C", color="#3b82f6", center_latitude=42.351, center_longitude=-71.062)
            z4 = FieldZone(field_id=f2.id, zone_name="Zone A", color="#22c55e", center_latitude=42.349, center_longitude=-71.072)
            z5 = FieldZone(field_id=f2.id, zone_name="Zone B", color="#3b82f6", center_latitude=42.347, center_longitude=-71.070)
            db.add_all([z1, z2, z3, z4, z5])
            db.commit()

            # Seed initial real scans from dataset images
            dataset_samples = [
                ("dataset/test/healthy", f1.id, z1.id, "North Field · Zone A", 42.353, -71.063),
                ("dataset/test/early_blight", f1.id, z2.id, "North Field · Zone B", 42.352, -71.061),
                ("dataset/test/healthy", f2.id, z5.id, "South Field · Zone B", 42.347, -71.070),
                ("dataset/test/late_blight", f1.id, z3.id, "North Field · Zone C", 42.351, -71.062),
            ]
            for folder, fid, zid, loc_name, lat, lng in dataset_samples:
                if os.path.exists(folder):
                    files = [f for f in os.listdir(folder) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
                    if files:
                        sample_img_path = os.path.join(folder, files[0])
                        try:
                            img = Image.open(sample_img_path)
                            process_diagnosis_and_save(
                                db=db,
                                user=user,
                                image=img,
                                original_filename=files[0],
                                field_id=fid,
                                field_zone_id=zid,
                                latitude=lat,
                                longitude=lng,
                                location_name=loc_name,
                            )
                        except Exception as e:
                            logger.warning(f"Could not seed sample scan from {sample_img_path}: {e}")

        logger.info("Database schema initialized successfully.")
    except Exception as e:
        logger.error(f"Database initialization error: {e}")
        db.rollback()
    finally:
        db.close()


def preload_model():
    try:
        logger.info("Pre-warming AgroDoc deep-learning model...")
        load_model()
        logger.info("AgroDoc ML model ready.")
    except Exception as e:
        logger.error(f"Failed to pre-warm model: {e}")
