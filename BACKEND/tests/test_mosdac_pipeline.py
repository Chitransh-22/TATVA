"""Unit and integration tests for ISRO MOSDAC INSAT-3DS Weather Pipeline."""

from datetime import datetime, timezone
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.config import settings, BACKEND_DIR
from app.main import app
from app.ingestion.mosdac.client import mosdac_client
from app.ingestion.mosdac.parser import mosdac_parser
from app.ingestion.mosdac.validator import mosdac_validator
from app.ingestion.mosdac.pipeline import mosdac_pipeline


def test_mosdac_client_configuration():
    """Verify MOSDAC client settings and endpoints."""
    assert settings.MOSDAC_DEFAULT_DATASET == "3SIMG_L2B_HEM"
    assert "gettoken" in settings.MOSDAC_TOKEN_URL
    assert "datasets.json" in settings.MOSDAC_SEARCH_URL
    assert "download" in settings.MOSDAC_DOWNLOAD_URL
    assert settings.MOSDAC_USERNAME != ""
    assert settings.MOSDAC_PASSWORD != ""


def test_mosdac_validator_rules(tmp_path):
    """Verify validator catches empty or corrupt files and valid structures."""
    # 1. Non-existent file
    valid, errors = mosdac_validator.validate_raw_file(tmp_path / "missing.h5")
    assert not valid
    assert any("not found" in e.lower() for e in errors)

    # 2. Empty / tiny file
    tiny_file = tmp_path / "tiny.h5"
    tiny_file.write_bytes(b"not an hdf5 file")
    valid, errors = mosdac_validator.validate_raw_file(tiny_file)
    assert not valid
    assert any("too small" in e.lower() or "corrupted" in e.lower() for e in errors)

    # 3. Parsed data physical validation
    valid_summary = {
        "summary": {
            "granule_id": "test_granule",
            "observation_time_utc": datetime.now(timezone.utc).isoformat(),
            "total_points": 50000,
            "max_precipitation_mm_hr": 45.2,
        },
        "lats": [15.0, 20.0, 25.0],
        "lons": [75.0, 80.0, 85.0],
    }
    valid, errors = mosdac_validator.validate_parsed_data(valid_summary)
    assert valid
    assert len(errors) == 0

    # 4. Extreme physical limit exceeded
    invalid_summary = {
        "summary": {
            "granule_id": "test_granule",
            "observation_time_utc": datetime.now(timezone.utc).isoformat(),
            "total_points": 50000,
            "max_precipitation_mm_hr": 999.0,  # Physically impossible
        },
        "lats": [15.0, 20.0],
        "lons": [75.0, 80.0],
    }
    valid, errors = mosdac_validator.validate_parsed_data(invalid_summary)
    assert not valid
    assert any("limit" in e.lower() for e in errors)


def test_mosdac_api_endpoints():
    """Verify all MOSDAC REST API endpoints."""
    client = TestClient(app)

    # 1. Health check
    res_health = client.get("/api/weather/mosdac/health")
    assert res_health.status_code == 200
    data_health = res_health.json()
    assert data_health["has_credentials"] is True
    assert data_health["default_dataset"] == "3SIMG_L2B_HEM"

    # 2. Latest summary
    res_latest = client.get("/api/weather/mosdac/latest")
    assert res_latest.status_code == 200
    data_latest = res_latest.json()
    assert data_latest["status"] == "SUCCESS"
    assert "INSAT-3DS" in data_latest["data"]["satellite"]
    assert data_latest["data"]["total_points"] > 0

    # 3. Points
    res_points = client.get("/api/weather/mosdac/points?min_rain=1.0&limit=50")
    assert res_points.status_code == 200
    data_points = res_points.json()
    assert data_points["status"] == "SUCCESS"
    assert len(data_points["points"]) <= 50

    # 4. Comparison
    res_comp = client.get("/api/weather/mosdac/comparison")
    assert res_comp.status_code == 200
    data_comp = res_comp.json()
    assert data_comp["status"] == "SUCCESS"
    assert data_comp["comparison"]["isro_mosdac"]["solves_stale_problem"] is True
    assert data_comp["comparison"]["nasa_imerg"]["solves_stale_problem"] is False
