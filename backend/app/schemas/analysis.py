from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AnalysisRunCreate(BaseModel):
    project_id: UUID
    processed_dataset_id: UUID
    name: str
    description: str | None = None


class AnalysisRunResponse(BaseModel):
    id: UUID
    project_id: UUID
    processed_dataset_id: UUID
    name: str
    description: str | None
    total_zones: int
    eligible_zones: int
    excluded_zones_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class EligibilityAnalysisResponse(BaseModel):
    analysis_run_id: UUID
    project_id: UUID
    processed_dataset_id: UUID
    total_zones: int
    eligible_zones: int
    excluded_zones: int