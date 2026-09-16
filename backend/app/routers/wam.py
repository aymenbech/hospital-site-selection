from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.dataset import (
    AHPCriteriaWeight,
    AHPComparisonRun,
    AnalysisRun,
    Criterion,
    ProcessedDataset,
    RawDataset,
    ZoneCriterionScore,
    ZoneScore,
)
from app.models.project import Project
from app.schemas.wam import WAMAnalysisRequest, WAMAnalysisResponse, WAMExpertScore, WAMRankingResult

router = APIRouter(prefix="/api/wam", tags=["wam"])


def get_zone_value(zone: dict, column_name: str):
    if column_name in zone:
        return zone[column_name]
    target = column_name.strip().lower()
    for key, value in zone.items():
        if str(key).strip().lower() == target:
            return value
    return None


def as_float(value, label: str) -> float:
    if value is None or value == "":
        raise HTTPException(status_code=400, detail=f"Missing numeric value for {label}")
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"Invalid numeric value for {label}")
    if not result == result or result in (float("inf"), float("-inf")):
        raise HTTPException(status_code=400, detail=f"Invalid numeric value for {label}")
    return result


@router.post("/execute", response_model=WAMAnalysisResponse)
def execute_wam(payload: WAMAnalysisRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    processed = db.query(ProcessedDataset).filter(ProcessedDataset.id == payload.processed_dataset_id).first()
    if not processed:
        raise HTTPException(status_code=404, detail="Processed dataset not found")

    raw_dataset = db.query(RawDataset).filter(RawDataset.id == processed.raw_dataset_id).first()
    if not raw_dataset or raw_dataset.project_id != project.id:
        raise HTTPException(status_code=400, detail="Processed dataset does not belong to this project")

    criteria = db.query(Criterion).filter(
        Criterion.project_id == payload.project_id,
        Criterion.is_active == True,
    ).all()
    if len(criteria) != 7:
        raise HTTPException(status_code=400, detail=f"The final methodology requires exactly 7 active criteria; found {len(criteria)}.")
    if not isinstance(processed.data, list) or not processed.data:
        raise HTTPException(status_code=400, detail="Processed dataset contains no zone data")
    if not payload.experts:
        raise HTTPException(status_code=400, detail="At least one expert is required")

    criteria_by_id = {criterion.id: criterion for criterion in criteria}
    criterion_ids = set(criteria_by_id)
    zone_rows = []
    raw_values = {criterion.id: [] for criterion in criteria}

    for zone in processed.data:
        zone_id = get_zone_value(zone, "ID_ZONE") or get_zone_value(zone, "id") or get_zone_value(zone, "zone_id") or get_zone_value(zone, "zone")
        if zone_id is None or str(zone_id).strip() == "":
            continue
        zone_name = get_zone_value(zone, "ZONE_NAME") or get_zone_value(zone, "zone_name") or get_zone_value(zone, "name")
        values = {}
        for criterion in criteria:
            value = as_float(get_zone_value(zone, criterion.source_column), f"{criterion.code} in zone {zone_id}")
            values[criterion.id] = value
            raw_values[criterion.id].append(value)
        zone_rows.append((str(zone_id), zone_name, values))

    if not zone_rows:
        raise HTTPException(status_code=400, detail="No valid zones found in processed dataset")

    stats = {cid: (min(values), max(values)) for cid, values in raw_values.items()}
    normalized_rows = []
    for zone_id, zone_name, values in zone_rows:
        normalized = {}
        for criterion in criteria:
            value = values[criterion.id]
            cmin, cmax = stats[criterion.id]
            if cmax == cmin:
                normalized[criterion.id] = 1.0
            else:
                base = (value - cmin) / (cmax - cmin)
                normalized[criterion.id] = base if criterion.type == "benefit" else 1.0 - base
        normalized_rows.append((zone_id, zone_name, normalized))

    expert_results = []
    persistence_payload = []
    for expert in payload.experts:
        if expert.consistency_ratio > 0.10:
            raise HTTPException(status_code=400, detail=f"Expert '{expert.expert_name}' has CR={expert.consistency_ratio:.4f}; CR must be <= 0.10.")

        comparison_run = db.query(AHPComparisonRun).filter(
            AHPComparisonRun.id == expert.comparison_run_id,
            AHPComparisonRun.project_id == payload.project_id,
        ).first()
        if not comparison_run:
            raise HTTPException(status_code=400, detail=f"AHP comparison run for expert '{expert.expert_name}' was not found for this project.")

        persisted_weights = db.query(AHPCriteriaWeight).filter(
            AHPCriteriaWeight.comparison_run_id == comparison_run.id,
        ).all()
        if len(persisted_weights) != 7:
            raise HTTPException(status_code=400, detail=f"AHP run for expert '{expert.expert_name}' must contain exactly 7 criterion weights.")

        weights = {item.criterion_id: float(item.weight) for item in persisted_weights}
        if set(weights) != criterion_ids:
            raise HTTPException(status_code=400, detail=f"AHP run for expert '{expert.expert_name}' does not match the 7 active project criteria.")
        if any(weight < 0 for weight in weights.values()):
            raise HTTPException(status_code=400, detail=f"AHP run for expert '{expert.expert_name}' contains a negative criterion weight.")
        total_weight = sum(weights.values())
        if total_weight <= 0 or abs(total_weight - 1.0) > 0.001:
            raise HTTPException(status_code=400, detail=f"AHP weights for expert '{expert.expert_name}' must sum to 1 (found {total_weight:.6f}).")

        zone_scores = {}
        zone_details = []
        for zone_id, zone_name, normalized in normalized_rows:
            criterion_contributions = {
                criterion.id: weights[criterion.id] * normalized[criterion.id]
                for criterion in criteria
            }
            score = sum(criterion_contributions.values())
            zone_scores[zone_id] = score
            zone_details.append((zone_id, zone_name, normalized, criterion_contributions, score))

        expert_results.append(
            WAMExpertScore(
                expert_id=expert.expert_id,
                expert_name=expert.expert_name,
                comparison_run_id=expert.comparison_run_id,
                zone_scores=zone_scores,
            )
        )
        persistence_payload.append((expert, zone_details))

    final_scores = {
        zone_id: sum(result.zone_scores[zone_id] for result in expert_results) / len(expert_results)
        for zone_id, _, _ in normalized_rows
    }
    zone_names = {zone_id: zone_name for zone_id, zone_name, _ in normalized_rows}
    ordered = sorted(final_scores.items(), key=lambda item: item[1], reverse=True)
    rankings = [
        WAMRankingResult(
            zone_id=zone_id,
            zone_name=zone_names.get(zone_id),
            final_score=score,
            rank=index + 1,
        )
        for index, (zone_id, score) in enumerate(ordered)
    ]

    analysis_run = AnalysisRun(
        project_id=project.id,
        processed_dataset_id=processed.id,
        name="WAM — Equal Expert Average",
        description=(
            "Final methodology: independent AHP criterion weights per expert, "
            "WAM score per zone and arithmetic mean across experts. "
            "Expertise weights are not used."
        ),
        total_zones=len(zone_rows),
        eligible_zones=len(zone_rows),
        excluded_zones_count=0,
        criteria_snapshot=[
            {
                "id": str(criterion.id),
                "code": criterion.code,
                "name": criterion.name,
                "type": criterion.type,
                "source_column": criterion.source_column,
            }
            for criterion in criteria
        ],
        rules_snapshot=[],
    )
    db.add(analysis_run)
    db.flush()

    for expert, zone_details in persistence_payload:
        for zone_id, zone_name, normalized, contributions, score in zone_details:
            zone_score = ZoneScore(
                analysis_run_id=analysis_run.id,
                ahp_run_id=expert.comparison_run_id,
                zone_id=zone_id,
                zone_name=zone_name,
                score=score,
                rank=None,
            )
            db.add(zone_score)
            db.flush()
            for criterion in criteria:
                db.add(
                    ZoneCriterionScore(
                        zone_score_id=zone_score.id,
                        criterion_id=criterion.id,
                        criterion_code=criterion.code,
                        normalized_value=normalized[criterion.id],
                        weighted_score=contributions[criterion.id],
                    )
                )

    db.commit()

    return WAMAnalysisResponse(
        analysis_run_id=analysis_run.id,
        project_id=project.id,
        processed_dataset_id=processed.id,
        criteria_count=7,
        experts_count=len(expert_results),
        expert_scores=expert_results,
        rankings=rankings,
    )
