import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional
import asyncpg
import pandas as pd
from app.config import settings
from app.database.migrations import ensure_monthly_partition
from app.ingestion.deduplication import dedup_ledger

logger = logging.getLogger(__name__)


class BulkObservationLoader:
    """Loads transformed observation CSVs directly into PostgreSQL using COPY commands.
    
    1. Fast raw COPY into unindexed staging table.
    2. Dynamic monthly partition creation.
    3. Spatial point geometry generation via PostGIS ST_SetSRID(ST_MakePoint()).
    4. Idempotent merge into partitioned observations table.
    5. Clean up of staging rows.
    """

    async def load_csv(
        self,
        csv_path: Path,
        granule_id: str,
        observation_time: datetime,
        source: str = "NASA",
        product: str = "IMERG",
    ) -> bool:
        """Execute high-speed staging COPY and partitioned table upsert."""
        await dedup_ledger.update_status(granule_id, status="LOADING")
        logger.info(f"Initiating bulk COPY for granule {granule_id} from {csv_path}...")

        conn = None
        try:
            conn = await asyncpg.connect(
                host=settings.POSTGRES_HOST,
                port=settings.POSTGRES_PORT,
                user=settings.POSTGRES_USER,
                password=settings.POSTGRES_PASSWORD,
                database=settings.POSTGRES_DB,
                timeout=5.0,
            )
        except Exception as e:
            err_msg = f"PostgreSQL connection failed during bulk COPY: {e}"
            logger.error(err_msg)
            await dedup_ledger.update_status(
                granule_id=granule_id,
                status="FAILED",
                error_message=err_msg
            )
            return False

        try:
            # 1. Clean any previous partial staging rows for this granule
            await conn.execute(
                "DELETE FROM precipitation_observations_staging WHERE granule_id = $1;",
                granule_id
            )

            # 2. Ensure partition exists for this observation month
            await ensure_monthly_partition(conn, observation_time)

            # 3. Stream CSV records to staging table using COPY
            logger.info("Executing asyncpg copy_to_table from CSV...")
            with open(csv_path, "rb") as f:
                # asyncpg copy_to_table accepts a binary stream or file-like object
                await conn.copy_to_table(
                    "precipitation_observations_staging",
                    source=f,
                    format="csv",
                    header=True,
                    columns=[
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
                    ]
                )

            # 4. Upsert from staging into partitioned table with PostGIS geometry
            logger.info("Migrating staging rows into partitioned precipitation_observations...")
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
                COALESCE(source, $2),
                COALESCE(product, $3)
            FROM precipitation_observations_staging
            WHERE granule_id = $1
            ON CONFLICT (observation_time, granule_id, latitude, longitude) DO UPDATE
            SET precipitation = EXCLUDED.precipitation,
                ice = EXCLUDED.ice,
                liquid = EXCLUDED.liquid,
                liquid_percent = EXCLUDED.liquid_percent,
                num_precip_half_hour = EXCLUDED.num_precip_half_hour,
                num_valid_half_hour = EXCLUDED.num_valid_half_hour,
                source = EXCLUDED.source,
                product = EXCLUDED.product;
            """
            result = await conn.execute(upsert_query, granule_id, source, product)

            # 5. Clean up staging table
            await conn.execute(
                "DELETE FROM precipitation_observations_staging WHERE granule_id = $1;",
                granule_id
            )

            # 6. Update ledger to COMPLETED
            await dedup_ledger.update_status(
                granule_id=granule_id,
                status="COMPLETED",
            )
            logger.info(f"Successfully bulk loaded and merged granule {granule_id} ({result})")
            return True

        except Exception as e:
            logger.error(f"Bulk loading error for granule {granule_id}: {e}", exc_info=True)
            await dedup_ledger.update_status(
                granule_id=granule_id,
                status="FAILED",
                error_message=f"Bulk COPY error: {str(e)}"
            )
            return False
        finally:
            if conn:
                await conn.close()


bulk_loader = BulkObservationLoader()
