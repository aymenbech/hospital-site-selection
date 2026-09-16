from datetime import datetime
from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
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


class CriterionInput(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    type: str
    source_column: str = Field(min_length=1, max_length=255)


class CriteriaSaveRequest(BaseModel):
    project_id: UUID
    processed_dataset_id: UUID
    criteria: List[CriterionInput]


@router.post("/criteria", response_model=list[dict])
def save_criteria(payload: CriteriaSaveRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    processed = db.query(ProcessedDataset).filter(
        ProcessedDataset.id == payload.processed_dataset_id
    ).first()
    if not processed:
        raise HTTPException(status_code=404, detail="Processed dataset not found")

    if processed.raw_dataset_id not in [ds.id for ds in project.datasets]:
        raise HTTPException(status_code=400, detail="Processed dataset does not belong to this project.")

    if len(payload.criteria) != 7:
        raise HTTPException(status_code=400, detail="Exactly 7 criteria are required for the AHP model.")

    seen_codes = set()
    seen_columns = set()
    rows = processed.data if isinstance(processed.data, list) else []
    available_columns = set(rows[0].keys()) if rows else set()

    for item in payload.criteria:
        if item.type not in {"benefit", "cost"}:
            raise HTTPException(status_code=400, detail=f"Invalid criterion type for {item.code}.")
        if item.code in seen_codes or item.source_column in seen_columns:
            raise HTTPException(status_code=400, detail="Criterion codes and source columns must be unique.")
        if available_columns and item.source_column not in available_columns:
            raise HTTPException(status_code=400, detail=f"Source column not found: {item.source_column}")
        seen_codes.add(item.code)
        seen_columns.add(item.source_column)

    db.query(Criterion).filter(
        Criterion.project_id == payload.project_id,
        Criterion.is_active == True,
    ).update({Criterion.is_active: False}, synchronize_session=False)

    created = []
    for item in payload.criteria:
        criterion = Criterion(
            project_id=payload.project_id,
            code=item.code.strip(),
            name=item.name.strip(),
            type=item.type,
            source_column=item.source_column.strip(),
            is_active=True,
        )
        db.add(criterion)
        created.append(criterion)

    db.commit()
    for criterion in created:
        db.refresh(criterion)

    return [
        {
            "id": str(c.id),
            "project_id": str(c.project_id),
            "code": c.code,
            "name": c.name,
            "type": c.type,
            "source_column": c.source_column,
            "is_active": c.is_active,
        }
        for c in created
    ]


@router.post(
    "/runs/eligibility",
    response_model=EligibilityAnalysisResponse,
)
def run_eligibility_analysis(
    payload: AnalysisRunCreate,
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    processed = db.query(ProcessedDataset).filter(
        ProcessedDataset.id == payload.processed_dataset_id
    ).first()
    if not processed:
        raise HTTPException(status_code=404, detail="Processed dataset not found")

    if processed.raw_dataset_id not in [ds.id for ds in project.datasets]:
        raise HTTPException(status_code=400, detail="Processed dataset does not belong to this project.")

    criteria = db.query(Criterion).filter(
        Criterion.project_id == payload.project_id,
        Criterion.is_active == True,
    ).all()

    rules = db.query(EligibilityRule).filter(
        EligibilityRule.project_id == payload.project_id,
        EligibilityRule.is_active == True,
    ).all()

    zones_data = processed.data
    if not isinstance(zones_data, list):
        raise HTTPException(status_code=500, detail="Processed dataset data is not a list.")

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
                reasons.append(f"{rule.name}: {col}={value} exceeds threshold {threshold}")
            elif op == "gte" and value >= threshold:
                reasons.append(f"{rule.name}: {col}={value} exceeds or equals threshold {threshold}")
            elif op == "lt" and value < threshold:
                reasons.append(f"{rule.name}: {col}={value} below threshold {threshold}")
            elif op == "lte" and value <= threshold:
                reasons.append(f"{rule.name}: {col}={value} below or equals threshold {threshold}")
            elif op == "eq" and value == threshold:
                reasons.append(f"{rule.name}: {col}={value} equals threshold {threshold}")
            elif op == "neq" and value != threshold:
                reasons.append(f"{rule.name}: {col}={value} differs from threshold {threshold}")
        if reasons:
            excluded_rows.append({"zone_id": zone_id, "zone_name": zone.get("ZONE_NAME"), "reasons": reasons})
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
            {"id": str(c.id), "code": c.code, "name": c.name, "type": c.type, "source_column": c.source_column}
            for c in criteria
        ],
        rules_snapshot=[
            {"id": str(r.id), "name": r.name, "column_name": r.column_name, "operator": r.operator, "value_json": r.value_json}
            for r in rules
        ],
    )
    db.add(analysis_run)
    db.flush()

    for row in excluded_rows:
        db.add(ExcludedZone(
            analysis_run_id=analysis_run.id,
            zone_id=row["zone_id"],
            zone_name=row.get("zone_name"),
            exclusion_reasons=row["reasons"],
        ))

    db.commit()

    return EligibilityAnalysisResponse(
        analysis_run_id=analysis_run.id,
        project_id=analysis_run.project_id,
        processed_dataset_id=analysis_run.processed_dataset_id,
        total_zones=total_zones,
        eligible_zones=eligible_count,
        excluded_zones=len(excluded_rows),
    )


@router.get("/runs/{run_id}", response_model=AnalysisRunResponse)
def get_analysis_run(run_id: UUID, db: Session = Depends(get_db)):
    run = db.query(AnalysisRun).filter(AnalysisRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Analysis run not found")
    return run
