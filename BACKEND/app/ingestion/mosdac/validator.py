"""Validator for ISRO MOSDAC INSAT-3DS raw granules and parsed observations."""

import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Tuple
import h5py
import numpy as np

logger = logging.getLogger(__name__)


class MosdacValidator:
    """Performs integrity, boundary, and physical limit validation on MOSDAC H5 files and extracted records."""

    REQUIRED_DATASETS = ["/HEM", "/Latitude", "/Longitude", "/time"]
    MAX_PHYSICAL_PRECIP_MM_HR = 500.0  # Physical Earth atmospheric limit

    def validate_raw_file(self, file_path: Path) -> Tuple[bool, List[str]]:
        """Validate that downloaded file is a genuine, uncorrupted HDF5 granule with required datasets."""
        errors: List[str] = []

        if not file_path.exists():
            return False, [f"File not found: {file_path}"]

        file_size = file_path.stat().st_size
        if file_size < 100 * 1024:  # Under 100 KB is truncated/invalid
            return False, [f"File size too small ({file_size} bytes): likely download error"]

        try:
            with h5py.File(file_path, "r") as h5:
                for ds in self.REQUIRED_DATASETS:
                    if ds not in h5:
                        errors.append(f"Missing required dataset: {ds}")
        except Exception as e:
            return False, [f"Corrupted or invalid HDF5 file ({type(e).__name__}: {e})"]

        is_valid = len(errors) == 0
        if not is_valid:
            logger.warning(f"[MOSDAC Validator] File validation failed for {file_path.name}: {errors}")
        return is_valid, errors

    def validate_parsed_data(self, parse_result: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Validate parsed observations for physical limits, bounds, and temporal integrity."""
        errors: List[str] = []
        summary = parse_result.get("summary", {})

        # 1. Temporal integrity
        obs_time_str = summary.get("observation_time_utc")
        if not obs_time_str:
            errors.append("Missing observation_time_utc in parsed summary")
        else:
            try:
                obs_time = datetime.fromisoformat(obs_time_str)
                now = datetime.now(timezone.utc)
                # Max 15 minutes future leeway for satellite clock skew
                if obs_time > now + timedelta(minutes=15):
                    errors.append(f"Observation time {obs_time} is in the future relative to {now}")
            except Exception as e:
                errors.append(f"Invalid observation timestamp format: {e}")

        # 2. Point count validation
        total_points = summary.get("total_points", 0)
        if total_points < 1000:
            errors.append(f"Suspiciously low point count inside India: {total_points} cells")

        # 3. Physical precipitation limits
        max_precip = summary.get("max_precipitation_mm_hr", 0.0)
        if max_precip < 0.0:
            errors.append(f"Negative precipitation rate found: {max_precip} mm/hr")
        if max_precip > self.MAX_PHYSICAL_PRECIP_MM_HR:
            errors.append(
                f"Precipitation exceeds physical atmospheric limit: {max_precip} > {self.MAX_PHYSICAL_PRECIP_MM_HR} mm/hr"
            )

        # 4. Coordinate range sanity
        lats = parse_result.get("lats")
        lons = parse_result.get("lons")
        if lats is not None and len(lats) > 0:
            min_lat, max_lat = float(np.min(lats)), float(np.max(lats))
            if min_lat < 5.0 or max_lat > 39.0:
                errors.append(f"Latitude range [{min_lat}, {max_lat}] out of expected bounds for India")

        if lons is not None and len(lons) > 0:
            min_lon, max_lon = float(np.min(lons)), float(np.max(lons))
            if min_lon < 66.0 or max_lon > 99.0:
                errors.append(f"Longitude range [{min_lon}, {max_lon}] out of expected bounds for India")

        is_valid = len(errors) == 0
        if not is_valid:
            logger.warning(f"[MOSDAC Validator] Parsed data validation failed: {errors}")
        else:
            logger.info(
                f"[MOSDAC Validator] Validation passed for granule {summary.get('granule_id')}: "
                f"{total_points:,} points, max={max_precip} mm/hr."
            )
        return is_valid, errors


mosdac_validator = MosdacValidator()
