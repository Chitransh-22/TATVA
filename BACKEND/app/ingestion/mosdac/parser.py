"""ISRO MOSDAC INSAT-3DS HDF5 (HEM) Data Parser & India Boundary Clipper."""

import json
import logging
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import h5py
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import shape

from app.config import settings, BACKEND_DIR

logger = logging.getLogger(__name__)

# Official Survey of India boundary GeoJSON path
INDIA_BOUNDARY_PATH = BACKEND_DIR / "data" / "boundaries" / "india_boundary.geojson"


class MosdacParser:
    """Parses INSAT-3DS Level-2B Hydro-Estimator Precipitation (.h5) granules.
    
    Extracts raw raster matrices, scales coordinates, and performs high-speed vectorized
    spatial clipping against the official Survey of India boundary polygon using Shapely C-engine.
    """

    def __init__(self, boundary_path: Optional[Path] = None):
        self._boundary_path = boundary_path or INDIA_BOUNDARY_PATH
        self._india_polygon: Optional[Any] = None
        self._load_boundary()

    def _load_boundary(self) -> None:
        """Load and cache the official Survey of India boundary geometry."""
        try:
            if self._boundary_path.exists():
                with open(self._boundary_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._india_polygon = shape(data["features"][0]["geometry"])
                logger.info(f"[MOSDAC Parser] Loaded India boundary from {self._boundary_path} ({self._india_polygon.geom_type})")
            else:
                logger.warning(f"[MOSDAC Parser] Boundary file not found at {self._boundary_path}")
        except Exception as e:
            logger.error(f"[MOSDAC Parser] Failed to load boundary GeoJSON: {e}")

    def parse_granule_h5(
        self,
        h5_path: Path,
        clip_to_india: bool = True,
        save_csv: bool = True,
    ) -> Dict[str, Any]:
        """Parse HDF5 file, clip to India, compute statistics, and prepare tabular observations."""
        start_time = time.time()
        granule_id = h5_path.stem
        if not h5_path.exists():
            raise FileNotFoundError(f"MOSDAC granule file not found: {h5_path}")

        logger.info(f"[MOSDAC Parser] Parsing H5 granule {granule_id} from {h5_path}...")

        with h5py.File(h5_path, "r") as h5:
            # 1. Observation Time Extraction
            time_ds = h5.get("/time")
            if time_ds is not None and len(time_ds) > 0:
                time_raw = float(time_ds[0])
                # Minutes since 2000-01-01 00:00:00 UTC
                obs_time = datetime(2000, 1, 1, 0, 0, 0, tzinfo=timezone.utc) + timedelta(minutes=time_raw)
            else:
                # Fallback to parsing filename: 3SIMG_12SEP2026_1100_L2B_HEM_V01R00
                parts = granule_id.split("_")
                obs_time = datetime.strptime(
                    f"{parts[1]}_{parts[2]}", "%d%b%Y_%H%M"
                ).replace(tzinfo=timezone.utc)

            # 2. Extract HEM (Hydro-Estimator Rainfall in mm/hr)
            hem_ds = h5.get("/HEM")
            if hem_ds is None:
                raise KeyError("Missing '/HEM' dataset in MOSDAC HDF5 file")

            if hem_ds.ndim == 3:
                hem = hem_ds[0, :, :]
            else:
                hem = hem_ds[:, :]

            # 3. Extract Coordinates and scale factors
            lat_ds = h5.get("/Latitude")
            lon_ds = h5.get("/Longitude")
            if lat_ds is None or lon_ds is None:
                raise KeyError("Missing '/Latitude' or '/Longitude' dataset in MOSDAC HDF5 file")

            def _to_scalar(val, default):
                if val is None:
                    return default
                arr = np.asarray(val).ravel()
                return arr[0] if len(arr) > 0 else default

            lat_scale = float(_to_scalar(lat_ds.attrs.get("scale_factor"), 0.01))
            lon_scale = float(_to_scalar(lon_ds.attrs.get("scale_factor"), 0.01))
            lat_fill = int(_to_scalar(lat_ds.attrs.get("_FillValue"), 32767))
            lon_fill = int(_to_scalar(lon_ds.attrs.get("_FillValue"), 32767))

            lat_raw = lat_ds[:, :]
            lon_raw = lon_ds[:, :]

        h5_read_time = time.time() - start_time
        logger.debug(f"[MOSDAC Parser] Read H5 data arrays in {h5_read_time:.3f}s")

        # 4. Mask fill values and invalid pixels
        # Fill values: HEM == -999.0, lat/lon == 32767
        valid_mask = (hem >= 0.0) & (lat_raw != lat_fill) & (lon_raw != lon_fill)
        
        lats_valid = lat_raw[valid_mask] * lat_scale
        lons_valid = lon_raw[valid_mask] * lon_scale
        hem_valid = hem[valid_mask].astype(np.float32)

        # 5. Spatial bounding box filter (India approximate extent)
        lat_min = getattr(settings, "INDIA_LAT_MIN", 6.0)
        lat_max = getattr(settings, "INDIA_LAT_MAX", 37.5)
        lon_min = getattr(settings, "INDIA_LON_MIN", 68.0)
        lon_max = getattr(settings, "INDIA_LON_MAX", 97.5)

        bbox_mask = (
            (lats_valid >= lat_min)
            & (lats_valid <= lat_max)
            & (lons_valid >= lon_min)
            & (lons_valid <= lon_max)
        )
        lats_bbox = lats_valid[bbox_mask]
        lons_bbox = lons_valid[bbox_mask]
        hem_bbox = hem_valid[bbox_mask]

        # 6. Exact Survey of India Polygon Clipping
        if clip_to_india and self._india_polygon is not None and len(lats_bbox) > 0:
            clip_start = time.time()
            inside_mask = shapely.contains_xy(self._india_polygon, lons_bbox, lats_bbox)
            lats_final = lats_bbox[inside_mask]
            lons_final = lons_bbox[inside_mask]
            hem_final = hem_bbox[inside_mask]
            clip_time = time.time() - clip_start
            logger.info(
                f"[MOSDAC Parser] Vectorized polygon clipping completed in {clip_time:.3f}s. "
                f"Points inside India: {len(lats_final):,}"
            )
        else:
            lats_final = lats_bbox
            lons_final = lons_bbox
            hem_final = hem_bbox

        total_points = len(lats_final)
        active_rain_mask = hem_final > 0.0
        active_rain_count = int(np.sum(active_rain_mask))

        max_precip = float(np.max(hem_final)) if total_points > 0 else 0.0
        mean_precip = float(np.mean(hem_final)) if total_points > 0 else 0.0
        mean_active_precip = float(np.mean(hem_final[active_rain_mask])) if active_rain_count > 0 else 0.0

        # Construct DataFrame for DB bulk loading
        df = pd.DataFrame({
            "granule_id": granule_id,
            "observation_time": obs_time,
            "latitude": np.round(lats_final, 4),
            "longitude": np.round(lons_final, 4),
            "precipitation": np.round(hem_final, 2),
            "ice": None,
            "liquid": None,
            "liquid_percent": None,
            "num_precip_half_hour": None,
            "num_valid_half_hour": None,
            "source": "MOSDAC",
            "product": "INSAT-3DS_HEM",
        })

        # Save transformed CSV if requested
        csv_path = None
        if save_csv:
            settings.ensure_directories()
            csv_path = settings.DATA_MOSDAC_TRANSFORMED_DIR / f"{granule_id}.csv"
            df.to_csv(csv_path, index=False)
            logger.info(f"[MOSDAC Parser] Saved transformed observation CSV to {csv_path}")

        # Compute IST time
        ist_offset = timedelta(hours=5, minutes=30)
        obs_time_ist = obs_time + ist_offset
        current_time_utc = datetime.now(timezone.utc)
        data_age_minutes = round((current_time_utc - obs_time).total_seconds() / 60.0, 1)

        total_elapsed = time.time() - start_time

        summary = {
            "granule_id": granule_id,
            "dataset": "3SIMG_L2B_HEM",
            "satellite": "INSAT-3DS",
            "sensor": "Imager",
            "product": "Hydro-Estimator Method (HEM)",
            "observation_time_utc": obs_time.isoformat(),
            "observation_time_ist": obs_time_ist.strftime("%Y-%m-%d %H:%M:%S IST"),
            "data_age_minutes": data_age_minutes,
            "is_live_fresh": data_age_minutes < 180,  # < 3 hours is fresh
            "total_points": total_points,
            "active_rain_points": active_rain_count,
            "max_precipitation_mm_hr": round(max_precip, 2),
            "mean_precipitation_mm_hr": round(mean_precip, 2),
            "mean_active_precipitation_mm_hr": round(mean_active_precip, 2),
            "heavy_rain_points": int(np.sum(hem_final >= 15.0)),
            "extreme_rain_points": int(np.sum(hem_final >= 50.0)),
            "processing_latency_seconds": round(total_elapsed, 3),
            "csv_path": str(csv_path) if csv_path else None,
            "raw_h5_path": str(h5_path),
        }

        logger.info(
            f"[MOSDAC Parser] Parsed {granule_id}: {total_points:,} cells inside India, "
            f"{active_rain_count:,} active rain, max={max_precip:.1f} mm/hr, age={data_age_minutes}m."
        )

        return {
            "summary": summary,
            "dataframe": df,
            "lats": lats_final,
            "lons": lons_final,
            "precip": hem_final,
        }


mosdac_parser = MosdacParser()
