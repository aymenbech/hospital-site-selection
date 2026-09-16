from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.dataset import DecisionMaker
from app.schemas.decision_maker import (
    DecisionMakerCreate,
    DecisionMakerResponse,
    
)


router = APIRouter()


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
        expertise_weight=payload.expertise_weight or 1.0,
    )

    db.add(decision_maker)
    db.commit()
    db.refresh(decision_maker)

    return decision_maker


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
            detail="Decision maker not found",
        )

    return decision_maker