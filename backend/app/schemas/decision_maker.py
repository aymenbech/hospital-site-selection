from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DecisionMakerCreate(BaseModel):
    project_id: UUID
    name: str = Field(min_length=1, max_length=255)
    email: str | None = None
    role: str | None = None
    expertise_weight: float = Field(default=1.0, gt=0, le=10)


class DecisionMakerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = None
    role: str | None = None
    expertise_weight: float | None = Field(default=None, gt=0, le=10)


class DecisionMakerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    name: str
    email: str | None = None
    role: str | None = None
    expertise_weight: float
    created_at: datetime


class ExpertComparisonItem(BaseModel):
    criterion_i_id: UUID
    criterion_j_id: UUID
    comparison_value: float = Field(gt=0)


class ExpertComparisonCreate(BaseModel):
    decision_maker_id: UUID
    analysis_run_id: UUID
    comparisons: list[ExpertComparisonItem] = Field(min_length=1)


class ExpertComparisonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    decision_maker_id: UUID
    analysis_run_id: UUID
    criterion_i_id: UUID
    criterion_j_id: UUID
    comparison_value: float
    created_at: datetime


class ExpertWeightResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    decision_maker_id: UUID
    ahp_run_id: UUID
    criterion_id: UUID
    weight: float
    created_at: datetime


class ExpertAHPResultResponse(BaseModel):
    decision_maker_id: UUID
    analysis_run_id: UUID
    ahp_run_id: UUID | None = None
    lambda_max: float
    consistency_index: float
    consistency_ratio: float
    is_consistent: bool
    weights: list[ExpertWeightResponse]


class AggregatedWeightItem(BaseModel):
    criterion_id: UUID
    weight: float


class AggregatedWeightsResponse(BaseModel):
    analysis_run_id: UUID
    aggregation_method: str
    weights: list[AggregatedWeightItem]