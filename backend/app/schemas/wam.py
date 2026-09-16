from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class ExpertCriterionWeightInput(BaseModel):
    criterion_id: UUID
    weight: float = Field(..., ge=0.0, le=1.0)


class ExpertWAMInput(BaseModel):
    expert_id: str
    expert_name: str
    consistency_ratio: float = Field(..., ge=0.0)
    comparison_run_id: UUID


class WAMRankingResult(BaseModel):
    zone_id: str
    zone_name: str | None
    final_score: Decimal
    rank: int


class WAMExpertScore(BaseModel):
    expert_id: str
    expert_name: str
    zone_scores: dict[str, float]


class WAMAnalysisRequest(BaseModel):
    project_id: UUID
    processed_dataset_id: UUID
    experts: list[ExpertWAMInput] = Field(..., min_length=1)


class WAMAnalysisResponse(BaseModel):
    project_id: UUID
    processed_dataset_id: UUID
    criteria_count: int
    experts_count: int
    expert_scores: list[WAMExpertScore]
    rankings: list[WAMRankingResult]
