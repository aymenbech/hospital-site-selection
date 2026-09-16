from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Any, Optional
import pandas as pd
import json

from app.database import get_db
from app.models.raw_dataset import RawDataset
from app.models.dataset import RawDatasetColumn, DatasetProfile, DatasetZoneMapping, ProcessedDataset
from app.services.storage import get_dataset_dataframe
from app.services.data_profiling import (
    extract_columns_info,
    profile_dataset,
    guess_zone_columns,
)
from uuid import UUID


router = APIRouter(tags=["datasets-profiling"])

class ColumnInfo(BaseModel):
    column_name: str
    column_index: int
    detected_type: str | None


class ProfileResponse(BaseModel):
    dataset_id: str
    total_rows: int
    total_columns: int
    missing_values: dict[str, int]
    duplicates_count: int
    numeric_stats: dict[str, dict[str, Any]]


class ZoneMappingResponse(BaseModel):
    dataset_id: str
    zone_id_column: str
    zone_name_column: str | None


class ProcessedDatasetResponse(BaseModel):
    id: UUID
    raw_dataset_id: UUID
    name: str
    row_count: int
    column_count: int


@router.get("/{dataset_id}/columns", response_model=list[ColumnInfo])
def get_dataset_columns(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    dataset = db.query(RawDataset).filter(RawDataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    existing = (
        db.query(RawDatasetColumn)
        .filter(RawDatasetColumn.raw_dataset_id == dataset_id)
        .all()
    )

    if existing:
        return [
            ColumnInfo(
                column_name=c.column_name,
                column_index=c.column_index,
                detected_type=c.inferred_type,
            )
            for c in existing
        ]

    df = get_dataset_dataframe(dataset)

    columns_info = extract_columns_info(df)

    for idx, col_info in enumerate(columns_info):
        db_col = RawDatasetColumn(
            raw_dataset_id=dataset_id,
            column_name=col_info["column_name"],
            column_index=col_info["column_index"],
            inferred_type=col_info["detected_type"],
        )
        db.add(db_col)

    db.commit()

    return [
        ColumnInfo(
            column_name=c.column_name,
            column_index=c.column_index,
            detected_type=c.detected_type,
        )
        for c in columns_info
    ]


@router.post("/{dataset_id}/profile", response_model=ProfileResponse)
def create_dataset_profile(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    dataset = db.query(RawDataset).filter(RawDataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    existing = (
        db.query(DatasetProfile)
        .filter(DatasetProfile.raw_dataset_id == dataset_id)
        .first()
    )

    if existing:
        return ProfileResponse(
            dataset_id=dataset_id,
            total_rows=existing.total_rows,
            total_columns=existing.total_columns,
            missing_values=existing.missing_values,
            duplicates_count=existing.duplicates_count,
            numeric_stats=existing.numeric_stats,
        )

    df = get_dataset_dataframe(dataset)
    profile = profile_dataset(df)

    db_profile = DatasetProfile(
        raw_dataset_id=dataset_id,
        total_rows=profile["total_rows"],
        total_columns=profile["total_columns"],
        missing_values=profile["missing_values"],
        duplicates_count=profile["duplicates_count"],
        numeric_stats=profile["numeric_stats"],
    )
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)

    return ProfileResponse(
        dataset_id=dataset_id,
        total_rows=db_profile.total_rows,
        total_columns=db_profile.total_columns,
        missing_values=db_profile.missing_values,
        duplicates_count=db_profile.duplicates_count,
        numeric_stats=db_profile.numeric_stats,
    )


@router.post("/{dataset_id}/zone-mapping", response_model=ZoneMappingResponse)
def create_zone_mapping(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    dataset = db.query(RawDataset).filter(RawDataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    existing = (
        db.query(DatasetZoneMapping)
        .filter(DatasetZoneMapping.raw_dataset_id == dataset_id)
        .first()
    )

    if existing:
        return ZoneMappingResponse(
            dataset_id=dataset_id,
            zone_id_column=existing.zone_id_column,
            zone_name_column=existing.zone_name_column,
        )

    df = get_dataset_dataframe(dataset)
    zone_id_col, zone_name_col = guess_zone_columns(df)

    if not zone_id_col:
        raise HTTPException(
            status_code=400,
            detail="Could not automatically detect zone ID column. Please specify manually.",
        )

    db_mapping = DatasetZoneMapping(
        raw_dataset_id=dataset_id,
        zone_id_column=zone_id_col,
        zone_name_column=zone_name_col,
    )
    db.add(db_mapping)
    db.commit()
    db.refresh(db_mapping)

    return ZoneMappingResponse(
        dataset_id=dataset_id,
        zone_id_column=db_mapping.zone_id_column,
        zone_name_column=db_mapping.zone_name_column,
    )


@router.post("/{dataset_id}/process", response_model=ProcessedDatasetResponse)
def process_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    dataset = db.query(RawDataset).filter(RawDataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = get_dataset_dataframe(dataset)

    df_clean = df.drop_duplicates()
    df_clean = df_clean.fillna("")

    processed_name = f"{dataset.name or 'dataset'}_processed"

    data_records = df_clean.to_dict(orient="records")

    db_processed = ProcessedDataset(
        raw_dataset_id=dataset_id,
        name=processed_name,
        row_count=int(len(df_clean)),
        column_count=int(len(df_clean.columns)),
        data=data_records,
    )
    db.add(db_processed)
    db.commit()
    db.refresh(db_processed)

    return ProcessedDatasetResponse(
        id=db_processed.id,
        raw_dataset_id=db_processed.raw_dataset_id,
        name=db_processed.name,
        row_count=db_processed.row_count,
        column_count=db_processed.column_count,
    )