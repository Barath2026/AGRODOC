from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from ..models.user import User
from ..models.field import Field
from ..models.field_zone import FieldZone
from ..schemas.auth import UserRegister, UserLogin
from ..utils.security import verify_password, get_password_hash, decode_access_token
from ..database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.strip().lower()).first()


def register_user(db: Session, data: UserRegister) -> User:
    email_clean = data.email.strip().lower()
    existing = get_user_by_email(db, email_clean)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered. Please log in or use a different email."
        )

    if data.confirm_password and data.password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match."
        )

    if len(data.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )

    user = User(
        full_name=data.full_name.strip(),
        email=email_clean,
        password_hash=get_password_hash(data.password),
        phone=data.phone.strip() if data.phone else None,
        role_title="Farm manager",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Seed default fields and zones for new user to match frontend default workspaces
    seed_default_user_fields(db, user.id)

    return user


def seed_default_user_fields(db: Session, user_id: int):
    # Field 1: North Field
    f1 = Field(
        user_id=user_id,
        field_name="North Field",
        location_name="42.35° N, 71.06° W · Parcel A",
        plant_count=10,
        latitude=42.352,
        longitude=-71.062,
        area=2.5,
    )
    db.add(f1)
    db.flush()

    # Zones for Field 1
    zones_f1 = [
        ("Zone A", "#22c55e", 42.353, -71.063),
        ("Zone B", "#eab308", 42.352, -71.061),
        ("Zone C", "#3b82f6", 42.351, -71.062),
    ]
    for z_name, col, lat, lng in zones_f1:
        z = FieldZone(
            field_id=f1.id,
            zone_name=z_name,
            color=col,
            center_latitude=lat,
            center_longitude=lng,
        )
        db.add(z)

    # Field 2: South Field
    f2 = Field(
        user_id=user_id,
        field_name="South Field",
        location_name="42.34° N, 71.07° W · Parcel B",
        plant_count=8,
        latitude=42.348,
        longitude=-71.071,
        area=1.8,
    )
    db.add(f2)
    db.flush()

    zones_f2 = [
        ("Zone A", "#22c55e", 42.349, -71.072),
        ("Zone B", "#3b82f6", 42.347, -71.070),
    ]
    for z_name, col, lat, lng in zones_f2:
        z = FieldZone(
            field_id=f2.id,
            zone_name=z_name,
            color=col,
            center_latitude=lat,
            center_longitude=lng,
        )
        db.add(z)

    db.commit()


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    if not token:
        # Check if demo/default user exists for seamless development/testing
        demo_user = db.query(User).filter(User.email == "maya@northfield.farm").first()
        if demo_user:
            return demo_user
        demo_user = db.query(User).first()
        if demo_user:
            return demo_user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub") or payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
