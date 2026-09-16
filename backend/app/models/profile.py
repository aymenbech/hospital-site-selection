from sqlalchemy import Column, String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
from enum import Enum as PyEnum
from sqlalchemy.orm import relationship



class AppRole(str, PyEnum):
    admin = "admin"
    analyst = "analyst"
    expert = "expert"


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, index=True)
    full_name = Column(String, nullable=True)
    role = Column(String, nullable=False, default="analyst")
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now())
    uploaded_datasets = relationship("RawDataset", back_populates="uploader")
