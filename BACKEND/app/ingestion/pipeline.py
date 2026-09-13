import asyncio
import logging
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional
from app.config import settings
from app.ingestion.topics import (
    TOPIC_GRANULES_DISCOVERED,
    TOPIC_GRANULES_RAW,
    TOPIC_GRANULES_STATUS,
    TOPIC_GRANULES_NEW,
    TOPIC_GRANULES_SKIPPED,
    TOPIC_GRANULES_TRANSFORMED,
    TOPIC_GRANULES_DLQ,
    TOPIC_WEATHER_OBSERVATION,
    GranuleDiscoveredMessage,
)
from app.ingestion.kafka_bus import kafka_bus
from app.ingestion.downloader import granule_downloader, is_valid_zip
from app.ingestion.extractor import granule_extractor
from app.ingestion.converter import convert_imerg_to_standard_csv
from app.ingestion.validator import granule_validator
from app.ingestion.loader import bulk_loader
from app.ingestion.deduplication import dedup_ledger
from app.analytics.aggregator import analytics_aggregator

logger = logging.getLogger(__name__)

MAX_EXTRACTION_RECOVERY_RETRIES = 3


class WeatherIngestionPipeline:
    """Orchestrates end-to-end IMERG ingestion across Kafka stages with strict lifecycle and recovery."""

    def __init__(self):
        self._initialized = False
        self._active_processing = set()

    def setup_event_subscribers(self) -> None:
        """Register listeners on Kafka bus topics."""
        if self._initialized:
            return

        kafka_bus.register_handler(TOPIC_GRANULES_DISCOVERED, self.on_granule_discovered)
        kafka_bus.register_handler(TOPIC_GRANULES_RAW, self.on_granule_raw)
        kafka_bus.register_handler(TOPIC_GRANULES_STATUS, self.on_granule_status)
        kafka_bus.register_handler(TOPIC_GRANULES_TRANSFORMED, self.on_granule_transformed)
        kafka_bus.register_handler(TOPIC_WEATHER_OBSERVATION, self.on_weather_observation)
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
        resolved_raw_path = settings.resolve_raw_path(raw_file_path, file_name=file_name)
        checksum = event.get("checksum_sha256")
        obs_time_raw = event.get("observation_time")
        if isinstance(obs_time_raw, str):
            obs_time = datetime.fromisoformat(obs_time_raw.replace("Z", "+00:00"))
        else:
            obs_time = obs_time_raw or datetime.now(timezone.utc)

        logger.info(f"[Pipeline] Evaluating raw granule {granule_id} via deduplication ledger...")
        if not checksum and resolved_raw_path.exists():
            from app.ingestion.deduplication import compute_file_sha256
            checksum = await asyncio.to_thread(compute_file_sha256, str(resolved_raw_path))

        await dedup_ledger.evaluate_and_route(
            granule_id=granule_id,
            file_name=file_name,
            source_url=source_url,
            observation_time=obs_time,
            raw_file_path=str(resolved_raw_path),
            checksum=checksum or "",
        )

    async def on_granule_status(self, event: Dict[str, Any]) -> None:
        """Handler for ritu.granules.status events.
        
        Safely ignores weather observation records if sharing the topic.
        """
        # If this is a weather observation record (has latitude and precipitation without action), ignore here
        if "latitude" in event and "precipitation" in event and "action" not in event:
            return

        action = str(event.get("action", "")).upper()
        granule_id = event.get("granule_id", "UNKNOWN")

        if action == "NEW":
            logger.info(f"[Pipeline] Received status 'NEW' for granule {granule_id}. Proceeding to extraction.")
            await self.on_granule_new(event)
        elif action == "SKIPPED":
            reason = event.get("reason", "Duplicate or already completed")
            logger.info(f"[Pipeline] Received status 'SKIPPED' for granule {granule_id}: {reason}")
        else:
            logger.debug(f"[Pipeline] Status event for {granule_id} with action '{action}' acknowledged.")

    async def on_granule_new(self, event: Dict[str, Any]) -> None:
        """Handler for verified new granules -> Extractor, Converter, and Validator.
        
        Includes automatic missing ZIP recovery and idempotency protection against duplicate/stale messages.
        """
        granule_id = event.get("granule_id")
        raw_file_path = event.get("raw_file_path")
        file_name = event.get("file_name", f"{granule_id}.zip")
        resolved_raw_path = settings.resolve_raw_path(raw_file_path, file_name=file_name)
        obs_time_raw = event.get("observation_time")
        if isinstance(obs_time_raw, str):
            obs_time = datetime.fromisoformat(obs_time_raw.replace("Z", "+00:00"))
        else:
            obs_time = obs_time_raw or datetime.now(timezone.utc)

        # 0. Check if granule is already completed/persisted in database ledger (e.g. from previous run or replayed offset)
        entry = await dedup_ledger.get_entry(granule_id)
        if entry and entry.get("status") in ("COMPLETED", "PERSISTED"):
            logger.info(
                f"[Pipeline] granule_id='{granule_id}' status='{entry.get('status')}' "
                f"note='Granule already completed in database. Safely skipping re-extraction.'"
            )
            return

        if granule_id in self._active_processing:
            logger.info(f"[Pipeline] Granule {granule_id} is currently being processed. Safely skipping concurrent execution.")
            return

        self._active_processing.add(granule_id)
        try:
            retry_count = (entry.get("retry_count") or 0) if entry else 0

            # 1. Recovery Check: Verify that the local raw ZIP file actually exists and is valid
            if not resolved_raw_path.exists() or not is_valid_zip(resolved_raw_path):
                if retry_count >= MAX_EXTRACTION_RECOVERY_RETRIES:
                    err_msg = (
                        f"ZIP file not found at {resolved_raw_path} and maximum recovery retries "
                        f"({MAX_EXTRACTION_RECOVERY_RETRIES}) exceeded."
                    )
                    logger.error(
                        f"[Pipeline] granule_id='{granule_id}' status='FAILED' retry_count={retry_count} "
                        f"failure_reason='{err_msg}'"
                    )
                    await dedup_ledger.update_status(
                        granule_id=granule_id,
                        status="FAILED",
                        error_message=err_msg,
                    )
                    return

                # Resolve download source URL from event, ledger, or NASA PPS structure
                source_url = event.get("source_url") or (entry.get("source_url") if entry else "")
                if not source_url or source_url.startswith("local://"):
                    base_pps = (settings.NASA_PPS_BASE_URL or "https://jsimpsonhttps.pps.eosdis.nasa.gov").rstrip("/")
                    source_url = f"{base_pps}/imerg/gis/{obs_time.year}/{obs_time.month:02d}/{file_name}"

                logger.info(
                    f"[Pipeline] granule_id='{granule_id}' status='RECOVERY_DOWNLOAD' "
                    f"download_url='{source_url}' local_path='{resolved_raw_path}' "
                    f"retry_count={retry_count + 1} note='Local ZIP missing or invalid; downloading before extraction...'"
                )

                # Perform recovery download
                downloaded = await granule_downloader.download_granule_safe(
                    source_url=source_url,
                    file_name=file_name,
                    granule_id=granule_id,
                )

                if not downloaded or not is_valid_zip(downloaded):
                    err_msg = f"Recovery download failed for {source_url} (attempt {retry_count + 1})"
                    logger.warning(
                        f"[Pipeline] granule_id='{granule_id}' status='DOWNLOAD_PENDING' "
                        f"retry_count={retry_count + 1} failure_reason='{err_msg}'"
                    )
                    await dedup_ledger.update_status(
                        granule_id=granule_id,
                        status="DOWNLOAD_PENDING",
                        error_message=err_msg,
                        retry_increment=True,
                        source_url=source_url,
                    )
                    return

                resolved_raw_path = downloaded
                logger.info(f"[Pipeline] granule_id='{granule_id}' status='RECOVERED' local_path='{resolved_raw_path}'")

            # 2. Extraction: EXTRACTING -> EXTRACTED
            logger.info(f"[Pipeline] Processing granule {granule_id} from {resolved_raw_path}...")
            await dedup_ledger.update_status(granule_id, status="EXTRACTING", raw_file_path=str(resolved_raw_path))
            layers = await asyncio.to_thread(granule_extractor.extract_zip, str(resolved_raw_path), granule_id)
            if not layers:
                err_msg = f"Failed to extract valid GeoTIFF layers from ZIP at {resolved_raw_path}"
                logger.error(f"[Pipeline] granule_id='{granule_id}' status='FAILED' failure_reason='{err_msg}'")
                await dedup_ledger.update_status(
                    granule_id,
                    status="FAILED",
                    error_message=err_msg,
                    retry_increment=True,
                )
                return

            await dedup_ledger.update_status(granule_id, status="EXTRACTED")

            # 3. Conversion: TRANSFORMING
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
                err_msg = f"Conversion error: {str(e)}"
                logger.error(f"[Pipeline] granule_id='{granule_id}' status='FAILED' failure_reason='{err_msg}'", exc_info=True)
                await dedup_ledger.update_status(
                    granule_id,
                    status="FAILED",
                    error_message=err_msg,
                    retry_increment=True,
                )
                return

            # 4. Validation: VALIDATING -> VALIDATED / DLQ
            await granule_validator.handle_transformed_file(
                csv_path=transformed_csv,
                granule_id=granule_id,
                observation_time=obs_time,
                row_count=row_count,
            )
        finally:
            self._active_processing.discard(granule_id)

    async def on_weather_observation(self, event: Dict[str, Any]) -> None:
        """Handler for weather observation event from Kafka -> Persist and broadcast."""
        # Prevent handling ledger events that share ritu.granules.status
        if "action" in event:
            return
        if "latitude" not in event or "precipitation" not in event:
            return

        try:
            from app.ingestion.weather_event_service import weather_pipeline
            await weather_pipeline.process_and_persist_events([event], publish_to_kafka=False)
        except Exception as ex:
            logger.error(f"[Pipeline] Error processing Kafka weather observation event: {ex}", exc_info=True)

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
            # Transition ledger status to PERSISTED and then COMPLETED
            await dedup_ledger.update_status(granule_id, status="PERSISTED")
            await dedup_ledger.update_status(granule_id, status="COMPLETED")

            # Trigger pre-aggregated analytics update
            try:
                await analytics_aggregator.compute_rollups_for_observation(obs_time)
                await analytics_aggregator.detect_anomalies_for_granule(granule_id, obs_time)
            except Exception as ex:
                logger.warning(f"Analytics computation notice post-load for {granule_id}: {ex}")

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

            # Broadcast incremental updates via WebSocket
            try:
                await self._broadcast_granule_websocket(csv_path, granule_id, obs_time)
            except Exception as ws_err:
                logger.debug(f"WebSocket broadcast error after bulk load: {ws_err}")
        else:
            raise RuntimeError(f"Bulk loading failed for granule {granule_id}")

    async def _broadcast_granule_websocket(self, csv_path: Path, granule_id: str, obs_time: datetime) -> None:
        """Broadcast downsampled raster updates from loaded CSV to active WebSocket subscribers."""
        import pandas as pd
        from app.api.ws_manager import weather_ws_manager

        if not csv_path.exists():
            return

        df = pd.read_csv(csv_path)
        if df.empty:
            return

        active_df = df[df["precipitation"] >= 0.1]
        sample_df = active_df.sample(n=min(len(active_df), 400), random_state=42) if len(active_df) > 400 else active_df

        updates = []
        for _, r in sample_df.iterrows():
            lat = round(float(r["latitude"]), 2)
            lon = round(float(r["longitude"]), 2)
            precip = round(float(r["precipitation"]), 2)
            updates.append({
                "id": f"{lat:.2f}_{lon:.2f}",
                "lat": lat,
                "lon": lon,
                "value": precip,
                "precipitation": precip,
                "liquid": round(float(r.get("liquid", precip)), 2),
                "ice": round(float(r.get("ice", 0.0)), 2),
                "liquid_percent": round(float(r.get("liquid_percent", 100.0)), 1),
                "timestamp": obs_time.isoformat(),
            })

        max_p = float(df["precipitation"].max()) if not df.empty else 0.0
        avg_p = round(float(df["precipitation"].mean()), 2) if not df.empty else 0.0

        summary = {
            "avg_precipitation": avg_p,
            "max_precipitation": max_p,
            "min_precipitation": float(df["precipitation"].min()) if not df.empty else 0.0,
            "total_points": len(df),
            "rain_category": "Heavy Rainfall" if max_p > 30 else "Moderate Rain",
        }

        await weather_ws_manager.broadcast_batch(
            updates=updates,
            removals=[],
            summary=summary,
            timestamp=obs_time,
            granule_id=granule_id,
            source="NASA",
            product="IMERG",
        )

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
        await dedup_ledger.update_status(granule_id, status="EXTRACTING", raw_file_path=str(zip_path.resolve()))
        layers = await asyncio.to_thread(granule_extractor.extract_zip, str(zip_path), granule_id)
        if not layers:
            await dedup_ledger.update_status(granule_id, status="FAILED", error_message="Extraction failed")
            return False
        await dedup_ledger.update_status(granule_id, status="EXTRACTED")

        # 3. Conversion
        await dedup_ledger.update_status(granule_id, status="TRANSFORMING")
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
        await dedup_ledger.update_status(granule_id, status="LOADING")
        loaded = await bulk_loader.load_csv(
            csv_path=transformed_csv,
            granule_id=granule_id,
            observation_time=obs_time,
        )

        if loaded:
            await dedup_ledger.update_status(granule_id, status="PERSISTED")
            await dedup_ledger.update_status(granule_id, status="COMPLETED")
            try:
                await analytics_aggregator.compute_rollups_for_observation(obs_time)
                await analytics_aggregator.detect_anomalies_for_granule(granule_id, obs_time)
            except Exception as ex:
                logger.warning(f"Analytics notice for {granule_id}: {ex}")

            try:
                from app.api.broadcaster import weather_broadcaster
                await weather_broadcaster.broadcast("new_granule", {
                    "granule_id": granule_id,
                    "observation_time": obs_time.isoformat(),
                    "status": "COMPLETED"
                })
            except Exception as b_err:
                logger.debug(f"SSE broadcast notice skipped: {b_err}")

            try:
                await self._broadcast_granule_websocket(transformed_csv, granule_id, obs_time)
            except Exception as ws_err:
                logger.debug(f"WebSocket broadcast error after direct load: {ws_err}")

        return loaded


pipeline_service = WeatherIngestionPipeline()
