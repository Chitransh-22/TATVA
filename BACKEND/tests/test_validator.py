import pytest
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone
from app.ingestion.validator import granule_validator


def test_validator_valid_csv(synthetic_imerg_bundle, tmp_path):
    from app.ingestion.converter import convert_imerg_to_standard_csv
    
    granule_id = synthetic_imerg_bundle["granule_id"]
    layers = synthetic_imerg_bundle["layer_paths"]
    obs_time = synthetic_imerg_bundle["observation_time"]
    valid_csv = tmp_path / "valid.csv"

    convert_imerg_to_standard_csv(
        files=layers,
        granule_id=granule_id,
        observation_time=obs_time,
        output_file=valid_csv,
        clip_to_india=False,
    )

    is_valid, errors, stats = granule_validator.validate_csv(valid_csv)
    assert is_valid is True
    assert len(errors) == 0
    assert stats["sample_row_count"] == 16


def test_validator_missing_column(tmp_path):
    bad_csv = tmp_path / "missing_col.csv"
    df = pd.DataFrame({
        "granule_id": ["TEST"],
        "observation_time": ["2026-09-03T05:30:00Z"],
        "latitude": [20.0],
        # longitude is missing!
        "precipitation": [5.0],
    })
    df.to_csv(bad_csv, index=False)

    is_valid, errors, stats = granule_validator.validate_csv(bad_csv)
    assert is_valid is False
    assert any("Missing required columns" in err for err in errors)


def test_validator_out_of_bounds_coords(tmp_path):
    bad_csv = tmp_path / "bad_coords.csv"
    df = pd.DataFrame({
        "granule_id": ["TEST"],
        "observation_time": ["2026-09-03T05:30:00Z"],
        "latitude": [120.0],  # Out of bounds!
        "longitude": [78.0],
        "precipitation": [5.0],
        "ice": [0.0],
        "liquid": [5.0],
        "liquid_percent": [100.0],
        "num_precip_half_hour": [1],
        "num_valid_half_hour": [1],
    })
    df.to_csv(bad_csv, index=False)

    is_valid, errors, stats = granule_validator.validate_csv(bad_csv)
    assert is_valid is False
    assert any("Latitude out of bounds" in err for err in errors)


def test_validator_negative_precip(tmp_path):
    bad_csv = tmp_path / "bad_precip.csv"
    df = pd.DataFrame({
        "granule_id": ["TEST"],
        "observation_time": ["2026-09-03T05:30:00Z"],
        "latitude": [20.0],
        "longitude": [78.0],
        "precipitation": [-5.0],  # Negative precipitation!
        "ice": [0.0],
        "liquid": [0.0],
        "liquid_percent": [0.0],
        "num_precip_half_hour": [1],
        "num_valid_half_hour": [1],
    })
    df.to_csv(bad_csv, index=False)

    is_valid, errors, stats = granule_validator.validate_csv(bad_csv)
    assert is_valid is False
    assert any("negative precipitation" in err for err in errors)
