import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Query, BackgroundTasks, HTTPException, Body
from pydantic import BaseModel, Field

from app.config import settings
from app.ingestion.deduplication import dedup_ledger, compute_file_sha256
from app.ingestion.kafka_bus import kafka_bus
from app.ingestion.discovery import discovery_service, parse_imerg_filename
from app.ingestion.downloader import granule_downloader
from app.ingestion.extractor import granule_extractor
from app.ingestion.converter import convert_imerg_to_standard_csv
from app.ingestion.validator import granule_validator
from app.ingestion.loader import bulk_loader
from app.ingestion.topics import (
    TOPIC_GRANULES_DISCOVERED,
    TOPIC_GRANULES_RAW,
    GranuleDiscoveredMessage,
    GranuleRawMessage,
)
from app.analytics.aggregator import analytics_aggregator
from app.scheduler.scheduler_service import ingestion_scheduler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingestion", tags=["Ingestion Pipeline Management"])


# =============================================================================
# In-Memory Run State Registry for NASA IMERG Pipeline Runs
# =============================================================================

_runs_registry: Dict[str, "NasaImergStatusResponse"] = {}


# =============================================================================
# Pydantic Schemas for Swagger / OpenAPI Documentation
# =============================================================================

class NasaImergTriggerRequest(BaseModel):
    limit: Optional[int] = Field(
        default=10,
        ge=1,
        le=100,
        description="Maximum number of granules to discover and process in this run",
    )
    query: Optional[str] = Field(
        default="precip_7d",
        description="Search query parameter for NASA OpenSearch API",
    )
    local_test_zip: Optional[str] = Field(
        default=None,
        description="Optional path to a local IMERG ZIP archive for isolated or offline test execution",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "limit": 5,
                "query": "precip_7d",
                "local_test_zip": None,
            }
        }
    }


class NasaImergTriggerResponse(BaseModel):
    status: str = Field(
        ...,
        description="Current state of the triggered pipeline job",
        examples=["started"],
    )
    pipeline: str = Field(
        ...,
        description="Name of the weather data ingestion pipeline",
        examples=["NASA IMERG"],
    )
    run_id: str = Field(
        ...,
        description="Unique execution identifier for status polling",
        examples=["imerg-run-20260906153000-a1b2c3"],
    )
    message: str = Field(
        ...,
        description="Human-readable description of the operation result",
        examples=["NASA IMERG ingestion started"],
    )


class NasaImergStatusResponse(BaseModel):
    run_id: str = Field(
        ...,
        description="Unique identifier of the ingestion run",
        examples=["imerg-run-20260906153000-a1b2c3"],
    )
    status: str = Field(
        ...,
        description="Current run execution status: 'started', 'running', 'completed', or 'failed'",
        examples=["completed"],
    )
    discovered_count: int = Field(
        default=0,
        description="Number of IMERG granules discovered from NASA OpenSearch / PPS",
    )
    downloaded_count: int = Field(
        default=0,
        description="Number of granules successfully downloaded (or loaded locally)",
    )
    skipped_count: int = Field(
        default=0,
        description="Number of duplicate granules skipped via SHA-256 deduplication ledger",
    )
    transformed_count: int = Field(
        default=0,
        description="Number of granules successfully extracted and converted via Affine Transform",
    )
    validated_count: int = Field(
        default=0,
        description="Number of transformed CSVs that passed strict schema and bounds validation",
    )
    loaded_count: int = Field(
        default=0,
        description="Number of granules loaded into PostgreSQL / PostGIS observation tables",
    )
    failed_count: int = Field(
        default=0,
        description="Number of granules that encountered errors or were routed to DLQ",
    )
    started_at: datetime = Field(
        ...,
        description="UTC timestamp when the ingestion job was started",
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        description="UTC timestamp when the ingestion job completed or terminated",
    )
    errors: List[str] = Field(
        default_factory=list,
        description="List of error messages and diagnostic details recorded during the run",
    )


# =============================================================================
# Background Execution Engine for NASA IMERG Pipeline
# =============================================================================

async def _execute_nasa_imerg_pipeline_run(
    run_id: str,
    limit: int = 10,
    query: str = "precip_7d",
    local_test_zip: Optional[str] = None,
) -> None:
    """Execute end-to-end NASA IMERG ingestion across existing pipeline components."""
    run = _runs_registry.get(run_id)
    if not run:
        return

    run.status = "running"
    logger.info(f"[NASA IMERG Run {run_id}] Execution started.")

    try:
        discovered_granules: List[GranuleDiscoveredMessage] = []

        if local_test_zip:
            # 1 & 2. Isolated test execution using local ZIP file
            zip_path = Path(local_test_zip)
            if not zip_path.exists():
                err = f"Specified local_test_zip does not exist: {local_test_zip}"
                logger.error(f"[NASA IMERG Run {run_id}] {err}")
                run.errors.append(err)
                run.status = "failed"
                run.completed_at = datetime.now(timezone.utc)
                return

            parsed = parse_imerg_filename(zip_path.name)
            granule_id = parsed["granule_id"] if parsed else zip_path.stem
            obs_time = parsed["observation_time"] if parsed else datetime.now(timezone.utc)
            discovered_granules.append(
                GranuleDiscoveredMessage(
                    granule_id=granule_id,
                    file_name=zip_path.name,
                    source_url=f"file://{zip_path.resolve()}",
                    observation_time=obs_time,
                    file_size_bytes=zip_path.stat().st_size,
                    product_type="IMERG",
                )
            )
        else:
            # 1 & 2. Trigger NASA IMERG discovery via OpenSearch (with PPS directory fallback)
            try:
                discovered_granules = await asyncio.to_thread(discovery_service.discover_from_opensearch, query=query, limit=limit)
                if not discovered_granules:
                    logger.info(
                        f"[NASA IMERG Run {run_id}] OpenSearch returned 0 granules. "
                        "Falling back to NASA PPS text directory..."
                    )
                    discovered_granules = await asyncio.to_thread(discovery_service.discover_from_pps_directory)
                    if limit and len(discovered_granules) > limit:
                        discovered_granules = discovered_granules[:limit]
            except Exception as e:
                err = f"NASA discovery exception: {str(e)}"
                logger.error(f"[NASA IMERG Run {run_id}] {err}")
                run.errors.append(err)

        run.discovered_count = len(discovered_granules)
        logger.info(f"[NASA IMERG Run {run_id}] Discovered {run.discovered_count} granules.")

        if not discovered_granules:
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            return

        # Process each discovered granule through the complete pipeline
        for granule in discovered_granules:
            granule_id = granule.granule_id

            try:
                # 3. Send discovered metadata through existing Kafka pipeline & ledger
                await kafka_bus.publish(
                    topic=TOPIC_GRANULES_DISCOVERED,
                    key=granule_id,
                    payload=granule.model_dump(),
                )
                await dedup_ledger.register_discovered(granule)

                # 4. Download granule using existing downloader and auth
                if local_test_zip or granule.source_url.startswith("file://"):
                    local_path = Path(granule.source_url.replace("file://", ""))
                    run.downloaded_count += 1
                else:
                    await dedup_ledger.update_status(granule_id, status="DOWNLOADING")
                    local_path = await asyncio.to_thread(
                        granule_downloader.download_granule,
                        source_url=granule.source_url,
                        file_name=granule.file_name,
                        expected_size=granule.file_size_bytes,
                    )
                    if not local_path or not local_path.exists():
                        err = f"Download failed for granule {granule_id} from {granule.source_url}"
                        logger.error(f"[NASA IMERG Run {run_id}] {err}")
                        run.failed_count += 1
                        run.errors.append(err)
                        await dedup_ledger.update_status(granule_id, status="FAILED", error_message=err)
                        continue
                    run.downloaded_count += 1

                # SHA-256 hash & publish to raw topic
                checksum = await asyncio.to_thread(compute_file_sha256, str(local_path))
                raw_event = GranuleRawMessage(
                    granule_id=granule_id,
                    file_name=granule.file_name,
                    raw_file_path=str(local_path.resolve()),
                    observation_time=granule.observation_time,
                    file_size_bytes=local_path.stat().st_size,
                    checksum_sha256=checksum,
                    source_url=granule.source_url,
                )
                await kafka_bus.publish(
                    topic=TOPIC_GRANULES_RAW,
                    key=granule_id,
                    payload=raw_event.model_dump(),
                )

                # Deduplication check & idempotent routing
                is_new, reason = await dedup_ledger.evaluate_and_route(
                    granule_id=granule_id,
                    file_name=granule.file_name,
                    source_url=granule.source_url,
                    observation_time=granule.observation_time,
                    raw_file_path=str(local_path.resolve()),
                    checksum=checksum,
                )
                if not is_new:
                    run.skipped_count += 1
                    logger.info(f"[NASA IMERG Run {run_id}] Granule {granule_id} skipped: {reason}")
                    continue

                # 5. Extract NASA IMERG ZIP layers
                await dedup_ledger.update_status(granule_id, status="EXTRACTING")
                layers = await asyncio.to_thread(granule_extractor.extract_zip, str(local_path), granule_id)
                if not layers:
                    err = f"Failed to extract GeoTIFF layers from ZIP for {granule_id}"
                    logger.error(f"[NASA IMERG Run {run_id}] {err}")
                    run.failed_count += 1
                    run.errors.append(err)
                    await dedup_ledger.update_status(granule_id, status="FAILED", error_message=err)
                    continue
                await dedup_ledger.update_status(granule_id, status="EXTRACTED")

                # 6 & 7. Affine Transform Converter -> Standardized/Clipped CSV
                await dedup_ledger.update_status(granule_id, status="TRANSFORMING")
                try:
                    summary = await asyncio.to_thread(
                        convert_imerg_to_standard_csv,
                        files=layers,
                        granule_id=granule_id,
                        observation_time=granule.observation_time,
                        clip_to_india=settings.CLIP_TO_INDIA,
                    )
                    transformed_csv = Path(summary["output_file"])
                    row_count = summary["row_count"]
                    run.transformed_count += 1
                except Exception as e:
                    err = f"Transformation error for granule {granule_id}: {str(e)}"
                    logger.error(f"[NASA IMERG Run {run_id}] {err}")
                    run.failed_count += 1
                    run.errors.append(err)
                    await dedup_ledger.update_status(granule_id, status="FAILED", error_message=err)
                    continue

                # 8 & 11. Validate CSV and send failures to DLQ
                is_valid = await granule_validator.handle_transformed_file(
                    csv_path=transformed_csv,
                    granule_id=granule_id,
                    observation_time=granule.observation_time,
                    row_count=row_count,
                )
                if not is_valid:
                    err = f"Validation failed for granule {granule_id} (routed to DLQ)"
                    logger.warning(f"[NASA IMERG Run {run_id}] {err}")
                    run.failed_count += 1
                    run.errors.append(err)
                    continue
                run.validated_count += 1

                # 9 & 10. Bulk COPY load into PostgreSQL/PostGIS & ledger update
                loaded = await bulk_loader.load_csv(
                    csv_path=transformed_csv,
                    granule_id=granule_id,
                    observation_time=granule.observation_time,
                )
                if loaded:
                    run.loaded_count += 1
                    try:
                        await analytics_aggregator.compute_rollups_for_observation(granule.observation_time)
                        await analytics_aggregator.detect_anomalies_for_granule(granule_id, granule.observation_time)
                    except Exception as ex:
                        logger.warning(f"[NASA IMERG Run {run_id}] Analytics aggregation notice for {granule_id}: {ex}")
                else:
                    err = f"Bulk loading failed for granule {granule_id}"
                    logger.error(f"[NASA IMERG Run {run_id}] {err}")
                    run.failed_count += 1
                    run.errors.append(err)

            except Exception as item_ex:
                err = f"Error processing granule {granule_id}: {str(item_ex)}"
                logger.error(f"[NASA IMERG Run {run_id}] {err}", exc_info=True)
                run.failed_count += 1
                run.errors.append(err)

    except Exception as run_ex:
        err = f"Critical run error: {str(run_ex)}"
        logger.error(f"[NASA IMERG Run {run_id}] {err}", exc_info=True)
        run.errors.append(err)
    finally:
        if run.failed_count > 0 and run.loaded_count == 0 and run.skipped_count == 0:
            run.status = "failed"
        else:
            run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
        logger.info(
            f"[NASA IMERG Run {run_id}] Finished with status '{run.status}'. "
            f"Discovered: {run.discovered_count}, Loaded: {run.loaded_count}, "
            f"Skipped: {run.skipped_count}, Failed: {run.failed_count}"
        )


# =============================================================================
# NASA IMERG Specific Ingestion Endpoints
# =============================================================================

@router.post(
    "/nasa/imerg",
    response_model=NasaImergTriggerResponse,
    summary="Trigger NASA IMERG Ingestion Pipeline",
    description=(
        "Trigger the end-to-end NASA IMERG weather data ingestion pipeline in the background. "
        "Discovers granules via NASA OpenSearch (with PPS directory fallback), downloads using "
        "HTTP Basic Auth, checks deduplication in PostgreSQL ledger, extracts GeoTIFF layers, "
        "runs the Affine Transform Converter (with India bounding box clipping), strictly validates "
        "the CSV, loads into PostGIS via staging COPY, and routes any failures to the DLQ."
    ),
    status_code=200,
)
async def trigger_nasa_imerg_ingestion(
    background_tasks: BackgroundTasks,
    request: Optional[NasaImergTriggerRequest] = Body(default=None),
) -> NasaImergTriggerResponse:
    """Trigger the end-to-end NASA IMERG data ingestion pipeline in the background."""
    req = request or NasaImergTriggerRequest()
    run_id = f"imerg-run-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"

    # Initialize tracking entry
    run_entry = NasaImergStatusResponse(
        run_id=run_id,
        status="started",
        started_at=datetime.now(timezone.utc),
    )
    _runs_registry[run_id] = run_entry

    # Keep active runs registry capped at 100 entries to prevent memory leak
    if len(_runs_registry) > 100:
        oldest_key = next(iter(_runs_registry))
        _runs_registry.pop(oldest_key, None)

    # Launch background processing
    background_tasks.add_task(
        _execute_nasa_imerg_pipeline_run,
        run_id=run_id,
        limit=req.limit or 10,
        query=req.query or "precip_7d",
        local_test_zip=req.local_test_zip,
    )

    return NasaImergTriggerResponse(
        status="started",
        pipeline="NASA IMERG",
        run_id=run_id,
        message="NASA IMERG ingestion started",
    )


@router.get(
    "/nasa/imerg/status/{run_id}",
    response_model=NasaImergStatusResponse,
    summary="Get NASA IMERG Ingestion Run Status",
    description=(
        "Retrieve execution progress, counts across all pipeline stages (discovered, downloaded, "
        "skipped, transformed, validated, loaded, failed), timestamps, and error diagnostics for a specific run ID."
    ),
)
async def get_nasa_imerg_run_status(run_id: str) -> NasaImergStatusResponse:
    """Retrieve detailed stage-by-stage status and metrics for a NASA IMERG ingestion run."""
    run = _runs_registry.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"NASA IMERG run '{run_id}' not found.")
    return run


# =============================================================================
# Existing General Ingestion Endpoints (Maintained for Backward Compatibility)
# =============================================================================

@router.get(
    "/status",
    summary="Get General Ingestion Pipeline Status",
    description="Retrieve end-to-end ingestion pipeline health, Kafka mode, ledger metrics, and scheduler state.",
)
async def get_ingestion_status() -> Dict[str, Any]:
    """Retrieve end-to-end ingestion pipeline health, ledger metrics, and scheduler state."""
    stats = await dedup_ledger.get_ledger_stats()
    return {
        "pipeline_health": "ONLINE",
        "kafka_connected": kafka_bus.is_connected,
        "kafka_mode": "Cluster" if kafka_bus.is_connected else "Asynchronous InMemory Fallback",
        "scheduler_running": ingestion_scheduler._running,
        "scheduler_interval_minutes": settings.SCHEDULER_INTERVAL_MINUTES,
        "last_discovery_run": (
            ingestion_scheduler.last_run_time.isoformat()
            if ingestion_scheduler.last_run_time
            else None
        ),
        "last_discovered_count": ingestion_scheduler.last_run_count,
        "ledger_metrics": stats,
    }


@router.post(
    "/trigger",
    summary="Trigger General Ingestion Cycle",
    description="Trigger an immediate general NASA discovery and ingestion cycle in the background.",
)
async def trigger_ingestion(background_tasks: BackgroundTasks) -> Dict[str, Any]:
    """Trigger an immediate NASA discovery and ingestion cycle."""
    background_tasks.add_task(ingestion_scheduler.run_now)
    return {
        "status": "triggered",
        "message": "Discovery and ingestion triggered in background task.",
    }


@router.get(
    "/ledger",
    summary="List Ingestion Ledger Entries",
    description="List recent granule entries from the ingestion ledger with optional status filtering.",
)
async def list_ledger_entries(
    status: Optional[str] = Query(None, description="Filter by status (e.g. COMPLETED, DLQ, NEW, DISCOVERED)"),
    limit: int = Query(50, le=200),
) -> Dict[str, Any]:
    """List recent granule entries from the ingestion ledger."""
    entries = await dedup_ledger.get_recent_entries(limit=limit, status=status)
    return {
        "count": len(entries),
        "filter_status": status,
        "entries": entries,
    }


@router.get(
    "/dlq",
    summary="List Dead Letter Queue Records",
    description="Inspect rejected granules and validation error reports in the Dead Letter Queue.",
)
async def list_dlq_records() -> Dict[str, Any]:
    """Inspect rejected granules and errors in the Dead Letter Queue."""
    dlq_dir = settings.DATA_DLQ_DIR
    records: List[Dict[str, Any]] = []

    if dlq_dir.exists():
        for file in dlq_dir.glob("*_dlq_error.json"):
            try:
                with open(file, "r") as f:
                    records.append(json.load(f))
            except Exception as e:
                logger.warning(f"Error reading DLQ file {file}: {e}")

    return {
        "dlq_count": len(records),
        "dlq_records": records,
    }
