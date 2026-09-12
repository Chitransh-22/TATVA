"""End-to-end Modular Ingestion Pipeline for ISRO MOSDAC Multi-Data Products."""

import asyncio
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import settings
from app.ingestion.kafka_bus import kafka_bus
from app.ingestion.topics import (
    TOPIC_MOSDAC_RAW,
    TOPIC_MOSDAC_WEATHER,
    TOPIC_MOSDAC_ENVIRONMENT,
    TOPIC_MOSDAC_OCEAN,
    TOPIC_MOSDAC_DLQ,
    MosdacKafkaEnvelope,
)
from app.ingestion.mosdac.client import mosdac_client
from app.ingestion.mosdac.registry import (
    MOSDAC_PRODUCTS,
    ProductCategory,
    ProductStatus,
    get_product_definition,
)
from app.ingestion.mosdac.adapters import get_adapter_for_product
from app.ingestion.mosdac.validator import mosdac_validator
from app.ingestion.mosdac.loader import mosdac_loader

logger = logging.getLogger(__name__)


class MosdacPipeline:
    """Orchestrates independent discovery, download, parsing, validation, Kafka publishing, and persistence for all MOSDAC products."""

    def __init__(self):
        # Cache of latest observations keyed by product_id
        self._latest_observations: Dict[str, Dict[str, Any]] = {}
        self._is_running: bool = False

    @property
    def latest_observation(self) -> Optional[Dict[str, Any]]:
        """Backward-compatible property for the default HEM rainfall observation."""
        return self._latest_observations.get("3SIMG_L2B_HEM")

    def get_latest_observation(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve latest observation for a specific MOSDAC product."""
        return self._latest_observations.get(product_id)

    def is_product_enabled(self, product_id: str) -> bool:
        """Check multi-tier environment configuration toggles for product enablement."""
        if not getattr(settings, "MOSDAC_PIPELINE_ENABLED", True):
            return False

        meta = get_product_definition(product_id)
        if not meta:
            return False

        # Category level toggle
        cat = meta.get("category")
        if cat == ProductCategory.WEATHER and not getattr(settings, "MOSDAC_WEATHER_ENABLED", True):
            return False
        if cat == ProductCategory.ENVIRONMENT and not getattr(settings, "MOSDAC_ENVIRONMENT_ENABLED", True):
            return False
        if cat == ProductCategory.OCEAN and not getattr(settings, "MOSDAC_OCEAN_ENABLED", True):
            return False

        # Product level toggle
        env_flag = meta.get("env_flag")
        if env_flag and not getattr(settings, env_flag, True):
            return False

        return True

    def infer_product_id(self, file_path: Path) -> str:
        """Infer MOSDAC product ID from filename."""
        name = file_path.name
        for p_id in MOSDAC_PRODUCTS:
            code = p_id.split("_")[-1]  # e.g., CTP, UTH, OLR, SST, FOG, SNW, AOD, HEM
            if f"_{code}_" in name or name.endswith(f"_{code}"):
                return p_id
        return "3SIMG_L2B_HEM"

    def get_kafka_topic_for_category(self, category: str) -> str:
        """Map product category to one of the 5 canonical MOSDAC Kafka topics."""
        cat_lower = str(category).lower()
        if "weather" in cat_lower:
            return TOPIC_MOSDAC_WEATHER
        elif "ocean" in cat_lower:
            return TOPIC_MOSDAC_OCEAN
        elif "env" in cat_lower:
            return TOPIC_MOSDAC_ENVIRONMENT
        return TOPIC_MOSDAC_WEATHER

    async def ingest_granule_file(
        self,
        file_path: Path,
        product_id: Optional[str] = None,
        persist_db: bool = True,
        clip_to_india: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Ingest a specific local MOSDAC HDF5 file through validation, parsing, database persistence, and Kafka publishing."""
        pipeline_start = time.time()
        granule_id = file_path.stem
        target_product = product_id or self.infer_product_id(file_path)
        meta = get_product_definition(target_product) or {}
        category = str(meta.get("category", "weather"))

        logger.info(f"[MOSDAC Pipeline] Starting ingestion for {target_product} ({file_path.name})...")

        # 1. Multi-tier toggle check
        if not self.is_product_enabled(target_product):
            msg = f"Product {target_product} is disabled by configuration toggles"
            logger.info(f"[MOSDAC Pipeline] {msg}")
            return {"status": "DISABLED", "message": msg, "product_id": target_product}

        # 2. Validate raw HDF5 file
        is_file_valid, file_errors = mosdac_validator.validate_raw_file(file_path, target_product)
        if not is_file_valid:
            logger.error(f"[MOSDAC Pipeline] Raw file validation failed for {granule_id}: {file_errors}")
            # Emit to DLQ
            await self._publish_dlq(granule_id, target_product, category, str(file_path), "RAW_FILE_VALIDATION_ERROR", file_errors)
            return {
                "status": "FAILED",
                "stage": "FILE_VALIDATION",
                "granule_id": granule_id,
                "product_id": target_product,
                "errors": file_errors,
            }

        # 3. Obtain product adapter and parse
        adapter = get_adapter_for_product(target_product)
        if not adapter:
            err = f"No adapter registered for product {target_product}"
            logger.error(f"[MOSDAC Pipeline] {err}")
            return {"status": "FAILED", "stage": "ADAPTER_LOOKUP", "error": err}

        # Determine spatial clipping: Ocean products should not be land-clipped
        should_clip = clip_to_india if clip_to_india is not None else (category != "ocean")

        try:
            parse_result = adapter.parse(
                h5_path=file_path,
                clip_to_india=should_clip,
                save_csv=True,
            )
        except Exception as e:
            logger.error(f"[MOSDAC Pipeline] Parsing failed for {granule_id}: {e}", exc_info=True)
            await self._publish_dlq(granule_id, target_product, category, str(file_path), "PARSING_ERROR", [str(e)])
            return {
                "status": "FAILED",
                "stage": "PARSING",
                "granule_id": granule_id,
                "product_id": target_product,
                "errors": [str(e)],
            }

        # 4. Validate parsed meteorological/geophysical data
        is_data_valid, data_errors = mosdac_validator.validate_parsed_data(parse_result)
        if not is_data_valid:
            logger.error(f"[MOSDAC Pipeline] Parsed data validation failed for {granule_id}: {data_errors}")
            await self._publish_dlq(granule_id, target_product, category, str(file_path), "DATA_VALIDATION_ERROR", data_errors)
            return {
                "status": "FAILED",
                "stage": "DATA_VALIDATION",
                "granule_id": granule_id,
                "product_id": target_product,
                "errors": data_errors,
            }

        summary = parse_result["summary"]
        df = parse_result["dataframe"]
        csv_path = Path(summary["csv_path"]) if summary.get("csv_path") else None
        obs_time = datetime.fromisoformat(summary["observation_time_utc"])

        # 5. Database Persistence (PostgreSQL + PostGIS)
        db_result = {}
        if persist_db:
            try:
                db_result = await mosdac_loader.load_product_observations(
                    product_id=target_product,
                    category=category,
                    granule_id=granule_id,
                    observation_time=obs_time,
                    csv_path=csv_path,
                    df=df,
                    summary=summary,
                )
            except Exception as e:
                logger.error(f"[MOSDAC Pipeline] Database load failed for {granule_id}: {e}", exc_info=True)
                db_result = {"success": False, "error": str(e), "row_count": 0}

        total_latency = time.time() - pipeline_start
        summary["total_pipeline_latency_seconds"] = round(total_latency, 2)
        summary["db_persisted"] = db_result.get("success", False)
        summary["db_row_count"] = db_result.get("row_count", 0)

        # 6. Cache in memory for instant API and test map responses
        lats = parse_result["lats"]
        lons = parse_result["lons"]
        vals = parse_result["values"]

        # Downsample compact points for low-latency map payload if dense
        # For rainfall: only active rain > 0.0
        if target_product in ("3SIMG_L2B_HEM", "3SIMG_L2G_IMR"):
            active_mask = vals > 0.0
            sel_lats, sel_lons, sel_vals = lats[active_mask], lons[active_mask], vals[active_mask]
        else:
            sel_lats, sel_lons, sel_vals = lats, lons, vals

        # Pack into compact list [[lat, lon, val], ...]
        max_cached_pts = 60000
        step = max(1, len(sel_lats) // max_cached_pts) if len(sel_lats) > max_cached_pts else 1
        points_compact = [
            [round(float(lat), 3), round(float(lon), 3), round(float(v), 3)]
            for lat, lon, v in zip(sel_lats[::step], sel_lons[::step], sel_vals[::step])
        ]

        cached_entry = {
            "product_id": target_product,
            "category": category,
            "summary": summary,
            "points": points_compact,
            "total_grid_points": summary["total_points"],
            "unit": summary.get("unit", ""),
            "cached_at": datetime.now(timezone.utc).isoformat(),
        }
        self._latest_observations[target_product] = cached_entry

        # 7. Publish to Kafka Domain Topic (Max 5 Topics Architecture)
        domain_topic = self.get_kafka_topic_for_category(category)
        msg_key = MosdacKafkaEnvelope.create_message_key(target_product, obs_time.isoformat())
        envelope = MosdacKafkaEnvelope(
            source="MOSDAC",
            satellite="INSAT-3DS",
            product=target_product,
            category=category,
            event_type="OBSERVATION_INGESTED",
            observation_time=obs_time.isoformat(),
            granule_id=granule_id,
            point_count=summary["total_points"],
            unit=summary.get("unit", ""),
            summary=summary,
        )
        await kafka_bus.publish(domain_topic, key=msg_key, payload=envelope.model_dump())
        logger.info(f"[MOSDAC Pipeline] Published {target_product} to Kafka topic '{domain_topic}' with key '{msg_key}'.")

        # 8. WebSocket Live Broadcast (Strictly after database commit & Kafka publish)
        try:
            await self._broadcast_product_websocket(
                product_id=target_product,
                category=category,
                granule_id=granule_id,
                obs_time=obs_time,
                summary=summary,
                points_compact=points_compact,
                is_test_event=False,
            )
        except Exception as ws_err:
            logger.error(f"[MOSDAC Pipeline] WebSocket broadcast error: {ws_err}", exc_info=True)

        logger.info(
            f"[MOSDAC Pipeline] Completed ingestion for {target_product} ({granule_id}) in {total_latency:.2f}s: "
            f"{len(points_compact):,} cached points, DB rows: {summary['db_row_count']:,}"
        )

        return {
            "status": "SUCCESS",
            "granule_id": granule_id,
            "product_id": target_product,
            "category": category,
            "summary": summary,
            "db_result": db_result,
        }

    async def _publish_dlq(
        self,
        granule_id: str,
        product_id: str,
        category: str,
        file_path: Optional[str],
        error_stage: str,
        errors: List[str],
    ) -> None:
        """Publish failed ingestion event to mosdac.dlq."""
        try:
            key = f"DLQ:{product_id}:{granule_id}"
            payload = {
                "source": "MOSDAC",
                "product": product_id,
                "category": category,
                "granule_id": granule_id,
                "failed_file_path": file_path,
                "error_stage": error_stage,
                "errors": errors,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            await kafka_bus.publish(TOPIC_MOSDAC_DLQ, key=key, payload=payload)
            logger.warning(f"[MOSDAC Pipeline] Routed failed event {granule_id} to '{TOPIC_MOSDAC_DLQ}'.")
        except Exception as dlq_err:
            logger.error(f"[MOSDAC Pipeline] Failed to publish to DLQ: {dlq_err}")

    async def _broadcast_product_websocket(
        self,
        product_id: str,
        category: str,
        granule_id: str,
        obs_time: datetime,
        summary: Dict[str, Any],
        points_compact: List[List[float]],
        is_test_event: bool = False,
    ) -> None:
        """Broadcast live observation event to matching WebSocket subscribers."""
        from app.api.ws_manager import weather_ws_manager

        event_label = "[MOSDAC TEST EVENT]" if is_test_event else "[MOSDAC LIVE]"
        logger.info(f"{event_label} New {product_id} granule ingested: {granule_id}, Obs: {obs_time.isoformat()}")

        sample_pts = points_compact[:500] if len(points_compact) > 500 else points_compact
        updates = [
            {
                "id": f"{pt[0]:.2f}_{pt[1]:.2f}",
                "lat": pt[0],
                "lon": pt[1],
                "value": pt[2],
                "precipitation": pt[2] if product_id == "3SIMG_L2B_HEM" else None,
                "timestamp": obs_time.isoformat(),
            }
            for pt in sample_pts
        ]

        total_pts = int(summary.get("total_points", len(points_compact)))
        max_val = float(summary.get("max_value", summary.get("max_precipitation_mm_hr", 0.0)))
        mean_val = float(summary.get("mean_value", summary.get("mean_precipitation_mm_hr", 0.0)))

        ws_summary = {
            "product_id": product_id,
            "category": category,
            "granule_id": granule_id,
            "total_points": total_pts,
            "min_value": float(summary.get("min_value", 0.0)),
            "max_value": max_val,
            "mean_value": mean_val,
            "unit": summary.get("unit", ""),
        }

        await weather_ws_manager.broadcast_batch(
            updates=updates,
            removals=[],
            summary=ws_summary,
            timestamp=obs_time,
            granule_id=granule_id,
            source="MOSDAC",
            product=product_id,
            category=category,
            point_count=total_pts,
            active_rain_count=int(summary.get("active_rain_points", len(updates))),
            max_rainfall=max_val,
            unit=summary.get("unit", ""),
        )

    async def broadcast_real_observation(
        self,
        product_id: str = "3SIMG_L2B_HEM",
        granule_id: Optional[str] = None,
        is_test_event: bool = True,
    ) -> Dict[str, Any]:
        """Broadcast a real existing MOSDAC observation as a WebSocket event."""
        # 1. First check in-memory observation cache
        cached = self._latest_observations.get(product_id)
        if cached:
            summary = cached["summary"]
            points_compact = cached["points"]
            target_granule_id = summary.get("granule_id", granule_id or product_id)
            obs_time = datetime.fromisoformat(summary["observation_time_utc"])
            meta = get_product_definition(product_id) or {}
            category = str(meta.get("category", "weather"))

            await self._broadcast_product_websocket(
                product_id=product_id,
                category=category,
                granule_id=target_granule_id,
                obs_time=obs_time,
                summary=summary,
                points_compact=points_compact,
                is_test_event=is_test_event,
            )
            return {
                "status": "SUCCESS",
                "event_type": "TEST_EVENT" if is_test_event else "LIVE_SOURCE_EVENT",
                "product_id": product_id,
                "granule_id": target_granule_id,
                "observation_time": obs_time.isoformat(),
                "broadcast_points_count": len(points_compact),
            }

        # 2. Check local raw directory for matching granule and parse on the fly
        raw_dir = settings.DATA_MOSDAC_RAW_DIR
        matching_files = list(raw_dir.glob(f"*{product_id.split('_')[-1]}*.h5"))
        if matching_files:
            target_file = matching_files[0]
            result = await self.ingest_granule_file(
                file_path=target_file,
                product_id=product_id,
                persist_db=True,
            )
            return {
                "status": "SUCCESS",
                "event_type": "TEST_EVENT",
                "product_id": product_id,
                "granule_id": target_file.stem,
                "parsed_on_the_fly": True,
            }

        return {"status": "NO_DATA", "message": f"No observation data found for product {product_id}"}

    async def ingest_latest_for_product(
        self,
        product_id: str,
        persist_db: bool = True,
        clip_to_india: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Discover latest granule for product, download, and ingest."""
        if not self.is_product_enabled(product_id):
            return {"status": "DISABLED", "message": f"Product {product_id} is disabled by configuration"}

        logger.info(f"[MOSDAC Pipeline] Querying latest granule for {product_id}...")
        latest = await mosdac_client.get_latest_granule(dataset=product_id)
        if not latest:
            return {"status": "NO_DATA", "message": f"No granules discovered in MOSDAC catalog for {product_id}"}

        granule_id = latest["granule_id"]
        meta_id = latest.get("meta_id")
        h5_path = await mosdac_client.download_granule(granule_id, meta_id=meta_id)

        return await self.ingest_granule_file(
            file_path=h5_path,
            product_id=product_id,
            persist_db=persist_db,
            clip_to_india=clip_to_india,
        )

    async def ingest_latest(
        self,
        dataset: str = settings.MOSDAC_DEFAULT_DATASET,
        persist_db: bool = True,
        clip_to_india: bool = True,
    ) -> Dict[str, Any]:
        """Backward-compatible method for default HEM rainfall ingestion."""
        return await self.ingest_latest_for_product(
            product_id=dataset,
            persist_db=persist_db,
            clip_to_india=clip_to_india,
        )

    async def ingest_all_enabled(self, persist_db: bool = True) -> Dict[str, Any]:
        """Run ingestion sequence across all currently enabled MOSDAC products."""
        results = {}
        for p_id in MOSDAC_PRODUCTS:
            if self.is_product_enabled(p_id):
                try:
                    results[p_id] = await self.ingest_latest_for_product(p_id, persist_db=persist_db)
                except Exception as e:
                    logger.error(f"[MOSDAC Pipeline] Failed ingesting {p_id}: {e}")
                    results[p_id] = {"status": "ERROR", "error": str(e)}
        return results


mosdac_pipeline = MosdacPipeline()
