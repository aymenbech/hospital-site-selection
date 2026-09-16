from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.profile import Profile
from app.models.project import Project

from app.services.auth import get_current_user_from_jwt
from app.models.profile import Profile
from app.database import get_db

router = APIRouter()


# ---------- Pydantic schemas ----------

class ProjectCreate(BaseModel):
    name: str = Field(min_length=3, max_length=150)
    description: str | None = None
    objective: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=150)
    description: str | None = None
    objective: str | None = None
    status: str | None = Field(
        default=None,
        pattern="^(draft|active|archived)$",
    )


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    name: str
    description: str | None
    objective: str | None
    status: str
    created_at: datetime
    updated_at: datetime


# ---------- Temporary development authentication ----------
# سنستبدلها لاحقًا بالتحقق من JWT القادم من Supabase Auth.

def get_current_user(db: Session = Depends(get_db)) -> Profile:
    user = db.query(Profile).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "No profile exists yet. Create a user in Supabase Auth first, "
                "then refresh the page."
            ),
        )

    return user


def get_project_or_404(
    project_id: UUID,
    db: Session,
    current_user: Profile,
) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id)
        .first()
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    if project.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this project.",
        )

    return project


# ---------- Routes ----------

@router.get("/", response_model=list[ProjectResponse])
def list_projects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user_from_jwt),
):
    print("=== LIST PROJECTS ===")
    print("Authenticated user:", current_user.id)

    projects = (
        db.query(Project)
        .filter(Project.owner_id == current_user.id)
        .order_by(Project.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    print("Projects returned:", [str(project.id) for project in projects])

    return projects

@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    project_in: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user_from_jwt),
):
    project = Project(
        **project_in.model_dump(),
        owner_id=current_user.id,  # تعيين المالك تلقائياً للمستخدم المسجل
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
):
    return get_project_or_404(project_id, db, current_user)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
):
    project = get_project_or_404(project_id, db, current_user)

    updates = payload.model_dump(exclude_unset=True)

    for field, value in updates.items():
        setattr(project, field, value)

    db.commit()
    db.refresh(project)

    return project


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
):
    project = get_project_or_404(project_id, db, current_user)

    db.delete(project)
@router.get("/{project_id}/datasets")
def list_project_datasets(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user_from_jwt),
):
    """
    List all datasets belonging to a specific project.
    """
    from app.models.raw_dataset import RawDataset

    print("=== LIST PROJECT DATASETS ===")
    print("Project ID:", project_id)
    print("Authenticated user:", current_user.id)

    datasets = (
        db.query(RawDataset)
        .filter(RawDataset.project_id == project_id)
        .order_by(RawDataset.created_at.desc())
        .all()
    )

    print("Datasets returned:", [str(ds.id) for ds in datasets])

    return datasets
    db.commit()