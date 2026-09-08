"""Kafka topic names and event message schemas."""

from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

# Kafka Topic Names (5-Topic Target Architecture)
TOPIC_GRANULES_DISCOVERED = "ritu.granules.discovered"
TOPIC_GRANULES_RAW = "ritu.granules.raw"
TOPIC_GRANULES_STATUS = "ritu.granules.status"
TOPIC_GRANULES_TRANSFORMED = "ritu.granules.transformed"
TOPIC_GRANULES_DLQ = "ritu.granules.dlq"

# Backward-compatibility aliases (consolidated into ritu.granules.status)
TOPIC_GRANULES_NEW = TOPIC_GRANULES_STATUS
TOPIC_GRANULES_SKIPPED = TOPIC_GRANULES_STATUS

ALL_TOPICS = [
    TOPIC_GRANULES_DISCOVERED,
    TOPIC_GRANULES_RAW,
    TOPIC_GRANULES_STATUS,
    TOPIC_GRANULES_TRANSFORMED,
    TOPIC_GRANULES_DLQ,
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
