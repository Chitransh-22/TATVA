import pytest
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.ingestion.pipeline import pipeline_service

@pytest.mark.asyncio
async def test_live_map_api_end_to_end():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Test Metadata
        res = await client.get("/api/weather/metadata")
        assert res.status_code == 200
        meta = res.json()
        assert meta["status"] == "success"
        assert meta["is_live"] is True
        assert "IST" in meta["latest_observation_ist"]
        assert meta["total_observations_recorded"] > 0
        assert len(meta["available_timestamps"]) > 0

        latest_time = meta["latest_observation_time"]

        # 2. Test India Overview
        res = await client.get(f"/api/weather/india/overview?observation_time={latest_time}")
        assert res.status_code == 200
        overview = res.json()
        assert overview["status"] == "success"
        assert "national_summary" in overview
        assert overview["national_summary"]["total_points"] > 0
        assert len(overview["state_summaries"]) == 36
        assert len(overview["grid_points"]) > 0

        # Verify Maharashtra is among the states
        mh_summary = next((s for s in overview["state_summaries"] if s["state_name"] == "Maharashtra"), None)
        assert mh_summary is not None
        assert mh_summary["total_points"] > 0
        assert len(mh_summary["bbox"]) == 4

        # 3. Test State View: Maharashtra
        res = await client.get(f"/api/weather/state/Maharashtra?observation_time={latest_time}")
        assert res.status_code == 200
        st = res.json()
        assert st["status"] == "success"
        assert st["state_name"] == "Maharashtra"
        assert len(st["district_summaries"]) > 0
        assert len(st["observations"]) > 0

        # Verify Pune is among Maharashtra's districts
        pune_dist = next((d for d in st["district_summaries"] if "pune" in d["district_name"].lower()), None)
        assert pune_dist is not None

        # 4. Test District View: Pune
        res = await client.get(f"/api/weather/district/Maharashtra/{pune_dist['district_name']}?observation_time={latest_time}")
        assert res.status_code == 200
        dist = res.json()
        assert dist["status"] == "success"
        assert "Pune" in dist["district_name"] or "Poona" in dist["district_name"]
        assert len(dist["observations"]) > 0
        
        # Verify real observation values (not mock)
        sample_obs = dist["observations"][0]
        assert "latitude" in sample_obs
        assert "longitude" in sample_obs
        assert "precipitation" in sample_obs
        assert "liquid" in sample_obs

        # 5. Test Historical Series
        res = await client.get("/api/weather/historical-series?district_name=Pune")
        assert res.status_code == 200
        hist = res.json()
        assert hist["status"] == "success"
        assert hist["count"] > 0
        assert len(hist["timeline"]) > 0
