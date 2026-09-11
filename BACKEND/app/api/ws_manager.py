import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Set, List, Any
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("ritu.ws")

IST = timezone(timedelta(hours=5, minutes=30))


def _to_ist_str(dt: Optional[datetime]) -> str:
    if not dt:
        return "N/A"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST).strftime("%Y-%m-%d %H:%M IST")


class ClientSubscription:
    """Holds state for an active WebSocket client session."""

    def __init__(self, client_id: str, websocket: WebSocket):
        self.client_id: str = client_id
        self.websocket: WebSocket = websocket
        self.state: Optional[str] = None
        self.district: Optional[str] = None
        self.parameter: str = "precipitation"
        self.bounds: Optional[Dict[str, float]] = None
        self.zoom: Optional[int] = None
        self.last_timestamp: datetime = datetime.now(timezone.utc)
        self.connected_at: datetime = datetime.now(timezone.utc)
        self.message_queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._sender_task: Optional[asyncio.Task] = None

    def matches(self, target_state: Optional[str], target_district: Optional[str]) -> bool:
        """Determine if an incremental update is relevant to this subscriber."""
        # 1. District level subscriber: only wants updates for this district
        if self.district:
            if target_district:
                d_norm = self.district.strip().lower().replace("ahmedabad", "ahmadabad")
                t_norm = target_district.strip().lower().replace("ahmedabad", "ahmadabad")
                return d_norm == t_norm or d_norm in t_norm or t_norm in d_norm
            return False

        # 2. State level subscriber: wants updates for this state or districts within it
        if self.state:
            if target_state:
                s_norm = self.state.strip().lower()
                t_norm = target_state.strip().lower()
                return s_norm == t_norm or s_norm in t_norm or t_norm in s_norm
            return False

        # 3. National (India) level subscriber: wants national/overview updates
        return target_state is None and target_district is None


class WeatherWebSocketManager:
    """Centralized manager for WebSocket connections, subscriptions, and real-time incremental broadcasts."""

    def __init__(self):
        self._clients: Dict[str, ClientSubscription] = {}
        self._lock: asyncio.Lock = asyncio.Lock()
        self._bg_task: Optional[asyncio.Task] = None
        self._running: bool = False
        self._last_ledger_check: Optional[datetime] = None
        # Monotonically increasing sequence/version number
        self._version_counter: int = 1000

    async def start(self):
        """Start WebSocket manager."""
        if not self._running:
            self._running = True
            logger.info("WeatherWebSocketManager started (event-driven broadcast mode).")

    async def stop(self):
        """Stop manager and disconnect all clients cleanly."""
        self._running = False
        # Close all active sockets
        async with self._lock:
            for sub in list(self._clients.values()):
                if sub._sender_task:
                    sub._sender_task.cancel()
                try:
                    await sub.websocket.close(code=1000, reason="Server shutting down")
                except Exception:
                    pass
            self._clients.clear()
        logger.info("WeatherWebSocketManager stopped.")

    async def connect(self, websocket: WebSocket) -> str:
        """Register a new WebSocket client connection."""
        await websocket.accept()
        client_id = str(uuid.uuid4())
        sub = ClientSubscription(client_id, websocket)
        sub._sender_task = asyncio.create_task(self._client_sender(sub))

        async with self._lock:
            self._clients[client_id] = sub

        logger.info(f"WebSocket client {client_id} connected. Total active: {len(self._clients)}")

        # Send greeting & initial connection ack
        await sub.message_queue.put(json.dumps({
            "type": "connected",
            "client_id": client_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": "Connected to RITU TATVA Real-Time Incremental Weather WebSocket"
        }))

        return client_id

    async def disconnect(self, client_id: str):
        """Cleanly unregister a disconnected WebSocket client."""
        async with self._lock:
            sub = self._clients.pop(client_id, None)
            if sub:
                if sub._sender_task:
                    sub._sender_task.cancel()
                logger.info(f"WebSocket client {client_id} disconnected. Remaining active: {len(self._clients)}")

    async def update_subscription(
        self,
        client_id: str,
        state: Optional[str] = None,
        district: Optional[str] = None,
        parameter: str = "precipitation",
        bounds: Optional[Dict[str, float]] = None,
        zoom: Optional[int] = None,
    ):
        """Update subscription filters for an existing client without reconnecting."""
        async with self._lock:
            sub = self._clients.get(client_id)
            if not sub:
                return

            sub.state = state.strip() if state else None
            sub.district = district.strip() if district else None
            sub.parameter = parameter
            sub.bounds = bounds
            sub.zoom = zoom
            sub.last_timestamp = datetime.now(timezone.utc)

        logger.info(f"Client {client_id} subscription updated: state={sub.state}, district={sub.district}")

        # Send subscription confirmation
        ack_msg = {
            "type": "subscribed",
            "subscription": {
                "state": sub.state,
                "district": sub.district,
                "parameter": sub.parameter,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await sub.message_queue.put(json.dumps(ack_msg))

    async def handle_ping(self, client_id: str):
        """Respond to client heartbeat ping."""
        async with self._lock:
            sub = self._clients.get(client_id)
        if sub:
            pong_msg = {
                "type": "pong",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            try:
                sub.message_queue.put_nowait(json.dumps(pong_msg))
            except asyncio.QueueFull:
                pass

    async def _client_sender(self, sub: ClientSubscription):
        """Dedicated background task to drain the client queue to the WebSocket."""
        try:
            while True:
                msg = await sub.message_queue.get()
                await sub.websocket.send_text(msg)
                sub.message_queue.task_done()
        except asyncio.CancelledError:
            pass
        except Exception as ex:
            logger.debug(f"Client {sub.client_id} sender terminated: {ex}")
            await self.disconnect(sub.client_id)

    async def broadcast_batch(
        self,
        updates: List[Dict[str, Any]],
        removals: Optional[List[str]] = None,
        summary: Optional[Dict[str, Any]] = None,
        target_state: Optional[str] = None,
        target_district: Optional[str] = None,
        timestamp: Optional[datetime] = None,
        granule_id: Optional[str] = None,
    ):
        """Broadcast a batch of incremental weather updates strictly to matching subscribers."""
        if not self._clients or not updates:
            return

        ts = timestamp or datetime.now(timezone.utc)
        self._version_counter += 1

        payload = {
            "type": "weather_batch",
            "action": "upsert",
            "version": self._version_counter,
            "timestamp": ts.isoformat(),
            "timestamp_ist": _to_ist_str(ts),
            "granule_id": granule_id or "REALTIME-IMERG",
            "state": target_state,
            "district": target_district,
            "updates_count": len(updates),
            "updates": updates,
            "removals": removals or [],
        }
        if summary:
            payload["summary"] = summary

        encoded = json.dumps(payload)

        async with self._lock:
            targets = [
                sub for sub in self._clients.values()
                if sub.matches(target_state, target_district)
            ]

        for sub in targets:
            try:
                sub.message_queue.put_nowait(encoded)
            except asyncio.QueueFull:
                logger.warning(f"Queue full for client {sub.client_id}; dropping message")

    async def broadcast_removals(
        self,
        ids: List[str],
        target_state: Optional[str] = None,
        target_district: Optional[str] = None,
        timestamp: Optional[datetime] = None,
    ):
        """Broadcast explicit expiration / deletion of obsolete weather observation points."""
        if not self._clients or not ids:
            return

        ts = timestamp or datetime.now(timezone.utc)
        payload = json.dumps({
            "type": "weather_remove",
            "action": "remove",
            "timestamp": ts.isoformat(),
            "ids": ids,
            "state": target_state,
            "district": target_district,
        })

        async with self._lock:
            targets = [
                sub for sub in self._clients.values()
                if sub.matches(target_state, target_district)
            ]

        for sub in targets:
            try:
                sub.message_queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    async def broadcast_event(
        self,
        event_type: str = "weather_update",
        action: str = "upsert",
        point_id: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None,
        target_state: Optional[str] = None,
        target_district: Optional[str] = None,
        timestamp: Optional[datetime] = None,
    ):
        """Broadcast a single incremental weather event."""
        if not self._clients:
            return

        ts = timestamp or datetime.now(timezone.utc)
        self._version_counter += 1

        payload = {
            "type": event_type,
            "action": action,
            "version": self._version_counter,
            "id": point_id or (data.get("id") if data else None),
            "timestamp": ts.isoformat(),
            "timestamp_ist": _to_ist_str(ts),
            "state": target_state,
            "district": target_district,
            "data": data or {},
        }
        encoded = json.dumps(payload)

        async with self._lock:
            targets = [
                sub for sub in self._clients.values()
                if sub.matches(target_state, target_district)
            ]

        for sub in targets:
            try:
                sub.message_queue.put_nowait(encoded)
            except asyncio.QueueFull:
                logger.warning(f"Queue full for client {sub.client_id}; dropping message")



# Global singleton instance
weather_ws_manager = WeatherWebSocketManager()
