import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Union

from sqlalchemy import text
from app.config import settings
from app.database.connection import AsyncSessionLocal
from app.api.ws_manager import weather_ws_manager
from app.ingestion.kafka_bus import kafka_bus
from app.ingestion.topics import TOPIC_WEATHER_OBSERVATION

logger = logging.getLogger("ritu.weather.pipeline")


def normalize_datetime(dt_val: Union[str, datetime, None]) -> datetime:
    """Normalize input timestamp to timezone-aware UTC datetime."""
    if dt_val is None:
        return datetime.now(timezone.utc)
    if isinstance(dt_val, str):
        cleaned = dt_val.strip().replace("Z", "+00:00")
        if " " in cleaned and ("+" not in cleaned[10:] and "-" not in cleaned[10:]):
            parts = cleaned.rsplit(" ", 1)
            if len(parts) == 2 and ":" in parts[1]:
                cleaned = f"{parts[0]}+{parts[1]}"
        try:
            dt = datetime.fromisoformat(cleaned)
        except Exception:
            dt = datetime.now(timezone.utc)
    else:
        dt = dt_val

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt


def normalize_observation(event: Dict[str, Any]) -> Dict[str, Any]:
    """Validate, normalize, and assign stable keys to a single weather observation event."""
    obs_time = normalize_datetime(
        event.get("observation_time") or event.get("timestamp") or event.get("time")
    )
    lat = round(float(event.get("latitude") if event.get("latitude") is not None else event.get("lat", 0.0)), 2)
    lon = round(float(event.get("longitude") if event.get("longitude") is not None else event.get("lon", 0.0)), 2)
    precip = round(max(0.0, float(event.get("precipitation") if event.get("precipitation") is not None else event.get("value", 0.0))), 2)

    granule_id = event.get("granule_id")
    if not granule_id:
        granule_id = f"RT-{obs_time.strftime('%Y%m%d%H%M')}-{lat:.2f}_{lon:.2f}"

    source = str(event.get("source", "NASA"))
    product = str(event.get("product", "IMERG"))
    state = event.get("state")
    district = event.get("district")

    ice = float(event.get("ice", 0.0)) if event.get("ice") is not None else 0.0
    liquid = float(event.get("liquid", precip)) if event.get("liquid") is not None else precip
    liquid_percent = float(event.get("liquid_percent", 100.0)) if event.get("liquid_percent") is not None else 100.0

    return {
        "granule_id": granule_id,
        "observation_time": obs_time,
        "latitude": lat,
        "longitude": lon,
        "precipitation": precip,
        "ice": ice,
        "liquid": liquid,
        "liquid_percent": liquid_percent,
        "num_precip_half_hour": int(event.get("num_precip_half_hour", 1)),
        "num_valid_half_hour": int(event.get("num_valid_half_hour", 1)),
        "source": source,
        "product": product,
        "state": state.strip() if isinstance(state, str) and state.strip() else None,
        "district": district.strip() if isinstance(district, str) and district.strip() else None,
        "created_at": datetime.now(timezone.utc),
    }


class WeatherEventPipelineService:
    """Core persistent pipeline service for incoming weather observations.

    Guarantees:
    1. Event validation and normalization.
    2. Atomic PostgreSQL persistence via UPSERT (deduplicated on primary key).
    3. Transaction commit verification.
    4. Real-time WebSocket broadcast to connected frontend subscribers.
    """

    def __init__(self):
        self._postgis_available: Optional[bool] = None

    async def _check_postgis(self, session) -> bool:
        """Check once whether PostGIS spatial functions are available."""
        if self._postgis_available is not None:
            return self._postgis_available
        try:
            res = await session.execute(text("SELECT PostGIS_Version();"))
            val = res.scalar_one_or_none()
            self._postgis_available = bool(val)
        except Exception:
            self._postgis_available = False
        return self._postgis_available

    async def _ensure_partition(self, session, dt: datetime) -> None:
        """Ensure monthly partition exists for the observation timestamp."""
        try:
            year = dt.year
            month = dt.month
            partition_name = f"precipitation_observations_{year}_{month:02d}"
            next_month = month + 1
            next_year = year
            if next_month > 12:
                next_month = 1
                next_year += 1
            start_date = f"{year}-{month:02d}-01"
            end_date = f"{next_year}-{next_month:02d}-01"
            ddl = text(f"""
                CREATE TABLE IF NOT EXISTS {partition_name} PARTITION OF precipitation_observations
                    FOR VALUES FROM ('{start_date}') TO ('{end_date}');
            """)
            await session.execute(ddl)
        except Exception:
            # If relation is not partitioned (e.g. SQLite or non-partitioned PostgreSQL), ignore
            pass

    async def process_and_persist_events(
        self,
        events: List[Dict[str, Any]],
        publish_to_kafka: bool = True,
    ) -> Tuple[int, List[Dict[str, Any]]]:
        """Validate, persist to PostgreSQL via UPSERT, commit, and broadcast via WebSocket.

        Returns:
            (persisted_count, normalized_events)
        """
        if not events:
            return 0, []

        normalized_list: List[Dict[str, Any]] = []
        for e in events:
            try:
                normalized_list.append(normalize_observation(e))
            except Exception as ex:
                logger.warning(f"Skipping malformed weather observation event: {e} ({ex})")

        if not normalized_list:
            return 0, []

        persisted_count = 0

        # 1. Database UPSERT into PostgreSQL
        try:
            async with AsyncSessionLocal() as session:
                has_postgis = await self._check_postgis(session)

                if has_postgis:
                    upsert_sql = text("""
                        INSERT INTO precipitation_observations (
                            granule_id, observation_time, latitude, longitude,
                            precipitation, ice, liquid, liquid_percent,
                            num_precip_half_hour, num_valid_half_hour,
                            source, product, state, district,
                            geom, created_at
                        )
                        VALUES (
                            :granule_id, :observation_time, :latitude, :longitude,
                            :precipitation, :ice, :liquid, :liquid_percent,
                            :num_precip_half_hour, :num_valid_half_hour,
                            :source, :product, :state, :district,
                            ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
                            :created_at
                        )
                        ON CONFLICT (observation_time, granule_id, latitude, longitude) DO UPDATE
                        SET precipitation = EXCLUDED.precipitation,
                            ice = EXCLUDED.ice,
                            liquid = EXCLUDED.liquid,
                            liquid_percent = EXCLUDED.liquid_percent,
                            source = EXCLUDED.source,
                            product = EXCLUDED.product,
                            state = COALESCE(EXCLUDED.state, precipitation_observations.state),
                            district = COALESCE(EXCLUDED.district, precipitation_observations.district);
                    """)
                else:
                    upsert_sql = text("""
                        INSERT INTO precipitation_observations (
                            granule_id, observation_time, latitude, longitude,
                            precipitation, ice, liquid, liquid_percent,
                            num_precip_half_hour, num_valid_half_hour,
                            source, product, state, district,
                            created_at
                        )
                        VALUES (
                            :granule_id, :observation_time, :latitude, :longitude,
                            :precipitation, :ice, :liquid, :liquid_percent,
                            :num_precip_half_hour, :num_valid_half_hour,
                            :source, :product, :state, :district,
                            :created_at
                        )
                        ON CONFLICT (observation_time, granule_id, latitude, longitude) DO UPDATE
                        SET precipitation = EXCLUDED.precipitation,
                            ice = EXCLUDED.ice,
                            liquid = EXCLUDED.liquid,
                            liquid_percent = EXCLUDED.liquid_percent,
                            source = EXCLUDED.source,
                            product = EXCLUDED.product,
                            state = COALESCE(EXCLUDED.state, precipitation_observations.state),
                            district = COALESCE(EXCLUDED.district, precipitation_observations.district);
                    """)

                # Ensure partition exists for observation timestamps
                ensured_months = set()
                for norm in normalized_list:
                    m_key = (norm["observation_time"].year, norm["observation_time"].month)
                    if m_key not in ensured_months:
                        await self._ensure_partition(session, norm["observation_time"])
                        ensured_months.add(m_key)

                for norm in normalized_list:
                    await session.execute(upsert_sql, norm)

                await session.commit()
                persisted_count = len(normalized_list)
                logger.info(f"Successfully persisted/upserted {persisted_count} weather observations to PostgreSQL.")

        except Exception as db_err:
            logger.error(f"PostgreSQL persistence failed for {len(normalized_list)} observations: {db_err}", exc_info=True)
            # Critical architecture rule: Do NOT broadcast data that failed to persist unless explicitly configured
            raise RuntimeError(f"Database persistence failure: {db_err}") from db_err

        # 2. Clear query caches so REST endpoints return new state immediately
        try:
            from app.api.weather import clear_weather_cache
            clear_weather_cache()
        except Exception:
            pass

        # 3. Publish to Kafka event bus (if enabled and requested)
        if publish_to_kafka:
            for item in normalized_list:
                try:
                    payload = dict(item)
                    payload["observation_time"] = payload["observation_time"].isoformat()
                    payload["created_at"] = payload["created_at"].isoformat()
                    await kafka_bus.publish(
                        topic=TOPIC_WEATHER_OBSERVATION,
                        key=f"{item['granule_id']}_{item['latitude']}_{item['longitude']}",
                        payload=payload,
                    )
                except Exception as k_err:
                    logger.debug(f"Kafka publish notice: {k_err}")

        # 4. Broadcast to connected WebSocket clients
        await self._broadcast_persisted_events(normalized_list)

        return persisted_count, normalized_list

    async def _broadcast_persisted_events(self, items: List[Dict[str, Any]]) -> None:
        """Construct incremental WebSocket update payload and broadcast to matching subscribers."""
        if not items:
            return

        # Group items by (state, district) to deliver targeted updates
        by_scope: Dict[Tuple[Optional[str], Optional[str]], List[Dict[str, Any]]] = {}
        for it in items:
            key = (it.get("state"), it.get("district"))
            by_scope.setdefault(key, []).append(it)

        now_utc = datetime.now(timezone.utc)

        for (st, dist), group in by_scope.items():
            updates = []
            for p in group:
                pt_id = f"{p['latitude']:.2f}_{p['longitude']:.2f}"
                updates.append({
                    "id": pt_id,
                    "lat": p["latitude"],
                    "lon": p["longitude"],
                    "value": p["precipitation"],
                    "precipitation": p["precipitation"],
                    "liquid": p["liquid"],
                    "ice": p["ice"],
                    "liquid_percent": p["liquid_percent"],
                    "timestamp": p["observation_time"].isoformat(),
                    "state": p.get("state"),
                    "district": p.get("district"),
                })

            precip_values = [u["value"] for u in updates]
            max_p = max(precip_values) if precip_values else 0.0
            avg_p = round(sum(precip_values) / len(precip_values), 2) if precip_values else 0.0

            rain_cat = "Moderate Rain"
            if max_p >= 100.0:
                rain_cat = "Very Heavy Torrential Downpour"
            elif max_p >= 50.0:
                rain_cat = "Heavy Rainfall"
            elif max_p >= 15.0:
                rain_cat = "Moderate Rain"
            elif max_p >= 1.0:
                rain_cat = "Light Rain"
            else:
                rain_cat = "Clear / Dry"

            summary = {
                "avg_precipitation": avg_p,
                "max_precipitation": max_p,
                "min_precipitation": min(precip_values) if precip_values else 0.0,
                "total_points": len(updates),
                "rain_category": rain_cat,
            }

            granule_id = group[0].get("granule_id", "REALTIME")

            # Broadcast targeted batch for this scope
            await weather_ws_manager.broadcast_batch(
                updates=updates,
                removals=[],
                summary=summary,
                target_state=st,
                target_district=dist,
                timestamp=now_utc,
                granule_id=granule_id,
            )

            # Also broadcast single event if count is 1 for direct single-point listeners
            if len(updates) == 1:
                u = updates[0]
                await weather_ws_manager.broadcast_event(
                    event_type="weather_update",
                    action="upsert",
                    point_id=u["id"],
                    data=u,
                    target_state=st,
                    target_district=dist,
                    timestamp=now_utc,
                )

            # Also broadcast to national subscribers if this was state/district data
            if st is not None:
                await weather_ws_manager.broadcast_batch(
                    updates=updates,
                    removals=[],
                    summary=summary,
                    target_state=None,
                    target_district=None,
                    timestamp=now_utc,
                    granule_id=granule_id,
                )
                if len(updates) == 1:
                    await weather_ws_manager.broadcast_event(
                        event_type="weather_update",
                        action="upsert",
                        point_id=updates[0]["id"],
                        data=updates[0],
                        target_state=None,
                        target_district=None,
                        timestamp=now_utc,
                    )


weather_pipeline = WeatherEventPipelineService()
