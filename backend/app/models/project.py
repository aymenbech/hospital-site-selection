from sqlalchemy import Column, String, DateTime, func, ForeignKey, CheckConstraint, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
from enum import Enum as PyEnum
from sqlalchemy.orm import relationship


class ProjectStatus(str, PyEnum):
    draft = "draft"
    active = "active"
    archived = "archived"


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, index=True, default=func.gen_random_uuid())
    owner_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="cascade"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    objective = Column(String, nullable=True)
    status = Column(SQLEnum(ProjectStatus, name="project_status", create_type=False), nullable=False, default="draft")
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("char_length(trim(name)) between 3 and 150", name="projects_name_length_check"),
    )

    # Inside the Project class
    datasets = relationship("RawDataset", back_populates="project", cascade="all, delete-orphan")