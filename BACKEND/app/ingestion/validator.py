import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List
import pandas as pd
from app.config import settings
from app.ingestion.topics import (
    TOPIC_GRANULES_TRANSFORMED,
    TOPIC_GRANULES_DLQ,
    GranuleTransformedMessage,
    GranuleDLQMessage,
)
from app.ingestion.kafka_bus import kafka_bus
from app.ingestion.deduplication import dedup_ledger, compute_file_sha256

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = [
    "granule_id",
    "observation_time",
    "latitude",
    "longitude",
    "precipitation",
    "ice",
    "liquid",
    "liquid_percent",
    "num_precip_half_hour",
    "num_valid_half_hour",
]


class GranuleValidator:
    """Strict schema, coordinate bounds, null threshold, and sanity validator for transformed CSVs."""

    def __init__(self):
        self.dlq_dir = settings.DATA_DLQ_DIR
        self.dlq_dir.mkdir(parents=True, exist_ok=True)

    def validate_csv(self, csv_path: Path) -> Tuple[bool, List[str], Dict[str, Any]]:
        """Validate CSV file contents and return (is_valid, error_reasons, stats)."""
        errors: List[str] = []
        stats: Dict[str, Any] = {}

        if not csv_path.exists():
            return False, [f"CSV file does not exist at {csv_path}"], {}

        if csv_path.stat().st_size == 0:
            return False, ["CSV file is completely empty (0 bytes)."], {}

        try:
            # Read first chunk or entire file
            df = pd.read_csv(csv_path, nrows=100000)
        except Exception as e:
            return False, [f"Corrupt CSV file, failed to parse: {e}"], {}

        row_count = len(df)
        stats["sample_row_count"] = row_count

        if row_count == 0:
            errors.append("CSV contains 0 observation records.")
            return False, errors, stats

        # 1. Schema check
        missing_cols = [col for col in REQUIRED_COLUMNS if col not in df.columns]
        if missing_cols:
            errors.append(f"Missing required columns in CSV: {missing_cols}")

        if errors:
            return False, errors, stats

        # 2. Coordinate range check
        lat_min, lat_max = df["latitude"].min(), df["latitude"].max()
        lon_min, lon_max = df["longitude"].min(), df["longitude"].max()
        stats["lat_range"] = (float(lat_min), float(lat_max))
        stats["lon_range"] = (float(lon_min), float(lon_max))

        if lat_min < -90.0 or lat_max > 90.0:
            errors.append(f"Latitude out of bounds [-90, 90]: [{lat_min}, {lat_max}]")

        if lon_min < -180.0 or lon_max > 180.0:
            errors.append(f"Longitude out of bounds [-180, 180]: [{lon_min}, {lon_max}]")

        # 3. Coordinate null checks
        if df["latitude"].isnull().any() or df["longitude"].isnull().any():
            errors.append("Null coordinate values detected in latitude or longitude.")

        # 4. Precipitation sanity checks
        precip_min = df["precipitation"].min()
        precip_max = df["precipitation"].max()
        stats["precip_range"] = (float(precip_min), float(precip_max))

        if precip_min < 0.0:
            errors.append(f"Invalid negative precipitation detected: min={precip_min}")

        # Distinguish 30-minute rain rate product (mm/hr) from multi-day accumulation products (.1day, .3day, .7day in mm)
        is_multiday = any(p in str(csv_path) for p in [".7day", ".3day", ".1day", "7day", "3day", "1day"])
        max_allowed = 50000.0 if is_multiday else 5000.0
        if precip_max > max_allowed:
            errors.append(f"Extreme unreasonable precipitation (>{max_allowed} mm): max={precip_max}")

        # 5. Null threshold check across observation time and IDs
        if df["granule_id"].isnull().any():
            errors.append("Missing granule_id in observation rows.")
        if df["observation_time"].isnull().any():
            errors.append("Missing observation_time in observation rows.")

        is_valid = len(errors) == 0
        return is_valid, errors, stats

    async def handle_transformed_file(
        self,
        csv_path: Path,
        granule_id: str,
        observation_time: datetime,
        row_count: int,
    ) -> bool:
        """Validate transformed CSV and route to either DLQ or Transformed topic."""
        await dedup_ledger.update_status(granule_id, status="VALIDATING")

        is_valid, errors, stats = await asyncio.to_thread(self.validate_csv, csv_path)

        if not is_valid:
            error_reason = "; ".join(errors)
            logger.error(f"Validation FAILED for granule {granule_id}: {error_reason}")

            # Write DLQ inspection artifact off the event loop
            dlq_report = {
                "granule_id": granule_id,
                "csv_path": str(csv_path.resolve()),
                "observation_time": observation_time.isoformat(),
                "errors": errors,
                "stats": stats,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            dlq_file = self.dlq_dir / f"{granule_id}_dlq_error.json"
            await asyncio.to_thread(dlq_file.write_text, json.dumps(dlq_report, indent=2))

            # Update ledger
            await dedup_ledger.update_status(
                granule_id=granule_id,
                status="DLQ",
                error_message=error_reason,
            )

            # Emit DLQ event
            dlq_msg = GranuleDLQMessage(
                granule_id=granule_id,
                source_stage="VALIDATOR",
                failed_file_path=str(csv_path.resolve()),
                error_reason=error_reason,
                error_details=dlq_report,
                retryable=False,
            )
            await kafka_bus.publish(
                topic=TOPIC_GRANULES_DLQ,
                key=granule_id,
                payload=dlq_msg.model_dump(),
            )
            return False

        # If valid, compute checksum off the event loop and emit transformed event
        checksum = await asyncio.to_thread(compute_file_sha256, str(csv_path))
        await dedup_ledger.update_status(
            granule_id=granule_id,
            status="VALIDATED",
            row_count=row_count,
            transformed_file_path=str(csv_path.resolve()),
        )

        transformed_msg = GranuleTransformedMessage(
            granule_id=granule_id,
            transformed_file_path=str(csv_path.resolve()),
            observation_time=observation_time,
            row_count=row_count,
            columns=REQUIRED_COLUMNS,
            checksum_sha256=checksum,
        )
        await kafka_bus.publish(
            topic=TOPIC_GRANULES_TRANSFORMED,
            key=granule_id,
            payload=transformed_msg.model_dump(),
        )
        logger.info(f"Granule {granule_id} passed validation ({row_count:,} rows). Published to '{TOPIC_GRANULES_TRANSFORMED}'.")
        return True


granule_validator = GranuleValidator()
