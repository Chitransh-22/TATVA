import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy import select, func, text
from app.database.connection import AsyncSessionLocal, is_database_reachable
from app.database.models import AggregatedWeather, WeatherAnomaly

logger = logging.getLogger(__name__)


class AnalyticsAggregator:
    """Pre-aggregates observation data and detects precipitation anomalies."""

    async def compute_rollups_for_observation(self, obs_time: datetime) -> None:
        """Compute Daily, 7-Day, and 30-Day pre-aggregates for India."""
        if not is_database_reachable():
            logger.debug("[Analytics] Database unreachable; skipping rollups")
            return
        logger.info(f"Computing analytics rollups around {obs_time.isoformat()}...")
        try:
            async with AsyncSessionLocal() as session:
                # 1. Daily Rollup
                day_start = datetime(obs_time.year, obs_time.month, obs_time.day, tzinfo=timezone.utc)
                day_end = day_start + timedelta(days=1)
                await self._compute_and_save_bucket(session, "DAILY", day_start, day_end)

                # 2. 7-Day Rolling Window
                week_start = obs_time - timedelta(days=7)
                await self._compute_and_save_bucket(session, "7DAY", week_start, obs_time)

                # 3. 30-Day Rolling Window
                month_start = obs_time - timedelta(days=30)
                await self._compute_and_save_bucket(session, "30DAY", month_start, obs_time)

                # 4. National & State regional summaries for the Map API
                await self.compute_regional_summaries(session, obs_time)

                await session.commit()
                logger.info("Analytics rollups successfully computed and committed.")
        except Exception as e:
            logger.error(f"Error computing rollups: {e}")

    async def compute_regional_summaries(self, session, obs_time: datetime, granule_id: Optional[str] = None) -> None:
        """Compute national and state-level rollups for weather_region_summary table."""
        try:
            # 1. National summary
            nat_sql = text("""
                INSERT INTO weather_region_summary (
                    observation_time, granule_id, region_type, region_name, state_name,
                    avg_precipitation, max_precipitation, min_precipitation, total_points, rain_category
                )
                SELECT
                    :obs_time, :granule_id, 'NATIONAL', 'India', 'India',
                    ROUND(COALESCE(AVG(precipitation), 0)::numeric, 2),
                    ROUND(COALESCE(MAX(precipitation), 0)::numeric, 2),
                    ROUND(COALESCE(MIN(precipitation), 0)::numeric, 2),
                    COUNT(*),
                    CASE
                        WHEN COALESCE(MAX(precipitation), 0) >= 100 THEN 'Very Heavy Torrential Downpour'
                        WHEN COALESCE(MAX(precipitation), 0) >= 50 THEN 'Heavy Rainfall'
                        WHEN COALESCE(MAX(precipitation), 0) >= 15 THEN 'Moderate Rain'
                        WHEN COALESCE(MAX(precipitation), 0) >= 1 THEN 'Light Rain'
                        ELSE 'Clear / Dry'
                    END
                FROM precipitation_observations
                WHERE observation_time = :obs_time
                ON CONFLICT (observation_time, region_type, region_name, state_name) DO UPDATE
                SET avg_precipitation = EXCLUDED.avg_precipitation,
                    max_precipitation = EXCLUDED.max_precipitation,
                    min_precipitation = EXCLUDED.min_precipitation,
                    total_points = EXCLUDED.total_points,
                    rain_category = EXCLUDED.rain_category;
            """)
            await session.execute(nat_sql, {"obs_time": obs_time, "granule_id": granule_id or "IMERG_LIVE"})

            # 2. State summaries (for all 36 states)
            states_sql = text("""
                INSERT INTO weather_region_summary (
                    observation_time, granule_id, region_type, region_name, state_name,
                    avg_precipitation, max_precipitation, min_precipitation, total_points, rain_category
                )
                SELECT
                    :obs_time, :granule_id, 'STATE', s.state_name, s.state_name,
                    ROUND(COALESCE(AVG(o.precipitation), 0)::numeric, 2),
                    ROUND(COALESCE(MAX(o.precipitation), 0)::numeric, 2),
                    ROUND(COALESCE(MIN(o.precipitation), 0)::numeric, 2),
                    COUNT(o.latitude),
                    CASE
                        WHEN COALESCE(MAX(o.precipitation), 0) >= 100 THEN 'Very Heavy Torrential Downpour'
                        WHEN COALESCE(MAX(o.precipitation), 0) >= 50 THEN 'Heavy Rainfall'
                        WHEN COALESCE(MAX(o.precipitation), 0) >= 15 THEN 'Moderate Rain'
                        WHEN COALESCE(MAX(o.precipitation), 0) >= 1 THEN 'Light Rain'
                        ELSE 'Clear / Dry'
                    END
                FROM boundary_states s
                LEFT JOIN precipitation_observations o ON
                    o.observation_time = :obs_time
                    AND o.latitude BETWEEN s.min_lat AND s.max_lat
                    AND o.longitude BETWEEN s.min_lon AND s.max_lon
                    AND ST_Intersects(o.geom, s.geom)
                GROUP BY s.state_name
                ON CONFLICT (observation_time, region_type, region_name, state_name) DO UPDATE
                SET avg_precipitation = EXCLUDED.avg_precipitation,
                    max_precipitation = EXCLUDED.max_precipitation,
                    min_precipitation = EXCLUDED.min_precipitation,
                    total_points = EXCLUDED.total_points,
                    rain_category = EXCLUDED.rain_category;
            """)
            await session.execute(states_sql, {"obs_time": obs_time, "granule_id": granule_id or "IMERG_LIVE"})
            logger.info(f"Regional summaries updated for observation {obs_time.isoformat()}")
        except Exception as err:
            logger.warning(f"Regional summary computation note: {err}")

    async def _compute_and_save_bucket(
        self,
        session,
        bucket_type: str,
        start_dt: datetime,
        end_dt: datetime,
        region_code: str = "INDIA_ALL"
    ) -> None:
        """Compute stats for a given time window from precipitation_observations."""
        query = text("""
            SELECT
                AVG(precipitation) AS avg_precip,
                MAX(precipitation) AS max_precip,
                MIN(precipitation) AS min_precip,
                SUM(precipitation) AS sum_precip,
                COUNT(*) AS total_samples
            FROM precipitation_observations
            WHERE observation_time >= :start_dt AND observation_time < :end_dt;
        """)
        res = await session.execute(query, {"start_dt": start_dt, "end_dt": end_dt})
        row = res.first()

        if not row or row.total_samples == 0:
            return

        upsert_query = text("""
            INSERT INTO aggregated_weather (
                time_bucket, period_start, period_end, region_code,
                avg_precipitation, max_precipitation, min_precipitation,
                total_volume_mm, total_samples, created_at
            )
            VALUES (
                :time_bucket, :period_start, :period_end, :region_code,
                :avg_precip, :max_precip, :min_precip,
                :total_volume_mm, :total_samples, NOW()
            )
            ON CONFLICT (time_bucket, period_start, period_end, region_code) DO UPDATE
            SET avg_precipitation = EXCLUDED.avg_precipitation,
                max_precipitation = EXCLUDED.max_precipitation,
                min_precipitation = EXCLUDED.min_precipitation,
                total_volume_mm = EXCLUDED.total_volume_mm,
                total_samples = EXCLUDED.total_samples;
        """)

        await session.execute(upsert_query, {
            "time_bucket": bucket_type,
            "period_start": start_dt,
            "period_end": end_dt,
            "region_code": region_code,
            "avg_precip": float(row.avg_precip or 0.0),
            "max_precip": float(row.max_precip or 0.0),
            "min_precip": float(row.min_precip or 0.0),
            "total_volume_mm": float(row.sum_precip or 0.0),
            "total_samples": int(row.total_samples or 0),
        })

    async def detect_anomalies_for_granule(
        self,
        granule_id: str,
        obs_time: datetime,
        extreme_threshold_mm: float = 65.0  # IMERG extreme rainfall threshold (Indian Met Dept Heavy Rain is >64.5mm)
    ) -> int:
        """Identify observation points exceeding heavy/extreme rainfall thresholds."""
        if not is_database_reachable():
            return 0
        try:
            async with AsyncSessionLocal() as session:
                query = text("""
                    INSERT INTO weather_anomalies (
                        granule_id, observation_time, latitude, longitude,
                        precipitation, anomaly_score, anomaly_type, description, created_at
                    )
                    SELECT
                        granule_id,
                        observation_time,
                        latitude,
                        longitude,
                        precipitation,
                        ROUND((precipitation / :threshold)::numeric, 2) AS anomaly_score,
                        'EXTREME_RAIN' AS anomaly_type,
                        CONCAT('Extreme rainfall intensity detected: ', precipitation, ' mm/hr') AS description,
                        NOW()
                    FROM precipitation_observations
                    WHERE granule_id = :granule_id AND precipitation >= :threshold
                    LIMIT 200;
                """)
                res = await session.execute(query, {
                    "granule_id": granule_id,
                    "threshold": extreme_threshold_mm
                })
                await session.commit()
                count = res.rowcount
                if count > 0:
                    logger.info(f"Recorded {count} extreme weather anomalies for granule {granule_id}")
                return count
        except Exception as e:
            logger.error(f"Error detecting anomalies for granule {granule_id}: {e}")
            return 0

    async def get_rollups(
        self,
        time_bucket: str = "7DAY",
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Query recent aggregated weather rollups."""
        try:
            async with AsyncSessionLocal() as session:
                query = (
                    select(AggregatedWeather)
                    .where(AggregatedWeather.time_bucket == time_bucket)
                    .order_by(AggregatedWeather.period_end.desc())
                    .limit(limit)
                )
                res = await session.execute(query)
                records = res.scalars().all()
                return [
                    {
                        "time_bucket": r.time_bucket,
                        "period_start": r.period_start.isoformat(),
                        "period_end": r.period_end.isoformat(),
                        "region_code": r.region_code,
                        "avg_precipitation": r.avg_precipitation,
                        "max_precipitation": r.max_precipitation,
                        "min_precipitation": r.min_precipitation,
                        "total_volume_mm": r.total_volume_mm,
                        "total_samples": r.total_samples,
                    }
                    for r in records
                ]
        except Exception as e:
            logger.error(f"Error querying rollups: {e}")
            return []

    async def get_anomalies(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Query detected weather anomalies."""
        try:
            async with AsyncSessionLocal() as session:
                query = select(WeatherAnomaly).order_by(WeatherAnomaly.observation_time.desc()).limit(limit)
                res = await session.execute(query)
                records = res.scalars().all()
                return [
                    {
                        "granule_id": r.granule_id,
                        "observation_time": r.observation_time.isoformat(),
                        "latitude": r.latitude,
                        "longitude": r.longitude,
                        "precipitation": r.precipitation,
                        "anomaly_score": r.anomaly_score,
                        "anomaly_type": r.anomaly_type,
                        "description": r.description,
                    }
                    for r in records
                ]
        except Exception as e:
            logger.error(f"Error querying anomalies: {e}")
            return []


analytics_aggregator = AnalyticsAggregator()
