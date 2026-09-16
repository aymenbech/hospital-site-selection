import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.dataset import Criterion, AHPComparisonRun, AHPPairwiseComparison, AHPCriteriaWeight
from app.models.project import Project
from app.schemas.ahp import AHPComparisonRunCreate, AHPComparisonRunResponse, AHPAnalysisResponse, AHPWeightResult

router = APIRouter(prefix="/api/ahp", tags=["ahp"])

RANDOM_INDEX = {1: 0.00, 2: 0.00, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}


def build_pairwise_matrix(comparisons: list, criteria_ids: list[UUID]) -> np.ndarray:
    n = len(criteria_ids)
    matrix = np.eye(n)
    id_to_idx = {cid: idx for idx, cid in enumerate(criteria_ids)}
    seen_pairs = set()
    for comp in comparisons:
        if comp.criterion_i_id not in id_to_idx or comp.criterion_j_id not in id_to_idx:
            raise HTTPException(status_code=400, detail="Comparison contains an unknown criterion")
        i, j = id_to_idx[comp.criterion_i_id], id_to_idx[comp.criterion_j_id]
        v = float(comp.scale_value)
        if v <= 0:
            raise HTTPException(status_code=400, detail="AHP comparison values must be positive")
        if i == j:
            if v != 1:
                raise HTTPException(status_code=400, detail="Diagonal element must be 1")
            continue
        pair = tuple(sorted((i, j)))
        if pair in seen_pairs:
            raise HTTPException(status_code=400, detail="Each AHP pair must be submitted once")
        seen_pairs.add(pair)
        matrix[i, j] = v
        matrix[j, i] = 1.0 / v
    expected_pairs = n * (n - 1) // 2
    if len(seen_pairs) != expected_pairs:
        raise HTTPException(status_code=400, detail=f"AHP requires exactly {expected_pairs} unique pairwise comparisons for {n} criteria.")
    return matrix


def compute_weights(matrix: np.ndarray) -> np.ndarray:
    normalized = matrix / matrix.sum(axis=0)
    weights = normalized.mean(axis=1)
    return weights / weights.sum()


def compute_lambda_max(matrix: np.ndarray, weights: np.ndarray) -> float:
    return float(np.mean((matrix @ weights) / weights))


@router.post("/runs", response_model=AHPAnalysisResponse)
def create_ahp_comparison_run(payload: AHPComparisonRunCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    criteria = db.query(Criterion).filter(Criterion.project_id == payload.project_id, Criterion.is_active == True).all()
    if len(criteria) != 7:
        raise HTTPException(status_code=400, detail=f"The final methodology requires exactly 7 active criteria; found {len(criteria)}.")

    criteria_ids = [c.id for c in criteria]
    id_to_criterion = {c.id: c for c in criteria}
    matrix = build_pairwise_matrix(payload.comparisons, criteria_ids)
    weights = compute_weights(matrix)
    n = len(criteria_ids)
    lambda_max = compute_lambda_max(matrix, weights)
    ci = (lambda_max - n) / (n - 1)
    ri = RANDOM_INDEX[n]
    cr = ci / ri if ri > 0 else 0.0
    is_consistent = cr <= 0.10

    comparison_run = AHPComparisonRun(project_id=payload.project_id, analysis_run_id=payload.analysis_run_id, name=payload.name, description=payload.description)
    db.add(comparison_run)
    db.flush()
    for comp_input in payload.comparisons:
        db.add(AHPPairwiseComparison(comparison_run_id=comparison_run.id, criterion_i_id=comp_input.criterion_i_id, criterion_j_id=comp_input.criterion_j_id, scale_value=comp_input.scale_value))
    for i, cid in enumerate(criteria_ids):
        db.add(AHPCriteriaWeight(comparison_run_id=comparison_run.id, criterion_id=cid, weight=float(weights[i])))
    db.commit()

    weights_result = [AHPWeightResult(criterion_id=cid, criterion_code=id_to_criterion[cid].code, criterion_name=id_to_criterion[cid].name, weight=float(weights[i])) for i, cid in enumerate(criteria_ids)]
    return AHPAnalysisResponse(comparison_run_id=comparison_run.id, project_id=comparison_run.project_id, analysis_run_id=comparison_run.analysis_run_id, weights=weights_result, lambda_max=lambda_max, consistency_index=ci, random_index=ri, consistency_ratio=cr, is_consistent=is_consistent)


@router.get("/runs/{run_id}", response_model=AHPComparisonRunResponse)
def get_ahp_comparison_run(run_id: UUID, db: Session = Depends(get_db)):
    run = db.query(AHPComparisonRun).filter(AHPComparisonRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="AHP comparison run not found")
    return run
