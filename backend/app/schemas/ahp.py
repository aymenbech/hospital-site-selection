from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class PairwiseComparisonInput(BaseModel):
    criterion_i_id: UUID
    criterion_j_id: UUID
    scale_value: float = Field(..., ge=1/9, le=9)


class AHPComparisonRunCreate(BaseModel):
    project_id: UUID
    analysis_run_id: UUID | None = None
    name: str
    description: str | None = None
    comparisons: list[PairwiseComparisonInput]


class AHPWeightResult(BaseModel):
    criterion_id: UUID
    criterion_code: str
    criterion_name: str
    weight: Decimal


class AHPComparisonRunResponse(BaseModel):
    id: UUID
    project_id: UUID
    analysis_run_id: UUID | None
    name: str
    description: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class AHPAnalysisResponse(BaseModel):
    comparison_run_id: UUID
    project_id: UUID
    analysis_run_id: UUID | None
    weights: list[AHPWeightResult]
    lambda_max: float
    consistency_index: float
    random_index: float
    consistency_ratio: float
    is_consistent: bool