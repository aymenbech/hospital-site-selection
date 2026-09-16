from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.dataset import (
    DecisionMaker,
    ExpertComparison,
    ExpertWeight,
)
from app.schemas.decision_maker import (
    AggregatedWeightItem,
    AggregatedWeightsResponse,
    DecisionMakerCreate,
    DecisionMakerResponse,
    DecisionMakerUpdate,
    ExpertComparisonCreate,
    ExpertComparisonResponse,
)


# IMPORTANT:
# Do not add prefix="/api/decision-makers" here,
# because main.py already adds that prefix.
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
    """
    Saves all pairwise comparisons submitted by one expert.

    The request body must contain:
    - decision_maker_id
    - analysis_run_id
    - comparisons: [{criterion_i_id, criterion_j_id, comparison_value}, ...]
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


@router.get(
    "/aggregate-weights/{analysis_run_id}",
    response_model=AggregatedWeightsResponse,
)
def aggregate_expert_weights(
    analysis_run_id: UUID,
    method: str = "wam",
    db: Session = Depends(get_db),
):
    """
    WAM formula for each criterion:

    group_weight =
      Σ(individual_AHP_weight × expert_expertise_weight)
      -------------------------------------------------
                  Σ(expert_expertise_weight)

    Then all calculated group weights are normalized so
    their sum equals 1.0.
    """
    if method.lower() != "wam":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only method='wam' is supported for group AHP aggregation.",
        )

    rows = (
        db.query(
            ExpertWeight.criterion_id,
            ExpertWeight.weight,
            DecisionMaker.expertise_weight,
        )
        .join(
            DecisionMaker,
            DecisionMaker.id == ExpertWeight.decision_maker_id,
        )
        .filter(
            ExpertWeight.ahp_run_id == analysis_run_id,
        )
        .all()
    )

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No expert AHP weights were found for this analysis run. "
                "Each decision maker must complete and save AHP first."
            ),
        )

    criterion_values: dict[UUID, list[tuple[float, float]]] = defaultdict(list)

    for criterion_id, individual_weight, expertise_weight in rows:
        criterion_values[criterion_id].append(
            (
                float(individual_weight),
                float(expertise_weight),
            )
        )

    raw_group_weights: dict[UUID, float] = {}

    for criterion_id, values in criterion_values.items():
        numerator = sum(
            individual_weight * expert_weight
            for individual_weight, expert_weight in values
        )

        denominator = sum(
            expert_weight
            for _, expert_weight in values
        )

        raw_group_weights[criterion_id] = (
            numerator / denominator if denominator > 0 else 0.0
        )

    total_weight = sum(raw_group_weights.values())

    if total_weight <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The aggregated group weight total is zero.",
        )

    aggregated_weights = [
        AggregatedWeightItem(
            criterion_id=criterion_id,
            weight=weight / total_weight,
        )
        for criterion_id, weight in raw_group_weights.items()
    ]

    return AggregatedWeightsResponse(
        analysis_run_id=analysis_run_id,
        aggregation_method="wam",
        weights=aggregated_weights,
    )