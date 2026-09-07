"""Database models and metadata."""

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column,
    String,
    Integer,
    BigInteger,
    Float,
    DateTime,
    Text,
    Index,
    PrimaryKeyConstraint,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class IngestionLedger(Base):
    """Tracks every NASA IMERG granule through the entire ingestion lifecycle.
    
    Guarantees idempotency and state visibility.
    """
    __tablename__ = "ingestion_ledger"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    granule_id = Column(String(255), unique=True, nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    source_url = Column(String(1024), nullable=False)
    observation_time = Column(DateTime(timezone=True), nullable=False, index=True)
    file_size_bytes = Column(BigInteger, nullable=True)
    checksum_sha256 = Column(String(64), nullable=True)
    raw_file_path = Column(String(1024), nullable=True)
    transformed_file_path = Column(String(1024), nullable=True)
    status = Column(String(32), nullable=False, default="DISCOVERED", index=True)
    row_count = Column(BigInteger, default=0)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_ledger_status_time", "status", "observation_time"),
    )


class PrecipitationObservationStaging(Base):
    """Unindexed staging table for fast bulk COPY loading from transformed CSVs."""
    __tablename__ = "precipitation_observations_staging"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    granule_id = Column(String(128), nullable=False)
    observation_time = Column(DateTime(timezone=True), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    precipitation = Column(Float, nullable=True)
    ice = Column(Float, nullable=True)
    liquid = Column(Float, nullable=True)
    liquid_percent = Column(Float, nullable=True)
    num_precip_half_hour = Column(Integer, nullable=True)
    num_valid_half_hour = Column(Integer, nullable=True)
    source = Column(String(64), nullable=False, default="NASA")
    product = Column(String(64), nullable=False, default="IMERG")


class PrecipitationObservation(Base):
    """Partitioned table for standardized weather observations with PostGIS spatial geometry."""
    __tablename__ = "precipitation_observations"

    observation_time = Column(DateTime(timezone=True), primary_key=True, nullable=False, index=True)
    granule_id = Column(String(128), primary_key=True, nullable=False)
    latitude = Column(Float, primary_key=True, nullable=False)
    longitude = Column(Float, primary_key=True, nullable=False)
    precipitation = Column(Float, nullable=True)
    ice = Column(Float, nullable=True)
    liquid = Column(Float, nullable=True)
    liquid_percent = Column(Float, nullable=True)
    num_precip_half_hour = Column(Integer, nullable=True)
    num_valid_half_hour = Column(Integer, nullable=True)
    source = Column(String(64), nullable=False, default="NASA")
    product = Column(String(64), nullable=False, default="IMERG")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        PrimaryKeyConstraint("observation_time", "granule_id", "latitude", "longitude"),
        Index("idx_precip_obs_time_coords", "observation_time", "latitude", "longitude"),
    )


class AggregatedWeather(Base):
    """Pre-aggregated rollups for high-speed dashboard analytics."""
    __tablename__ = "aggregated_weather"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    time_bucket = Column(String(16), nullable=False)  # 'DAILY', '7DAY', '30DAY'
    period_start = Column(DateTime(timezone=True), nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=False)
    region_code = Column(String(64), nullable=False, default="INDIA_ALL")
    avg_precipitation = Column(Float, nullable=True)
    max_precipitation = Column(Float, nullable=True)
    min_precipitation = Column(Float, nullable=True)
    total_volume_mm = Column(Float, nullable=True)
    total_samples = Column(BigInteger, default=0)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("time_bucket", "period_start", "period_end", "region_code", name="uq_agg_bucket_region"),
        Index("idx_agg_time_lookup", "time_bucket", "period_start"),
    )


class WeatherAnomaly(Base):
    """Detected weather anomalies and extreme precipitation events."""
    __tablename__ = "weather_anomalies"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    granule_id = Column(String(128), nullable=False, index=True)
    observation_time = Column(DateTime(timezone=True), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    precipitation = Column(Float, nullable=False)
    anomaly_score = Column(Float, nullable=True)
    anomaly_type = Column(String(32), nullable=False, default="EXTREME_RAIN")
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("idx_anomaly_time_coords", "observation_time", "latitude", "longitude"),
    )
