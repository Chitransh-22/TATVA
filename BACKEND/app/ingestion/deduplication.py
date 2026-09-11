import hashlib
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy import select, update, func
from app.database.connection import AsyncSessionLocal, is_database_reachable
from app.database.models import IngestionLedger
from app.ingestion.topics import (
    TOPIC_GRANULES_STATUS,
    TOPIC_GRANULES_NEW,
    TOPIC_GRANULES_SKIPPED,
    GranuleDiscoveredMessage,
    GranuleLedgerMessage,
)
from app.config import settings
from app.ingestion.kafka_bus import kafka_bus

logger = logging.getLogger(__name__)


def compute_file_sha256(file_path: str, chunk_size: int = 65536) -> str:
    """Compute SHA-256 hash of a file on disk."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(chunk_size):
            hasher.update(chunk)
    return hasher.hexdigest()


class DeduplicationLedgerService:
    """Manages idempotent granule tracking in PostgreSQL ingestion_ledger.
    
    Guarantees strict lifecycle progression and no duplicate downloads, conversions, or loadings.
    Includes seamless in-memory fallback when database is unreachable (e.g. offline/firewalled).
    """

    def __init__(self):
        self._memory_ledger: Dict[str, Dict[str, Any]] = {}

    async def get_entry(self, granule_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve full details of a granule ledger entry."""
        if not is_database_reachable():
            return self._memory_ledger.get(granule_id)
        try:
            async with AsyncSessionLocal() as session:
                query = select(IngestionLedger).where(IngestionLedger.granule_id == granule_id)
                res = await session.execute(query)
                entry = res.scalar_one_or_none()
                if not entry:
                    return None
                return {
                    "id": entry.id,
                    "granule_id": entry.granule_id,
                    "file_name": entry.file_name,
                    "source_url": entry.source_url,
                    "observation_time": entry.observation_time,
                    "file_size_bytes": entry.file_size_bytes,
                    "checksum_sha256": entry.checksum_sha256,
                    "raw_file_path": entry.raw_file_path,
                    "transformed_file_path": entry.transformed_file_path,
                    "status": entry.status,
                    "row_count": entry.row_count,
                    "error_message": entry.error_message,
                    "retry_count": entry.retry_count or 0,
                    "created_at": entry.created_at,
                    "updated_at": entry.updated_at,
                }
        except Exception as e:
            logger.error(f"[DedupLedger] Error fetching entry for {granule_id}: {e}")
            return self._memory_ledger.get(granule_id)

    async def register_discovered(self, msg: GranuleDiscoveredMessage) -> Optional[Any]:
        """Record newly discovered granule in ledger if not already recorded."""
        if not is_database_reachable():
            entry = self._memory_ledger.get(msg.granule_id)
            if entry:
                if not entry.get("source_url") and msg.source_url:
                    entry["source_url"] = msg.source_url
                return entry
            entry = {
                "id": len(self._memory_ledger) + 1,
                "granule_id": msg.granule_id,
                "file_name": msg.file_name,
                "source_url": msg.source_url,
                "observation_time": msg.observation_time,
                "file_size_bytes": msg.file_size_bytes,
                "status": "DISCOVERED",
                "retry_count": 0,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
            self._memory_ledger[msg.granule_id] = entry
            logger.info(f"[DedupLedger] Registered discovered granule {msg.granule_id} (status: DISCOVERED) [in-memory]")
            return entry
        try:
            async with AsyncSessionLocal() as session:
                query = select(IngestionLedger).where(IngestionLedger.granule_id == msg.granule_id)
                res = await session.execute(query)
                entry = res.scalar_one_or_none()

                if entry:
                    # If source_url was previously missing or empty, update it
                    if not entry.source_url and msg.source_url:
                        entry.source_url = msg.source_url
                        await session.commit()
                    return entry

                entry = IngestionLedger(
                    granule_id=msg.granule_id,
                    file_name=msg.file_name,
                    source_url=msg.source_url,
                    observation_time=msg.observation_time,
                    file_size_bytes=msg.file_size_bytes,
                    status="DISCOVERED",
                    retry_count=0,
                )
                session.add(entry)
                await session.commit()
                await session.refresh(entry)
                logger.info(f"[DedupLedger] Registered discovered granule {msg.granule_id} (status: DISCOVERED)")
                return entry
        except Exception as e:
            logger.error(f"[DedupLedger] Error registering discovered granule {msg.granule_id}: {e}")
            return None

    async def evaluate_and_route(
        self,
        granule_id: str,
        file_name: str,
        source_url: str,
        observation_time: datetime,
        raw_file_path: str,
        checksum: str,
    ) -> Tuple[bool, str]:
        """Evaluate whether a downloaded raw file is new or duplicate.
        
        CRITICAL ARCHITECTURAL RULE:
        Does NOT publish 'NEW' to ritu.granules.status until the local ZIP file
        is verified to exist on disk and is non-empty.
        
        Returns:
            (is_new, reason)
        """
        try:
            resolved_raw_path = settings.resolve_raw_path(raw_file_path, file_name=file_name)

            # 1. Verify local file actually exists on disk before publishing NEW status
            if not resolved_raw_path.exists() or resolved_raw_path.stat().st_size < 1000:
                err_reason = f"Raw ZIP file not found or empty at {resolved_raw_path}"
                logger.warning(f"[DedupLedger] Cannot route granule {granule_id} to NEW: {err_reason}")
                await self.update_status(
                    granule_id=granule_id,
                    status="DOWNLOAD_PENDING",
                    error_message=err_reason,
                )
                return False, err_reason

            if not is_database_reachable():
                mem_entry = self._memory_ledger.get(granule_id)
                if mem_entry and mem_entry.get("status") in ("COMPLETED", "PERSISTED", "TRANSFORMED"):
                    if not mem_entry.get("checksum_sha256") or mem_entry.get("checksum_sha256") == checksum:
                        logger.info(f"[DedupLedger] Granule {granule_id} already completed in memory fallback. Skipping.")
                        skipped_msg = GranuleLedgerMessage(
                            granule_id=granule_id,
                            file_name=file_name,
                            observation_time=observation_time,
                            raw_file_path=str(resolved_raw_path),
                            action="SKIPPED",
                            reason="Already completed with identical checksum",
                            checksum_sha256=checksum,
                        )
                        await kafka_bus.publish(
                            topic=TOPIC_GRANULES_SKIPPED,
                            key=granule_id,
                            payload=skipped_msg.model_dump(),
                        )
                        return False, "Already completed"

                for gid, e in self._memory_ledger.items():
                    if gid != granule_id and e.get("checksum_sha256") == checksum and e.get("status") in ("COMPLETED", "PERSISTED"):
                        logger.info(f"[DedupLedger] Granule {granule_id} content matches {gid} in memory fallback. Skipping.")
                        skipped_msg = GranuleLedgerMessage(
                            granule_id=granule_id,
                            file_name=file_name,
                            observation_time=observation_time,
                            raw_file_path=str(resolved_raw_path),
                            action="SKIPPED",
                            reason=f"Identical checksum matches {gid}",
                            checksum_sha256=checksum,
                        )
                        await kafka_bus.publish(
                            topic=TOPIC_GRANULES_SKIPPED,
                            key=granule_id,
                            payload=skipped_msg.model_dump(),
                        )
                        return False, "Duplicate content hash"

                if not mem_entry:
                    mem_entry = {
                        "id": len(self._memory_ledger) + 1,
                        "granule_id": granule_id,
                        "file_name": file_name,
                        "source_url": source_url,
                        "observation_time": observation_time,
                        "raw_file_path": str(resolved_raw_path),
                        "checksum_sha256": checksum,
                        "status": "NEW",
                        "updated_at": datetime.now(timezone.utc),
                    }
                    self._memory_ledger[granule_id] = mem_entry
                else:
                    mem_entry["raw_file_path"] = str(resolved_raw_path)
                    mem_entry["checksum_sha256"] = checksum
                    if source_url and not mem_entry.get("source_url"):
                        mem_entry["source_url"] = source_url
                    mem_entry["status"] = "NEW"
                    mem_entry["updated_at"] = datetime.now(timezone.utc)

                new_msg = GranuleLedgerMessage(
                    granule_id=granule_id,
                    file_name=file_name,
                    observation_time=observation_time,
                    raw_file_path=str(resolved_raw_path),
                    action="NEW",
                    checksum_sha256=checksum,
                )
                await kafka_bus.publish(
                    topic=TOPIC_GRANULES_NEW,
                    key=granule_id,
                    payload=new_msg.model_dump(),
                )
                logger.info(f"[DedupLedger] Granule {granule_id} verified on disk (in-memory). Published status 'NEW'.")
                return True, "Verified new granule"

            async with AsyncSessionLocal() as session:
                query = select(IngestionLedger).where(IngestionLedger.granule_id == granule_id)
                res = await session.execute(query)
                entry = res.scalar_one_or_none()

                # If entry exists and already completed or persisted:
                if entry and entry.status in ("COMPLETED", "PERSISTED", "TRANSFORMED") and (not entry.checksum_sha256 or entry.checksum_sha256 == checksum):
                    logger.info(f"[DedupLedger] Granule {granule_id} already completed with matching checksum. Skipping.")
                    
                    skipped_msg = GranuleLedgerMessage(
                        granule_id=granule_id,
                        file_name=file_name,
                        observation_time=observation_time,
                        raw_file_path=str(resolved_raw_path),
                        action="SKIPPED",
                        reason="Already completed with identical checksum",
                        checksum_sha256=checksum,
                    )
                    await kafka_bus.publish(
                        topic=TOPIC_GRANULES_SKIPPED,
                        key=granule_id,
                        payload=skipped_msg.model_dump(),
                    )
                    return False, "Already completed"

                # Check if checksum matches any other completed granule
                chk_query = select(IngestionLedger).where(
                    IngestionLedger.checksum_sha256 == checksum,
                    IngestionLedger.status.in_(["COMPLETED", "PERSISTED"])
                )
                chk_res = await session.execute(chk_query)
                duplicate_content = chk_res.scalar_one_or_none()
                if duplicate_content:
                    logger.info(f"[DedupLedger] Granule {granule_id} content checksum matches {duplicate_content.granule_id}. Skipping.")
                    skipped_msg = GranuleLedgerMessage(
                        granule_id=granule_id,
                        file_name=file_name,
                        observation_time=observation_time,
                        raw_file_path=str(resolved_raw_path),
                        action="SKIPPED",
                        reason=f"Identical checksum matches {duplicate_content.granule_id}",
                        checksum_sha256=checksum,
                    )
                    await kafka_bus.publish(
                        topic=TOPIC_GRANULES_SKIPPED,
                        key=granule_id,
                        payload=skipped_msg.model_dump(),
                    )
                    return False, "Duplicate content hash"

                # Otherwise, file is verified on disk and is a genuine new granule
                if not entry:
                    entry = IngestionLedger(
                        granule_id=granule_id,
                        file_name=file_name,
                        source_url=source_url,
                        observation_time=observation_time,
                        raw_file_path=str(resolved_raw_path),
                        checksum_sha256=checksum,
                        status="NEW",
                    )
                    session.add(entry)
                else:
                    entry.raw_file_path = str(resolved_raw_path)
                    entry.checksum_sha256 = checksum
                    if source_url and not entry.source_url:
                        entry.source_url = source_url
                    entry.status = "NEW"
                    entry.updated_at = datetime.now(timezone.utc)

                await session.commit()

                # ONLY emit to ritu.granules.status with action NEW now that file is on disk
                new_msg = GranuleLedgerMessage(
                    granule_id=granule_id,
                    file_name=file_name,
                    observation_time=observation_time,
                    raw_file_path=str(resolved_raw_path),
                    action="NEW",
                    checksum_sha256=checksum,
                )
                await kafka_bus.publish(
                    topic=TOPIC_GRANULES_NEW,
                    key=granule_id,
                    payload=new_msg.model_dump(),
                )
                logger.info(f"[DedupLedger] Granule {granule_id} verified on disk. Published status 'NEW' to Kafka.")
                return True, "Verified new granule"
        except Exception as e:
            logger.error(f"[DedupLedger] Error evaluating granule {granule_id}: {e}")
            return True, f"Fallback (DB exception: {e})"

    async def update_status(
        self,
        granule_id: str,
        status: str,
        error_message: Optional[str] = None,
        row_count: Optional[int] = None,
        transformed_file_path: Optional[str] = None,
        retry_count: Optional[int] = None,
        retry_increment: bool = False,
        source_url: Optional[str] = None,
        raw_file_path: Optional[str] = None,
    ) -> None:
        """Update the ledger state and diagnostics for a granule."""
        mem_entry = self._memory_ledger.setdefault(granule_id, {
            "id": len(self._memory_ledger) + 1,
            "granule_id": granule_id,
            "status": status,
        })
        mem_entry["status"] = status
        mem_entry["updated_at"] = datetime.now(timezone.utc)
        if error_message is not None:
            mem_entry["error_message"] = error_message
        if row_count is not None:
            mem_entry["row_count"] = row_count
        if transformed_file_path:
            mem_entry["transformed_file_path"] = transformed_file_path
        if source_url:
            mem_entry["source_url"] = source_url
        if raw_file_path:
            mem_entry["raw_file_path"] = raw_file_path
        if retry_increment:
            mem_entry["retry_count"] = mem_entry.get("retry_count", 0) + 1
        elif retry_count is not None:
            mem_entry["retry_count"] = retry_count

        if not is_database_reachable():
            logger.info(f"[DedupLedger] Updated (in-memory): granule_id='{granule_id}', status='{status}'")
            return

        try:
            async with AsyncSessionLocal() as session:
                update_values: Dict[str, Any] = {
                    "status": status,
                    "updated_at": datetime.now(timezone.utc),
                }
                if error_message is not None:
                    update_values["error_message"] = error_message
                if row_count is not None:
                    update_values["row_count"] = row_count
                if transformed_file_path:
                    update_values["transformed_file_path"] = transformed_file_path
                if source_url:
                    update_values["source_url"] = source_url
                if raw_file_path:
                    update_values["raw_file_path"] = raw_file_path

                if retry_increment:
                    stmt = (
                        update(IngestionLedger)
                        .where(IngestionLedger.granule_id == granule_id)
                        .values(
                            retry_count=func.coalesce(IngestionLedger.retry_count, 0) + 1,
                            **update_values
                        )
                    )
                elif retry_count is not None:
                    update_values["retry_count"] = retry_count
                    stmt = (
                        update(IngestionLedger)
                        .where(IngestionLedger.granule_id == granule_id)
                        .values(**update_values)
                    )
                else:
                    stmt = (
                        update(IngestionLedger)
                        .where(IngestionLedger.granule_id == granule_id)
                        .values(**update_values)
                    )

                await session.execute(stmt)
                await session.commit()
                logger.info(f"[DedupLedger] Updated: granule_id='{granule_id}', status='{status}'")
        except Exception as e:
            logger.error(f"[DedupLedger] Failed to update ledger for {granule_id}: {e}")

    async def get_ledger_stats(self) -> Dict[str, Any]:
        """Aggregate counts of granules across all states."""
        if not is_database_reachable():
            counts: Dict[str, int] = {}
            for e in self._memory_ledger.values():
                s = e.get("status", "UNKNOWN")
                counts[s] = counts.get(s, 0) + 1
            return {
                "total_tracked": len(self._memory_ledger),
                "by_status": counts,
            }

        try:
            async with AsyncSessionLocal() as session:
                query = select(IngestionLedger.status, func.count(IngestionLedger.id)).group_by(IngestionLedger.status)
                res = await session.execute(query)
                status_counts = dict(res.all())
                total = sum(status_counts.values())
                return {
                    "total_tracked": total,
                    "by_status": status_counts,
                }
        except Exception as e:
            logger.error(f"[DedupLedger] Error fetching ledger stats: {e}")
            return {"total_tracked": 0, "by_status": {}}

    async def get_recent_entries(self, limit: int = 50, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve recent ledger entries."""
        if not is_database_reachable():
            items = list(self._memory_ledger.values())
            if status:
                items = [e for e in items if e.get("status") == status]
            return [
                {
                    "granule_id": e.get("granule_id"),
                    "file_name": e.get("file_name"),
                    "observation_time": e["observation_time"].isoformat() if isinstance(e.get("observation_time"), datetime) else e.get("observation_time"),
                    "status": e.get("status"),
                    "row_count": e.get("row_count"),
                    "checksum_sha256": e.get("checksum_sha256"),
                    "error_message": e.get("error_message"),
                    "retry_count": e.get("retry_count", 0),
                    "updated_at": e["updated_at"].isoformat() if isinstance(e.get("updated_at"), datetime) else e.get("updated_at"),
                }
                for e in items[:limit]
            ]

        try:
            async with AsyncSessionLocal() as session:
                query = select(IngestionLedger).order_by(IngestionLedger.updated_at.desc()).limit(limit)
                if status:
                    query = query.where(IngestionLedger.status == status)
                res = await session.execute(query)
                entries = res.scalars().all()
                return [
                    {
                        "granule_id": e.granule_id,
                        "file_name": e.file_name,
                        "observation_time": e.observation_time.isoformat() if e.observation_time else None,
                        "status": e.status,
                        "row_count": e.row_count,
                        "checksum_sha256": e.checksum_sha256,
                        "error_message": e.error_message,
                        "retry_count": e.retry_count or 0,
                        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
                    }
                    for e in entries
                ]
        except Exception as e:
            logger.error(f"[DedupLedger] Error fetching recent ledger entries: {e}")
            return []


dedup_ledger = DeduplicationLedgerService()
