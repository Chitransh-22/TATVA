"""End-to-end Ingestion Pipeline for ISRO MOSDAC INSAT-3DS Weather Data."""

import asyncio
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import settings
from app.ingestion.mosdac.client import mosdac_client
from app.ingestion.mosdac.parser import mosdac_parser
from app.ingestion.mosdac.validator import mosdac_validator
from app.ingestion.mosdac.loader import mosdac_loader

logger = logging.getLogger(__name__)


class MosdacPipeline:
    """Orchestrates independent discovery, download, parsing, validation, and persistence for MOSDAC data."""

    def __init__(self):
        self._latest_observation: Optional[Dict[str, Any]] = None
        self._is_running: bool = False

    @property
    def latest_observation(self) -> Optional[Dict[str, Any]]:
        return self._latest_observation

    async def ingest_granule_file(
        self,
        file_path: Path,
        persist_db: bool = True,
        clip_to_india: bool = True,
    ) -> Dict[str, Any]:
        """Ingest a specific local MOSDAC HDF5 file through validation, parsing, and database persistence."""
        pipeline_start = time.time()
        granule_id = file_path.stem
        logger.info(f"[MOSDAC Pipeline] Starting ingestion for file: {file_path.name}")

        # 1. Validate raw HDF5 file
        is_file_valid, file_errors = mosdac_validator.validate_raw_file(file_path)
        if not is_file_valid:
            logger.error(f"[MOSDAC Pipeline] Raw file validation failed for {granule_id}: {file_errors}")
            return {
                "status": "FAILED",
                "stage": "FILE_VALIDATION",
                "granule_id": granule_id,
                "errors": file_errors,
            }

        # 2. Parse HDF5, scale coordinates, and clip to Survey of India boundary
        try:
            parse_result = mosdac_parser.parse_granule_h5(
                h5_path=file_path,
                clip_to_india=clip_to_india,
                save_csv=True,
            )
        except Exception as e:
            logger.error(f"[MOSDAC Pipeline] Parsing failed for {granule_id}: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "stage": "PARSING",
                "granule_id": granule_id,
                "errors": [str(e)],
            }

        # 3. Validate parsed meteorological data
        is_data_valid, data_errors = mosdac_validator.validate_parsed_data(parse_result)
        if not is_data_valid:
            logger.error(f"[MOSDAC Pipeline] Parsed data validation failed for {granule_id}: {data_errors}")
            return {
                "status": "FAILED",
                "stage": "DATA_VALIDATION",
                "granule_id": granule_id,
                "errors": data_errors,
            }

        summary = parse_result["summary"]
        df = parse_result["dataframe"]
        csv_path = Path(summary["csv_path"]) if summary.get("csv_path") else None
        obs_time = datetime.fromisoformat(summary["observation_time_utc"])

        # 4. Database Persistence (PostgreSQL + PostGIS)
        db_result = {}
        if persist_db:
            try:
                db_result = await mosdac_loader.load_granule_observations(
                    granule_id=granule_id,
                    observation_time=obs_time,
                    csv_path=csv_path,
                    df=df,
                )
            except Exception as e:
                logger.error(f"[MOSDAC Pipeline] Database load failed for {granule_id}: {e}", exc_info=True)
                db_result = {"success": False, "error": str(e), "row_count": 0}

        total_latency = time.time() - pipeline_start
        summary["total_pipeline_latency_seconds"] = round(total_latency, 2)
        summary["db_persisted"] = db_result.get("success", False)
        summary["db_row_count"] = db_result.get("row_count", 0)

        # 5. Cache in memory for lightning-fast API responses
        # Prepare points array [lat, lon, precip] for map rendering
        # Filter to active rain (precipitation > 0.0) to keep payload lightweight
        active_mask = parse_result["precip"] > 0.0
        rain_lats = parse_result["lats"][active_mask]
        rain_lons = parse_result["lons"][active_mask]
        rain_precip = parse_result["precip"][active_mask]

        # Pack into compact list [[lat, lon, precip], ...]
        points_compact = [
            [round(float(lat), 3), round(float(lon), 3), round(float(p), 2)]
            for lat, lon, p in zip(rain_lats, rain_lons, rain_precip)
        ]

        self._latest_observation = {
            "summary": summary,
            "points": points_compact,
            "rain_points_count": len(points_compact),
            "total_grid_points": summary["total_points"],
            "cached_at": datetime.now(timezone.utc).isoformat(),
        }

        logger.info(
            f"[MOSDAC Pipeline] Completed ingestion for {granule_id} in {total_latency:.2f}s: "
            f"{len(points_compact):,} active rain points, DB rows: {summary['db_row_count']:,}"
        )

        return {
            "status": "SUCCESS",
            "granule_id": granule_id,
            "summary": summary,
            "db_result": db_result,
        }

    async def ingest_latest(
        self,
        dataset: str = settings.MOSDAC_DEFAULT_DATASET,
        persist_db: bool = True,
        clip_to_india: bool = True,
    ) -> Dict[str, Any]:
        """Discover the latest available granule from MOSDAC OpenSearch, download, and ingest."""
        if self._is_running:
            return {"status": "IN_PROGRESS", "message": "Another MOSDAC ingestion job is currently running"}

        self._is_running = True
        try:
            logger.info(f"[MOSDAC Pipeline] Querying latest granule for {dataset}...")
            latest = await mosdac_client.get_latest_granule(dataset=dataset)
            if not latest:
                return {"status": "NO_DATA", "message": f"No granules discovered for {dataset}"}

            granule_id = latest["granule_id"]
            logger.info(f"[MOSDAC Pipeline] Latest discovered granule: {granule_id}")

            # Download
            h5_path = await mosdac_client.download_granule(granule_id)

            # Ingest
            result = await self.ingest_granule_file(
                file_path=h5_path,
                persist_db=persist_db,
                clip_to_india=clip_to_india,
            )
            return result
        finally:
            self._is_running = False


mosdac_pipeline = MosdacPipeline()
