import pytest
from fastapi.testclient import TestClient


def test_root_endpoint(test_client: TestClient):
    response = test_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "HEALTHY"
    assert "version" in data


def test_health_endpoint(test_client: TestClient):
    response = test_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "HEALTHY"
    assert "scheduler_active" in data
    assert "database_connected" in data
    assert "kafka_connected" in data


def test_health_db_endpoint(test_client: TestClient):
    response = test_client.get("/health/db")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data
    assert "host" in data
    assert "port" in data
    assert "postgis_enabled" in data
    # Ensure no credentials leaked
    assert "password" not in str(data).lower()


def test_health_kafka_endpoint(test_client: TestClient):
    response = test_client.get("/health/kafka")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "mode" in data
    assert "registered_topics" in data
    assert len(data["registered_topics"]) >= 5


def test_ingestion_status_endpoint(test_client: TestClient):
    response = test_client.get("/api/ingestion/status")
    assert response.status_code == 200
    data = response.json()
    assert data["pipeline_health"] == "ONLINE"
    assert "ledger_metrics" in data


def test_weather_anomalies_endpoint(test_client: TestClient):
    response = test_client.get("/api/weather/anomalies")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "anomalies" in data


def test_dlq_endpoint(test_client: TestClient):
    response = test_client.get("/api/ingestion/dlq")
    assert response.status_code == 200
    data = response.json()
    assert "dlq_count" in data
    assert "dlq_records" in data


def test_existing_trigger_and_ledger_endpoints(test_client: TestClient):
    # Test POST /api/ingestion/trigger
    trigger_resp = test_client.post("/api/ingestion/trigger")
    assert trigger_resp.status_code == 200
    assert trigger_resp.json()["status"] == "triggered"

    # Test GET /api/ingestion/ledger
    ledger_resp = test_client.get("/api/ingestion/ledger?limit=10")
    assert ledger_resp.status_code == 200
    assert "count" in ledger_resp.json()
    assert "entries" in ledger_resp.json()


def test_nasa_imerg_status_not_found(test_client: TestClient):
    response = test_client.get("/api/ingestion/nasa/imerg/status/non-existent-run-id")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_nasa_imerg_trigger_and_execution_with_synthetic_bundle(
    test_client: TestClient,
    synthetic_imerg_bundle,
):
    zip_path = str(synthetic_imerg_bundle["zip_path"])

    # 1. Trigger POST /api/ingestion/nasa/imerg
    response = test_client.post(
        "/api/ingestion/nasa/imerg",
        json={"local_test_zip": zip_path, "limit": 1},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "started"
    assert data["pipeline"] == "NASA IMERG"
    assert data["message"] == "NASA IMERG ingestion started"
    assert "run_id" in data
    run_id = data["run_id"]

    # 2. Check GET /api/ingestion/nasa/imerg/status/{run_id}
    # In TestClient, FastAPI BackgroundTasks run synchronously before post() returns
    status_resp = test_client.get(f"/api/ingestion/nasa/imerg/status/{run_id}")
    assert status_resp.status_code == 200
    status_data = status_resp.json()

    assert status_data["run_id"] == run_id
    assert status_data["status"] == "completed"
    assert status_data["discovered_count"] == 1
    assert status_data["downloaded_count"] == 1
    assert status_data["transformed_count"] == 1
    assert status_data["validated_count"] == 1
    assert status_data["loaded_count"] == 1
    assert status_data["failed_count"] == 0
    assert status_data["started_at"] is not None
    assert status_data["completed_at"] is not None
    assert isinstance(status_data["errors"], list)

    # 3. Trigger second time with same bundle to verify deduplication tracking
    second_resp = test_client.post(
        "/api/ingestion/nasa/imerg",
        json={"local_test_zip": zip_path, "limit": 1},
    )
    assert second_resp.status_code == 200
    second_run_id = second_resp.json()["run_id"]

    second_status = test_client.get(f"/api/ingestion/nasa/imerg/status/{second_run_id}").json()
    assert second_status["status"] == "completed"
    assert second_status["discovered_count"] == 1
    assert second_status["downloaded_count"] == 1
