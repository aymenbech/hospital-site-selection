from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Text,  Numeric,UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import text

from app.database import Base


class RawDatasetColumn(Base):
    __tablename__ = "raw_dataset_columns"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    raw_dataset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("raw_datasets.id", ondelete="CASCADE"),
        nullable=False,
    )

    column_name = Column(Text, nullable=False)
    column_index = Column(Integer, nullable=False)
    inferred_type = Column(Text)

    is_zone_id = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )

    is_zone_name = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        UniqueConstraint(
            "raw_dataset_id",
            "column_name",
            name="uq_raw_dataset_columns_dataset_column",
        ),
    )


class DatasetProfile(Base):
    __tablename__ = "dataset_profiles"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    raw_dataset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("raw_datasets.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    total_rows = Column(Integer, nullable=False)
    total_columns = Column(Integer, nullable=False)

    missing_values = Column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )

    duplicates_count = Column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    numeric_stats = Column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class DatasetZoneMapping(Base):
    __tablename__ = "dataset_zone_mapping"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    raw_dataset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("raw_datasets.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    zone_id_column = Column(Text, nullable=False)
    zone_name_column = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class ProcessedDataset(Base):
    __tablename__ = "processed_datasets"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    raw_dataset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("raw_datasets.id", ondelete="CASCADE"),
        nullable=False,
    )

    name = Column(Text, nullable=False)
    row_count = Column(Integer, nullable=False)
    column_count = Column(Integer, nullable=False)

    data = Column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class Criterion(Base):
    __tablename__ = "criteria"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    code = Column(Text, nullable=False)
    name = Column(Text, nullable=False)

    type = Column(
        Text,  # criterion_type enum: cost / benefit
        nullable=False,
    )

    source_column = Column(Text, nullable=False)
    unit = Column(Text, nullable=True)
    description = Column(Text, nullable=True)

    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class EligibilityRule(Base):
    __tablename__ = "eligibility_rules"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)

    column_name = Column(Text, nullable=False)

    operator = Column(
        Text,  # eligibility_operator enum: eq, neq, lt, lte, gt, gte, in, not_in
        nullable=False,
    )

    value_json = Column(JSONB, nullable=False)

    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    processed_dataset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processed_datasets.id", ondelete="CASCADE"),
        nullable=False,
    )

    name = Column(Text, nullable=False)

    description = Column(Text, nullable=True)

    total_zones = Column(Integer, nullable=False)

    eligible_zones = Column(Integer, nullable=False)

    excluded_zones_count = Column(Integer, nullable=False)

    criteria_snapshot = Column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )

    rules_snapshot = Column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class ExcludedZone(Base):
    __tablename__ = "excluded_zones"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    analysis_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("analysis_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    zone_id = Column(Text, nullable=False)

    zone_name = Column(Text, nullable=True)

    exclusion_reasons = Column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class AHPComparisonRun(Base):
    __tablename__ = "ahp_comparison_runs"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    analysis_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("analysis_runs.id", ondelete="SET NULL"),
        nullable=True,
    )

    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class AHPPairwiseComparison(Base):
    __tablename__ = "ahp_pairwise_comparisons"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    comparison_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ahp_comparison_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    criterion_i_id = Column(
        UUID(as_uuid=True),
        ForeignKey("criteria.id", ondelete="CASCADE"),
        nullable=False,
    )

    criterion_j_id = Column(
        UUID(as_uuid=True),
        ForeignKey("criteria.id", ondelete="CASCADE"),
        nullable=False,
    )

    scale_value = Column(Numeric, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        UniqueConstraint(
            "comparison_run_id",
            "criterion_i_id",
            "criterion_j_id",
            name="uq_ahp_pairwise_comparisons",
        ),
    )


class AHPCriteriaWeight(Base):
    __tablename__ = "ahp_criteria_weights"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    comparison_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ahp_comparison_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    criterion_id = Column(
        UUID(as_uuid=True),
        ForeignKey("criteria.id", ondelete="CASCADE"),
        nullable=False,
    )

    weight = Column(Numeric, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        UniqueConstraint(
            "comparison_run_id",
            "criterion_id",
            name="uq_ahp_criteria_weights",
        ),
    )
class ZoneScore(Base):
    __tablename__ = "zone_scores"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    analysis_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("analysis_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    ahp_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ahp_comparison_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    zone_id = Column(Text, nullable=False)
    zone_name = Column(Text, nullable=True)
    score = Column(Numeric, nullable=False)
    rank = Column(Integer, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        UniqueConstraint(
            "analysis_run_id",
            "ahp_run_id",
            "zone_id",
            name="uq_zone_scores",
        ),
    )


class ZoneCriterionScore(Base):
    __tablename__ = "zone_criterion_scores"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    zone_score_id = Column(
        UUID(as_uuid=True),
        ForeignKey("zone_scores.id", ondelete="CASCADE"),
        nullable=False,
    )

    criterion_id = Column(
        UUID(as_uuid=True),
        ForeignKey("criteria.id", ondelete="CASCADE"),
        nullable=False,
    )

    criterion_code = Column(Text, nullable=False)
    normalized_value = Column(Numeric, nullable=False)
    weighted_score = Column(Numeric, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )    
class DecisionMaker(Base):
    __tablename__ = "decision_makers"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    name = Column(Text, nullable=False)
    email = Column(Text, nullable=True)
    role = Column(Text, nullable=True)

    expertise_weight = Column(
        Numeric,
        nullable=False,
        default=1.0,
        server_default=text("1.0"),
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class ExpertComparison(Base):
    __tablename__ = "expert_comparisons"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    decision_maker_id = Column(
        UUID(as_uuid=True),
        ForeignKey("decision_makers.id", ondelete="CASCADE"),
        nullable=False,
    )

    analysis_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("analysis_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    criterion_i_id = Column(
        UUID(as_uuid=True),
        ForeignKey("criteria.id", ondelete="CASCADE"),
        nullable=False,
    )

    criterion_j_id = Column(
        UUID(as_uuid=True),
        ForeignKey("criteria.id", ondelete="CASCADE"),
        nullable=False,
    )

    comparison_value = Column(Numeric, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        UniqueConstraint(
            "decision_maker_id",
            "analysis_run_id",
            "criterion_i_id",
            "criterion_j_id",
            name="uq_expert_comparisons",
        ),
    )


class ExpertWeight(Base):
    __tablename__ = "expert_weights"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    decision_maker_id = Column(
        UUID(as_uuid=True),
        ForeignKey("decision_makers.id", ondelete="CASCADE"),
        nullable=False,
    )

    ahp_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ahp_comparison_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    criterion_id = Column(
        UUID(as_uuid=True),
        ForeignKey("criteria.id", ondelete="CASCADE"),
        nullable=False,
    )

    weight = Column(Numeric, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        UniqueConstraint(
            "decision_maker_id",
            "ahp_run_id",
            "criterion_id",
            name="uq_expert_weights",
        ),
    )    