"""PostgreSQL / PostGIS Bulk Loader for ISRO MOSDAC Observations."""

import asyncio
import io
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import asyncpg
import pandas as pd

from app.config import settings
from app.database.connection import is_database_reachable, connect_asyncpg_with_retry
from app.database.migrations import ensure_monthly_partition, ensure_mosdac_monthly_partition

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

            # Prepare standardized DataFrame matching precipitation_observations_staging schema
            if df is not None and len(df) > 0:
                prep_df = df.copy()
            elif csv_path and csv_path.exists():
                prep_df = pd.read_csv(csv_path)
            else:
                raise ValueError("Neither valid csv_path nor non-empty df provided for loading")

            if "precipitation" not in prep_df.columns and "value" in prep_df.columns:
                prep_df["precipitation"] = prep_df["value"]
            if "granule_id" not in prep_df.columns:
                prep_df["granule_id"] = granule_id
            if "observation_time" not in prep_df.columns:
                prep_df["observation_time"] = observation_time
            if "ice" not in prep_df.columns:
                prep_df["ice"] = 0.0
            if "liquid" not in prep_df.columns:
                prep_df["liquid"] = 0.0
            if "liquid_percent" not in prep_df.columns:
                prep_df["liquid_percent"] = 0.0
            if "num_precip_half_hour" not in prep_df.columns:
                prep_df["num_precip_half_hour"] = 1
            if "num_valid_half_hour" not in prep_df.columns:
                prep_df["num_valid_half_hour"] = 1
            if "source" not in prep_df.columns:
                prep_df["source"] = "MOSDAC"
            if "product" not in prep_df.columns:
                prep_df["product"] = "INSAT-3DS_IMR" if "IMR" in granule_id else "INSAT-3DS_HEM"

            csv_buffer = io.BytesIO()
            prep_df[staging_columns].to_csv(csv_buffer, index=False)
            csv_buffer.seek(0)
            await conn.copy_to_table(
                "precipitation_observations_staging",
                source=csv_buffer,
                format="csv",
                header=True,
                columns=staging_columns,
            )

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
                source,
                product
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
            inserted_count = len(prep_df)

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

            # 7. Compute regional summaries and clear weather caches
            try:
                from app.analytics.aggregator import analytics_aggregator
                from app.database.connection import AsyncSessionLocal
                from app.api.weather import clear_weather_cache
                async with AsyncSessionLocal() as session:
                    await analytics_aggregator.compute_regional_summaries(session, observation_time, granule_id)
                    await session.commit()
                clear_weather_cache()
            except Exception as agg_err:
                logger.warning(f"[MOSDAC Loader] Regional summary computation note: {agg_err}")

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

    async def record_product_ledger_status(
        self,
        product_id: str,
        category: str,
        granule_id: str,
        status: str,
        observation_time: datetime,
        file_name: Optional[str] = None,
        source_url: Optional[str] = None,
        file_size_bytes: Optional[int] = None,
        raw_file_path: Optional[str] = None,
        transformed_file_path: Optional[str] = None,
        row_count: int = 0,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None,
        mean_value: Optional[float] = None,
        unit: Optional[str] = None,
        summary_dict: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Upsert product ledger record for tracking multi-product granule lifecycle and guaranteeing idempotency."""
        if not is_database_reachable():
            logger.warning(f"[MOSDAC Product Ledger] Database unreachable; skipping ledger record for {granule_id}")
            return

        conn = None
        try:
            conn = await connect_asyncpg_with_retry(max_retries=2, timeout=10.0)
            now_utc = datetime.now(timezone.utc)
            summary_json_str = json.dumps(summary_dict, default=str) if summary_dict else None

            query = """
            INSERT INTO mosdac_product_ledger (
                product_id, category, granule_id, file_name, source_url, observation_time,
                file_size_bytes, status, row_count, min_value, max_value, mean_value,
                unit, summary_json, raw_file_path, transformed_file_path, error_message, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            ON CONFLICT (granule_id) DO UPDATE
            SET status = EXCLUDED.status,
                row_count = CASE WHEN EXCLUDED.row_count > 0 THEN EXCLUDED.row_count ELSE mosdac_product_ledger.row_count END,
                min_value = EXCLUDED.min_value,
                max_value = EXCLUDED.max_value,
                mean_value = EXCLUDED.mean_value,
                unit = EXCLUDED.unit,
                summary_json = COALESCE(EXCLUDED.summary_json, mosdac_product_ledger.summary_json),
                error_message = EXCLUDED.error_message,
                updated_at = EXCLUDED.updated_at;
            """
            await conn.execute(
                query,
                product_id,
                category,
                granule_id,
                file_name or f"{granule_id}.h5",
                source_url or f"{settings.MOSDAC_DOWNLOAD_URL}?id={granule_id}",
                observation_time,
                file_size_bytes,
                status,
                row_count,
                min_value,
                max_value,
                mean_value,
                unit,
                summary_json_str,
                raw_file_path,
                transformed_file_path,
                error_message,
                now_utc,
            )
        except Exception as e:
            logger.error(f"[MOSDAC Product Ledger] Failed to update ledger for {granule_id}: {e}")
        finally:
            if conn:
                try:
                    await conn.close()
                except Exception:
                    pass

    async def load_product_observations(
        self,
        product_id: str,
        category: str,
        granule_id: str,
        observation_time: datetime,
        csv_path: Optional[Path] = None,
        df: Optional[pd.DataFrame] = None,
        summary: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Bulk load domain observations into PostgreSQL partitioned table (or precipitation_observations for HEM)."""
        # If rainfall HEM/IMR: preserve existing precipitation_observations table
        if product_id in ("3SIMG_L2B_HEM", "3SIMG_L2G_IMR"):
            res = await self.load_granule_observations(
                granule_id=granule_id,
                observation_time=observation_time,
                csv_path=csv_path,
                df=df,
            )
            # Also record in unified mosdac_product_ledger
            await self.record_product_ledger_status(
                product_id=product_id,
                category=category,
                granule_id=granule_id,
                status="COMPLETED" if res.get("success") else "FAILED",
                observation_time=observation_time,
                row_count=res.get("row_count", 0),
                min_value=summary.get("min_value", 0.0) if summary else 0.0,
                max_value=summary.get("max_value", 0.0) if summary else 0.0,
                mean_value=summary.get("mean_value", 0.0) if summary else 0.0,
                unit="mm/hr",
                summary_dict=summary,
            )
            return res

        # For all other products (CTP, UTH, OLR, SST, FOG, SNW, AOD): load into mosdac_observations
        start_time = time.time()
        logger.info(f"[MOSDAC Loader] Starting domain DB ingestion for {product_id} ({granule_id})...")

        await self.record_product_ledger_status(
            product_id=product_id,
            category=category,
            granule_id=granule_id,
            status="LOADING",
            observation_time=observation_time,
            transformed_file_path=str(csv_path) if csv_path else None,
            summary_dict=summary,
        )

        if not is_database_reachable():
            err_msg = "Database host unreachable; skipping persistence"
            logger.warning(f"[MOSDAC Loader] {err_msg}")
            await self.record_product_ledger_status(
                product_id=product_id,
                category=category,
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
                "DELETE FROM mosdac_observations_staging WHERE granule_id = $1 AND product_id = $2;",
                granule_id,
                product_id,
            )

            # 2. Ensure dynamic monthly partition exists
            await ensure_mosdac_monthly_partition(conn, observation_time)

            # 3. Stream records via asyncpg copy_to_table
            logger.info(f"[MOSDAC Loader] Executing asyncpg COPY to mosdac_observations_staging for {granule_id}...")

            staging_columns = [
                "granule_id",
                "product_id",
                "category",
                "observation_time",
                "latitude",
                "longitude",
                "value",
                "secondary_value",
                "unit",
                "state",
                "district",
            ]

            if csv_path and csv_path.exists():
                with open(csv_path, "rb") as f:
                    await conn.copy_to_table(
                        "mosdac_observations_staging",
                        source=f,
                        format="csv",
                        header=True,
                        columns=staging_columns,
                    )
            elif df is not None and len(df) > 0:
                csv_buffer = io.BytesIO()
                df.to_csv(csv_buffer, index=False)
                csv_buffer.seek(0)
                await conn.copy_to_table(
                    "mosdac_observations_staging",
                    source=csv_buffer,
                    format="csv",
                    header=True,
                    columns=staging_columns,
                )
            else:
                raise ValueError("Neither valid csv_path nor non-empty df provided for loading")

            # 4. Upsert from staging into mosdac_observations
            logger.info(f"[MOSDAC Loader] Upserting staging records into mosdac_observations for {product_id}...")
            upsert_query = """
            INSERT INTO mosdac_observations (
                granule_id, product_id, category, observation_time, latitude, longitude, geom,
                value, secondary_value, unit, state, district
            )
            SELECT
                granule_id,
                product_id,
                category,
                observation_time,
                latitude,
                longitude,
                ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
                value,
                secondary_value,
                unit,
                state,
                district
            FROM mosdac_observations_staging
            WHERE granule_id = $1 AND product_id = $2
            ON CONFLICT (observation_time, product_id, granule_id, latitude, longitude) DO UPDATE
            SET value = EXCLUDED.value,
                secondary_value = EXCLUDED.secondary_value,
                geom = EXCLUDED.geom;
            """
            result_tag = await conn.execute(upsert_query, granule_id, product_id)

            # 5. Clean up staging rows
            await conn.execute(
                "DELETE FROM mosdac_observations_staging WHERE granule_id = $1 AND product_id = $2;",
                granule_id,
                product_id,
            )

            # Count rows inserted
            inserted_count = len(df) if df is not None else 0
            if inserted_count == 0 and csv_path and csv_path.exists():
                inserted_count = sum(1 for _ in open(csv_path, "r")) - 1

            duration = time.time() - start_time
            logger.info(
                f"[MOSDAC Loader] {product_id} granule {granule_id} successfully persisted ({inserted_count:,} rows, "
                f"{duration:.2f}s, SQL result: {result_tag})"
            )

            # 6. Update ledger to COMPLETED
            await self.record_product_ledger_status(
                product_id=product_id,
                category=category,
                granule_id=granule_id,
                status="COMPLETED",
                observation_time=observation_time,
                row_count=inserted_count,
                min_value=summary.get("min_value") if summary else None,
                max_value=summary.get("max_value") if summary else None,
                mean_value=summary.get("mean_value") if summary else None,
                unit=summary.get("unit") if summary else None,
                summary_dict=summary,
            )

            return {
                "success": True,
                "granule_id": granule_id,
                "product_id": product_id,
                "row_count": inserted_count,
                "duration_seconds": round(duration, 2),
                "sql_result": result_tag,
            }

        except Exception as e:
            err_msg = f"Database ingestion failed for {product_id} ({granule_id}): {e}"
            logger.error(f"[MOSDAC Loader] {err_msg}", exc_info=True)
            await self.record_product_ledger_status(
                product_id=product_id,
                category=category,
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

