"""PostgreSQL / PostGIS Bulk Loader for ISRO MOSDAC Observations."""

import asyncio
import io
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import asyncpg
import pandas as pd

from app.config import settings
from app.database.connection import is_database_reachable, connect_asyncpg_with_retry
from app.database.migrations import ensure_monthly_partition

logger = logging.getLogger(__name__)


class MosdacLoader:
    """Loads transformed MOSDAC observation records into PostgreSQL partitioned tables and updates the Ingestion Ledger."""

    async def record_ledger_status(
        self,
        granule_id: str,
        status: str,
        observation_time: datetime,
        file_name: Optional[str] = None,
        source_url: Optional[str] = None,
        file_size_bytes: Optional[int] = None,
        raw_file_path: Optional[str] = None,
        transformed_file_path: Optional[str] = None,
        row_count: int = 0,
        error_message: Optional[str] = None,
    ) -> None:
        """Upsert ledger status record for tracking granule lifecycle and guaranteeing idempotency."""
        if not is_database_reachable():
            logger.warning(f"[MOSDAC Ledger] Database unreachable; skipping ledger record for {granule_id}")
            return

        conn = None
        try:
            conn = await connect_asyncpg_with_retry(max_retries=2, timeout=10.0)
            now_utc = datetime.now(timezone.utc)
            query = """
            INSERT INTO ingestion_ledger (
                granule_id, file_name, source_url, observation_time,
                file_size_bytes, raw_file_path, transformed_file_path,
                status, row_count, error_message, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (granule_id) DO UPDATE
            SET status = EXCLUDED.status,
                row_count = CASE WHEN EXCLUDED.row_count > 0 THEN EXCLUDED.row_count ELSE ingestion_ledger.row_count END,
                error_message = EXCLUDED.error_message,
                updated_at = EXCLUDED.updated_at;
            """
            await conn.execute(
                query,
                granule_id,
                file_name or f"{granule_id}.h5",
                source_url or f"{settings.MOSDAC_DOWNLOAD_URL}?id={granule_id}",
                observation_time,
                file_size_bytes,
                raw_file_path,
                transformed_file_path,
                status,
                row_count,
                error_message,
                now_utc,
            )
        except Exception as e:
            logger.error(f"[MOSDAC Ledger] Failed to update ledger for {granule_id}: {e}")
        finally:
            if conn:
                try:
                    await conn.close()
                except Exception:
                    pass

    async def load_granule_observations(
        self,
        granule_id: str,
        observation_time: datetime,
        csv_path: Optional[Path] = None,
        df: Optional[pd.DataFrame] = None,
    ) -> Dict[str, Any]:
        """Bulk load observations into PostgreSQL partitioned table via COPY and PostGIS geometry creation."""
        start_time = time.time()
        logger.info(f"[MOSDAC Loader] Starting database ingestion for {granule_id}...")

        await self.record_ledger_status(
            granule_id=granule_id,
            status="LOADING",
            observation_time=observation_time,
            transformed_file_path=str(csv_path) if csv_path else None,
        )

        if not is_database_reachable():
            err_msg = "Database host is unreachable; skipping persistence"
            logger.warning(f"[MOSDAC Loader] {err_msg}")
            await self.record_ledger_status(
                granule_id=granule_id,
                status="FAILED",
                observation_time=observation_time,
                error_message=err_msg,
            )
            return {"success": False, "error": err_msg, "row_count": 0}

        conn = None
        try:
            conn = await connect_asyncpg_with_retry(max_retries=3, timeout=30.0)

            # 1. Clean previous staging rows for this granule
            await conn.execute(
                "DELETE FROM precipitation_observations_staging WHERE granule_id = $1;",
                granule_id,
            )

            # 2. Ensure dynamic monthly partition exists (e.g. precipitation_observations_2026_09)
            await ensure_monthly_partition(conn, observation_time)

            # 3. Stream records via asyncpg copy_to_table
            logger.info(f"[MOSDAC Loader] Executing asyncpg COPY to staging table for {granule_id}...")

            staging_columns = [
                "granule_id",
                "observation_time",
                "latitude",
                "longitude",
                "precipitation",
                "ice",
                "liquid",
                "liquid_percent",
                "num_precip_half_hour",
                "num_valid_half_hour",
                "source",
                "product",
            ]

            if csv_path and csv_path.exists():
                with open(csv_path, "rb") as f:
                    await conn.copy_to_table(
                        "precipitation_observations_staging",
                        source=f,
                        format="csv",
                        header=True,
                        columns=staging_columns,
                    )
            elif df is not None and len(df) > 0:
                # Use in-memory buffer
                csv_buffer = io.BytesIO()
                df.to_csv(csv_buffer, index=False)
                csv_buffer.seek(0)
                await conn.copy_to_table(
                    "precipitation_observations_staging",
                    source=csv_buffer,
                    format="csv",
                    header=True,
                    columns=staging_columns,
                )
            else:
                raise ValueError("Neither valid csv_path nor non-empty df provided for loading")

            # 4. Idempotent Upsert from staging into partitioned observations table with PostGIS geometry
            logger.info(f"[MOSDAC Loader] Upserting staging records into precipitation_observations...")
            upsert_query = """
            INSERT INTO precipitation_observations (
                granule_id, observation_time, latitude, longitude, geom,
                precipitation, ice, liquid, liquid_percent,
                num_precip_half_hour, num_valid_half_hour,
                source, product
            )
            SELECT
                granule_id,
                observation_time,
                latitude,
                longitude,
                ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
                precipitation,
                ice,
                liquid,
                liquid_percent,
                num_precip_half_hour,
                num_valid_half_hour,
                'MOSDAC',
                'INSAT-3DS_HEM'
            FROM precipitation_observations_staging
            WHERE granule_id = $1
            ON CONFLICT (observation_time, granule_id, latitude, longitude) DO UPDATE
            SET precipitation = EXCLUDED.precipitation,
                source = EXCLUDED.source,
                product = EXCLUDED.product,
                geom = EXCLUDED.geom;
            """
            result_tag = await conn.execute(upsert_query, granule_id)

            # 5. Clean up staging rows
            await conn.execute(
                "DELETE FROM precipitation_observations_staging WHERE granule_id = $1;",
                granule_id,
            )

            # Count rows inserted
            inserted_count = len(df) if df is not None else 0
            if inserted_count == 0 and csv_path and csv_path.exists():
                inserted_count = sum(1 for _ in open(csv_path, "r")) - 1

            duration = time.time() - start_time
            logger.info(
                f"[MOSDAC Loader] Granule {granule_id} successfully persisted ({inserted_count:,} rows, "
                f"{duration:.2f}s, SQL result: {result_tag})"
            )

            # 6. Update ledger to COMPLETED
            await self.record_ledger_status(
                granule_id=granule_id,
                status="COMPLETED",
                observation_time=observation_time,
                row_count=inserted_count,
            )

            return {
                "success": True,
                "granule_id": granule_id,
                "row_count": inserted_count,
                "duration_seconds": round(duration, 2),
                "sql_result": result_tag,
            }

        except Exception as e:
            err_msg = f"Database ingestion failed for {granule_id}: {e}"
            logger.error(f"[MOSDAC Loader] {err_msg}", exc_info=True)
            await self.record_ledger_status(
                granule_id=granule_id,
                status="FAILED",
                observation_time=observation_time,
                error_message=err_msg,
            )
            return {"success": False, "error": str(e), "row_count": 0}
        finally:
            if conn:
                try:
                    await conn.close()
                except Exception:
                    pass


mosdac_loader = MosdacLoader()
