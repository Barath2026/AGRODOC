from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class ContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    email: EmailStr
    subject: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)


class ContactResponse(BaseModel):
    id: int
    name: str
    email: str
    subject: str
    message: str
    created_at: datetime
    status: str = "received"

    class Config:
        from_attributes = True
