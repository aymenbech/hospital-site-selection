from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.dataset import DecisionMaker, ExpertComparison
from app.schemas.decision_maker import (
    DecisionMakerCreate,
    DecisionMakerResponse,
    DecisionMakerUpdate,
    ExpertComparisonCreate,
    ExpertComparisonResponse,
)


# Decision makers only manage experts and their legacy comparison records.
# The final methodology does NOT aggregate expert criterion weights here.
# Final calculation is performed by /api/wam/execute:
# AHP per expert -> WAM per expert -> equal expert average.
router = APIRouter()


@router.post(
    "/",
    response_model=DecisionMakerResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_decision_maker(
    payload: DecisionMakerCreate,
    db: Session = Depends(get_db),
):
    decision_maker = DecisionMaker(
        project_id=payload.project_id,
        name=payload.name,
        email=payload.email,
        role=payload.role,
        # Kept for database/schema compatibility only.
        # It is NOT used by the final methodology.
        expertise_weight=payload.expertise_weight,
    )

    db.add(decision_maker)
    db.commit()
    db.refresh(decision_maker)

    return decision_maker


@router.get(
    "/project/{project_id}",
    response_model=list[DecisionMakerResponse],
)
def get_project_decision_makers(
    project_id: UUID,
    db: Session = Depends(get_db),
):
    return (
        db.query(DecisionMaker)
        .filter(DecisionMaker.project_id == project_id)
        .order_by(DecisionMaker.created_at.asc())
        .all()
    )


@router.get(
    "/{decision_maker_id}",
    response_model=DecisionMakerResponse,
)
def get_decision_maker(
    decision_maker_id: UUID,
    db: Session = Depends(get_db),
):
    decision_maker = (
        db.query(DecisionMaker)
        .filter(DecisionMaker.id == decision_maker_id)
        .first()
    )

    if not decision_maker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Decision maker not found.",
        )

    return decision_maker


@router.put(
    "/{decision_maker_id}",
    response_model=DecisionMakerResponse,
)
def update_decision_maker(
    decision_maker_id: UUID,
    payload: DecisionMakerUpdate,
    db: Session = Depends(get_db),
):
    decision_maker = (
        db.query(DecisionMaker)
        .filter(DecisionMaker.id == decision_maker_id)
        .first()
    )

    if not decision_maker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Decision maker not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(decision_maker, field, value)

    db.commit()
    db.refresh(decision_maker)

    return decision_maker


@router.post(
    "/comparisons",
    response_model=list[ExpertComparisonResponse],
)
def save_expert_comparisons(
    payload: ExpertComparisonCreate,
    db: Session = Depends(get_db),
):
    """Save legacy expert comparison records for compatibility.

    The production AHP workflow uses /api/ahp/runs and persisted
    AHPComparisonRun/AHPPairwiseComparison records. This endpoint does not
    participate in the final WAM ranking calculation.
    """
    decision_maker = (
        db.query(DecisionMaker)
        .filter(DecisionMaker.id == payload.decision_maker_id)
        .first()
    )

    if not decision_maker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Decision maker not found.",
        )

    saved_comparisons = []

    try:
        for item in payload.comparisons:
            existing = (
                db.query(ExpertComparison)
                .filter(
                    ExpertComparison.decision_maker_id
                    == payload.decision_maker_id,
                    ExpertComparison.analysis_run_id
                    == payload.analysis_run_id,
                    ExpertComparison.criterion_i_id == item.criterion_i_id,
                    ExpertComparison.criterion_j_id == item.criterion_j_id,
                )
                .first()
            )

            if existing:
                existing.comparison_value = item.comparison_value
                saved_comparisons.append(existing)
            else:
                comparison = ExpertComparison(
                    decision_maker_id=payload.decision_maker_id,
                    analysis_run_id=payload.analysis_run_id,
                    criterion_i_id=item.criterion_i_id,
                    criterion_j_id=item.criterion_j_id,
                    comparison_value=item.comparison_value,
                )
                db.add(comparison)
                saved_comparisons.append(comparison)

        db.commit()

        for comparison in saved_comparisons:
            db.refresh(comparison)

        return saved_comparisons

    except Exception:
        db.rollback()
        raise
