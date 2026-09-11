import pytest
from pathlib import Path
from unittest.mock import patch, AsyncMock
from app.ingestion.pipeline import pipeline_service
from app.ingestion.deduplication import dedup_ledger, compute_file_sha256
from app.config import settings
from app.database.connection import is_database_reachable


@pytest.mark.asyncio
async def test_end_to_end_pipeline_direct_and_dedup(synthetic_imerg_bundle, tmp_path):
    granule_id = synthetic_imerg_bundle["granule_id"]
    zip_path = synthetic_imerg_bundle["zip_path"]
    obs_time = synthetic_imerg_bundle["observation_time"]

    # 1. First Run: Process granule end-to-end
    success = await pipeline_service.process_granule_direct(
        granule_id=granule_id,
        zip_path=zip_path,
        observation_time=obs_time,
    )
    assert success is True

    # Verify transformed CSV exists
    transformed_file = settings.DATA_TRANSFORMED_DIR / f"{granule_id}.csv"
    assert transformed_file.exists()
    assert transformed_file.stat().st_size > 0

    # 2. Second Run: Verify Deduplication Ledger detects it as duplicate
    checksum = compute_file_sha256(str(zip_path))
    is_new, reason = await dedup_ledger.evaluate_and_route(
        granule_id=granule_id,
        file_name=zip_path.name,
        source_url=f"local://{zip_path.name}",
        observation_time=obs_time,
        raw_file_path=str(zip_path.resolve()),
        checksum=checksum,
    )

    assert is_new is False
    assert "completed" in reason.lower() or "duplicate" in reason.lower()
