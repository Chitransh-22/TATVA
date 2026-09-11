import asyncio
import json
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.ws_manager import weather_ws_manager, ClientSubscription
from app.ingestion.weather_event_service import (
    weather_pipeline,
    normalize_observation,
    normalize_datetime,
)
from app.scheduler.scheduler_service import ingestion_scheduler


# =============================================================================
# TEST A — DATABASE INSERT & BROADCAST
# =============================================================================

@pytest.mark.asyncio
async def test_a_database_persist_and_broadcast():
    now_utc = datetime.now(timezone.utc)
    raw_event = {
        "latitude": 23.02,
        "longitude": 72.57,
        "precipitation": 25.4,
        "state": "Gujarat",
        "district": "Ahmedabad",
        "observation_time": now_utc.isoformat(),
        "source": "NASA",
        "product": "IMERG",
    }

    norm = normalize_observation(raw_event)
    assert norm["latitude"] == 23.02
    assert norm["longitude"] == 72.57
    assert norm["precipitation"] == 25.4
    assert norm["state"] == "Gujarat"
    assert norm["district"] == "Ahmedabad"
    assert norm["granule_id"] is not None
    assert norm["observation_time"].tzinfo == timezone.utc

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.commit = AsyncMock()

    mock_ws = AsyncMock()
    client_id = "test-client-a"
    sub = ClientSubscription(client_id, mock_ws)
    weather_ws_manager._clients[client_id] = sub

    try:
        with patch("app.ingestion.weather_event_service.AsyncSessionLocal") as mock_session_local:
            mock_session_local.return_value.__aenter__.return_value = mock_session

            persisted_count, normalized = await weather_pipeline.process_and_persist_events(
                [raw_event],
                publish_to_kafka=False,
            )

            assert persisted_count == 1
            assert len(normalized) == 1
            assert mock_session.execute.called
            assert mock_session.commit.called

            msg_str = await asyncio.wait_for(sub.message_queue.get(), timeout=2.0)
            msg = json.loads(msg_str)
            assert msg["type"] in ["weather_batch", "weather_update"]
            assert msg["action"] == "upsert"

    finally:
        weather_ws_manager._clients.pop(client_id, None)


@pytest.mark.asyncio
async def test_a_persistence_failure_suppresses_broadcast():
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=RuntimeError("Connection to Azure PostgreSQL timed out"))

    mock_ws = AsyncMock()
    client_id = "test-client-a2"
    sub = ClientSubscription(client_id, mock_ws)
    weather_ws_manager._clients[client_id] = sub

    try:
        with patch("app.ingestion.weather_event_service.AsyncSessionLocal") as mock_session_local:
            mock_session_local.return_value.__aenter__.return_value = mock_session

            with pytest.raises(RuntimeError, match="Database persistence failure"):
                await weather_pipeline.process_and_persist_events(
                    [{"latitude": 19.07, "longitude": 72.87, "precipitation": 12.0}],
                    publish_to_kafka=False,
                )

            assert sub.message_queue.empty()
    finally:
        weather_ws_manager._clients.pop(client_id, None)


# =============================================================================
# TEST B — RELOAD (7-Day REST Snapshot Restores Map State)
# =============================================================================

@pytest.mark.asyncio
async def test_b_reload_restores_7day_snapshot():
    from app.api.weather import get_india_overview

    now_utc = datetime.now(timezone.utc)
    mock_db = AsyncMock()

    mock_summary_row = MagicMock()
    mock_summary_row.avg_p = 18.5
    mock_summary_row.max_p = 64.2
    mock_summary_row.min_p = 0.5
    mock_summary_row.pt_count = 120
    mock_summary_row.gid = "NASA-7DAY-TEST"
    mock_summary_row.latest_time = now_utc

    mock_state_row = MagicMock()
    mock_state_row.state_name = "Maharashtra"
    mock_state_row.min_lat = 15.6
    mock_state_row.max_lat = 22.0
    mock_state_row.min_lon = 72.6
    mock_state_row.max_lon = 80.9
    mock_state_row.center_lat = 19.0
    mock_state_row.center_lon = 76.0
    mock_state_row.avg_precipitation = 22.4
    mock_state_row.max_precipitation = 64.2
    mock_state_row.min_precipitation = 1.0
    mock_state_row.total_points = 85

    mock_grid_row = MagicMock()
    mock_grid_row.lat = 19.0
    mock_grid_row.lon = 73.0
    mock_grid_row.precip = 35.0

    mock_obs_row = MagicMock()
    mock_obs_row.granule_id = "NASA-7DAY-TEST"
    mock_obs_row.observation_time = now_utc
    mock_obs_row.latitude = 19.05
    mock_obs_row.longitude = 73.02
    mock_obs_row.precipitation = 35.0
    mock_obs_row.liquid = 35.0
    mock_obs_row.ice = 0.0
    mock_obs_row.liquid_percent = 100.0
    mock_obs_row.state = "Maharashtra"
    mock_obs_row.district = "Thane"

    mock_db.execute = AsyncMock(side_effect=[
        MagicMock(first=lambda: mock_summary_row),
        MagicMock(fetchall=lambda: [mock_state_row]),
        MagicMock(fetchall=lambda: [mock_grid_row]),
        MagicMock(fetchall=lambda: [mock_obs_row]),
    ])

    response = await get_india_overview(db=mock_db, observation_time=None, grid_step=0.2)

    assert response["status"] == "success"
    assert response["is_7day_rolling"] is True
    assert response["window_hours"] == 168
    assert response["national_summary"]["total_points"] == 120
    assert len(response["state_summaries"]) == 1
    assert len(response["grid_points"]) == 1
    assert len(response["observations"]) == 1
    assert response["observations"][0]["id"] == "19.05_73.02"


# =============================================================================
# TEST C — LIVE UPDATE (Incremental WebSocket Broadcast)
# =============================================================================

@pytest.mark.asyncio
async def test_c_live_update_via_websocket():
    now_utc = datetime.now(timezone.utc)
    new_event = {
        "latitude": 28.61,
        "longitude": 77.20,
        "precipitation": 45.0,
        "state": "Delhi",
        "district": "New Delhi",
        "observation_time": now_utc.isoformat(),
    }

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.commit = AsyncMock()

    mock_ws = AsyncMock()
    client_id = "test-client-c"
    sub = ClientSubscription(client_id, mock_ws)
    weather_ws_manager._clients[client_id] = sub

    try:
        with patch("app.ingestion.weather_event_service.AsyncSessionLocal") as mock_session_local:
            mock_session_local.return_value.__aenter__.return_value = mock_session

            await weather_pipeline.process_and_persist_events([new_event], publish_to_kafka=False)

            msg_str = await asyncio.wait_for(sub.message_queue.get(), timeout=2.0)
            msg = json.loads(msg_str)

            assert msg["action"] == "upsert"
            assert msg["version"] >= 1000
    finally:
        weather_ws_manager._clients.pop(client_id, None)


# =============================================================================
# TEST D — DUPLICATE / UPSERT DEDUPLICATION
# =============================================================================

@pytest.mark.asyncio
async def test_d_duplicate_deduplication():
    now_utc = datetime.now(timezone.utc)
    event1 = {
        "granule_id": "TEST-DEDUP-01",
        "latitude": 12.97,
        "longitude": 77.59,
        "precipitation": 10.0,
        "observation_time": now_utc.isoformat(),
        "state": "Karnataka",
        "district": "Bengaluru",
    }
    event2 = {
        "granule_id": "TEST-DEDUP-01",
        "latitude": 12.97,
        "longitude": 77.59,
        "precipitation": 15.5,
        "observation_time": now_utc.isoformat(),
        "state": "Karnataka",
        "district": "Bengaluru",
    }

    n1 = normalize_observation(event1)
    n2 = normalize_observation(event2)

    pk1 = (n1["observation_time"], n1["granule_id"], n1["latitude"], n1["longitude"])
    pk2 = (n2["observation_time"], n2["granule_id"], n2["latitude"], n2["longitude"])
    assert pk1 == pk2

    mock_session = AsyncMock()
    executed_statements = []

    async def record_exec(stmt, params):
        executed_statements.append((stmt, params))
        return MagicMock()

    mock_session.execute = AsyncMock(side_effect=record_exec)
    mock_session.commit = AsyncMock()

    with patch("app.ingestion.weather_event_service.AsyncSessionLocal") as mock_session_local:
        mock_session_local.return_value.__aenter__.return_value = mock_session

        await weather_pipeline.process_and_persist_events([event1], publish_to_kafka=False)
        await weather_pipeline.process_and_persist_events([event2], publish_to_kafka=False)

        for stmt, params in executed_statements:
            sql_text = str(stmt).upper()
            if "INSERT INTO PRECIPITATION_OBSERVATIONS" in sql_text:
                assert "ON CONFLICT (OBSERVATION_TIME, GRANULE_ID, LATITUDE, LONGITUDE) DO UPDATE" in sql_text


# =============================================================================
# TEST E — 7-DAY EXPIRATION & AUTOMATIC CLEANUP
# =============================================================================

@pytest.mark.asyncio
async def test_e_7day_expiration_and_cleanup():
    now_utc = datetime.now(timezone.utc)
    old_time = now_utc - timedelta(days=8)
    cutoff = now_utc - timedelta(days=7)

    assert (now_utc - cutoff).total_seconds() == 7 * 24 * 3600
    assert old_time < cutoff

    mock_deleted_row = MagicMock()
    mock_deleted_row.latitude = 21.14
    mock_deleted_row.longitude = 79.08

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=MagicMock(fetchall=lambda: [mock_deleted_row]))
    mock_session.commit = AsyncMock()

    mock_ws = AsyncMock()
    client_id = "test-client-e"
    sub = ClientSubscription(client_id, mock_ws)
    weather_ws_manager._clients[client_id] = sub

    try:
        with patch("app.scheduler.scheduler_service.AsyncSessionLocal") as mock_session_local:
            mock_session_local.return_value.__aenter__.return_value = mock_session

            res = await ingestion_scheduler.cleanup_expired_observations(days=7)

            assert res["status"] == "success"
            assert res["deleted_count"] == 1
            assert res["broadcasted_removals_count"] == 1

            msg_str = await asyncio.wait_for(sub.message_queue.get(), timeout=2.0)
            msg = json.loads(msg_str)
            assert msg["type"] == "weather_remove"
            assert msg["action"] == "remove"
            assert "21.14_79.08" in msg["ids"]
    finally:
        weather_ws_manager._clients.pop(client_id, None)


# =============================================================================
# TEST F — RECONNECT & RESYNC
# =============================================================================

@pytest.mark.asyncio
async def test_f_reconnect_synchronization():
    mock_ws = AsyncMock()
    client_id = await weather_ws_manager.connect(mock_ws)
    assert client_id in weather_ws_manager._clients

    await weather_ws_manager.disconnect(client_id)
    assert client_id not in weather_ws_manager._clients

    new_client_id = await weather_ws_manager.connect(mock_ws)
    assert new_client_id in weather_ws_manager._clients

    # Allow the background _client_sender task to drain the queue to mock_ws
    await asyncio.sleep(0.05)
    assert mock_ws.send_text.called
    sent_msgs = [json.loads(c[0][0]) for c in mock_ws.send_text.call_args_list]
    assert any(m.get("type") == "connected" and m.get("client_id") == new_client_id for m in sent_msgs)

    await weather_ws_manager.disconnect(new_client_id)


# =============================================================================
# TEST G — STATE / DISTRICT FILTERING
# =============================================================================

@pytest.mark.asyncio
async def test_g_filtering_preserves_underlying_dataset():
    sub_gujarat = ClientSubscription("client-guj", AsyncMock())
    sub_gujarat.state = "Gujarat"

    sub_national = ClientSubscription("client-nat", AsyncMock())
    sub_national.state = None
    sub_national.district = None

    assert sub_gujarat.matches("Gujarat", None) is True
    assert sub_gujarat.matches("Maharashtra", None) is False
    assert sub_national.matches(None, None) is True


# =============================================================================
# TEST H — MAP PERFORMANCE
# =============================================================================

@pytest.mark.asyncio
async def test_h_performance_batch_broadcasting():
    mock_ws = AsyncMock()
    client_id = "test-client-h"
    sub = ClientSubscription(client_id, mock_ws)
    weather_ws_manager._clients[client_id] = sub

    try:
        batch_updates = [
            {
                "id": f"20.{i:02d}_78.{i:02d}",
                "lat": 20.0 + i * 0.05,
                "lon": 78.0 + i * 0.05,
                "value": 10.0 + i,
                "precipitation": 10.0 + i,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            for i in range(50)
        ]

        await weather_ws_manager.broadcast_batch(
            updates=batch_updates,
            summary={"avg_precipitation": 15.0, "max_precipitation": 35.0},
        )

        msg_str = await asyncio.wait_for(sub.message_queue.get(), timeout=2.0)
        msg = json.loads(msg_str)
        assert msg["updates_count"] == 50
        assert len(msg["updates"]) == 50
    finally:
        weather_ws_manager._clients.pop(client_id, None)


# =============================================================================
# TEST I — DYNAMIC RAW PATH REBASING & PORTABILITY
# =============================================================================

def test_i_dynamic_raw_path_rebasing():
    from pathlib import Path
    from app.config import settings
    from app.ingestion.extractor import granule_extractor

    # 1. Foreign path from old F:\ drive is rebased to current DATA_RAW_DIR
    foreign_path = r"F:\OldDrive\SomeForeignPath\BACKEND\data\raw\test_granule.zip"
    resolved = settings.resolve_raw_path(foreign_path)
    expected = (settings.DATA_RAW_DIR / "test_granule.zip").resolve()
    assert resolved == expected
    assert "F:" not in str(resolved) or str(settings.DATA_RAW_DIR).startswith("F:")
    assert "OldDrive" not in str(resolved)

    # 2. Existing file in current data/raw is recognized
    existing_files = list(settings.DATA_RAW_DIR.glob("*.zip"))
    if existing_files:
        real_file = existing_files[0]
        fake_foreign = f"F:\\OldDrive\\SomeProject\\BACKEND\\data\\raw\\{real_file.name}"
        resolved_real = settings.resolve_raw_path(fake_foreign)
        assert resolved_real.exists()
        assert resolved_real == real_file.resolve()

    # 3. Missing file is reported at local DATA_RAW_DIR without creating fake files
    missing_foreign = r"F:\Shashwat_Mandali\Coding Script\RITU-platform\BACKEND\data\raw\definitely_not_here_9999.zip"
    extract_result = granule_extractor.extract_zip(missing_foreign, "definitely_not_here_9999")
    assert extract_result is None

