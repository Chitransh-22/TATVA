import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional
from app.config import settings
from app.ingestion.topics import (
    TOPIC_GRANULES_DISCOVERED,
    TOPIC_GRANULES_RAW,
    TOPIC_GRANULES_NEW,
    TOPIC_GRANULES_SKIPPED,
    TOPIC_GRANULES_TRANSFORMED,
    TOPIC_GRANULES_DLQ,
    GranuleDiscoveredMessage,
)
from app.ingestion.kafka_bus import kafka_bus
from app.ingestion.downloader import granule_downloader
from app.ingestion.extractor import granule_extractor
from app.ingestion.converter import convert_imerg_to_standard_csv
from app.ingestion.validator import granule_validator
from app.ingestion.loader import bulk_loader
from app.ingestion.deduplication import dedup_ledger
from app.analytics.aggregator import analytics_aggregator

logger = logging.getLogger(__name__)


class WeatherIngestionPipeline:
    """Orchestrates end-to-end IMERG ingestion across Kafka stages."""

    def __init__(self):
        self._initialized = False

    def setup_event_subscribers(self) -> None:
        """Register listeners on Kafka bus topics."""
        if self._initialized:
            return

        kafka_bus.register_handler(TOPIC_GRANULES_DISCOVERED, self.on_granule_discovered)
        kafka_bus.register_handler(TOPIC_GRANULES_RAW, self.on_granule_raw)
        kafka_bus.register_handler(TOPIC_GRANULES_NEW, self.on_granule_new)
        kafka_bus.register_handler(TOPIC_GRANULES_TRANSFORMED, self.on_granule_transformed)
        self._initialized = True
        logger.info("Kafka ingestion pipeline event subscribers registered.")

    async def on_granule_discovered(self, event: Dict[str, Any]) -> None:
        """Handler for discovered granules -> Initiates download."""
        granule_id = event.get("granule_id")
        logger.info(f"[Pipeline] Received discovered event for {granule_id}")
        msg = GranuleDiscoveredMessage(**event)
        await granule_downloader.handle_discovered_granule(msg)

    async def on_granule_raw(self, event: Dict[str, Any]) -> None:
        """Handler for raw downloaded granules -> Deduplication / Ingestion Ledger evaluation."""
        granule_id = event.get("granule_id")
        file_name = event.get("file_name", f"{granule_id}.zip")
        source_url = event.get("source_url", "")
        raw_file_path = event.get("raw_file_path")
        checksum = event.get("checksum_sha256")
        obs_time_raw = event.get("observation_time")
        if isinstance(obs_time_raw, str):
            obs_time = datetime.fromisoformat(obs_time_raw.replace("Z", "+00:00"))
        else:
            obs_time = obs_time_raw or datetime.now(timezone.utc)

        logger.info(f"[Pipeline] Evaluating raw granule {granule_id} via deduplication ledger...")
        if not checksum and raw_file_path and Path(raw_file_path).exists():
            from app.ingestion.deduplication import compute_file_sha256
            checksum = await asyncio.to_thread(compute_file_sha256, raw_file_path)

        await dedup_ledger.evaluate_and_route(
            granule_id=granule_id,
            file_name=file_name,
            source_url=source_url,
            observation_time=obs_time,
            raw_file_path=raw_file_path,
            checksum=checksum or "",
        )

    async def on_granule_new(self, event: Dict[str, Any]) -> None:
        """Handler for verified new granules -> Extractor and Converter."""
        granule_id = event.get("granule_id")
        raw_file_path = event.get("raw_file_path")
        obs_time_raw = event.get("observation_time")
        if isinstance(obs_time_raw, str):
            obs_time = datetime.fromisoformat(obs_time_raw.replace("Z", "+00:00"))
        else:
            obs_time = obs_time_raw or datetime.now(timezone.utc)

        logger.info(f"[Pipeline] Processing new granule {granule_id} from {raw_file_path}")

        # 1. Extraction
        await dedup_ledger.update_status(granule_id, status="EXTRACTING")
        layers = await asyncio.to_thread(granule_extractor.extract_zip, raw_file_path, granule_id)
        if not layers:
            await dedup_ledger.update_status(
                granule_id,
                status="FAILED",
                error_message="Failed to extract valid GeoTIFF layers from ZIP"
            )
            return

        await dedup_ledger.update_status(granule_id, status="EXTRACTED")

        # 2. Conversion
        await dedup_ledger.update_status(granule_id, status="TRANSFORMING")
        try:
            summary = await asyncio.to_thread(
                convert_imerg_to_standard_csv,
                files=layers,
                granule_id=granule_id,
                observation_time=obs_time,
                clip_to_india=settings.CLIP_TO_INDIA,
            )
            transformed_csv = Path(summary["output_file"])
            row_count = summary["row_count"]
        except Exception as e:
            logger.error(f"Error converting granule {granule_id}: {e}", exc_info=True)
            await dedup_ledger.update_status(
                granule_id,
                status="FAILED",
                error_message=f"Conversion error: {str(e)}"
            )
            return

        # 3. Validation
        await granule_validator.handle_transformed_file(
            csv_path=transformed_csv,
            granule_id=granule_id,
            observation_time=obs_time,
            row_count=row_count,
        )

    async def on_granule_transformed(self, event: Dict[str, Any]) -> None:
        """Handler for validated transformed CSV -> Bulk staging COPY and PostGIS load."""
        granule_id = event.get("granule_id")
        csv_path = Path(event.get("transformed_file_path"))
        obs_time_raw = event.get("observation_time")
        if isinstance(obs_time_raw, str):
            obs_time = datetime.fromisoformat(obs_time_raw.replace("Z", "+00:00"))
        else:
            obs_time = obs_time_raw or datetime.now(timezone.utc)

        logger.info(f"[Pipeline] Bulk loading validated granule {granule_id}...")
        success = await bulk_loader.load_csv(
            csv_path=csv_path,
            granule_id=granule_id,
            observation_time=obs_time,
        )

        if success:
            # Trigger pre-aggregated analytics update
            try:
                await analytics_aggregator.compute_rollups_for_observation(obs_time)
                await analytics_aggregator.detect_anomalies_for_granule(granule_id, obs_time)
            except Exception as ex:
                logger.error(f"Error computing analytics post-load: {ex}")

            # Notify connected map clients via SSE broadcaster
            try:
                from app.api.broadcaster import weather_broadcaster
                await weather_broadcaster.broadcast("new_granule", {
                    "granule_id": granule_id,
                    "observation_time": obs_time.isoformat(),
                    "status": "COMPLETED"
                })
            except Exception as b_err:
                logger.debug(f"SSE broadcast notice skipped: {b_err}")
        else:
            raise RuntimeError(f"Bulk loading failed for granule {granule_id}")

    async def process_granule_direct(
        self,
        granule_id: str,
        zip_path: Path,
        observation_time: Optional[datetime] = None,
    ) -> bool:
        """Direct end-to-end pipeline execution for a local ZIP file.
        
        Useful for testing, reprocessing, and manual CLI/API execution.
        """
        obs_time = observation_time or datetime.now(timezone.utc)
        logger.info(f"Directly processing granule {granule_id} from {zip_path}...")

        # 1. Ledger registration
        await dedup_ledger.register_discovered(
            GranuleDiscoveredMessage(
                granule_id=granule_id,
                file_name=zip_path.name,
                source_url=f"local://{zip_path.name}",
                observation_time=obs_time,
                file_size_bytes=zip_path.stat().st_size,
            )
        )

        # 2. Extraction
        layers = await asyncio.to_thread(granule_extractor.extract_zip, str(zip_path), granule_id)
        if not layers:
            await dedup_ledger.update_status(granule_id, status="FAILED", error_message="Extraction failed")
            return False

        # 3. Conversion
        summary = await asyncio.to_thread(
            convert_imerg_to_standard_csv,
            files=layers,
            granule_id=granule_id,
            observation_time=obs_time,
            clip_to_india=settings.CLIP_TO_INDIA,
        )
        transformed_csv = Path(summary["output_file"])
        row_count = summary["row_count"]

        # 4. Validation
        is_valid = await granule_validator.handle_transformed_file(
            csv_path=transformed_csv,
            granule_id=granule_id,
            observation_time=obs_time,
            row_count=row_count,
        )
        if not is_valid:
            return False

        # 5. Bulk Load
        loaded = await bulk_loader.load_csv(
            csv_path=transformed_csv,
            granule_id=granule_id,
            observation_time=obs_time,
        )

        if loaded:
            await analytics_aggregator.compute_rollups_for_observation(obs_time)
            await analytics_aggregator.detect_anomalies_for_granule(granule_id, obs_time)
            try:
                from app.api.broadcaster import weather_broadcaster
                await weather_broadcaster.broadcast("new_granule", {
                    "granule_id": granule_id,
                    "observation_time": obs_time.isoformat(),
                    "status": "COMPLETED"
                })
            except Exception as b_err:
                logger.debug(f"SSE broadcast notice skipped: {b_err}")

        return loaded


pipeline_service = WeatherIngestionPipeline()
