import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database.connection import get_db
from app.analytics.aggregator import analytics_aggregator
from app.api.broadcaster import weather_broadcaster
from app.api.ws_manager import weather_ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weather", tags=["Weather Analytics"])

IST = timezone(timedelta(hours=5, minutes=30))


def _to_ist_str(dt: Optional[datetime]) -> str:
    """Format UTC datetime to readable Indian Standard Time (IST)."""
    if not dt:
        return "N/A"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    ist_dt = dt.astimezone(IST)
    return ist_dt.strftime("%Y-%m-%d %H:%M IST")


def _classify_rain(max_p: float) -> str:
    if max_p >= 100.0:
        return "Very Heavy Torrential Downpour"
    if max_p >= 50.0:
        return "Heavy Rainfall"
    if max_p >= 15.0:
        return "Moderate Rain"
    if max_p >= 1.0:
        return "Light Rain"
    return "Clear / Dry"


def _parse_iso_time(time_str: str) -> datetime:
    """Parse ISO datetime safely handling URL decoding of + into space."""
    s = time_str.strip().replace("Z", "+00:00")
    if " " in s and ("+" not in s[10:] and "-" not in s[10:]):
        parts = s.rsplit(" ", 1)
        if len(parts) == 2 and ":" in parts[1]:
            s = f"{parts[0]}+{parts[1]}"
    return datetime.fromisoformat(s)


# In-memory LRU-like caches to make repeated queries instant (0.001s)
_CACHE_OVERVIEW: Dict[str, Any] = {}
_CACHE_STATE: Dict[str, Any] = {}
_CACHE_DISTRICT: Dict[str, Any] = {}

def clear_weather_cache() -> None:
    """Clear in-memory weather caches on new data ingestion."""
    _CACHE_OVERVIEW.clear()
    _CACHE_STATE.clear()
    _CACHE_DISTRICT.clear()


# =============================================================================
# 1. LIVE DATA FRESHNESS & METADATA
# =============================================================================

@router.get("/metadata")
async def get_weather_metadata(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Retrieve metadata about the currently loaded NASA IMERG observation dataset.
    
    Includes authoritative database timestamps formatted in IST.
    """
    try:
        # 1. Available distinct observation timestamps from ingestion_ledger (COMPLETED status)
        times_res = await db.execute(text("""
            SELECT observation_time, granule_id, row_count
            FROM ingestion_ledger
            WHERE status = 'COMPLETED'
            ORDER BY observation_time DESC
            LIMIT 20;
        """))
        ledger_completed = times_res.fetchall()

        if ledger_completed:
            latest_time = ledger_completed[0].observation_time
            latest_granule = ledger_completed[0].granule_id
            total_pts = int(ledger_completed[0].row_count or 0)
            available_times = [
                {
                    "observation_time": r.observation_time.isoformat(),
                    "observation_ist": _to_ist_str(r.observation_time),
                    "granule_id": r.granule_id,
                    "point_count": int(r.row_count or 0),
                }
                for r in ledger_completed
            ]
        else:
            latest_time = None
            latest_granule = "NONE"
            total_pts = 0
            available_times = []

        # 2. Total points recorded across all completed granules
        total_all_res = await db.execute(text("""
            SELECT COALESCE(SUM(row_count), 0)
            FROM ingestion_ledger
            WHERE status = 'COMPLETED';
        """))
        total_all = int(total_all_res.scalar_one_or_none() or 0)

        # 3. Latest ledger entry for pipeline status
        ledger_res = await db.execute(text("""
            SELECT granule_id, status, observation_time, row_count, created_at, updated_at
            FROM ingestion_ledger
            ORDER BY created_at DESC
            LIMIT 1;
        """))
        ledger_row = ledger_res.first()
        pipeline_status = ledger_row.status if ledger_row else "IDLE"

        return {
            "status": "success",
            "is_live": total_all > 0,
            "latest_observation_time": latest_time.isoformat() if latest_time else None,
            "latest_observation_ist": _to_ist_str(latest_time) if latest_time else "No Data Ingested",
            "latest_granule_id": latest_granule,
            "granule_point_count": total_pts,
            "total_observations_recorded": total_all,
            "pipeline_status": pipeline_status,
            "available_timestamps": available_times,
        }
    except Exception as e:
        logger.error(f"Error in /weather/metadata: {e}")
        return {
            "status": "error",
            "message": str(e),
            "is_live": False,
            "latest_observation_time": None,
            "latest_observation_ist": "Error Fetching Status",
        }


# =============================================================================
# 2. INDIA OVERVIEW (Aggregated State Rollups + Clipped Grid)
# =============================================================================

@router.get("/india/overview")
async def get_india_overview(
    db: AsyncSession = Depends(get_db),
    observation_time: Optional[str] = Query(None, description="ISO observation time; defaults to latest full dataset"),
    grid_step: float = Query(0.2, ge=0.1, le=1.0, description="Step in degrees for hardware-accelerated canvas heatmap"),
) -> Dict[str, Any]:
    """Retrieve full India overview: national metrics, state summaries, and canvas raster points."""
    try:
        # Resolve target observation_time from ingestion_ledger
        if observation_time:
            target_dt = _parse_iso_time(observation_time)
        else:
            time_query = text("""
                SELECT observation_time
                FROM ingestion_ledger
                WHERE status = 'COMPLETED' AND row_count > 500
                ORDER BY observation_time DESC
                LIMIT 1;
            """)
            res = await db.execute(time_query)
            target_dt = res.scalar_one_or_none()
            if not target_dt:
                time_fb = await db.execute(text("""
                    SELECT observation_time
                    FROM ingestion_ledger
                    WHERE status = 'COMPLETED'
                    ORDER BY observation_time DESC
                    LIMIT 1;
                """))
                target_dt = time_fb.scalar_one_or_none()

        if not target_dt:
            return {
                "status": "no_data",
                "message": "No observation data available yet.",
                "observation_time": None,
                "observation_ist": "N/A",
                "national_summary": {},
                "state_summaries": [],
                "grid_points": [],
            }

        # Check in-memory cache
        cache_key = f"{target_dt.isoformat()}_{grid_step}"
        if cache_key in _CACHE_OVERVIEW:
            return _CACHE_OVERVIEW[cache_key]

        # 1. Fetch National Summary from weather_region_summary or on the fly
        nat_res = await db.execute(text("""
            SELECT avg_precipitation, max_precipitation, min_precipitation, total_points, rain_category, granule_id
            FROM weather_region_summary
            WHERE observation_time = :obs_time AND region_type = 'NATIONAL'
            LIMIT 1;
        """), {"obs_time": target_dt})
        nat_row = nat_res.first()

        if not nat_row:
            # Fallback compute national on the fly
            nat_calc = await db.execute(text("""
                SELECT
                    ROUND(COALESCE(AVG(precipitation), 0)::numeric, 2) as avg_p,
                    ROUND(COALESCE(MAX(precipitation), 0)::numeric, 2) as max_p,
                    ROUND(COALESCE(MIN(precipitation), 0)::numeric, 2) as min_p,
                    COUNT(*) as pt_count,
                    COALESCE(MAX(granule_id), 'IMERG') as gid
                FROM precipitation_observations
                WHERE observation_time = :obs_time;
            """), {"obs_time": target_dt})
            c = nat_calc.first()
            max_p = float(c.max_p or 0.0)
            national_summary = {
                "avg_precipitation": float(c.avg_p or 0.0),
                "max_precipitation": max_p,
                "min_precipitation": float(c.min_p or 0.0),
                "total_points": int(c.pt_count or 0),
                "rain_category": _classify_rain(max_p),
                "granule_id": c.gid,
            }
        else:
            national_summary = {
                "avg_precipitation": float(nat_row.avg_precipitation or 0.0),
                "max_precipitation": float(nat_row.max_precipitation or 0.0),
                "min_precipitation": float(nat_row.min_precipitation or 0.0),
                "total_points": int(nat_row.total_points or 0),
                "rain_category": nat_row.rain_category,
                "granule_id": nat_row.granule_id,
            }

        # 2. Fetch all 36 State Summaries (Instant read from weather_region_summary joined with boundary_states)
        states_res = await db.execute(text("""
            SELECT
                s.state_name,
                s.min_lat, s.max_lat, s.min_lon, s.max_lon, s.center_lat, s.center_lon,
                COALESCE(w.avg_precipitation, 0.0) as avg_precipitation,
                COALESCE(w.max_precipitation, 0.0) as max_precipitation,
                COALESCE(w.min_precipitation, 0.0) as min_precipitation,
                COALESCE(w.total_points, 0) as total_points,
                COALESCE(w.rain_category, 'Clear / Dry') as rain_category
            FROM boundary_states s
            LEFT JOIN weather_region_summary w ON
                w.observation_time = :obs_time
                AND w.region_type = 'STATE'
                AND w.region_name = s.state_name
            ORDER BY w.max_precipitation DESC NULLS LAST, s.state_name ASC;
        """), {"obs_time": target_dt})
        state_rows = states_res.fetchall()

        state_summaries = [
            {
                "state_name": r.state_name,
                "avg_precipitation": float(r.avg_precipitation),
                "max_precipitation": float(r.max_precipitation),
                "min_precipitation": float(r.min_precipitation),
                "total_points": int(r.total_points),
                "rain_category": r.rain_category,
                "bbox": [r.min_lat, r.min_lon, r.max_lat, r.max_lon],
                "center": [r.center_lat, r.center_lon],
            }
            for r in state_rows
        ]

        # 3. Downsampled grid for hardware-accelerated canvas heatmap rendering
        # Rounds coordinates by grid_step to avoid sending 90,000 unneeded points
        grid_res = await db.execute(text("""
            SELECT
                ROUND((latitude / :step)::numeric) * :step as lat,
                ROUND((longitude / :step)::numeric) * :step as lon,
                ROUND(AVG(precipitation)::numeric, 1) as precip
            FROM precipitation_observations
            WHERE observation_time = :obs_time AND precipitation >= 0.1
            GROUP BY 1, 2
            ORDER BY 1, 2;
        """), {"obs_time": target_dt, "step": grid_step})
        grid_points = [
            [float(r.lat), float(r.lon), float(r.precip)]
            for r in grid_res.fetchall()
        ]

        result = {
            "status": "success",
            "observation_time": target_dt.isoformat(),
            "observation_ist": _to_ist_str(target_dt),
            "granule_id": national_summary.get("granule_id", "IMERG"),
            "national_summary": national_summary,
            "state_summaries": state_summaries,
            "grid_points": grid_points,
            "grid_step": grid_step,
        }
        _CACHE_OVERVIEW[cache_key] = result
        return result

    except Exception as e:
        logger.error(f"Error in /weather/india/overview: {e}", exc_info=True)
        return {
            "status": "error",
            "message": str(e),
            "state_summaries": [],
            "grid_points": [],
        }


# =============================================================================
# 3. STATE VIEW (State Detail + District Rollups + Detailed Observations)
# =============================================================================

@router.get("/state/{state_name}")
async def get_state_weather(
    state_name: str,
    db: AsyncSession = Depends(get_db),
    observation_time: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Retrieve detailed weather observations and district rollups for a selected state."""
    try:
        # Resolve state geometry & bbox
        st_res = await db.execute(text("""
            SELECT state_name, min_lat, max_lat, min_lon, max_lon, center_lat, center_lon
            FROM boundary_states
            WHERE state_name ILIKE :st
            LIMIT 1;
        """), {"st": state_name.strip()})
        state = st_res.first()
        if not state:
            raise HTTPException(status_code=404, detail=f"State '{state_name}' not found.")

        # Resolve observation time from ingestion_ledger
        if observation_time:
            target_dt = _parse_iso_time(observation_time)
        else:
            time_res = await db.execute(text("""
                SELECT observation_time
                FROM ingestion_ledger
                WHERE status = 'COMPLETED' AND row_count > 500
                ORDER BY observation_time DESC
                LIMIT 1;
            """))
            target_dt = time_res.scalar_one_or_none()
            if not target_dt:
                time_fb = await db.execute(text("""
                    SELECT observation_time
                    FROM ingestion_ledger
                    WHERE status = 'COMPLETED'
                    ORDER BY observation_time DESC
                    LIMIT 1;
                """))
                target_dt = time_fb.scalar_one_or_none()

        if not target_dt:
            return {
                "status": "no_data",
                "state_name": state.state_name,
                "message": "No observation records available.",
            }

        # Check in-memory cache
        cache_key = f"{state.state_name}_{target_dt.isoformat()}"
        if cache_key in _CACHE_STATE:
            return _CACHE_STATE[cache_key]

        # 1. State Summary - Check precomputed weather_region_summary first
        st_sum_res = await db.execute(text("""
            SELECT avg_precipitation, max_precipitation, min_precipitation, total_points, rain_category
            FROM weather_region_summary
            WHERE observation_time = :obs_time AND region_type = 'STATE' AND region_name ILIKE :st
            LIMIT 1;
        """), {"obs_time": target_dt, "st": state.state_name})
        st_sum_row = st_sum_res.first()

        if st_sum_row:
            state_summary = {
                "avg_precipitation": float(st_sum_row.avg_precipitation or 0.0),
                "max_precipitation": float(st_sum_row.max_precipitation or 0.0),
                "min_precipitation": float(st_sum_row.min_precipitation or 0.0),
                "total_points": int(st_sum_row.total_points or 0),
                "rain_category": st_sum_row.rain_category,
            }
        else:
            state_sum_res2 = await db.execute(text("""
                SELECT
                    ROUND(COALESCE(AVG(o.precipitation), 0)::numeric, 2) as avg_p,
                    ROUND(COALESCE(MAX(o.precipitation), 0)::numeric, 2) as max_p,
                    ROUND(COALESCE(MIN(o.precipitation), 0)::numeric, 2) as min_p,
                    COUNT(o.latitude) as pt_count
                FROM precipitation_observations o
                WHERE o.observation_time = :obs_time
                  AND o.latitude BETWEEN :min_lat AND :max_lat
                  AND o.longitude BETWEEN :min_lon AND :max_lon;
            """), {"obs_time": target_dt, "min_lat": state.min_lat, "max_lat": state.max_lat, "min_lon": state.min_lon, "max_lon": state.max_lon})
            st_sum = state_sum_res2.first()
            max_p = float(st_sum.max_p or 0.0) if st_sum else 0.0
            state_summary = {
                "avg_precipitation": float(st_sum.avg_p or 0.0) if st_sum else 0.0,
                "max_precipitation": max_p,
                "min_precipitation": float(st_sum.min_p or 0.0) if st_sum else 0.0,
                "total_points": int(st_sum.pt_count or 0) if st_sum else 0,
                "rain_category": _classify_rain(max_p),
            }

        # 2. Districts in this state with their precipitation rollups (CTE bounded by state bbox)
        dist_res = await db.execute(text("""
            WITH state_obs AS (
                SELECT latitude, longitude, precipitation
                FROM precipitation_observations
                WHERE observation_time = :obs_time
                  AND latitude BETWEEN :min_lat AND :max_lat
                  AND longitude BETWEEN :min_lon AND :max_lon
            )
            SELECT
                d.district_name,
                d.min_lat, d.max_lat, d.min_lon, d.max_lon, d.center_lat, d.center_lon,
                ROUND(COALESCE(AVG(o.precipitation), 0)::numeric, 2) as avg_p,
                ROUND(COALESCE(MAX(o.precipitation), 0)::numeric, 2) as max_p,
                ROUND(COALESCE(MIN(o.precipitation), 0)::numeric, 2) as min_p,
                COUNT(o.latitude) as pt_count
            FROM boundary_districts d
            LEFT JOIN state_obs o ON
                o.latitude BETWEEN d.min_lat AND d.max_lat
                AND o.longitude BETWEEN d.min_lon AND d.max_lon
            WHERE d.state_name ILIKE :st
            GROUP BY d.id, d.district_name, d.min_lat, d.max_lat, d.min_lon, d.max_lon, d.center_lat, d.center_lon
            ORDER BY avg_p DESC, d.district_name ASC;
        """), {
            "obs_time": target_dt,
            "min_lat": state.min_lat,
            "max_lat": state.max_lat,
            "min_lon": state.min_lon,
            "max_lon": state.max_lon,
            "st": f"%{state.state_name}%"
        })
        district_rows = dist_res.fetchall()

        district_summaries = [
            {
                "district_name": r.district_name,
                "avg_precipitation": float(r.avg_p),
                "max_precipitation": float(r.max_p),
                "min_precipitation": float(r.min_p),
                "total_points": int(r.pt_count),
                "rain_category": _classify_rain(float(r.max_p)),
                "bbox": [r.min_lat, r.min_lon, r.max_lat, r.max_lon],
                "center": [r.center_lat, r.center_lon],
            }
            for r in district_rows
        ]

        # 3. Observations points in state (Only points with measurable rain >= 0.1 mm/hr)
        # Avoids sending 4,000 zero-value points that are never rendered by the canvas!
        obs_res = await db.execute(text("""
            SELECT
                o.latitude, o.longitude, o.precipitation
            FROM precipitation_observations o
            WHERE o.observation_time = :obs_time
              AND o.latitude BETWEEN :min_lat AND :max_lat
              AND o.longitude BETWEEN :min_lon AND :max_lon
              AND o.precipitation >= 0.1
            LIMIT 2000;
        """), {"obs_time": target_dt, "min_lat": state.min_lat, "max_lat": state.max_lat, "min_lon": state.min_lon, "max_lon": state.max_lon})
        observations = [
            {
                "latitude": float(r.latitude),
                "longitude": float(r.longitude),
                "precipitation": float(r.precipitation),
                "liquid": float(r.precipitation),
                "ice": 0.0,
                "liquid_percent": 100.0,
            }
            for r in obs_res.fetchall()
        ]

        result = {
            "status": "success",
            "state_name": state.state_name,
            "observation_time": target_dt.isoformat(),
            "observation_ist": _to_ist_str(target_dt),
            "bbox": [state.min_lat, state.min_lon, state.max_lat, state.max_lon],
            "center": [state.center_lat, state.center_lon],
            "state_summary": state_summary,
            "district_summaries": district_summaries,
            "observations": observations,
        }
        _CACHE_STATE[cache_key] = result
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in /weather/state/{state_name}: {e}", exc_info=True)
        return {"status": "error", "message": str(e), "state_name": state_name}


# =============================================================================
# 4. DISTRICT VIEW (Exact District Observations + Nearby Anomalies)
# =============================================================================

@router.get("/district/{state_name}/{district_name}")
async def get_district_weather(
    state_name: str,
    district_name: str,
    db: AsyncSession = Depends(get_db),
    observation_time: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Retrieve detailed weather observations strictly within a district boundary."""
    try:
        # Match district with phonetic/alias support (e.g. Ahmedabad -> Ahmadabad)
        clean_dist = district_name.strip()
        search_terms = [clean_dist]
        if "ahmed" in clean_dist.lower():
            search_terms.append(clean_dist.lower().replace("ahmed", "ahmad"))
        elif "ahmad" in clean_dist.lower():
            search_terms.append(clean_dist.lower().replace("ahmad", "ahmed"))

        district = None
        for term in search_terms:
            dist_res = await db.execute(text("""
                SELECT id, state_name, district_name, min_lat, max_lat, min_lon, max_lon, center_lat, center_lon
                FROM boundary_districts
                WHERE district_name ILIKE :dist AND state_name ILIKE :st
                LIMIT 1;
            """), {"dist": f"%{term}%", "st": f"%{state_name.strip()}%"})
            district = dist_res.first()
            if district:
                break

        # Fallback if state name mismatch (e.g. Pune in Maharashtra)
        if not district:
            for term in search_terms:
                dist_res2 = await db.execute(text("""
                    SELECT id, state_name, district_name, min_lat, max_lat, min_lon, max_lon, center_lat, center_lon
                    FROM boundary_districts
                    WHERE district_name ILIKE :dist
                    LIMIT 1;
                """), {"dist": f"%{term}%"})
                district = dist_res2.first()
                if district:
                    break

        if not district:
            raise HTTPException(status_code=404, detail=f"District '{district_name}' not found.")

        # Resolve observation time from ingestion_ledger
        if observation_time:
            target_dt = _parse_iso_time(observation_time)
        else:
            time_res = await db.execute(text("""
                SELECT observation_time
                FROM ingestion_ledger
                WHERE status = 'COMPLETED' AND row_count > 500
                ORDER BY observation_time DESC
                LIMIT 1;
            """))
            target_dt = time_res.scalar_one_or_none()
            if not target_dt:
                time_fb = await db.execute(text("""
                    SELECT observation_time
                    FROM ingestion_ledger
                    WHERE status = 'COMPLETED'
                    ORDER BY observation_time DESC
                    LIMIT 1;
                """))
                target_dt = time_fb.scalar_one_or_none()

        if not target_dt:
            return {
                "status": "no_data",
                "state_name": district.state_name,
                "district_name": district.district_name,
                "message": "No observation data available.",
            }

        # Check in-memory cache
        cache_key = f"{district.state_name}_{district.district_name}_{target_dt.isoformat()}"
        if cache_key in _CACHE_DISTRICT:
            return _CACHE_DISTRICT[cache_key]

        # Query all observations inside district polygon
        obs_res = await db.execute(text("""
            SELECT
                o.latitude, o.longitude, o.precipitation, o.liquid, o.ice, o.liquid_percent
            FROM precipitation_observations o
            JOIN boundary_districts d ON d.id = :did
            WHERE o.observation_time = :obs_time
              AND o.latitude BETWEEN d.min_lat AND d.max_lat
              AND o.longitude BETWEEN d.min_lon AND d.max_lon
              AND ST_Intersects(o.geom, d.geom)
            ORDER BY o.precipitation DESC;
        """), {"did": district.id, "obs_time": target_dt})
        observations = [
            {
                "latitude": r.latitude,
                "longitude": r.longitude,
                "precipitation": r.precipitation,
                "liquid": r.liquid,
                "ice": r.ice,
                "liquid_percent": r.liquid_percent,
            }
            for r in obs_res.fetchall()
        ]

        if observations:
            precip_vals = [p["precipitation"] for p in observations]
            avg_p = round(sum(precip_vals) / len(precip_vals), 2)
            max_p = max(precip_vals)
            min_p = min(precip_vals)
        else:
            avg_p, max_p, min_p = 0.0, 0.0, 0.0

        district_summary = {
            "avg_precipitation": avg_p,
            "max_precipitation": max_p,
            "min_precipitation": min_p,
            "total_points": len(observations),
            "rain_category": _classify_rain(max_p),
        }

        # Check nearby anomalies
        anom_res = await db.execute(text("""
            SELECT observation_time, latitude, longitude, precipitation, anomaly_type, description
            FROM weather_anomalies
            WHERE latitude BETWEEN :min_lat AND :max_lat
              AND longitude BETWEEN :min_lon AND :max_lon
            ORDER BY observation_time DESC
            LIMIT 5;
        """), {
            "min_lat": district.min_lat - 0.2,
            "max_lat": district.max_lat + 0.2,
            "min_lon": district.min_lon - 0.2,
            "max_lon": district.max_lon + 0.2,
        })
        anomalies = [
            {
                "time": r.observation_time.isoformat(),
                "latitude": r.latitude,
                "longitude": r.longitude,
                "precipitation": r.precipitation,
                "type": r.anomaly_type,
                "description": r.description,
            }
            for r in anom_res.fetchall()
        ]

        result = {
            "status": "success",
            "state_name": district.state_name,
            "district_name": district.district_name,
            "observation_time": target_dt.isoformat(),
            "observation_ist": _to_ist_str(target_dt),
            "bbox": [district.min_lat, district.min_lon, district.max_lat, district.max_lon],
            "center": [district.center_lat, district.center_lon],
            "district_summary": district_summary,
            "observations": observations,
            "anomalies": anomalies,
        }
        _CACHE_DISTRICT[cache_key] = result
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in /weather/district: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


# =============================================================================
# 5. HISTORICAL OBSERVATIONS FOR SELECTED REGION
# =============================================================================

@router.get("/historical-series")
async def get_historical_series(
    db: AsyncSession = Depends(get_db),
    state_name: Optional[str] = Query(None),
    district_name: Optional[str] = Query(None),
    limit: int = Query(24, le=100),
) -> Dict[str, Any]:
    """Retrieve historical precipitation time-series for India, a state, or a district."""
    try:
        if district_name:
            # Query district history
            sql = text("""
                SELECT
                    o.observation_time,
                    ROUND(AVG(o.precipitation)::numeric, 2) as avg_p,
                    ROUND(MAX(o.precipitation)::numeric, 2) as max_p,
                    ROUND(MIN(o.precipitation)::numeric, 2) as min_p,
                    COUNT(o.latitude) as pt_count
                FROM precipitation_observations o
                JOIN boundary_districts d ON d.district_name ILIKE :dist
                WHERE o.latitude BETWEEN d.min_lat AND d.max_lat
                  AND o.longitude BETWEEN d.min_lon AND d.max_lon
                  AND ST_Intersects(o.geom, d.geom)
                GROUP BY o.observation_time
                ORDER BY o.observation_time DESC
                LIMIT :limit;
            """)
            params = {"dist": f"%{district_name.strip()}%", "limit": limit}
            region_label = f"District: {district_name}"

        elif state_name:
            # Query state history from weather_region_summary or observations
            sql = text("""
                SELECT
                    observation_time,
                    avg_precipitation as avg_p,
                    max_precipitation as max_p,
                    min_precipitation as min_p,
                    total_points as pt_count
                FROM weather_region_summary
                WHERE region_type = 'STATE' AND region_name ILIKE :st
                ORDER BY observation_time DESC
                LIMIT :limit;
            """)
            params = {"st": f"%{state_name.strip()}%", "limit": limit}
            region_label = f"State: {state_name}"

        else:
            # National history
            sql = text("""
                SELECT
                    observation_time,
                    avg_precipitation as avg_p,
                    max_precipitation as max_p,
                    min_precipitation as min_p,
                    total_points as pt_count
                FROM weather_region_summary
                WHERE region_type = 'NATIONAL'
                ORDER BY observation_time DESC
                LIMIT :limit;
            """)
            params = {"limit": limit}
            region_label = "National (India)"

        res = await db.execute(sql, params)
        rows = res.fetchall()

        timeline = [
            {
                "observation_time": r.observation_time.isoformat(),
                "observation_ist": _to_ist_str(r.observation_time),
                "avg_precipitation": float(r.avg_p or 0.0),
                "max_precipitation": float(r.max_p or 0.0),
                "min_precipitation": float(r.min_p or 0.0),
                "total_points": int(r.pt_count or 0),
            }
            for r in reversed(rows)  # Chronological order
        ]

        return {
            "status": "success",
            "region": region_label,
            "count": len(timeline),
            "timeline": timeline,
        }
    except Exception as e:
        logger.error(f"Error in /weather/historical-series: {e}")
        return {"status": "error", "message": str(e), "timeline": []}


# =============================================================================
# 6. SERVER-SENT EVENTS (SSE) LIVE UPDATE STREAM
# =============================================================================

@router.get("/live-stream")
async def live_weather_stream(request: Request):
    """Server-Sent Events (SSE) stream delivering instant notifications on new ingested weather data."""
    queue = weather_broadcaster.subscribe()

    async def event_generator():
        try:
            # Send initial connection greeting
            yield f"data: {json.dumps({'type': 'connected', 'message': 'Subscribed to live NASA IMERG ingestion stream'})}\n\n"

            while True:
                # Check for client disconnect
                if await request.is_disconnected():
                    break

                try:
                    # Wait up to 15s for new message, otherwise send keepalive ping
                    msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'ping', 'time': datetime.now(timezone.utc).isoformat()})}\n\n"

        except asyncio.CancelledError:
            pass
        finally:
            weather_broadcaster.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# =============================================================================
# 6.5 REAL-TIME INCREMENTAL WEBSOCKET STREAM
# =============================================================================

@router.websocket("/ws")
async def weather_websocket_endpoint(websocket: WebSocket):
    """Persistent bidirectional WebSocket connection for live incremental weather telemetry.
    
    Receives subscriptions for India, specific states, or specific districts, and streams
    only modified/new grid points and removals without full-dataset reload.
    """
    client_id = await weather_ws_manager.connect(websocket)
    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                msg = json.loads(data_text)
            except Exception:
                continue

            action = msg.get("action")
            if action == "subscribe":
                state = msg.get("state")
                district = msg.get("district")
                param = msg.get("parameter", "precipitation")
                bounds = msg.get("bounds")
                zoom = msg.get("zoom")
                await weather_ws_manager.update_subscription(
                    client_id=client_id,
                    state=state,
                    district=district,
                    parameter=param,
                    bounds=bounds,
                    zoom=zoom,
                )
            elif action == "ping":
                await weather_ws_manager.handle_ping(client_id)
            elif action == "unsubscribe":
                await weather_ws_manager.update_subscription(
                    client_id=client_id,
                    state=None,
                    district=None,
                )

    except WebSocketDisconnect:
        await weather_ws_manager.disconnect(client_id)
    except Exception as ex:
        logger.debug(f"WS client {client_id} disconnected: {ex}")
        await weather_ws_manager.disconnect(client_id)


# =============================================================================
# 7. BACKWARDS COMPATIBILITY (Preserved legacy endpoints)
# =============================================================================

@router.get("/current")
async def get_current_weather(
    db: AsyncSession = Depends(get_db),
    format: str = Query("summary", description="'summary' or 'geojson'"),
    limit: int = Query(500, le=5000, description="Max observation points if geojson format"),
) -> Dict[str, Any]:
    """Retrieve the most recent weather observation dataset across India."""
    try:
        time_query = text("SELECT MAX(observation_time) as max_time FROM precipitation_observations;")
        res = await db.execute(time_query)
        latest_time = res.scalar_one_or_none()

        if not latest_time:
            return {
                "status": "no_data",
                "message": "No observations recorded yet. Ingestion pipeline is warming up.",
                "latest_observation_time": None,
                "data": []
            }

        summary_query = text("""
            SELECT
                AVG(precipitation) as avg_p,
                MAX(precipitation) as max_p,
                MIN(precipitation) as min_p,
                COUNT(*) as total_points
            FROM precipitation_observations
            WHERE observation_time = :obs_time;
        """)
        s_res = await db.execute(summary_query, {"obs_time": latest_time})
        stats = s_res.first()

        response_data: Dict[str, Any] = {
            "status": "success",
            "observation_time": latest_time.isoformat(),
            "summary": {
                "average_precipitation_mm": round(float(stats.avg_p or 0.0), 2),
                "max_precipitation_mm": round(float(stats.max_p or 0.0), 2),
                "min_precipitation_mm": round(float(stats.min_p or 0.0), 2),
                "total_grid_points": int(stats.total_points or 0),
            }
        }

        if format == "geojson":
            pts_query = text("""
                SELECT
                    latitude, longitude, precipitation, ice, liquid, liquid_percent
                FROM precipitation_observations
                WHERE observation_time = :obs_time
                LIMIT :limit;
            """)
            pts_res = await db.execute(pts_query, {"obs_time": latest_time, "limit": limit})
            features = [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [r.longitude, r.latitude],
                    },
                    "properties": {
                        "precipitation": r.precipitation,
                        "ice": r.ice,
                        "liquid": r.liquid,
                        "liquid_percent": r.liquid_percent,
                    }
                }
                for r in pts_res.fetchall()
            ]
            response_data["geojson"] = {
                "type": "FeatureCollection",
                "features": features
            }

        return response_data

    except Exception as e:
        logger.error(f"Error in /weather/current: {e}")
        return {"status": "error", "message": str(e), "data": []}


@router.get("/historical")
async def get_historical_weather(
    db: AsyncSession = Depends(get_db),
    start_time: Optional[datetime] = Query(None, description="Start ISO timestamp"),
    end_time: Optional[datetime] = Query(None, description="End ISO timestamp"),
    min_lat: Optional[float] = Query(None),
    max_lat: Optional[float] = Query(None),
    min_lon: Optional[float] = Query(None),
    max_lon: Optional[float] = Query(None),
    limit: int = Query(500, le=5000),
) -> Dict[str, Any]:
    """Query historical precipitation observations filtered by time and spatial bounding box."""
    try:
        now = datetime.now(timezone.utc)
        start_time = start_time or (now - timedelta(days=7))
        end_time = end_time or now

        clauses = ["observation_time >= :start_time", "observation_time <= :end_time"]
        params: Dict[str, Any] = {"start_time": start_time, "end_time": end_time, "limit": limit}

        if min_lat is not None:
            clauses.append("latitude >= :min_lat")
            params["min_lat"] = min_lat
        if max_lat is not None:
            clauses.append("latitude <= :max_lat")
            params["max_lat"] = max_lat
        if min_lon is not None:
            clauses.append("longitude >= :min_lon")
            params["min_lon"] = min_lon
        if max_lon is not None:
            clauses.append("longitude <= :max_lon")
            params["max_lon"] = max_lon

        where_str = " AND ".join(clauses)
        sql = f"""
            SELECT
                observation_time, latitude, longitude, precipitation, ice, liquid, liquid_percent
            FROM precipitation_observations
            WHERE {where_str}
            ORDER BY observation_time DESC
            LIMIT :limit;
        """
        res = await db.execute(text(sql), params)
        rows = res.fetchall()

        return {
            "status": "success",
            "count": len(rows),
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "records": [
                {
                    "observation_time": r.observation_time.isoformat(),
                    "latitude": r.latitude,
                    "longitude": r.longitude,
                    "precipitation": r.precipitation,
                    "ice": r.ice,
                    "liquid": r.liquid,
                    "liquid_percent": r.liquid_percent,
                }
                for r in rows
            ]
        }
    except Exception as e:
        logger.error(f"Error in /weather/historical: {e}")
        return {"status": "error", "message": str(e), "records": []}


@router.get("/anomalies")
async def get_weather_anomalies(
    limit: int = Query(50, le=500),
) -> Dict[str, Any]:
    """Retrieve detected precipitation anomalies and heavy rainfall alerts."""
    anomalies = await analytics_aggregator.get_anomalies(limit=limit)
    return {
        "status": "success",
        "count": len(anomalies),
        "anomalies": anomalies,
    }


@router.get("/point")
async def get_point_weather(
    db: AsyncSession = Depends(get_db),
    latitude: float = Query(..., ge=-90.0, le=90.0, description="Target Latitude"),
    longitude: float = Query(..., ge=-180.0, le=180.0, description="Target Longitude"),
    radius_km: float = Query(25.0, ge=1.0, le=200.0, description="Spatial tolerance radius in km"),
    limit: int = Query(24, le=168, description="Time steps limit (e.g. 24 half-hours = 12 hrs)"),
) -> Dict[str, Any]:
    """Query nearest weather observation time-series at a specific coordinate (lat, lon)."""
    try:
        deg_radius = radius_km / 111.0

        sql = """
            SELECT
                observation_time,
                latitude,
                longitude,
                precipitation,
                ice,
                liquid,
                liquid_percent,
                SQRT(POW(latitude - :lat, 2) + POW(longitude - :lon, 2)) as distance_deg
            FROM precipitation_observations
            WHERE latitude BETWEEN :min_lat AND :max_lat
              AND longitude BETWEEN :min_lon AND :max_lon
            ORDER BY observation_time DESC, distance_deg ASC
            LIMIT :limit;
        """
        params = {
            "lat": latitude,
            "lon": longitude,
            "min_lat": latitude - deg_radius,
            "max_lat": latitude + deg_radius,
            "min_lon": longitude - deg_radius,
            "max_lon": longitude + deg_radius,
            "limit": limit,
        }
        res = await db.execute(text(sql), params)
        rows = res.fetchall()

        return {
            "status": "success",
            "target": {"latitude": latitude, "longitude": longitude},
            "radius_km": radius_km,
            "count": len(rows),
            "time_series": [
                {
                    "observation_time": r.observation_time.isoformat(),
                    "matched_coords": [r.latitude, r.longitude],
                    "precipitation": r.precipitation,
                    "ice": r.ice,
                    "liquid": r.liquid,
                    "liquid_percent": r.liquid_percent,
                }
                for r in rows
            ]
        }
    except Exception as e:
        logger.error(f"Error in /weather/point: {e}")
        return {"status": "error", "message": str(e), "time_series": []}
