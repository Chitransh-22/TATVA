import pandas as pd
from pathlib import Path
from app.ingestion.converter import convert_imerg_to_standard_csv


def test_converter_generation(synthetic_imerg_bundle, tmp_path):
    granule_id = synthetic_imerg_bundle["granule_id"]
    layers = synthetic_imerg_bundle["layer_paths"]
    obs_time = synthetic_imerg_bundle["observation_time"]
    out_csv = tmp_path / "output.csv"

    summary = convert_imerg_to_standard_csv(
        files=layers,
        granule_id=granule_id,
        observation_time=obs_time,
        output_file=out_csv,
        clip_to_india=False,  # Test full grid first
    )

    assert out_csv.exists()
    assert summary["row_count"] == 16
    assert summary["max_precipitation"] == 82.0

    # Inspect CSV structure
    df = pd.read_csv(out_csv)
    assert len(df) == 16
    expected_cols = [
        "granule_id",
        "observation_time",
        "latitude",
        "longitude",
        "precipitation",
        "ice",
        "liquid",
        "liquid_percent",
        "num_precip_half_hour",
        "num_valid_half_hour",
    ]
    for col in expected_cols:
        assert col in df.columns

    # Verify coordinate meshgrid calculation
    # Since affine transform: west=78.0, north=20.4, xres=0.1, yres=0.1
    assert df["longitude"].min() >= 78.0
    assert df["latitude"].max() <= 20.4
