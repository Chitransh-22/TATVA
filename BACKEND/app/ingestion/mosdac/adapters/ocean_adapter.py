"""Ocean & Marine Domain Adapters for MOSDAC Products (SST, Scatterometer Wind, Chlorophyll)."""

import logging
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import h5py
import numpy as np
import pandas as pd

from app.config import settings
from app.ingestion.mosdac.adapters.base_adapter import BaseMosdacAdapter, to_scalar

logger = logging.getLogger(__name__)


class OceanMosdacAdapter(BaseMosdacAdapter):
    """Parses Ocean & Marine category MOSDAC satellite products."""

    def parse(
        self,
        h5_path: Path,
        clip_to_india: bool = False,  # Ocean products cover maritime regions around India
        save_csv: bool = True,
    ) -> Dict[str, Any]:
        """Parse raw HDF5 granule according to its ocean product schema."""
        start_time = time.time()
        granule_id = h5_path.stem
        if not h5_path.exists():
            raise FileNotFoundError(f"MOSDAC ocean granule not found: {h5_path}")

        logger.info(f"[{self.product_id}] Parsing ocean granule {granule_id} from {h5_path}...")

        with h5py.File(h5_path, "r") as h5:
            obs_time = self.extract_observation_time(h5, granule_id)

            if self.product_id == "3SIMG_L2B_SST":
                lats, lons, values, secondary, unit = self._parse_sst(h5)
            else:
                raise NotImplementedError(f"Ocean product '{self.product_id}' currently marked unavailable or not implemented.")

        # Maritime regional bounding box filter (Arabian Sea, Bay of Bengal, Equatorial Indian Ocean)
        # Lat: -5.0 to 30.0, Lon: 50.0 to 105.0
        ocean_mask = (
            (lats >= -5.0) & (lats <= 30.0) &
            (lons >= 50.0) & (lons <= 105.0)
        )
        lats_final = lats[ocean_mask]
        lons_final = lons[ocean_mask]
        vals_final = values[ocean_mask]
        sec_final = secondary[ocean_mask] if secondary is not None else None

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
            "category": "ocean",
            "observation_time": obs_time,
            "latitude": np.round(lats_final, 4),
            "longitude": np.round(lons_final, 4),
            "value": np.round(vals_final, 2),
            "secondary_value": np.round(sec_final, 2) if sec_final is not None else None,
            "unit": unit,
            "state": None,
            "district": None,
        })

        csv_path = None
        if save_csv:
            out_dir = settings.DATA_MOSDAC_TRANSFORMED_DIR / "ocean"
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
            "category": "ocean",
            "satellite": "INSAT-3DS",
            "sensor": "Imager",
            "observation_time_utc": obs_time.isoformat(),
            "observation_time_ist": obs_time_ist.strftime("%Y-%m-%d %H:%M:%S IST"),
            "data_age_minutes": age_minutes,
            "is_live_fresh": age_minutes < 180,
            "total_points": total_points,
            "valid_points": total_points,
            "min_value": round(min_val, 2),
            "max_value": round(max_val, 2),
            "mean_value": round(mean_val, 2),
            "unit": unit,
            "processing_latency_seconds": round(latency, 3),
            "csv_path": str(csv_path) if csv_path else None,
            "raw_h5_path": str(h5_path),
        }

        logger.info(
            f"[{self.product_id}] Parsed {granule_id}: {total_points:,} ocean cells, "
            f"SST range [{min_val:.1f}, {max_val:.1f}] {unit}, latency={latency:.2f}s."
        )

        return {
            "product_id": self.product_id,
            "category": "ocean",
            "summary": summary,
            "dataframe": df,
            "lats": lats_final,
            "lons": lons_final,
            "values": vals_final,
            "secondary_values": sec_final,
        }

    def _parse_sst(self, h5: h5py.File) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray], str]:
        """Extract Sea Surface Temperature in Celsius (°C)."""
        sst_ds = h5["/SST_REG"]
        sst_raw = sst_ds[0, :, :] if sst_ds.ndim == 3 else sst_ds[:, :]

        lat_ds = h5["/Latitude"]
        lon_ds = h5["/Longitude"]
        lat_scale = float(to_scalar(lat_ds.attrs.get("scale_factor"), 0.01))
        lon_scale = float(to_scalar(lon_ds.attrs.get("scale_factor"), 0.01))
        lat_fill = int(to_scalar(lat_ds.attrs.get("_FillValue"), 32767))
        lon_fill = int(to_scalar(lon_ds.attrs.get("_FillValue"), 32767))

        lat_raw = lat_ds[:, :]
        lon_raw = lon_ds[:, :]

        # Valid SST in Kelvin: 270.0 to 315.0 K (~ -3°C to 42°C)
        mask = (sst_raw >= 270.0) & (sst_raw <= 315.0) & (lat_raw != lat_fill) & (lon_raw != lon_fill)
        lats = lat_raw[mask] * lat_scale
        lons = lon_raw[mask] * lon_scale
        sst_kelvin = sst_raw[mask].astype(np.float32)

        # Convert Kelvin to Celsius
        sst_celsius = sst_kelvin - 273.15

        return lats, lons, sst_celsius, sst_kelvin, "°C"
