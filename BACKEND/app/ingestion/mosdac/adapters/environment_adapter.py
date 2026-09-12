"""Environment Domain Adapters for MOSDAC Products (Snow Cover, Aerosol Optical Depth)."""

import logging
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import h5py
import numpy as np
import pandas as pd
import pyproj

from app.config import settings
from app.ingestion.mosdac.adapters.base_adapter import BaseMosdacAdapter, to_scalar

logger = logging.getLogger(__name__)


class EnvironmentMosdacAdapter(BaseMosdacAdapter):
    """Parses Environment category MOSDAC satellite products."""

    def parse(
        self,
        h5_path: Path,
        clip_to_india: bool = True,
        save_csv: bool = True,
    ) -> Dict[str, Any]:
        """Parse raw HDF5 granule according to its environment product schema."""
        start_time = time.time()
        granule_id = h5_path.stem
        if not h5_path.exists():
            raise FileNotFoundError(f"MOSDAC environment granule not found: {h5_path}")

        logger.info(f"[{self.product_id}] Parsing environment granule {granule_id} from {h5_path}...")

        with h5py.File(h5_path, "r") as h5:
            obs_time = self.extract_observation_time(h5, granule_id)

            if self.product_id == "3SIMG_L2C_SNW":
                lats, lons, values, secondary, unit = self._parse_snow(h5)
            elif self.product_id == "3SIMG_L2G_AOD":
                lats, lons, values, secondary, unit = self._parse_aod(h5)
            else:
                raise NotImplementedError(f"Environment product '{self.product_id}' currently marked unavailable or not implemented.")

        # Spatial clipping to Survey of India boundary
        if clip_to_india:
            lats_final, lons_final, vals_final, sec_final = self.clip_coordinates_to_india(
                lats, lons, values, secondary
            )
        else:
            lats_final, lons_final, vals_final, sec_final = lats, lons, values, secondary

        total_points = len(lats_final)
        if total_points > 0:
            min_val = float(np.min(vals_final))
            max_val = float(np.max(vals_final))
            mean_val = float(np.mean(vals_final))
        else:
            min_val, max_val, mean_val = 0.0, 0.0, 0.0

        # Construct DataFrame
        df = pd.DataFrame({
            "granule_id": granule_id,
            "product_id": self.product_id,
            "category": "environment",
            "observation_time": obs_time,
            "latitude": np.round(lats_final, 4),
            "longitude": np.round(lons_final, 4),
            "value": np.round(vals_final, 3),
            "secondary_value": np.round(sec_final, 2) if sec_final is not None else None,
            "unit": unit,
            "state": None,
            "district": None,
        })

        csv_path = None
        if save_csv:
            out_dir = settings.DATA_MOSDAC_TRANSFORMED_DIR / "environment"
            out_dir.mkdir(parents=True, exist_ok=True)
            csv_path = out_dir / f"{granule_id}.csv"
            df.to_csv(csv_path, index=False)

        ist_offset = timedelta(hours=5, minutes=30)
        obs_time_ist = obs_time + ist_offset
        now_utc = datetime.now(timezone.utc)
        age_minutes = round((now_utc - obs_time).total_seconds() / 60.0, 1)
        latency = time.time() - start_time

        summary = {
            "granule_id": granule_id,
            "product_id": self.product_id,
            "category": "environment",
            "satellite": "INSAT-3DS",
            "sensor": "Imager",
            "observation_time_utc": obs_time.isoformat(),
            "observation_time_ist": obs_time_ist.strftime("%Y-%m-%d %H:%M:%S IST"),
            "data_age_minutes": age_minutes,
            "is_live_fresh": age_minutes < 180,
            "total_points": total_points,
            "valid_points": total_points,
            "min_value": round(min_val, 3),
            "max_value": round(max_val, 3),
            "mean_value": round(mean_val, 3),
            "unit": unit,
            "processing_latency_seconds": round(latency, 3),
            "csv_path": str(csv_path) if csv_path else None,
            "raw_h5_path": str(h5_path),
        }

        logger.info(
            f"[{self.product_id}] Parsed {granule_id}: {total_points:,} cells inside India, "
            f"range [{min_val:.3f}, {max_val:.3f}] {unit}, latency={latency:.2f}s."
        )

        return {
            "product_id": self.product_id,
            "category": "environment",
            "summary": summary,
            "dataframe": df,
            "lats": lats_final,
            "lons": lons_final,
            "values": vals_final,
            "secondary_values": sec_final,
        }

    def _parse_snow(self, h5: h5py.File) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray], str]:
        """Extract Fractional Snow Cover (%) and binary Snow mask with Mercator projection inverse."""
        fsc_ds = h5["/FSC"]
        snw_ds = h5.get("/SNW")
        fsc_raw = fsc_ds[0, :, :] if fsc_ds.ndim == 3 else fsc_ds[:, :]
        snw_raw = (snw_ds[0, :, :] if snw_ds.ndim == 3 else snw_ds[:, :]) if snw_ds is not None else None

        x_coords = h5["/X"][:]
        y_coords = h5["/Y"][:]

        # 2D Mercator coordinate meshgrid
        xx, yy = np.meshgrid(x_coords, y_coords)

        # Inverse projection (Mercator, origin lon 75.0, lat 0.0)
        proj_snw = pyproj.Proj(proj="merc", lon_0=75.0, lat_ts=0.0, a=6378137.0, b=6356752.3142)
        lons_2d, lats_2d = proj_snw(xx, yy, inverse=True)

        # In MOSDAC FSC, values are fraction (0.0 to 1.0) or percentage (0 to 100).
        # We scale 0.0-1.0 to percentage 0.0-100.0%.
        # Filter valid snow fraction >= 0.0
        mask = (fsc_raw >= 0.0) & (fsc_raw <= 100.0)
        lats = lats_2d[mask]
        lons = lons_2d[mask]
        vals = fsc_raw[mask].astype(np.float32)

        # If max is <= 1.5, values are normalized fraction 0-1, convert to percentage
        if len(vals) > 0 and np.max(vals) <= 1.5:
            vals = np.clip(vals * 100.0, 0.0, 100.0)

        sec = snw_raw[mask].astype(np.float32) if snw_raw is not None else None
        return lats, lons, vals, sec, "%"

    def _parse_aod(self, h5: h5py.File) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray], str]:
        """Extract Aerosol Optical Depth (650 nm) from regular lat/lon grid."""
        aod_ds = h5["/AOD"]
        aod_raw = aod_ds[0, :, :] if aod_ds.ndim == 3 else aod_ds[:, :]

        lat_1d = h5["/latitude"][:]
        lon_1d = h5["/longitude"][:]

        # Build 2D regular grid
        lons_2d, lats_2d = np.meshgrid(lon_1d, lat_1d)

        # Valid AOD: 0.01 to 3.5 (fill is -999.0)
        mask = (aod_raw >= 0.01) & (aod_raw <= 3.5)
        lats = lats_2d[mask]
        lons = lons_2d[mask]
        vals = aod_raw[mask].astype(np.float32)

        return lats, lons, vals, None, "Optical Thickness"
