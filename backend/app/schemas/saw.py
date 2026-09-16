from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class ZoneScoreResult(BaseModel):
    zone_id: str
    zone_name: str | None
    score: Decimal
    rank: int | None


class SAWAnalysisResponse(BaseModel):
    analysis_run_id: UUID
    ahp_run_id: UUID
    total_zones: int
    scores: list[ZoneScoreResult]