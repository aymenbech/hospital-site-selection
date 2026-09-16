from typing import Any
import pandas as pd
import numpy as np


def detect_column_type(series: pd.Series) -> str:
    if series.dropna().empty:
        return "unknown"

    if pd.api.types.is_numeric_dtype(series):
        return "numeric"

    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"

    try:
        pd.to_datetime(series.dropna().iloc[:100])
        return "datetime"
    except Exception:
        pass

    if series.dropna().nunique() / series.dropna().shape[0] < 0.1:
        return "categorical"

    return "text"


def extract_columns_info(df: pd.DataFrame) -> list[dict[str, Any]]:
    columns = []
    for idx, col in enumerate(df.columns):
        col_type = detect_column_type(df[col])
        columns.append({
            "column_name": str(col),
            "column_index": idx,
            "detected_type": col_type,
        })
    return columns


def compute_missing_values(df: pd.DataFrame) -> dict[str, int]:
    return df.isna().sum().to_dict()


def compute_duplicates_count(df: pd.DataFrame) -> int:
    return int(df.duplicated().sum())


def compute_numeric_stats(df: pd.DataFrame) -> dict[str, dict[str, Any]]:
    stats = {}
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            s = df[col].dropna()
            if s.empty:
                continue
            stats[col] = {
                "min": float(s.min()),
                "max": float(s.max()),
                "mean": float(s.mean()),
                "median": float(s.median()),
                "std": float(s.std()) if len(s) > 1 else 0.0,
                "count": int(s.count()),
            }
    return stats


def profile_dataset(df: pd.DataFrame) -> dict[str, Any]:
    missing = compute_missing_values(df)
    duplicates = compute_duplicates_count(df)
    numeric_stats = compute_numeric_stats(df)

    return {
        "total_rows": int(len(df)),
        "total_columns": int(len(df.columns)),
        "missing_values": {str(k): int(v) for k, v in missing.items()},
        "duplicates_count": duplicates,
        "numeric_stats": numeric_stats,
    }


def guess_zone_columns(df: pd.DataFrame) -> tuple[str | None, str | None]:
    columns = [str(c) for c in df.columns]
    columns_upper = [c.upper() for c in columns]

    zone_id_candidates = [
        "IDZONE", "ZONE_ID", "ZONEID", "ID_ZONE",
        "CODEZONE", "ZONE_CODE", "ZONECODE",
    ]

    zone_name_candidates = [
        "ZONE", "ZONE_NAME", "ZONENAME", "NAME", "LIBELLE",
        "LIBZONE", "ZONE_LIB", "DESIGNATION",
    ]

    zone_id_col = None
    for cand in zone_id_candidates:
        if cand in columns_upper:
            idx = columns_upper.index(cand)
            zone_id_col = columns[idx]
            break

    if zone_id_col is None:
        for i, c in enumerate(columns_upper):
            if "ZONE" in c and ("ID" in c or "CODE" in c):
                zone_id_col = columns[i]
                break

    zone_name_col = None
    for cand in zone_name_candidates:
        if cand in columns_upper:
            idx = columns_upper.index(cand)
            candidate = columns[idx]
            if candidate != zone_id_col:
                zone_name_col = candidate
                break

    if zone_name_col is None:
        for i, c in enumerate(columns_upper):
            if "ZONE" in c and c != zone_id_col:
                zone_name_col = columns[i]
                break

    return zone_id_col, zone_name_col