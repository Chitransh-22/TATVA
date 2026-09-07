import os
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional, Any, Union
import numpy as np
import pandas as pd
import rasterio
from rasterio._env import set_proj_data_search_path
_rasterio_proj = os.path.join(os.path.dirname(rasterio.__file__), "proj_data")
if os.path.exists(_rasterio_proj):
    set_proj_data_search_path(_rasterio_proj)
from app.config import settings

logger = logging.getLogger(__name__)


def convert_imerg_to_standard_csv(
    files: Dict[str, Union[str, Path]],
    granule_id: str,
    observation_time: datetime,
    output_file: Optional[Union[str, Path]] = None,
    clip_to_india: Optional[bool] = None,
) -> Dict[str, Any]:
    """Convert NASA IMERG GeoTIFF rasters into standardized observation CSV.
    
    Reuses the affine transform and coordinate meshgrid approach from the 
    application's core converter component.
    """
    if clip_to_india is None:
        clip_to_india = settings.CLIP_TO_INDIA

    if output_file is None:
        output_file = settings.DATA_TRANSFORMED_DIR / f"{granule_id}.csv"
    output_file = Path(output_file)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # --------------------------------------------------
    # READ RASTERS
    # --------------------------------------------------
    arrays: Dict[str, np.ndarray] = {}
    transform = None
    crs = None
    rows = None
    cols = None

    # Ensure precipitation layer exists
    if "precipitation" not in files:
        raise ValueError("Missing 'precipitation' raster layer in input files.")

    # Read base precipitation layer first to extract affine metadata
    precip_path = str(files["precipitation"])
    logger.info(f"Reading precipitation raster from {precip_path}...")
    with rasterio.open(precip_path) as src:
        arrays["precipitation"] = src.read(1)
        transform = src.transform
        crs = src.crs
        rows = src.height
        cols = src.width

    # Read remaining layers
    for name, filepath in files.items():
        if name == "precipitation":
            continue
        try:
            with rasterio.open(str(filepath)) as src:
                arr = src.read(1)
                if arr.shape != (rows, cols):
                    raise ValueError(
                        f"Layer {name} shape {arr.shape} does not match base shape ({rows}, {cols})"
                    )
                arrays[name] = arr
        except Exception as e:
            logger.warning(f"Could not read layer {name} ({filepath}): {e}. Filling with defaults.")
            arrays[name] = np.zeros((rows, cols), dtype=np.float32)

    # Ensure all expected secondary layers are populated
    for layer in ["ice", "liquid", "liquidPercent", "numPrecipHalfHour", "numValidHalfHour"]:
        if layer not in arrays:
            arrays[layer] = np.zeros((rows, cols), dtype=np.float32)

    # --------------------------------------------------
    # CREATE LATITUDE / LONGITUDE GRID (AFFINE PIXEL CENTERS)
    # --------------------------------------------------
    logger.info("Computing coordinate meshgrid via affine transform...")
    row_indices, col_indices = np.meshgrid(
        np.arange(rows),
        np.arange(cols),
        indexing="ij"
    )

    # Pixel CENTER coordinates
    longitude = (
        transform.c
        + (col_indices + 0.5) * transform.a
        + (row_indices + 0.5) * transform.b
    )

    latitude = (
        transform.f
        + (col_indices + 0.5) * transform.d
        + (row_indices + 0.5) * transform.e
    )

    # --------------------------------------------------
    # SPATIAL FILTERING / CLIPPING
    # --------------------------------------------------
    if clip_to_india:
        logger.info(
            f"Filtering coordinates to India extent: "
            f"lat [{settings.INDIA_LAT_MIN}, {settings.INDIA_LAT_MAX}], "
            f"lon [{settings.INDIA_LON_MIN}, {settings.INDIA_LON_MAX}]"
        )
        mask = (
            (latitude >= settings.INDIA_LAT_MIN)
            & (latitude <= settings.INDIA_LAT_MAX)
            & (longitude >= settings.INDIA_LON_MIN)
            & (longitude <= settings.INDIA_LON_MAX)
        )
    else:
        mask = np.ones((rows, cols), dtype=bool)

    # Extract masked coordinate arrays
    lat_subset = latitude[mask]
    lon_subset = longitude[mask]

    # Handle negative nodata values (e.g. -9999.0 in IMERG)
    precip_arr = arrays["precipitation"][mask].astype(np.float32)
    precip_arr = np.where(precip_arr < 0, np.nan, precip_arr)

    ice_arr = arrays["ice"][mask].astype(np.float32)
    ice_arr = np.where(ice_arr < 0, 0.0, ice_arr)

    liquid_arr = arrays["liquid"][mask].astype(np.float32)
    liquid_arr = np.where(liquid_arr < 0, 0.0, liquid_arr)

    liquid_pct = arrays["liquidPercent"][mask].astype(np.float32)
    liquid_pct = np.where(liquid_pct < 0, 0.0, liquid_pct)

    num_precip = arrays["numPrecipHalfHour"][mask].astype(np.int32)
    num_precip = np.where(num_precip < 0, 0, num_precip)

    num_valid = arrays["numValidHalfHour"][mask].astype(np.int32)
    num_valid = np.where(num_valid < 0, 0, num_valid)

    # --------------------------------------------------
    # CONSTRUCT STANDARDIZED DATAFRAME
    # --------------------------------------------------
    logger.info("Constructing standardized observation DataFrame...")
    obs_time_iso = observation_time.isoformat()

    df = pd.DataFrame({
        "granule_id": granule_id,
        "observation_time": obs_time_iso,
        "latitude": np.round(lat_subset, 4),
        "longitude": np.round(lon_subset, 4),
        "precipitation": np.round(precip_arr, 2),
        "ice": np.round(ice_arr, 2),
        "liquid": np.round(liquid_arr, 2),
        "liquid_percent": np.round(liquid_pct, 2),
        "num_precip_half_hour": num_precip,
        "num_valid_half_hour": num_valid,
    })

    # Drop rows where precipitation is completely invalid / NaN
    df = df.dropna(subset=["precipitation"])

    # --------------------------------------------------
    # SAVE STANDARDIZED CSV
    # --------------------------------------------------
    logger.info(f"Writing CSV to {output_file} ({len(df):,} rows)...")
    df.to_csv(output_file, index=False)

    summary = {
        "output_file": str(output_file.resolve()),
        "row_count": len(df),
        "crs": str(crs),
        "min_lat": float(df["latitude"].min()) if len(df) > 0 else 0.0,
        "max_lat": float(df["latitude"].max()) if len(df) > 0 else 0.0,
        "min_lon": float(df["longitude"].min()) if len(df) > 0 else 0.0,
        "max_lon": float(df["longitude"].max()) if len(df) > 0 else 0.0,
        "mean_precipitation": float(df["precipitation"].mean()) if len(df) > 0 else 0.0,
        "max_precipitation": float(df["precipitation"].max()) if len(df) > 0 else 0.0,
    }
    logger.info(f"Conversion complete: {summary}")
    return summary
