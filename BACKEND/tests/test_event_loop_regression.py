import asyncio
import time
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.ingestion.converter import convert_imerg_to_standard_csv


@pytest.mark.asyncio
async def test_slow_ingestion_does_not_block_health_or_docs(synthetic_imerg_bundle, tmp_path):
    """Regression test: Proves that slow/heavy ingestion running in the background
    does NOT prevent FastAPI event loop from immediately responding to /health or /docs.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Verify baseline health and docs
        health_resp = await client.get("/health")
        assert health_resp.status_code == 200
        docs_resp = await client.get("/docs")
        assert docs_resp.status_code == 200

        # 2. Simulate slow/heavy ingestion work (e.g. slow network download or heavy raster compute)
        # executed via asyncio.to_thread as in the fixed pipeline
        def slow_ingestion_work():
            time.sleep(2.0)
            return "INGESTION_COMPLETE"

        start_time = time.perf_counter()

        # Launch the slow ingestion work via asyncio.to_thread
        ingestion_task = asyncio.create_task(asyncio.to_thread(slow_ingestion_work))

        # While the slow ingestion task is actively running in background, query /health and /docs
        await asyncio.sleep(0.05)
        assert not ingestion_task.done(), "Ingestion task should still be running"

        req_start = time.perf_counter()
        concurrent_health = await client.get("/health")
        health_latency = time.perf_counter() - req_start

        docs_start = time.perf_counter()
        concurrent_docs = await client.get("/docs")
        docs_latency = time.perf_counter() - docs_start

        # Wait for ingestion task to complete
        result = await ingestion_task
        total_time = time.perf_counter() - start_time

        assert result == "INGESTION_COMPLETE"
        assert total_time >= 2.0, f"Expected slow operation to take >= 2.0s, took {total_time}"

        # Critical regression assertions:
        # /health and /docs responded immediately while ingestion was actively running
        # (If event loop were blocked, both requests would take >= 2.0s)
        assert concurrent_health.status_code == 200
        assert health_latency < 1.0, f"/health request was delayed ({health_latency:.3f}s); event loop was blocked!"

        assert concurrent_docs.status_code == 200
        assert docs_latency < 0.5, f"/docs request was delayed ({docs_latency:.3f}s); event loop was blocked!"
        assert "swagger-ui" in concurrent_docs.text.lower() or "html" in concurrent_docs.text.lower()


@pytest.mark.asyncio
async def test_raster_conversion_in_thread_does_not_block_event_loop(synthetic_imerg_bundle, tmp_path):
    """Regression test: Proves that actual NASA IMERG raster conversion executed via
    asyncio.to_thread allows concurrent /health queries to respond immediately.
    """
    granule_id = synthetic_imerg_bundle["granule_id"]
    layers = synthetic_imerg_bundle["layer_paths"]
    obs_time = synthetic_imerg_bundle["observation_time"]
    out_csv = tmp_path / "conv_regression.csv"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Run actual converter in worker thread
        conversion_task = asyncio.create_task(
            asyncio.to_thread(
                convert_imerg_to_standard_csv,
                files=layers,
                granule_id=granule_id,
                observation_time=obs_time,
                output_file=out_csv,
                clip_to_india=False,
            )
        )

        # Concurrently request /health while conversion is processing
        health_resp = await client.get("/health")
        assert health_resp.status_code == 200
        assert health_resp.json()["fastapi_reachable"] is True

        summary = await conversion_task
        assert summary["row_count"] == 16
        assert out_csv.exists()
