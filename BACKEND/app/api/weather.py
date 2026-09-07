import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database.connection import get_db
from app.analytics.aggregator import analytics_aggregator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weather", tags=["Weather Analytics"])


@router.get("/current")
async def get_current_weather(
    db: AsyncSession = Depends(get_db),
    format: str = Query("summary", description="'summary' or 'geojson'"),
    limit: int = Query(500, le=5000, description="Max observation points if geojson format"),
) -> Dict[str, Any]:
    """Retrieve the most recent weather observation dataset across India."""
    try:
        # Find latest observation_time
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

        # Query summary metrics
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
        return {
            "status": "error",
            "message": str(e),
            "data": []
        }


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
        # Spatial query using bounding distance box approx: 1 deg lat ~ 111 km
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
