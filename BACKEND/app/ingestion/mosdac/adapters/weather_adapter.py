"""Weather Domain Adapters for MOSDAC Products (HEM, CTP, UTH, OLR, FOG)."""

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


class WeatherMosdacAdapter(BaseMosdacAdapter):
    """Parses Weather category MOSDAC satellite products."""

    def parse(
        self,
        h5_path: Path,
        clip_to_india: bool = True,
        save_csv: bool = True,
    ) -> Dict[str, Any]:
        """Parse raw HDF5 granule according to its specific weather product schema."""
        start_time = time.time()
        granule_id = h5_path.stem
        if not h5_path.exists():
            raise FileNotFoundError(f"MOSDAC granule not found: {h5_path}")

        logger.info(f"[{self.product_id}] Parsing weather granule {granule_id} from {h5_path}...")

        with h5py.File(h5_path, "r") as h5:
            obs_time = self.extract_observation_time(h5, granule_id)

            if self.product_id in ("3SIMG_L2B_HEM", "3SIMG_L2G_IMR"):
                lats, lons, values, secondary, unit = self._parse_rainfall(h5)
            elif self.product_id == "3SIMG_L2B_CTP":
                lats, lons, values, secondary, unit = self._parse_ctp(h5)
            elif self.product_id == "3SIMG_L2B_UTH":
                lats, lons, values, secondary, unit = self._parse_uth(h5)
            elif self.product_id == "3SIMG_L2B_OLR":
                lats, lons, values, secondary, unit = self._parse_olr(h5)
            elif self.product_id == "3SIMG_L2C_FOG":
                lats, lons, values, secondary, unit = self._parse_fog(h5)
            else:
                raise NotImplementedError(f"Unsupported weather product: {self.product_id}")

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

        # Construct DataFrame for DB bulk loading
        df = pd.DataFrame({
            "granule_id": granule_id,
            "product_id": self.product_id,
            "category": "weather",
            "observation_time": obs_time,
            "latitude": np.round(lats_final, 4),
            "longitude": np.round(lons_final, 4),
            "value": np.round(vals_final, 2),
            "secondary_value": np.round(sec_final, 2) if sec_final is not None else None,
            "unit": unit,
            "state": None,
            "district": None,
        })

        # Save transformed CSV if requested
        csv_path = None
        if save_csv:
            out_dir = settings.DATA_MOSDAC_TRANSFORMED_DIR / "weather"
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
            "category": "weather",
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

        # If rainfall, add active rain count and specialized metrics
        if self.product_id in ("3SIMG_L2B_HEM", "3SIMG_L2G_IMR"):
            active_mask = vals_final > 0.0
            summary["active_rain_points"] = int(np.sum(active_mask))
            summary["max_precipitation_mm_hr"] = round(max_val, 2)
            summary["mean_precipitation_mm_hr"] = round(mean_val, 2)

        logger.info(
            f"[{self.product_id}] Parsed {granule_id}: {total_points:,} cells inside India, "
            f"range [{min_val:.1f}, {max_val:.1f}] {unit}, latency={latency:.2f}s."
        )

        return {
            "product_id": self.product_id,
            "category": "weather",
            "summary": summary,
            "dataframe": df,
            "lats": lats_final,
            "lons": lons_final,
            "values": vals_final,
            "secondary_values": sec_final,
        }

    def _parse_rainfall(self, h5: h5py.File) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray], str]:
        """Extract HEM / IMR precipitation."""
        # Check for 1D coordinates (IMR)
        if "/latitude" in h5 or "latitude" in h5:
            ds_name = "/IMR" if "/IMR" in h5 else "IMR"
            ds = h5[ds_name]
            raw_rain = ds[0, :, :] if ds.ndim == 3 else ds[:, :]
            lat_ds = h5["/latitude"] if "/latitude" in h5 else h5["latitude"]
            lon_ds = h5["/longitude"] if "/longitude" in h5 else h5["longitude"]
            lat_1d = lat_ds[:]
            lon_1d = lon_ds[:]
            lon_2d, lat_2d = np.meshgrid(lon_1d, lat_1d)
            fill_val = to_scalar(ds.attrs.get("_FillValue"), -999.0)
            mask = (raw_rain >= 0.0) & (raw_rain != fill_val) & np.isfinite(raw_rain)
            lats = lat_2d[mask].astype(np.float64)
            lons = lon_2d[mask].astype(np.float64)
            vals = raw_rain[mask].astype(np.float32)
            return lats, lons, vals, None, "mm/hr"

        ds_name = "/HEM" if "/HEM" in h5 else "/IMR"
        ds = h5[ds_name]
        raw_rain = ds[0, :, :] if ds.ndim == 3 else ds[:, :]

        lat_ds = h5["/Latitude"]
        lon_ds = h5["/Longitude"]
        lat_scale = float(to_scalar(lat_ds.attrs.get("scale_factor"), 0.01))
        lon_scale = float(to_scalar(lon_ds.attrs.get("scale_factor"), 0.01))
        lat_fill = int(to_scalar(lat_ds.attrs.get("_FillValue"), 32767))
        lon_fill = int(to_scalar(lon_ds.attrs.get("_FillValue"), 32767))

        lat_raw = lat_ds[:, :]
        lon_raw = lon_ds[:, :]

        mask = (raw_rain >= 0.0) & (lat_raw != lat_fill) & (lon_raw != lon_fill)
        lats = lat_raw[mask] * lat_scale
        lons = lon_raw[mask] * lon_scale
        vals = raw_rain[mask].astype(np.float32)
        return lats, lons, vals, None, "mm/hr"

    def _parse_ctp(self, h5: h5py.File) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray], str]:
        """Extract Cloud Top Pressure (hPa) and Temperature (K)."""
        ctp_ds = h5["/CTP"]
        ctt_ds = h5.get("/CTT")
        ctp_raw = ctp_ds[0, :, :] if ctp_ds.ndim == 3 else ctp_ds[:, :]
        ctt_raw = (ctt_ds[0, :, :] if ctt_ds.ndim == 3 else ctt_ds[:, :]) if ctt_ds is not None else None

        lat_ds = h5["/Latitude"]
        lon_ds = h5["/Longitude"]
        lat_scale = float(to_scalar(lat_ds.attrs.get("scale_factor"), 0.01))
        lon_scale = float(to_scalar(lon_ds.attrs.get("scale_factor"), 0.01))
        lat_fill = int(to_scalar(lat_ds.attrs.get("_FillValue"), 31172))
        lon_fill = int(to_scalar(lon_ds.attrs.get("_FillValue"), 31172))

        lat_raw = lat_ds[:, :]
        lon_raw = lon_ds[:, :]

        # Valid CTP range: 50.0 to 1050.0 hPa
        mask = (ctp_raw >= 50.0) & (ctp_raw <= 1050.0) & (lat_raw != lat_fill) & (lon_raw != lon_fill)
        lats = lat_raw[mask] * lat_scale
        lons = lon_raw[mask] * lon_scale
        vals = ctp_raw[mask].astype(np.float32)
        sec = ctt_raw[mask].astype(np.float32) if ctt_raw is not None else None
        return lats, lons, vals, sec, "hPa"

    def _parse_uth(self, h5: h5py.File) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray], str]:
        """Extract Upper Tropospheric Humidity (%)."""
        uth_ds = h5["/UTH"]
        uth_raw = uth_ds[0, :, :] if uth_ds.ndim == 3 else uth_ds[:, :]

        lat_ds = h5["/Latitude"]
        lon_ds = h5["/Longitude"]
        lat_scale = float(to_scalar(lat_ds.attrs.get("scale_factor"), 0.01))
        lon_scale = float(to_scalar(lon_ds.attrs.get("scale_factor"), 0.01))
        lat_fill = int(to_scalar(lat_ds.attrs.get("_FillValue"), 32767))
        lon_fill = int(to_scalar(lon_ds.attrs.get("_FillValue"), 32767))

        lat_raw = lat_ds[:, :]
        lon_raw = lon_ds[:, :]

        # Valid UTH range: 0.0 to 100.0 %
        mask = (uth_raw >= 0.0) & (uth_raw <= 100.0) & (lat_raw != lat_fill) & (lon_raw != lon_fill)
        lats = lat_raw[mask] * lat_scale
        lons = lon_raw[mask] * lon_scale
        vals = uth_raw[mask].astype(np.float32)
        return lats, lons, vals, None, "%"

    def _parse_olr(self, h5: h5py.File) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray], str]:
        """Extract Outgoing Longwave Radiation (W/m^2)."""
        olr_ds = h5["/OLR"]
        olr_raw = olr_ds[0, :, :] if olr_ds.ndim == 3 else olr_ds[:, :]

        lat_ds = h5["/Latitude"]
        lon_ds = h5["/Longitude"]
        lat_scale = float(to_scalar(lat_ds.attrs.get("scale_factor"), 0.01))
        lon_scale = float(to_scalar(lon_ds.attrs.get("scale_factor"), 0.01))
        lat_fill = int(to_scalar(lat_ds.attrs.get("_FillValue"), 32767))
        lon_fill = int(to_scalar(lon_ds.attrs.get("_FillValue"), 32767))

        lat_raw = lat_ds[:, :]
        lon_raw = lon_ds[:, :]

        # Valid OLR range: 50.0 to 400.0 W/m^2
        mask = (olr_raw >= 50.0) & (olr_raw <= 400.0) & (lat_raw != lat_fill) & (lon_raw != lon_fill)
        lats = lat_raw[mask] * lat_scale
        lons = lon_raw[mask] * lon_scale
        vals = olr_raw[mask].astype(np.float32)
        return lats, lons, vals, None, "W/m²"

    def _parse_fog(self, h5: h5py.File) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray], str]:
        """Extract Fog mask (0/1) and intensity (1-4) with Mercator projection inverse."""
        fog_ds = h5["/FOG"]
        intensity_ds = h5.get("/FOG_INTENSITY")
        fog_raw = fog_ds[0, :, :] if fog_ds.ndim == 3 else fog_ds[:, :]
        intensity_raw = (intensity_ds[0, :, :] if intensity_ds.ndim == 3 else intensity_ds[:, :]) if intensity_ds is not None else None

        x_coords = h5["/X"][:]
        y_coords = h5["/Y"][:]

        # Build 2D Mercator coordinate meshgrid
        xx, yy = np.meshgrid(x_coords, y_coords)

        # Inverse project to geographic coordinates (lat/lon in WGS84)
        proj_fog = pyproj.Proj(proj="merc", lon_0=77.25, lat_ts=17.75, a=6378137.0, b=6356752.3142)
        lons_2d, lats_2d = proj_fog(xx, yy, inverse=True)

        # Valid mask: FOG in [0, 1] (not -128)
        mask = (fog_raw >= 0) & (fog_raw <= 1)
        lats = lats_2d[mask]
        lons = lons_2d[mask]
        vals = fog_raw[mask].astype(np.float32)
        sec = intensity_raw[mask].astype(np.float32) if intensity_raw is not None else None
        return lats, lons, vals, sec, "Mask"
