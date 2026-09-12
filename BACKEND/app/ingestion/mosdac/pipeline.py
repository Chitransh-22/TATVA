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

        # 6. WebSocket Live Broadcast (Strictly after database commit)
        if db_result.get("success", False):
            try:
                await self._broadcast_mosdac_websocket(
                    granule_id=granule_id,
                    obs_time=obs_time,
                    summary=summary,
                    points_compact=points_compact,
                    is_test_event=False,
                )
            except Exception as ws_err:
                logger.error(f"[MOSDAC Pipeline] WebSocket broadcast error: {ws_err}", exc_info=True)
        else:
            logger.warning(f"[MOSDAC Pipeline] Skipping WebSocket broadcast because database persistence was not successful: {db_result}")

        return {
            "status": "SUCCESS",
            "granule_id": granule_id,
            "summary": summary,
            "db_result": db_result,
        }

    async def _broadcast_mosdac_websocket(
        self,
        granule_id: str,
        obs_time: datetime,
        summary: Dict[str, Any],
        points_compact: List[List[float]],
        is_test_event: bool = False,
    ) -> None:
        """Broadcast live MOSDAC observation event to connected WebSocket clients."""
        from app.api.ws_manager import weather_ws_manager

        event_label = "[MOSDAC TEST EVENT]" if is_test_event else "[MOSDAC LIVE]"
        logger.info(f"{event_label}\nNew granule ingested:\n{granule_id}")
        logger.info(f"{event_label}\nObservation:\n{obs_time.isoformat()}")
        logger.info(f"{event_label}\nRows inserted:\n{summary.get('db_row_count', len(points_compact))}")
        logger.info(f"{event_label}\nAttempting WebSocket broadcast...")

        logger.info(f"[MOSDAC]\nNew source data:\n{obs_time.isoformat()}")
        logger.info(f"[MOSDAC]\nInserted:\n{summary.get('db_row_count', len(points_compact))}")

        # Downsample active rain points to up to 400 for low-latency WebSocket notification
        sample_pts = points_compact[:400] if len(points_compact) > 400 else points_compact
        updates = [
            {
                "id": f"{pt[0]:.2f}_{pt[1]:.2f}",
                "lat": pt[0],
                "lon": pt[1],
                "value": pt[2],
                "precipitation": pt[2],
                "liquid": pt[2],
                "ice": 0.0,
                "liquid_percent": 100.0,
                "timestamp": obs_time.isoformat(),
            }
            for pt in sample_pts
        ]

        max_rain = float(summary.get("max_precipitation_mm_hr", 0.0))
        mean_rain = float(summary.get("mean_precipitation_mm_hr", 0.0))
        total_pts = int(summary.get("total_points", len(points_compact)))
        active_pts_count = int(summary.get("active_rain_points", len(points_compact)))

        ws_summary = {
            "avg_precipitation": round(mean_rain, 2),
            "max_precipitation": round(max_rain, 2),
            "min_precipitation": float(summary.get("min_precipitation_mm_hr", 0.0)),
            "total_points": total_pts,
            "rain_category": summary.get("rain_category") or (
                "Very Heavy Torrential Downpour" if max_rain >= 100
                else "Heavy Rainfall" if max_rain >= 50
                else "Moderate Rain" if max_rain >= 15
                else "Light Rain" if max_rain >= 1
                else "Clear / Dry"
            ),
            "granule_id": granule_id,
        }

        await weather_ws_manager.broadcast_batch(
            updates=updates,
            removals=[],
            summary=ws_summary,
            timestamp=obs_time,
            granule_id=granule_id,
            source="MOSDAC",
            product="3SIMG_L2B_HEM",
            point_count=total_pts,
            active_rain_count=active_pts_count,
            max_rainfall=max_rain,
        )

        logger.info(f"[MOSDAC WS]\nBroadcast:\n{obs_time.isoformat()}")

    async def broadcast_real_observation(
        self,
        granule_id: Optional[str] = None,
        is_test_event: bool = True,
    ) -> Dict[str, Any]:
        """[Step 12 Test Mechanism] Broadcast a REAL existing MOSDAC observation as a WebSocket event."""
        from app.database.connection import is_database_reachable, connect_asyncpg_with_retry
        from app.api.weather import clear_weather_cache

        if not is_database_reachable():
            return {"status": "ERROR", "message": "Database not reachable"}

        conn = await connect_asyncpg_with_retry(max_retries=2, timeout=10.0)
        try:
            if granule_id:
                ledger_row = await conn.fetchrow(
                    """
                    SELECT granule_id, observation_time, row_count
                    FROM ingestion_ledger
                    WHERE granule_id = $1 AND status = 'COMPLETED';
                    """,
                    granule_id,
                )
            else:
                ledger_row = await conn.fetchrow(
                    """
                    SELECT granule_id, observation_time, row_count
                    FROM ingestion_ledger
                    WHERE status = 'COMPLETED' AND (file_name LIKE '%3SIMG%' OR granule_id LIKE '%3SIMG%')
                    ORDER BY observation_time DESC
                    LIMIT 1;
                    """
                )

            if not ledger_row:
                return {"status": "NO_DATA", "message": "No completed MOSDAC observation found in database"}

            target_granule_id = ledger_row["granule_id"]
            obs_time = ledger_row["observation_time"]
            total_rows = int(ledger_row["row_count"] or 0)

            # 1. Use in-memory observation cache if matching
            if self._latest_observation and self._latest_observation["summary"].get("granule_id") == target_granule_id:
                summary = self._latest_observation["summary"]
                points_compact = self._latest_observation["points"]
            else:
                # 2. Check transformed CSV for instant loading
                csv_path = settings.DATA_MOSDAC_TRANSFORMED_DIR / f"{target_granule_id}.csv"
                if csv_path.exists():
                    import pandas as pd
                    df = pd.read_csv(csv_path)
                    active_mask = df["precipitation"] > 0.0
                    active_df = df[active_mask]
                    max_rain = float(df["precipitation"].max()) if not df.empty else 0.0
                    mean_rain = float(df["precipitation"].mean()) if not df.empty else 0.0
                    
                    sample_df = active_df.iloc[:400]
                    points_compact = [
                        [round(float(r["latitude"]), 3), round(float(r["longitude"]), 3), round(float(r["precipitation"]), 2)]
                        for _, r in sample_df.iterrows()
                    ]
                    summary = {
                        "granule_id": target_granule_id,
                        "observation_time_utc": obs_time.isoformat(),
                        "total_points": len(df),
                        "db_row_count": total_rows or len(df),
                        "active_rain_points": len(active_df),
                        "max_precipitation_mm_hr": max_rain,
                        "mean_precipitation_mm_hr": mean_rain,
                        "min_precipitation_mm_hr": float(df["precipitation"].min()) if not df.empty else 0.0,
                    }
                else:
                    # 3. Fallback: query from DB
                    sample_rows = await conn.fetch(
                        """
                        SELECT latitude, longitude, precipitation
                        FROM precipitation_observations
                        WHERE observation_time = $1 AND source = 'MOSDAC' AND precipitation >= 0.1
                        LIMIT 400;
                        """,
                        obs_time,
                    )
                    points_compact = [
                        [round(float(r["latitude"]), 3), round(float(r["longitude"]), 3), round(float(r["precipitation"]), 2)]
                        for r in sample_rows
                    ]
                    summary = {
                        "granule_id": target_granule_id,
                        "observation_time_utc": obs_time.isoformat(),
                        "total_points": total_rows,
                        "db_row_count": total_rows,
                        "active_rain_points": len(points_compact),
                        "max_precipitation_mm_hr": max(r[2] for r in points_compact) if points_compact else 0.0,
                        "mean_precipitation_mm_hr": sum(r[2] for r in points_compact) / len(points_compact) if points_compact else 0.0,
                        "min_precipitation_mm_hr": 0.0,
                    }

                # Cache in pipeline
                self._latest_observation = {
                    "summary": summary,
                    "points": points_compact,
                    "rain_points_count": len(points_compact),
                    "total_grid_points": summary["total_points"],
                    "cached_at": datetime.now(timezone.utc).isoformat(),
                }

            # Clear cache so any REST follow-ups see fresh state
            clear_weather_cache()

            # Execute broadcast
            await self._broadcast_mosdac_websocket(
                granule_id=target_granule_id,
                obs_time=obs_time,
                summary=summary,
                points_compact=points_compact,
                is_test_event=is_test_event,
            )

            return {
                "status": "SUCCESS",
                "event_type": "TEST_EVENT" if is_test_event else "LIVE_SOURCE_EVENT",
                "granule_id": target_granule_id,
                "observation_time": obs_time.isoformat(),
                "rows_in_db": total_rows,
                "broadcast_points_count": len(points_compact),
            }
        finally:
            await conn.close()

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
