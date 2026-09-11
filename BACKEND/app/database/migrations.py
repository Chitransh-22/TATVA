import logging
from datetime import datetime
import asyncpg
from app.config import settings

logger = logging.getLogger(__name__)

MIGRATION_DDL = """
-- Enable PostGIS extension if available
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PostGIS extension could not be enabled, continuing without spatial extension.';
END $$;

-- 1. Ingestion Ledger table
CREATE TABLE IF NOT EXISTS ingestion_ledger (
    id BIGSERIAL PRIMARY KEY,
    granule_id VARCHAR(255) UNIQUE NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    source_url VARCHAR(1024) NOT NULL,
    observation_time TIMESTAMPTZ NOT NULL,
    file_size_bytes BIGINT,
    checksum_sha256 VARCHAR(64),
    raw_file_path VARCHAR(1024),
    transformed_file_path VARCHAR(1024),
    status VARCHAR(32) NOT NULL DEFAULT 'DISCOVERED',
    row_count BIGINT DEFAULT 0,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_status_time ON ingestion_ledger (status, observation_time);
CREATE INDEX IF NOT EXISTS idx_ledger_granule ON ingestion_ledger (granule_id);

-- 2. Staging Table (Optimized for ultra-fast raw COPY loading, no heavy indexes)
CREATE TABLE IF NOT EXISTS precipitation_observations_staging (
    granule_id VARCHAR(128) NOT NULL,
    observation_time TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    precipitation DOUBLE PRECISION,
    ice DOUBLE PRECISION,
    liquid DOUBLE PRECISION,
    liquid_percent DOUBLE PRECISION,
    num_precip_half_hour INTEGER,
    num_valid_half_hour INTEGER,
    source VARCHAR(64) DEFAULT 'NASA',
    product VARCHAR(64) DEFAULT 'IMERG',
    state VARCHAR(128),
    district VARCHAR(128)
);

-- Upgrade staging table if already created previously without columns
ALTER TABLE precipitation_observations_staging ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'NASA';
ALTER TABLE precipitation_observations_staging ADD COLUMN IF NOT EXISTS product VARCHAR(64) DEFAULT 'IMERG';
ALTER TABLE precipitation_observations_staging ADD COLUMN IF NOT EXISTS state VARCHAR(128);
ALTER TABLE precipitation_observations_staging ADD COLUMN IF NOT EXISTS district VARCHAR(128);

-- 3. Partitioned Main Observations Table
CREATE TABLE IF NOT EXISTS precipitation_observations (
    granule_id VARCHAR(128) NOT NULL,
    observation_time TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326),
    precipitation DOUBLE PRECISION,
    ice DOUBLE PRECISION,
    liquid DOUBLE PRECISION,
    liquid_percent DOUBLE PRECISION,
    num_precip_half_hour INTEGER,
    num_valid_half_hour INTEGER,
    source VARCHAR(64) DEFAULT 'NASA',
    product VARCHAR(64) DEFAULT 'IMERG',
    state VARCHAR(128),
    district VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (observation_time, granule_id, latitude, longitude)
) PARTITION BY RANGE (observation_time);

-- Upgrade partitioned main table if already created previously without columns
ALTER TABLE precipitation_observations ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'NASA';
ALTER TABLE precipitation_observations ADD COLUMN IF NOT EXISTS product VARCHAR(64) DEFAULT 'IMERG';
ALTER TABLE precipitation_observations ADD COLUMN IF NOT EXISTS state VARCHAR(128);
ALTER TABLE precipitation_observations ADD COLUMN IF NOT EXISTS district VARCHAR(128);

-- Performance indices for 7-day rolling window lookups & cleanup
CREATE INDEX IF NOT EXISTS idx_precip_obs_time_only ON precipitation_observations (observation_time DESC);
CREATE INDEX IF NOT EXISTS idx_precip_obs_state_district ON precipitation_observations (state, district);

-- 4. Pre-aggregated Analytics Table
CREATE TABLE IF NOT EXISTS aggregated_weather (
    id BIGSERIAL PRIMARY KEY,
    time_bucket VARCHAR(16) NOT NULL, -- 'DAILY', '7DAY', '30DAY'
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    region_code VARCHAR(64) NOT NULL DEFAULT 'INDIA_ALL',
    avg_precipitation DOUBLE PRECISION,
    max_precipitation DOUBLE PRECISION,
    min_precipitation DOUBLE PRECISION,
    total_volume_mm DOUBLE PRECISION,
    total_samples BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_agg_bucket_region UNIQUE (time_bucket, period_start, period_end, region_code)
);

CREATE INDEX IF NOT EXISTS idx_agg_time_lookup ON aggregated_weather (time_bucket, period_start);

-- 5. Weather Anomalies Table
CREATE TABLE IF NOT EXISTS weather_anomalies (
    id BIGSERIAL PRIMARY KEY,
    granule_id VARCHAR(128) NOT NULL,
    observation_time TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    precipitation DOUBLE PRECISION NOT NULL,
    anomaly_score DOUBLE PRECISION,
    anomaly_type VARCHAR(32) NOT NULL DEFAULT 'EXTREME_RAIN',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_anomaly_time ON weather_anomalies (observation_time);
CREATE INDEX IF NOT EXISTS idx_anomaly_coords ON weather_anomalies (latitude, longitude);

-- 6. Boundary Tables for States and Districts
CREATE TABLE IF NOT EXISTS boundary_states (
    state_name VARCHAR(128) PRIMARY KEY,
    geom GEOMETRY(Geometry, 4326) NOT NULL,
    min_lat DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    min_lon DOUBLE PRECISION,
    max_lon DOUBLE PRECISION,
    center_lat DOUBLE PRECISION,
    center_lon DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_boundary_states_geom ON boundary_states USING GIST (geom);

CREATE TABLE IF NOT EXISTS boundary_districts (
    id SERIAL PRIMARY KEY,
    state_name VARCHAR(128) NOT NULL,
    district_name VARCHAR(128) NOT NULL,
    geom GEOMETRY(Geometry, 4326) NOT NULL,
    min_lat DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    min_lon DOUBLE PRECISION,
    max_lon DOUBLE PRECISION,
    center_lat DOUBLE PRECISION,
    center_lon DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_boundary_districts_geom ON boundary_districts USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_boundary_districts_state ON boundary_districts (state_name);
CREATE INDEX IF NOT EXISTS idx_boundary_districts_name ON boundary_districts (district_name);

-- 7. Weather Region Summary (National & State rollups for instant API responses)
CREATE TABLE IF NOT EXISTS weather_region_summary (
    id BIGSERIAL PRIMARY KEY,
    observation_time TIMESTAMPTZ NOT NULL,
    granule_id VARCHAR(128) NOT NULL,
    region_type VARCHAR(32) NOT NULL,
    region_name VARCHAR(128) NOT NULL,
    state_name VARCHAR(128) NOT NULL,
    avg_precipitation DOUBLE PRECISION,
    max_precipitation DOUBLE PRECISION,
    min_precipitation DOUBLE PRECISION,
    total_points BIGINT DEFAULT 0,
    rain_category VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_region_summary UNIQUE (observation_time, region_type, region_name, state_name)
);
CREATE INDEX IF NOT EXISTS idx_region_summary_lookup ON weather_region_summary (observation_time, region_type, state_name);
"""


async def ensure_monthly_partition(conn: asyncpg.Connection, dt: datetime) -> str:
    """Ensure a partition exists for the specified year and month."""
    year = dt.year
    month = dt.month
    partition_name = f"precipitation_observations_{year}_{month:02d}"

    # Next month calculation
    next_month = month + 1
    next_year = year
    if next_month > 12:
        next_month = 1
        next_year += 1

    start_date = f"{year}-{month:02d}-01"
    end_date = f"{next_year}-{next_month:02d}-01"

    ddl = f"""
    CREATE TABLE IF NOT EXISTS {partition_name} PARTITION OF precipitation_observations
        FOR VALUES FROM ('{start_date}') TO ('{end_date}');

    CREATE INDEX IF NOT EXISTS idx_{partition_name}_geom ON {partition_name} USING GIST (geom);
    CREATE INDEX IF NOT EXISTS idx_{partition_name}_time ON {partition_name} (observation_time DESC);
    CREATE INDEX IF NOT EXISTS idx_{partition_name}_granule ON {partition_name} (granule_id);
    CREATE INDEX IF NOT EXISTS idx_{partition_name}_state_dist ON {partition_name} (state, district);
    """
    await conn.execute(ddl)
    return partition_name


async def seed_boundaries_if_empty(conn: asyncpg.Connection) -> None:
    """Seed boundary_states and boundary_districts from GeoJSON assets if tables are empty."""
    import json
    from pathlib import Path

    boundaries_dir = Path(__file__).resolve().parent.parent.parent / "data" / "boundaries"
    states_path = boundaries_dir / "india_states.geojson"
    districts_path = boundaries_dir / "india_districts.geojson"

    try:
        states_count = await conn.fetchval("SELECT count(*) FROM boundary_states;")
        if states_count == 0 and states_path.exists():
            logger.info("Seeding boundary_states from india_states.geojson...")
            with open(states_path, "r", encoding="utf-8") as f:
                states_data = json.load(f)
            state_insert_sql = """
                INSERT INTO boundary_states (state_name, geom, min_lat, max_lat, min_lon, max_lon, center_lat, center_lon)
                SELECT
                    $1,
                    g,
                    ST_YMin(g),
                    ST_YMax(g),
                    ST_XMin(g),
                    ST_XMax(g),
                    ST_Y(ST_Centroid(g)),
                    ST_X(ST_Centroid(g))
                FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS g) sub
                ON CONFLICT (state_name) DO NOTHING;
            """
            for feat in states_data.get("features", []):
                st_name = feat.get("properties", {}).get("ST_NM")
                if st_name and feat.get("geometry"):
                    geom_str = json.dumps(feat["geometry"])
                    await conn.execute(state_insert_sql, st_name, geom_str)
            logger.info(f"Seeded boundary_states (total: {len(states_data.get('features', []))}).")

        districts_count = await conn.fetchval("SELECT count(*) FROM boundary_districts;")
        if districts_count == 0 and districts_path.exists():
            logger.info("Seeding boundary_districts from india_districts.geojson...")
            with open(districts_path, "r", encoding="utf-8") as f:
                dist_data = json.load(f)
            dist_insert_sql = """
                INSERT INTO boundary_districts (state_name, district_name, geom, min_lat, max_lat, min_lon, max_lon, center_lat, center_lon)
                SELECT
                    $1,
                    $2,
                    g,
                    ST_YMin(g),
                    ST_YMax(g),
                    ST_XMin(g),
                    ST_XMax(g),
                    ST_Y(ST_Centroid(g)),
                    ST_X(ST_Centroid(g))
                FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($3), 4326) AS g) sub;
            """
            for feat in dist_data.get("features", []):
                st_name = feat.get("properties", {}).get("NAME_1", "")
                dist_name = feat.get("properties", {}).get("NAME_2", "")
                if dist_name and feat.get("geometry"):
                    geom_str = json.dumps(feat["geometry"])
                    await conn.execute(dist_insert_sql, st_name, dist_name, geom_str)
            logger.info(f"Seeded boundary_districts (total: {len(dist_data.get('features', []))}).")
    except Exception as e:
        logger.warning(f"Boundary seeding encountered non-fatal error: {e}")


async def run_migrations() -> bool:
    """Run all core database DDL statements and verify PostGIS."""
    # Step 1: Ensure database exists
    conn = None
    conn_kwargs = {
        "host": settings.POSTGRES_HOST,
        "port": settings.POSTGRES_PORT,
        "user": settings.POSTGRES_USER,
        "password": settings.POSTGRES_PASSWORD,
        "database": settings.POSTGRES_DB,
        "timeout": 30.0,
    }
    if settings.POSTGRES_SSL:
        conn_kwargs["ssl"] = settings.POSTGRES_SSL

    try:
        from app.database.connection import connect_asyncpg_with_retry
        conn = await connect_asyncpg_with_retry(max_retries=3, timeout=30.0)
    except asyncpg.InvalidCatalogNameError:
        # Target database does not exist, connect to postgres and create it
        logger.info(f"Database '{settings.POSTGRES_DB}' does not exist. Creating it...")
        try:
            admin_kwargs = dict(conn_kwargs)
            admin_kwargs["database"] = "postgres"
            admin_conn = await asyncpg.connect(**admin_kwargs)
            await admin_conn.execute(f'CREATE DATABASE "{settings.POSTGRES_DB}";')
            await admin_conn.close()
            logger.info(f"Database '{settings.POSTGRES_DB}' created successfully.")
            # Reconnect to the newly created database
            conn = await asyncpg.connect(**conn_kwargs)
        except Exception as create_err:
            logger.error(f"Failed to create database '{settings.POSTGRES_DB}': {create_err}")
            return False
    except Exception as conn_err:
        logger.warning(f"Could not connect to PostgreSQL ({conn_err}). Operating in standalone mode.", exc_info=True)
        return False

    # Step 2: Run DDL migrations & PostGIS verification
    try:
        logger.info("Executing database schema migrations...")
        await conn.execute(MIGRATION_DDL)

        # Verify PostGIS version
        try:
            pgis_ver = await conn.fetchval("SELECT PostGIS_Version();")
            logger.info(f"PostGIS extension verified successfully: {pgis_ver}")
        except Exception as pgis_err:
            logger.warning(f"PostGIS version check failed or not installed: {pgis_err}")

        # Ensure current and upcoming month partitions exist
        now = datetime.utcnow()
        await ensure_monthly_partition(conn, now)

        # Seed static boundaries (states and districts) if empty
        await seed_boundaries_if_empty(conn)

        logger.info("Database migrations completed successfully.")
        return True
    except Exception as ddl_err:
        logger.error(f"Error executing database migrations: {ddl_err}", exc_info=True)
        return False
    finally:
        if conn:
            await conn.close()
