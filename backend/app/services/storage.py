import io
from pathlib import Path

import pandas as pd
from storage3.utils import StorageException
from supabase import Client, create_client

from app.config import settings
from app.models.raw_dataset import RawDataset


DATASETS_BUCKET = settings.supabase_storage_bucket


supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
)


def build_dataset_storage_path(
    project_id: str,
    dataset_id: str,
    filename: str,
) -> str:
    safe_filename = Path(filename).name.replace(" ", "_")

    return (
        f"projects/{project_id}/"
        f"datasets/{dataset_id}_{safe_filename}"
    )


def upload_dataset_file(
    storage_path: str,
    content: bytes,
    content_type: str | None,
) -> None:
    supabase.storage.from_(DATASETS_BUCKET).upload(
        path=storage_path,
        file=content,
        file_options={
            "content-type": content_type or "application/octet-stream",
            "upsert": "false",
        },
    )


def delete_dataset_file(storage_path: str) -> None:
    supabase.storage.from_(DATASETS_BUCKET).remove([storage_path])


def get_dataset_dataframe(dataset: RawDataset) -> pd.DataFrame:
    """
    Downloads the raw CSV/XLSX file stored in Supabase Storage
    and returns its contents as a pandas DataFrame.
    """
    storage_path = dataset.storage_path

    try:
        response = supabase.storage.from_(DATASETS_BUCKET).download(
            storage_path
        )
    except StorageException as error:
        raise FileNotFoundError(
            f"Dataset file was not found in Supabase Storage: {storage_path}"
        ) from error

    file_extension = Path(storage_path).suffix.lower()

    if file_extension == ".csv":
        return pd.read_csv(io.BytesIO(response))

    if file_extension in {".xlsx", ".xls"}:
        return pd.read_excel(io.BytesIO(response))

    raise ValueError(
        f"Unsupported dataset file extension: {file_extension}"
    )