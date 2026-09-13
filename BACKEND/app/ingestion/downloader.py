import asyncio
import os
import hashlib
import logging
import zipfile
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime, timezone
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


def is_valid_zip(file_path: Path) -> bool:
    """Verify that a path is an existing, non-empty, and valid uncorrupted ZIP archive."""
    if not file_path.is_file() or file_path.stat().st_size < 1000:
        return False
    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            # testzip() checks CRC32 for each file in archive; returns None if all files test OK
            return zf.testzip() is None
    except Exception:
        return False


class GranuleDownloader:
    """Authenticated HTTP downloader for NASA PPS IMERG GIS granules with verification and idempotency."""

    def __init__(self):
        self.auth = HTTPBasicAuth(settings.NASA_USERNAME, settings.NASA_PASSWORD)
        self.raw_dir = settings.DATA_RAW_DIR
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        # Concurrency control: map granule_id -> asyncio.Future to prevent duplicate concurrent downloads
        self._active_downloads: Dict[str, asyncio.Future] = {}
        self._lock = asyncio.Lock()

    def download_granule(
        self,
        source_url: str,
        file_name: str,
        expected_size: Optional[int] = None,
        granule_id: Optional[str] = None,
    ) -> Optional[Path]:
        """Download granule from NASA PPS with streaming, .part temp files, and ZIP verification."""
        gid = granule_id or file_name.replace(".zip", "")
        target_path = self.raw_dir / file_name
        part_path = self.raw_dir / f"{file_name}.part"

        # 1. Idempotency check: if valid archive already exists on disk, skip re-downloading
        if target_path.exists():
            if is_valid_zip(target_path):
                if expected_size and target_path.stat().st_size == expected_size:
                    logger.info(
                        f"[Downloader] granule_id='{gid}' status='DOWNLOADED' "
                        f"local_path='{target_path}' note='File exists with matching expected size and valid ZIP structure.'"
                    )
                    return target_path
                elif not expected_size:
                    logger.info(
                        f"[Downloader] granule_id='{gid}' status='DOWNLOADED' "
                        f"local_path='{target_path}' note='File already exists and is a valid ZIP archive.'"
                    )
                    return target_path
            else:
                logger.warning(
                    f"[Downloader] granule_id='{gid}' status='CORRUPT_LOCAL' "
                    f"local_path='{target_path}' note='Existing local file is corrupted or incomplete. Removing and re-downloading.'"
                )
                try:
                    target_path.unlink()
                except Exception as ue:
                    logger.warning(f"Could not remove corrupted file {target_path}: {ue}")

        # 2. Clean up any stale partial download
        if part_path.exists():
            part_path.unlink(missing_ok=True)

        verify_param = settings.get_nasa_ssl_verify()
        logger.info(
            f"[Downloader] granule_id='{gid}' status='DOWNLOADING' "
            f"download_url='{source_url}' local_path='{target_path}' temp_part='{part_path}' "
            f"ssl_verify='{verify_param}' timestamp='{datetime.now(timezone.utc).isoformat()}'"
        )

        try:
            if source_url.startswith("file://") or "://" not in source_url:
                import shutil
                if source_url.startswith("file://"):
                    raw_p = source_url[7:]
                    if raw_p.startswith("/") and len(raw_p) > 2 and raw_p[2] == ":":
                        raw_p = raw_p[1:]
                    local_src = Path(raw_p)
                else:
                    local_src = Path(source_url)

                if not local_src.exists():
                    logger.error(
                        f"[Downloader] granule_id='{gid}' status='FAILED' "
                        f"download_url='{source_url}' failure_reason='Local file not found: {local_src}'"
                    )
                    return None
                shutil.copy2(str(local_src), str(part_path))
            else:
                with requests.get(
                    source_url,
                    auth=self.auth,
                    stream=True,
                    timeout=settings.DOWNLOAD_TIMEOUT_SECONDS,
                    verify=verify_param,
                ) as r:
                    if r.status_code == 401:
                        logger.error(
                            f"[Downloader] granule_id='{gid}' status='FAILED' "
                            f"download_url='{source_url}' failure_reason='Authentication failed: Check NASA_USERNAME and NASA_PASSWORD.'"
                        )
                        return None
                    r.raise_for_status()

                    with open(part_path, "wb") as f:
                        for chunk in r.iter_content(chunk_size=128 * 1024):
                            if chunk:
                                f.write(chunk)

            # 3. Verify downloaded .part file before promoting to final target_path
            if not part_path.exists() or part_path.stat().st_size == 0:
                logger.error(
                    f"[Downloader] granule_id='{gid}' status='FAILED' "
                    f"download_url='{source_url}' failure_reason='Downloaded file is missing or 0 bytes.'"
                )
                if part_path.exists():
                    part_path.unlink(missing_ok=True)
                return None

            if not is_valid_zip(part_path):
                logger.error(
                    f"[Downloader] granule_id='{gid}' status='FAILED' "
                    f"download_url='{source_url}' failure_reason='Downloaded .part file failed ZIP integrity test (corrupt archive).'"
                )
                part_path.unlink(missing_ok=True)
                return None

            # 4. Atomic promote .part -> target_path
            if target_path.exists():
                target_path.unlink(missing_ok=True)
            part_path.replace(target_path)

            file_size = target_path.stat().st_size
            logger.info(
                f"[Downloader] granule_id='{gid}' status='DOWNLOADED' "
                f"local_path='{target_path}' file_size_bytes={file_size} "
                f"timestamp='{datetime.now(timezone.utc).isoformat()}'"
            )
            return target_path

        except requests.exceptions.SSLError as ssl_err:
            logger.error(
                f"[Downloader] granule_id='{gid}' status='FAILED' download_url='{source_url}' "
                f"failure_reason='SSL certificate error: {ssl_err}. Verify NASA_SSL_CA_BUNDLE.'"
            )
            if part_path.exists():
                part_path.unlink(missing_ok=True)
            return None
        except Exception as e:
            logger.error(
                f"[Downloader] granule_id='{gid}' status='FAILED' download_url='{source_url}' "
                f"failure_reason='{str(e)}'"
            )
            if part_path.exists():
                part_path.unlink(missing_ok=True)
            return None

    async def download_granule_safe(
        self,
        source_url: str,
        file_name: str,
        expected_size: Optional[int] = None,
        granule_id: Optional[str] = None,
    ) -> Optional[Path]:
        """Thread-safe and concurrency-controlled wrapper to download a granule once."""
        gid = granule_id or file_name.replace(".zip", "")

        async with self._lock:
            if gid in self._active_downloads:
                logger.info(f"[Downloader] granule_id='{gid}' note='Download already in progress. Awaiting existing task.'")
                fut = self._active_downloads[gid]
            else:
                loop = asyncio.get_running_loop()
                fut = loop.create_future()
                self._active_downloads[gid] = fut

                # Launch worker task
                async def _worker():
                    try:
                        res = await asyncio.to_thread(
                            self.download_granule,
                            source_url=source_url,
                            file_name=file_name,
                            expected_size=expected_size,
                            granule_id=gid,
                        )
                        if not fut.done():
                            fut.set_result(res)
                    except Exception as ex:
                        if not fut.done():
                            fut.set_exception(ex)
                    finally:
                        async with self._lock:
                            self._active_downloads.pop(gid, None)

                asyncio.create_task(_worker())

        try:
            return await fut
        except Exception as e:
            logger.error(f"[Downloader] Error in concurrent download task for {gid}: {e}")
            return None

    async def handle_discovered_granule(self, msg: GranuleDiscoveredMessage) -> Optional[Path]:
        """Orchestrate downloading a discovered granule, hashing it, and publishing to raw topic."""
        # 1. State transition: DOWNLOAD_PENDING -> DOWNLOADING
        await dedup_ledger.update_status(msg.granule_id, status="DOWNLOAD_PENDING")
        await dedup_ledger.update_status(msg.granule_id, status="DOWNLOADING")

        # 2. Perform download with concurrency protection
        local_path = await self.download_granule_safe(
            source_url=msg.source_url,
            file_name=msg.file_name,
            expected_size=msg.file_size_bytes,
            granule_id=msg.granule_id,
        )

        if not local_path or not local_path.exists():
            await dedup_ledger.update_status(
                msg.granule_id,
                status="FAILED",
                error_message="Download failed, returned empty file, or failed ZIP verification"
            )
            return None

        # 3. State transition: DOWNLOADED
        await dedup_ledger.update_status(msg.granule_id, status="DOWNLOADED")

        # 4. Compute SHA-256 off the event loop
        checksum = await asyncio.to_thread(compute_file_sha256, str(local_path))
        file_size = local_path.stat().st_size

        # 5. Publish verified download to ritu.granules.raw
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
