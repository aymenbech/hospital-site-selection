from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.dataset import (
    ProcessedDataset,
    Criterion,
    EligibilityRule,
    AnalysisRun,
    ExcludedZone,
)
from app.models.project import Project
from app.schemas.analysis import (
    AnalysisRunCreate,
    AnalysisRunResponse,
    EligibilityAnalysisResponse,
)

router = APIRouter(
    prefix="/api/analysis",
    tags=["analysis"],
)


@router.post(
    "/runs/eligibility",
    response_model=EligibilityAnalysisResponse,
)
def run_eligibility_analysis(
    payload: AnalysisRunCreate,
    db: Session = Depends(get_db),
):
    project = (
        db.query(Project)
        .filter(Project.id == payload.project_id)
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    processed = (
        db.query(ProcessedDataset)
        .filter(ProcessedDataset.id == payload.processed_dataset_id)
        .first()
    )

    if not processed:
        raise HTTPException(
            status_code=404,
            detail="Processed dataset not found",
        )

    if processed.raw_dataset_id not in [
        ds.id for ds in project.datasets
    ]:
        raise HTTPException(
            status_code=400,
            detail=(
                "Processed dataset does not belong to this project."
            ),
        )

    criteria = (
        db.query(Criterion)
        .filter(
            Criterion.project_id == payload.project_id,
            Criterion.is_active == True,
        )
        .all()
    )

    rules = (
        db.query(EligibilityRule)
        .filter(
            EligibilityRule.project_id == payload.project_id,
            EligibilityRule.is_active == True,
        )
        .all()
    )

    zones_data = processed.data

    if not isinstance(zones_data, list):
        raise HTTPException(
            status_code=500,
            detail="Processed dataset data is not a list.",
        )

    excluded_rows = []
    eligible_count = 0

    for zone in zones_data:
        zone_id = str(zone.get("ID_ZONE"))
        reasons = []

        for rule in rules:
            col = rule.column_name
            op = rule.operator
            threshold = rule.value_json

            if col not in zone:
                continue

            value = zone[col]

            if op == "gt" and value > threshold:
                reasons.append(
                    f"{rule.name}: {col}={value} exceeds threshold {threshold}"
                )
            elif op == "gte" and value >= threshold:
                reasons.append(
                    f"{rule.name}: {col}={value} exceeds or equals threshold {threshold}"
                )
            elif op == "lt" and value < threshold:
                reasons.append(
                    f"{rule.name}: {col}={value} below threshold {threshold}"
                )
            elif op == "lte" and value <= threshold:
                reasons.append(
                    f"{rule.name}: {col}={value} below or equals threshold {threshold}"
                )
            elif op == "eq" and value == threshold:
                reasons.append(
                    f"{rule.name}: {col}={value} equals threshold {threshold}"
                )
            elif op == "neq" and value != threshold:
                reasons.append(
                    f"{rule.name}: {col}={value} differs from threshold {threshold}"
                )

        if reasons:
            excluded_rows.append(
                {
                    "zone_id": zone_id,
                    "zone_name": zone.get("ZONE_NAME"),
                    "reasons": reasons,
                }
            )
        else:
            eligible_count += 1

    total_zones = len(zones_data)

    analysis_run = AnalysisRun(
        project_id=payload.project_id,
        processed_dataset_id=payload.processed_dataset_id,
        name=payload.name,
        description=payload.description,
        total_zones=total_zones,
        eligible_zones=eligible_count,
        excluded_zones_count=len(excluded_rows),
        criteria_snapshot=[
            {
                "id": str(c.id),
                "code": c.code,
                "name": c.name,
                "type": c.type,
                "source_column": c.source_column,
            }
            for c in criteria
        ],
        rules_snapshot=[
            {
                "id": str(r.id),
                "name": r.name,
                "column_name": r.column_name,
                "operator": r.operator,
                "value_json": r.value_json,
            }
            for r in rules
        ],
    )

    db.add(analysis_run)
    db.flush()

    for row in excluded_rows:
        db.add(
            ExcludedZone(
                analysis_run_id=analysis_run.id,
                zone_id=row["zone_id"],
                zone_name=row.get("zone_name"),
                exclusion_reasons=row["reasons"],
            )
        )

    db.commit()

    return EligibilityAnalysisResponse(
        analysis_run_id=analysis_run.id,
        project_id=analysis_run.project_id,
        processed_dataset_id=analysis_run.processed_dataset_id,
        total_zones=total_zones,
        eligible_zones=eligible_count,
        excluded_zones=len(excluded_rows),
    )


@router.get(
    "/runs/{run_id}",
    response_model=AnalysisRunResponse,
)
def get_analysis_run(
    run_id: UUID,
    db: Session = Depends(get_db),
):
    run = (
        db.query(AnalysisRun)
        .filter(AnalysisRun.id == run_id)
        .first()
    )

    if not run:
        raise HTTPException(
            status_code=404,
            detail="Analysis run not found",
        )

    return run