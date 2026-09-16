from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.dataset import (
    Criterion,
    AHPCriteriaWeight,
    ProcessedDataset,
    AnalysisRun,
    AHPComparisonRun,
    ZoneScore,
    ZoneCriterionScore,
)
from app.schemas.saw import SAWAnalysisResponse, ZoneScoreResult


router = APIRouter(
    prefix="/api/saw",
    tags=["saw"],
)


def get_zone_value(zone: dict, column_name: str):
    """Get value from zone dict, trying exact match first, then case-insensitive match."""
    if column_name in zone:
        return zone[column_name]

    normalized_column = column_name.strip().lower()

    for key, value in zone.items():
        if str(key).strip().lower() == normalized_column:
            return value

    return None


@router.post(
    "/runs/{analysis_run_id}/execute",
    response_model=SAWAnalysisResponse,
)
def execute_saw(
    analysis_run_id: UUID,
    ahp_run_id: UUID,
    db: Session = Depends(get_db),
):
    # تحقق من وجود AnalysisRun
    analysis_run = (
        db.query(AnalysisRun)
        .filter(AnalysisRun.id == analysis_run_id)
        .first()
    )

    if not analysis_run:
        raise HTTPException(status_code=404, detail="Analysis run not found")

    # تحقق من وجود AHP run
    ahp_run = (
        db.query(AHPComparisonRun)
        .filter(AHPComparisonRun.id == ahp_run_id)
        .first()
    )

    if not ahp_run:
        raise HTTPException(status_code=404, detail="AHP run not found")

    # جلب البيانات من ProcessedDataset
    processed = (
        db.query(ProcessedDataset)
        .filter(ProcessedDataset.id == analysis_run.processed_dataset_id)
        .first()
    )

    if not processed:
        raise HTTPException(status_code=404, detail="Processed dataset not found")

    # البيانات: قائمة القواميس
    zones_data = processed.data  # JSONB list[dict]

    if not zones_data or len(zones_data) == 0:
        raise HTTPException(status_code=400, detail="No zone data found")

    # جلب الأوزان
    weights = (
        db.query(AHPCriteriaWeight)
        .filter(AHPCriteriaWeight.comparison_run_id == ahp_run_id)
        .all()
    )

    if not weights:
        raise HTTPException(status_code=400, detail="No AHP weights found")

    weight_dict = {w.criterion_id: float(w.weight) for w in weights}

    # جلب معلومات المعايير
    criteria = (
        db.query(Criterion)
        .filter(Criterion.id.in_(weight_dict.keys()))
        .all()
    )

    criterion_info = {
        c.id: {"code": c.code, "type": c.type, "source_column": c.source_column}
        for c in criteria
    }

    # استخراج كل القيم لكل معيار
    criterion_values = {cid: [] for cid in weight_dict.keys()}

    for zone in zones_data:
        for cid, info in criterion_info.items():
            col = info["source_column"]
            val = get_zone_value(zone, col)

            if val is None:
                val = 0.0
            else:
                try:
                    val = float(val)
                except (ValueError, TypeError):
                    val = 0.0

            criterion_values[cid].append(val)

    # حساب min/max للتطبيع
    criterion_stats = {}
    for cid, values in criterion_values.items():
        if len(values) == 0:
            criterion_stats[cid] = {"min": 0.0, "max": 1.0}
        else:
            criterion_stats[cid] = {
                "min": min(values),
                "max": max(values),
            }

    # حساب الدرجات
    zone_scores = []

    for zone in zones_data:
        zone_id = (
            get_zone_value(zone, "ID_ZONE")
            or get_zone_value(zone, "id")
            or get_zone_value(zone, "zone_id")
            or get_zone_value(zone, "zone")
        )

        zone_name = (
            get_zone_value(zone, "ZONE_NAME")
            or get_zone_value(zone, "zone_name")
            or get_zone_value(zone, "name")
        )

        if not zone_id:
            continue

        total_score = 0.0
        detail_rows = []

        for cid, info in criterion_info.items():
            col = info["source_column"]
            val = get_zone_value(zone, col)

            if val is None:
                val = 0.0
            else:
                try:
                    val = float(val)
                except (ValueError, TypeError):
                    val = 0.0

            # تطبيع
            cmin = criterion_stats[cid]["min"]
            cmax = criterion_stats[cid]["max"]

            if cmax - cmin == 0:
                normalized = 1.0
            else:
                normalized = (val - cmin) / (cmax - cmin)

            weight = weight_dict[cid]
            ctype = info["type"]

            if ctype == "benefit":
                weighted = weight * normalized
            else:  # cost
                weighted = weight * (1.0 - normalized)

            total_score += weighted

            detail_rows.append({
                "criterion_id": cid,
                "criterion_code": info["code"],
                "normalized_value": normalized,
                "weighted_score": weighted,
            })

        zone_scores.append({
            "zone_id": str(zone_id),
            "zone_name": zone_name,
            "score": total_score,
            "details": detail_rows,
        })

    # الترتيب
    zone_scores.sort(key=lambda x: x["score"], reverse=True)

    for i, z in enumerate(zone_scores):
        z["rank"] = i + 1

    # الحفظ في قاعدة البيانات
    results = []

    for z in zone_scores:
        zone_score = ZoneScore(
            analysis_run_id=analysis_run_id,
            ahp_run_id=ahp_run_id,
            zone_id=z["zone_id"],
            zone_name=z["zone_name"],
            score=z["score"],
            rank=z["rank"],
        )
        db.add(zone_score)
        db.flush()

        for d in z["details"]:
            db.add(
                ZoneCriterionScore(
                    zone_score_id=zone_score.id,
                    criterion_id=d["criterion_id"],
                    criterion_code=d["criterion_code"],
                    normalized_value=d["normalized_value"],
                    weighted_score=d["weighted_score"],
                )
            )

        results.append(
            ZoneScoreResult(
                zone_id=z["zone_id"],
                zone_name=z["zone_name"],
                score=z["score"],
                rank=z["rank"],
            )
        )

    db.commit()

    return SAWAnalysisResponse(
        analysis_run_id=analysis_run_id,
        ahp_run_id=ahp_run_id,
        total_zones=len(results),
        scores=results,
    )