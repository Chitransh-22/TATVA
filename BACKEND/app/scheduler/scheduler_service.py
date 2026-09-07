import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from app.config import settings
from app.ingestion.discovery import discovery_service

logger = logging.getLogger(__name__)


class IngestionScheduler:
    """Asynchronous background scheduler for periodic NASA IMERG granule discovery."""

    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()
        self.last_run_time: Optional[datetime] = None
        self.last_run_count: int = 0

    async def start(self) -> None:
        """Start the background periodic discovery loop."""
        if self._running or not settings.SCHEDULER_ENABLED:
            return

        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info(f"Ingestion scheduler started (interval: {settings.SCHEDULER_INTERVAL_MINUTES} minutes).")

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

    async def run_now(self) -> int:
        """Trigger an immediate discovery cycle without blocking the event loop."""
        if self._lock.locked():
            logger.info("Discovery run already in progress. Skipping concurrent trigger.")
            return self.last_run_count

        async with self._lock:
            logger.info("Triggering on-demand discovery run...")
            self.last_run_time = datetime.now(timezone.utc)
            granules = await discovery_service.run_discovery(emit_to_kafka=True)
            self.last_run_count = len(granules)
            return self.last_run_count

    async def _loop(self) -> None:
        """Periodic loop."""
        # Initial run on startup after a small delay
        await asyncio.sleep(5)
        while self._running:
            try:
                await self.run_now()
            except Exception as e:
                logger.error(f"Error in scheduler execution loop: {e}", exc_info=True)

            # Sleep for interval
            interval_secs = max(60, settings.SCHEDULER_INTERVAL_MINUTES * 60)
            await asyncio.sleep(interval_secs)


ingestion_scheduler = IngestionScheduler()
