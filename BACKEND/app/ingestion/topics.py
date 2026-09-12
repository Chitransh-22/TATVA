"""Kafka topic names and event message schemas."""

from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

# Kafka Topic Names (Target Architecture)
TOPIC_GRANULES_DISCOVERED = "ritu.granules.discovered"
TOPIC_GRANULES_RAW = "ritu.granules.raw"
TOPIC_GRANULES_STATUS = "ritu.granules.status"
TOPIC_GRANULES_TRANSFORMED = "ritu.granules.transformed"
TOPIC_GRANULES_DLQ = "ritu.granules.dlq"
TOPIC_WEATHER_OBSERVATION = TOPIC_GRANULES_STATUS

# Backward-compatibility aliases (consolidated into ritu.granules.status)
TOPIC_GRANULES_NEW = TOPIC_GRANULES_STATUS
TOPIC_GRANULES_SKIPPED = TOPIC_GRANULES_STATUS

# MOSDAC Kafka Topics (Architecture Constraint: Strictly Maximum 5 Domain Topics)
TOPIC_MOSDAC_RAW = "mosdac.raw"
TOPIC_MOSDAC_WEATHER = "mosdac.weather"
TOPIC_MOSDAC_ENVIRONMENT = "mosdac.environment"
TOPIC_MOSDAC_OCEAN = "mosdac.ocean"
TOPIC_MOSDAC_DLQ = "mosdac.dlq"

MOSDAC_TOPICS = [
    TOPIC_MOSDAC_RAW,
    TOPIC_MOSDAC_WEATHER,
    TOPIC_MOSDAC_ENVIRONMENT,
    TOPIC_MOSDAC_OCEAN,
    TOPIC_MOSDAC_DLQ,
]

ALL_TOPICS = [
    TOPIC_GRANULES_DISCOVERED,
    TOPIC_GRANULES_RAW,
    TOPIC_GRANULES_STATUS,
    TOPIC_GRANULES_TRANSFORMED,
    TOPIC_GRANULES_DLQ,
    *MOSDAC_TOPICS,
]


class BaseGranuleEvent(BaseModel):
    granule_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GranuleDiscoveredMessage(BaseGranuleEvent):
    file_name: str
    source_url: str
    observation_time: datetime
    file_size_bytes: Optional[int] = None
    product_type: str = "IMERG"


class GranuleRawMessage(BaseGranuleEvent):
    file_name: str
    raw_file_path: str
    observation_time: datetime
    file_size_bytes: int
    checksum_sha256: str
    source_url: str


class GranuleLedgerMessage(BaseGranuleEvent):
    file_name: str
    observation_time: datetime
    raw_file_path: Optional[str] = None
    action: str  # "NEW" or "SKIPPED"
    reason: Optional[str] = None
    checksum_sha256: Optional[str] = None


class GranuleTransformedMessage(BaseGranuleEvent):
    transformed_file_path: str
    observation_time: datetime
    row_count: int
    columns: list[str] = Field(default_factory=list)
    checksum_sha256: str


class GranuleDLQMessage(BaseGranuleEvent):
    source_stage: str
    failed_file_path: Optional[str] = None
    error_reason: str
    error_details: Optional[Dict[str, Any]] = None
    retryable: bool = False


class WeatherObservationMessage(BaseGranuleEvent):
    observation_time: datetime
    latitude: float
    longitude: float
    precipitation: float
    ice: Optional[float] = 0.0
    liquid: Optional[float] = None
    liquid_percent: Optional[float] = 100.0
    num_precip_half_hour: Optional[int] = 1
    num_valid_half_hour: Optional[int] = 1
    source: str = "NASA"
    product: str = "IMERG"
    state: Optional[str] = None
    district: Optional[str] = None


class MosdacKafkaEnvelope(BaseModel):
    """Standardized Kafka message envelope for ISRO MOSDAC multi-product events.
    
    Adheres strictly to the 5-topic domain partitioning architecture.
    """
    source: str = "MOSDAC"
    satellite: str = "INSAT-3DS"
    product: str
    category: str  # "weather", "environment", "ocean"
    event_type: str  # "DISCOVERED", "RAW_STORED", "OBSERVATION_INGESTED", "ERROR"
    observation_time: str
    ingested_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    granule_id: str
    version: int = 1
    point_count: int = 0
    unit: str = ""
    summary: Dict[str, Any] = Field(default_factory=dict)
    payload: Optional[Dict[str, Any]] = None

    @classmethod
    def create_message_key(cls, product: str, observation_time: str) -> str:
        """Create domain partitioned message key: MOSDAC:{product}:{observation_time}."""
        return f"MOSDAC:{product}:{observation_time}"


