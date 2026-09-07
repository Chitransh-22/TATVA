import asyncio
import os
import hashlib
import logging
from pathlib import Path
from typing import Optional
import requests
from requests.auth import HTTPBasicAuth
from app.config import settings
from app.ingestion.topics import (
    TOPIC_GRANULES_RAW,
    GranuleDiscoveredMessage,
    GranuleRawMessage,
)
from app.ingestion.kafka_bus import kafka_bus
from app.ingestion.deduplication import dedup_ledger, compute_file_sha256

logger = logging.getLogger(__name__)


class GranuleDownloader:
    """Authenticated HTTP downloader for NASA PPS IMERG GIS granules."""

    def __init__(self):
        self.auth = HTTPBasicAuth(settings.NASA_USERNAME, settings.NASA_PASSWORD)
        self.raw_dir = settings.DATA_RAW_DIR
        self.raw_dir.mkdir(parents=True, exist_ok=True)

    def download_granule(
        self,
        source_url: str,
        file_name: str,
        expected_size: Optional[int] = None
    ) -> Optional[Path]:
        """Download granule from NASA PPS with streaming and checksumming."""
        target_path = self.raw_dir / file_name
        part_path = self.raw_dir / f"{file_name}.part"

        # If already exists and has valid non-zero size, return immediately
        if target_path.exists() and target_path.stat().st_size > 1000:
            if expected_size and target_path.stat().st_size == expected_size:
                logger.info(f"File {file_name} already exists with expected size.")
                return target_path
            elif not expected_size:
                logger.info(f"File {file_name} already downloaded on disk.")
                return target_path

        logger.info(f"Starting download from {source_url} to {target_path}...")
        try:
            with requests.get(
                source_url,
                auth=self.auth,
                stream=True,
                timeout=settings.DOWNLOAD_TIMEOUT_SECONDS
            ) as r:
                if r.status_code == 401:
                    logger.error("Authentication failed: Check NASA_USERNAME and NASA_PASSWORD.")
                    return None
                r.raise_for_status()

                with open(part_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=128 * 1024):
                        if chunk:
                            f.write(chunk)

            # Atomic rename from .part to final
            if part_path.exists():
                if target_path.exists():
                    target_path.unlink()
                part_path.rename(target_path)

            logger.info(f"Successfully downloaded {file_name} ({target_path.stat().st_size:,} bytes)")
            return target_path

        except Exception as e:
            logger.error(f"Download error for {source_url}: {e}")
            if part_path.exists():
                part_path.unlink(missing_ok=True)
            return None

    async def handle_discovered_granule(self, msg: GranuleDiscoveredMessage) -> Optional[Path]:
        """Orchestrate downloading a discovered granule, hashing it, and publishing to raw topic."""
        # Update ledger status to DOWNLOADING
        await dedup_ledger.update_status(msg.granule_id, status="DOWNLOADING")

        # Perform download off the event loop
        local_path = await asyncio.to_thread(
            self.download_granule,
            source_url=msg.source_url,
            file_name=msg.file_name,
            expected_size=msg.file_size_bytes,
        )

        if not local_path or not local_path.exists():
            await dedup_ledger.update_status(
                msg.granule_id,
                status="FAILED",
                error_message="Download failed or returned empty file"
            )
            return None

        # Compute SHA-256 off the event loop
        checksum = await asyncio.to_thread(compute_file_sha256, str(local_path))
        file_size = local_path.stat().st_size

        # Publish to ritu.granules.raw
        raw_event = GranuleRawMessage(
            granule_id=msg.granule_id,
            file_name=msg.file_name,
            raw_file_path=str(local_path.resolve()),
            observation_time=msg.observation_time,
            file_size_bytes=file_size,
            checksum_sha256=checksum,
            source_url=msg.source_url,
        )
        await kafka_bus.publish(
            topic=TOPIC_GRANULES_RAW,
            key=msg.granule_id,
            payload=raw_event.model_dump(),
        )

        return local_path


granule_downloader = GranuleDownloader()
