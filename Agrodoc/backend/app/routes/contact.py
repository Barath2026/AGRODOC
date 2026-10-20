from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.contact import ContactMessage
from ..schemas.contact import ContactCreate, ContactResponse

router = APIRouter(prefix="/contact", tags=["Contact"])


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
def submit_contact_form(data: ContactCreate, db: Session = Depends(get_db)):
    msg = ContactMessage(
        name=data.name.strip(),
        email=data.email.strip().lower(),
        subject=data.subject.strip(),
        message=data.message.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg
