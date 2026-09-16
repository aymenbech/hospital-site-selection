from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class RawDataset(Base):
    __tablename__ = "raw_datasets"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    # استخدام name بدلاً من file_name لمطابقة قاعدة البيانات
    name = Column(
        String,
        nullable=True,
    )

    file_size_bytes = Column(
        BigInteger,
        nullable=True,
    )

    storage_path = Column(
        Text,
        nullable=False,
        default="",
    )

    row_count = Column(
        BigInteger,
        nullable=True,
        default=0,
    )

    column_count = Column(
        BigInteger,
        nullable=True,
        default=0,
    )

    uploaded_by = Column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    project = relationship(
        "Project",
        back_populates="datasets",
    )

    uploader = relationship(
        "Profile",
        back_populates="uploaded_datasets",
    )