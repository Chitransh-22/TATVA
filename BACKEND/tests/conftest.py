import os
import sys
from pathlib import Path

# Add BACKEND directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import zipfile
import tempfile
import pytest
from datetime import datetime, timezone
import numpy as np
import rasterio
from rasterio._env import set_proj_data_search_path
set_proj_data_search_path(os.path.join(os.path.dirname(rasterio.__file__), "proj_data"))
from rasterio.transform import from_origin
from fastapi.testclient import TestClient

from app.config import settings

settings.ENVIRONMENT = "test"
settings.SCHEDULER_ENABLED = False
settings.KAFKA_ENABLED = False

from app.main import app

@pytest.fixture(scope="session")
def test_client():
    """Create a FastAPI test client."""
    with TestClient(app) as client:
        yield client


@pytest.fixture
def synthetic_imerg_bundle(tmp_path):
    """Generate a realistic synthetic NASA IMERG ZIP granule with 6 GeoTIFF layers."""
    granule_id = "3B-HHR-L.MS.MRG.3IMERG.20260903-S053000-E055959.0330.V07C.7day"
    zip_filename = f"{granule_id}.zip"
    
    layers = {
        "precipitation": f"{granule_id}.tif",
        "ice": f"{granule_id}.ice.tif",
        "liquid": f"{granule_id}.liquid.tif",
        "liquidPercent": f"{granule_id}.liquidPercent.tif",
        "numPrecipHalfHour": f"{granule_id}.numPrecipHalfHour.tif",
        "numValidHalfHour": f"{granule_id}.numValidHalfHour.tif",
    }

    # 4x4 grid positioned over Central India (lat: 20-20.4, lon: 78-78.4)
    rows, cols = 4, 4
    # Affine transform: west=78.0, north=20.4, xres=0.1, yres=0.1
    transform = from_origin(78.0, 20.4, 0.1, 0.1)
    
    staging_dir = tmp_path / "tifs"
    staging_dir.mkdir(parents=True, exist_ok=True)
    created_paths = {}

    for layer_name, filename in layers.items():
        filepath = staging_dir / filename
        if layer_name == "precipitation":
            data = np.array([
                [0.0, 5.2, 12.4, 0.5],
                [1.2, 25.0, 48.3, 2.1],
                [0.0, 15.6, 82.0, 0.0],
                [0.0, 0.0, 4.2, 1.0],
            ], dtype=np.float32)
        elif layer_name == "ice":
            data = np.full((rows, cols), 0.5, dtype=np.float32)
        elif layer_name == "liquid":
            data = np.full((rows, cols), 4.5, dtype=np.float32)
        elif layer_name == "liquidPercent":
            data = np.full((rows, cols), 90.0, dtype=np.float32)
        elif layer_name == "numPrecipHalfHour":
            data = np.full((rows, cols), 1, dtype=np.int32)
        else: # numValidHalfHour
            data = np.full((rows, cols), 1, dtype=np.int32)

        with rasterio.open(
            str(filepath),
            "w",
            driver="GTiff",
            height=rows,
            width=cols,
            count=1,
            dtype=data.dtype,
            crs="EPSG:4326",
            transform=transform,
        ) as dst:
            dst.write(data, 1)

        created_paths[layer_name] = filepath

    # Pack into ZIP archive
    zip_path = tmp_path / zip_filename
    with zipfile.ZipFile(zip_path, "w") as z:
        for filepath in created_paths.values():
            z.write(filepath, arcname=filepath.name)

    return {
        "granule_id": granule_id,
        "zip_path": zip_path,
        "layer_paths": created_paths,
        "rows": rows,
        "cols": cols,
        "observation_time": datetime(2026, 9, 3, 5, 30, 0, tzinfo=timezone.utc),
    }
