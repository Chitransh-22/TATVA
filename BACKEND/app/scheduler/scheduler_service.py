import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from sqlalchemy import text
from app.config import settings
from app.database.connection import AsyncSessionLocal
from app.ingestion.discovery import discovery_service
from app.ingestion.deduplication import dedup_ledger
from app.ingestion.downloader import granule_downloader
from app.ingestion.pipeline import pipeline_service
from app.api.ws_manager import weather_ws_manager

logger = logging.getLogger(__name__)


class IngestionScheduler:
    """Asynchronous background scheduler for periodic NASA IMERG granule discovery
    and rolling 7-day weather observation database retention cleanup.
    """

    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()
        self.last_run_time: Optional[datetime] = None
        self.last_run_count: int = 0
        self.last_cleanup_time: Optional[datetime] = None
        self.last_cleanup_deleted_count: int = 0

    async def start(self) -> None:
        """Start the background periodic discovery and cleanup loop."""
        if self._running or not settings.SCHEDULER_ENABLED:
            return

        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info(f"Ingestion scheduler started (interval: {settings.SCHEDULER_INTERVAL_MINUTES} minutes, rolling 7-day retention active).")

    async def stop(self) -> None:
        """Gracefully stop the background scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Ingestion scheduler stopped.")

    async def run_now(self, limit: int = 50) -> int:
        """Trigger an immediate discovery cycle and auto-ingest latest 30min granules."""
        if self._lock.locked():
            logger.info("Discovery run already in progress. Skipping concurrent trigger.")
            return self.last_run_count

        async with self._lock:
            logger.info("Triggering on-demand discovery run...")
            self.last_run_time = datetime.now(timezone.utc)
            granules = await discovery_service.run_discovery(emit_to_kafka=True, limit=limit, product_suffix=".30min")
            self.last_run_count = len(granules)

            # Auto-ingest any recent un-ingested 30min precipitation rate granules
            rate_granules = [
                g for g in granules
                if "30min" in g.file_name or g.file_name.endswith(".30min.zip")
            ]
            if rate_granules:
                rate_granules.sort(key=lambda x: x.observation_time, reverse=True)
                missing_to_ingest = []
                for rg in rate_granules[:4]:
                    entry = await dedup_ledger.get_entry(rg.granule_id)
                    if not entry or entry.get("status") not in ("COMPLETED", "PERSISTED"):
                        missing_to_ingest.append(rg)

                for mg in reversed(missing_to_ingest):
                    logger.info(f"[Scheduler] Ingesting missing 30min granule {mg.granule_id} ({mg.observation_time})...")
                    try:
                        dl_path = await granule_downloader.download_granule_safe(
                            source_url=mg.source_url,
                            file_name=mg.file_name,
                            expected_size=mg.file_size_bytes,
                            granule_id=mg.granule_id,
                        )
                        if dl_path and dl_path.exists():
                            success = await pipeline_service.process_granule_direct(
                                granule_id=mg.granule_id,
                                zip_path=dl_path,
                                observation_time=mg.observation_time,
                            )
                            logger.info(f"[Scheduler] Ingestion of {mg.granule_id}: {'SUCCESS' if success else 'FAILED'}")
                    except Exception as ing_err:
                        logger.error(f"[Scheduler] Error ingesting {mg.granule_id}: {ing_err}")

            return self.last_run_count

    async def cleanup_expired_observations(self, days: int = 7) -> Dict[str, Any]:
        """Enforce rolling 7-day active window in PostgreSQL.

        Deletes observations older than cutoff (T - 7 days) and broadcasts
        removals to connected WebSocket clients.
        """
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=days)
        deleted_count = 0
        removed_ids = []

        try:
            async with AsyncSessionLocal() as session:
                # Determine anchor T for rolling 7-day retention
                latest_res = await session.execute(text(
                    "SELECT MAX(observation_time) FROM precipitation_observations WHERE latitude >= 6.0;"
                ))
                latest_obs = latest_res.scalar()
                ref_time = latest_obs if latest_obs else now
                cutoff = ref_time - timedelta(days=days)

                # Delete observations older than T - 7 days using the observation_time index
                # PostgreSQL RETURNING allows discovering exact point IDs removed
                delete_query = text("""
                    DELETE FROM precipitation_observations
                    WHERE observation_time < :cutoff
                    RETURNING latitude, longitude;
                """)
                res = await session.execute(delete_query, {"cutoff": cutoff})
                rows = res.fetchall()
                await session.commit()

                deleted_count = len(rows)
                self.last_cleanup_time = now
                self.last_cleanup_deleted_count = deleted_count

                if deleted_count > 0:
                    logger.info(f"[Retention] Deleted {deleted_count} expired observations older than {cutoff.isoformat()}.")
                    # Build list of unique point IDs to broadcast removals to frontend
                    removed_ids = list({f"{r.latitude:.2f}_{r.longitude:.2f}" for r in rows[:100]})
                    await weather_ws_manager.broadcast_removals(
                        ids=removed_ids,
                        timestamp=now,
                    )
                    # Clear query caches
                    try:
                        from app.api.weather import clear_weather_cache
                        clear_weather_cache()
                    except Exception:
                        pass
                else:
                    logger.debug(f"[Retention] 7-day database window check completed. 0 records older than {cutoff.isoformat()}.")

        except Exception as e:
            logger.error(f"[Retention] Error during 7-day rolling window cleanup: {e}")

        return {
            "status": "success",
            "cutoff": cutoff.isoformat(),
            "deleted_count": deleted_count,
            "broadcasted_removals_count": len(removed_ids),
        }

    async def _loop(self) -> None:
        """Periodic loop running discovery and rolling 7-day cleanup."""
        await asyncio.sleep(3)
        await self.cleanup_expired_observations(days=7)
        try:
            await self.run_now()
        except Exception as init_err:
            logger.error(f"Error in initial startup discovery/ingestion: {init_err}")

        last_discovery = asyncio.get_event_loop().time()
        last_cleanup = asyncio.get_event_loop().time()

        while self._running:
            try:
                now_ts = asyncio.get_event_loop().time()

                # 1. Lightweight rolling 7-day retention cleanup every 3 minutes
                if now_ts - last_cleanup >= 180.0:
                    try:
                        await self.cleanup_expired_observations(days=7)
                    except Exception as ce:
                        logger.error(f"Error in scheduled retention cleanup: {ce}")
                    last_cleanup = now_ts

                # 2. IMERG discovery cycle every SCHEDULER_INTERVAL_MINUTES
                disc_interval = max(60.0, float(settings.SCHEDULER_INTERVAL_MINUTES * 60))
                if now_ts - last_discovery >= disc_interval:
                    try:
                        await self.run_now()
                    except Exception as de:
                        logger.error(f"Error in scheduled discovery run: {de}")
                    last_discovery = now_ts

            except Exception as loop_err:
                logger.error(f"Unexpected error in scheduler loop: {loop_err}", exc_info=True)

            await asyncio.sleep(10)


ingestion_scheduler = IngestionScheduler()
