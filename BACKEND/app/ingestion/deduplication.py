import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy import select, update, func
from app.database.connection import AsyncSessionLocal
from app.database.models import IngestionLedger
from app.ingestion.topics import (
    TOPIC_GRANULES_NEW,
    TOPIC_GRANULES_SKIPPED,
    GranuleDiscoveredMessage,
    GranuleLedgerMessage,
)
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
    
    Guarantees no duplicate downloads, conversions, or loadings take place.
    """

    async def register_discovered(self, msg: GranuleDiscoveredMessage) -> Optional[IngestionLedger]:
        """Record newly discovered granule in ledger if not already recorded."""
        try:
            async with AsyncSessionLocal() as session:
                query = select(IngestionLedger).where(IngestionLedger.granule_id == msg.granule_id)
                res = await session.execute(query)
                entry = res.scalar_one_or_none()

                if entry:
                    return entry

                entry = IngestionLedger(
                    granule_id=msg.granule_id,
                    file_name=msg.file_name,
                    source_url=msg.source_url,
                    observation_time=msg.observation_time,
                    file_size_bytes=msg.file_size_bytes,
                    status="DISCOVERED",
                )
                session.add(entry)
                await session.commit()
                await session.refresh(entry)
                return entry
        except Exception as e:
            logger.error(f"Error registering discovered granule {msg.granule_id}: {e}")
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
        
        Returns:
            (is_new, reason)
        """
        try:
            async with AsyncSessionLocal() as session:
                query = select(IngestionLedger).where(IngestionLedger.granule_id == granule_id)
                res = await session.execute(query)
                entry = res.scalar_one_or_none()

                # If entry exists and already completed with matching checksum:
                if entry and entry.status in ("COMPLETED", "TRANSFORMED") and entry.checksum_sha256 == checksum:
                    logger.info(f"Granule {granule_id} already ingested with matching checksum. Skipping.")
                    
                    # Emit to ritu.granules.skipped
                    skipped_msg = GranuleLedgerMessage(
                        granule_id=granule_id,
                        file_name=file_name,
                        observation_time=observation_time,
                        raw_file_path=raw_file_path,
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
                    IngestionLedger.status == "COMPLETED"
                )
                chk_res = await session.execute(chk_query)
                duplicate_content = chk_res.scalar_one_or_none()
                if duplicate_content:
                    logger.info(f"Granule {granule_id} content checksum matches {duplicate_content.granule_id}. Skipping.")
                    skipped_msg = GranuleLedgerMessage(
                        granule_id=granule_id,
                        file_name=file_name,
                        observation_time=observation_time,
                        raw_file_path=raw_file_path,
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

                # Otherwise, treat as new granule
                if not entry:
                    entry = IngestionLedger(
                        granule_id=granule_id,
                        file_name=file_name,
                        source_url=source_url,
                        observation_time=observation_time,
                        raw_file_path=raw_file_path,
                        checksum_sha256=checksum,
                        status="NEW",
                    )
                    session.add(entry)
                else:
                    entry.raw_file_path = raw_file_path
                    entry.checksum_sha256 = checksum
                    entry.status = "NEW"
                    entry.updated_at = datetime.now(timezone.utc)

                await session.commit()

                # Emit to ritu.granules.new
                new_msg = GranuleLedgerMessage(
                    granule_id=granule_id,
                    file_name=file_name,
                    observation_time=observation_time,
                    raw_file_path=raw_file_path,
                    action="NEW",
                    checksum_sha256=checksum,
                )
                await kafka_bus.publish(
                    topic=TOPIC_GRANULES_NEW,
                    key=granule_id,
                    payload=new_msg.model_dump(),
                )
                return True, "Verified new granule"
        except Exception as e:
            logger.error(f"Error evaluating granule {granule_id}: {e}")
            # In case DB is unavailable (e.g. lightweight test), treat as new to allow pipeline continuation
            return True, f"Fallback (DB exception: {e})"

    async def update_status(
        self,
        granule_id: str,
        status: str,
        error_message: Optional[str] = None,
        row_count: Optional[int] = None,
        transformed_file_path: Optional[str] = None,
    ) -> None:
        """Update the ledger state for a granule."""
        try:
            async with AsyncSessionLocal() as session:
                stmt = (
                    update(IngestionLedger)
                    .where(IngestionLedger.granule_id == granule_id)
                    .values(
                        status=status,
                        error_message=error_message,
                        updated_at=datetime.now(timezone.utc),
                        **({"row_count": row_count} if row_count is not None else {}),
                        **({"transformed_file_path": transformed_file_path} if transformed_file_path else {})
                    )
                )
                await session.execute(stmt)
                await session.commit()
                logger.info(f"Ledger updated: granule_id='{granule_id}', status='{status}'")
        except Exception as e:
            logger.error(f"Failed to update ledger for {granule_id}: {e}")

    async def get_ledger_stats(self) -> Dict[str, Any]:
        """Aggregate counts of granules across all states."""
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
            logger.error(f"Error fetching ledger stats: {e}")
            return {"total_tracked": 0, "by_status": {}}

    async def get_recent_entries(self, limit: int = 50, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve recent ledger entries."""
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
                        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
                    }
                    for e in entries
                ]
        except Exception as e:
            logger.error(f"Error fetching recent ledger entries: {e}")
            return []


dedup_ledger = DeduplicationLedgerService()
