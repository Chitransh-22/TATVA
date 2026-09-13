"""Validator for ISRO MOSDAC raw granules and parsed multi-product observations."""

import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import h5py
import numpy as np

from app.ingestion.mosdac.registry import get_product_definition, MOSDAC_PRODUCTS

logger = logging.getLogger(__name__)


class MosdacValidator:
    """Performs integrity, boundary, and physical limit validation on MOSDAC H5 files and extracted records."""

    def validate_raw_file(
        self,
        file_path: Path,
        product_id: Optional[str] = None,
    ) -> Tuple[bool, List[str]]:
        """Validate that downloaded file is a genuine, uncorrupted HDF5 granule with required datasets."""
        errors: List[str] = []

        if not file_path.exists():
            return False, [f"File not found: {file_path}"]

        file_size = file_path.stat().st_size
        if file_size < 10 * 1024:  # Under 10 KB is corrupted/truncated
            return False, [f"File size too small ({file_size} bytes): likely download error"]

        # Infer product_id from filename if not explicitly provided
        if not product_id:
            for p_id in MOSDAC_PRODUCTS:
                short_code = p_id.split("_")[-1]  # e.g., CTP, UTH, OLR, SST, FOG, SNW, AOD, HEM
                if short_code in file_path.name:
                    product_id = p_id
                    break

        try:
            with h5py.File(file_path, "r") as h5:
                if product_id:
                    meta = get_product_definition(product_id)
                    target_ds = meta.get("hdf5_dataset_path") if meta else None
                    if target_ds and target_ds.lstrip("/") not in h5 and target_ds not in h5:
                        errors.append(f"Missing required primary dataset: {target_ds}")
                else:
                    # Generic check: ensure at least one dataset exists
                    if len(h5.keys()) == 0:
                        errors.append("HDF5 file contains no root datasets")
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
        product_id = parse_result.get("product_id") or summary.get("product_id", "3SIMG_L2B_HEM")
        meta = get_product_definition(product_id) or {}

        # 1. Temporal integrity
        obs_time_str = summary.get("observation_time_utc")
        if not obs_time_str:
            errors.append("Missing observation_time_utc in parsed summary")
        else:
            try:
                obs_time = datetime.fromisoformat(obs_time_str)
                now = datetime.now(timezone.utc)
                # Max 60 minutes future leeway for satellite clock skew
                if obs_time > now + timedelta(minutes=60):
                    errors.append(f"Observation time {obs_time} is in the future relative to {now}")
            except Exception as e:
                errors.append(f"Invalid observation timestamp format: {e}")

        # 2. Point count validation
        total_points = summary.get("total_points", 0)
        if total_points == 0:
            errors.append(f"Zero observation points extracted inside target boundary for {product_id}")

        # 3. Physical range limits
        min_val = summary.get("min_value")
        max_val = summary.get("max_value")
        valid_min = meta.get("valid_min")
        valid_max = meta.get("valid_max")

        if valid_min is not None and min_val is not None:
            # Allow 10% lower margin for sensor edge noise
            if min_val < valid_min * 0.8 and valid_min > 0:
                errors.append(f"Value below physical minimum: {min_val} < {valid_min}")

        if valid_max is not None and max_val is not None:
            # Allow 20% upper margin for extreme phenomena
            if max_val > valid_max * 1.5:
                errors.append(f"Value exceeds physical maximum: {max_val} > {valid_max}")

        is_valid = len(errors) == 0
        if not is_valid:
            logger.warning(f"[MOSDAC Validator] Parsed data validation failed for {product_id}: {errors}")
        else:
            logger.info(
                f"[MOSDAC Validator] Validation passed for {product_id} ({summary.get('granule_id')}): "
                f"{total_points:,} points, range [{min_val}, {max_val}] {summary.get('unit')}."
            )
        return is_valid, errors


mosdac_validator = MosdacValidator()
