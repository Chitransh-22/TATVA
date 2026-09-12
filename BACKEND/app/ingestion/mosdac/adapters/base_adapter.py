"""Base Adapter and Common Geo-processing for MOSDAC Products."""

import json
import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import h5py
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import shape

from app.config import settings, BACKEND_DIR
from app.ingestion.mosdac.registry import get_product_definition

logger = logging.getLogger(__name__)

INDIA_BOUNDARY_PATH = BACKEND_DIR / "data" / "boundaries" / "india_boundary.geojson"


def to_scalar(val: Any, default: Any = 0.0) -> Any:
    """Safely extract scalar from numpy array or HDF5 attribute."""
    if val is None:
        return default
    arr = np.asarray(val).ravel()
    return arr[0] if len(arr) > 0 else default


class BaseMosdacAdapter(ABC):
    """Abstract base adapter for MOSDAC product extraction, coordinate transformation, and clipping."""

    def __init__(self, product_id: str, boundary_path: Optional[Path] = None):
        self.product_id = product_id
        self.metadata = get_product_definition(product_id) or {}
        self._boundary_path = boundary_path or INDIA_BOUNDARY_PATH
        self._india_polygon: Optional[Any] = None
        self._load_boundary()

    def _load_boundary(self) -> None:
        """Load and cache Survey of India boundary polygon."""
        try:
            if self._boundary_path.exists():
                with open(self._boundary_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._india_polygon = shape(data["features"][0]["geometry"])
                logger.debug(f"[{self.product_id}] Loaded boundary polygon from {self._boundary_path}")
            else:
                logger.warning(f"[{self.product_id}] Boundary file not found at {self._boundary_path}")
        except Exception as e:
            logger.error(f"[{self.product_id}] Failed to load boundary GeoJSON: {e}")

    def extract_observation_time(self, h5: h5py.File, granule_id: str) -> datetime:
        """Extract observation timestamp from /time dataset or filename."""
        time_ds = h5.get("/time")
        if time_ds is not None and len(time_ds) > 0:
            time_raw = float(time_ds[0])
            # Minutes since 2000-01-01 00:00:00 UTC
            return datetime(2000, 1, 1, 0, 0, 0, tzinfo=timezone.utc) + timedelta(minutes=time_raw)

        # Fallback: extract from standard ISRO filename e.g., 3SIMG_12SEP2026_1400_L2B_CTP_V01R00
        parts = granule_id.split("_")
        if len(parts) >= 3:
            try:
                date_str = parts[1]  # 12SEP2026
                time_str = parts[2]  # 1400
                return datetime.strptime(f"{date_str}_{time_str}", "%d%b%Y_%H%M").replace(tzinfo=timezone.utc)
            except Exception:
                pass

        return datetime.now(timezone.utc)

    def clip_coordinates_to_india(
        self,
        lats: np.ndarray,
        lons: np.ndarray,
        values: np.ndarray,
        secondary: Optional[np.ndarray] = None,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray]]:
        """Filter coordinates strictly inside India bounding box and Survey of India boundary."""
        if len(lats) == 0:
            return lats, lons, values, secondary

        # 1. Bounding box pre-filter
        lat_min = getattr(settings, "INDIA_LAT_MIN", 6.0)
        lat_max = getattr(settings, "INDIA_LAT_MAX", 37.5)
        lon_min = getattr(settings, "INDIA_LON_MIN", 68.0)
        lon_max = getattr(settings, "INDIA_LON_MAX", 97.5)

        bbox_mask = (
            (lats >= lat_min)
            & (lats <= lat_max)
            & (lons >= lon_min)
            & (lons <= lon_max)
        )

        lats_bb = lats[bbox_mask]
        lons_bb = lons[bbox_mask]
        vals_bb = values[bbox_mask]
        sec_bb = secondary[bbox_mask] if secondary is not None else None

        # 2. Vectorized polygon clipping
        if self._india_polygon is not None and len(lats_bb) > 0:
            inside_mask = shapely.contains_xy(self._india_polygon, lons_bb, lats_bb)
            return (
                lats_bb[inside_mask],
                lons_bb[inside_mask],
                vals_bb[inside_mask],
                sec_bb[inside_mask] if sec_bb is not None else None,
            )

        return lats_bb, lons_bb, vals_bb, sec_bb

    @abstractmethod
    def parse(
        self,
        h5_path: Path,
        clip_to_india: bool = True,
        save_csv: bool = True,
    ) -> Dict[str, Any]:
        """Parse raw HDF5 granule and return structured observation records."""
        pass
