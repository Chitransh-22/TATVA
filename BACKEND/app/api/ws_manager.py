import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Set, List, Any
from fastapi import WebSocket, WebSocketDisconnect
from app.config import settings

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
        self.source: str = getattr(settings, "WEATHER_DATA_SOURCE", "MOSDAC")
        self.product: Optional[str] = None
        self.category: Optional[str] = None
        self.state: Optional[str] = None
        self.district: Optional[str] = None
        self.parameter: str = "precipitation"
        self.bounds: Optional[Dict[str, float]] = None
        self.zoom: Optional[int] = None
        self.last_timestamp: datetime = datetime.now(timezone.utc)
        self.connected_at: datetime = datetime.now(timezone.utc)
        self.message_queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._sender_task: Optional[asyncio.Task] = None

    def matches(
        self,
        target_state: Optional[str],
        target_district: Optional[str],
        target_source: Optional[str] = None,
        target_product: Optional[str] = None,
        target_category: Optional[str] = None,
    ) -> bool:
        """Determine if an incremental update is relevant to this subscriber."""
        # Source filtering: If client is subscribed to MOSDAC, ignore NASA events (and vice versa)
        if target_source and self.source:
            if target_source.strip().upper() != self.source.strip().upper():
                return False

        # Product filtering: If client specified a specific product, match strictly
        if self.product and self.product != "*":
            if target_product and self.product.upper() != target_product.upper():
                return False
        elif not self.product:
            # Default backward-compatibility: unconfigured clients receive default rainfall products
            if target_product and target_product.upper() not in ("3SIMG_L2B_HEM", "3SIMG_L2G_IMR", "IMERG"):
                return False

        # Category filtering: If client specified category, match
        if self.category and self.category != "*":
            if target_category:
                sub_cat = self.category.lower().replace("productcategory.", "").strip()
                tgt_cat = target_category.lower().replace("productcategory.", "").strip()
                if sub_cat != tgt_cat:
                    return False

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
        # Broadcast observability metrics
        self.last_broadcast_time: Optional[datetime] = None
        self.last_broadcast_granule: Optional[str] = None
        self.last_broadcast_updates_count: int = 0
        self.total_broadcasts: int = 0

    def get_stats(self) -> Dict[str, Any]:
        """Return real-time broadcast and connection metrics for diagnostics."""
        return {
            "connected_clients_count": len(self._clients),
            "last_broadcast_time": self.last_broadcast_time.isoformat() if self.last_broadcast_time else None,
            "last_broadcast_time_ist": _to_ist_str(self.last_broadcast_time) if self.last_broadcast_time else None,
            "last_broadcast_granule": self.last_broadcast_granule,
            "last_broadcast_updates_count": self.last_broadcast_updates_count,
            "total_broadcasts": self.total_broadcasts,
            "version": self._version_counter,
        }

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
        source: Optional[str] = None,
        parameter: str = "precipitation",
        bounds: Optional[Dict[str, float]] = None,
        zoom: Optional[int] = None,
        product: Optional[str] = None,
        category: Optional[str] = None,
    ):
        """Update subscription filters for an existing client without reconnecting."""
        async with self._lock:
            sub = self._clients.get(client_id)
            if not sub:
                return

            sub.state = state.strip() if state else None
            sub.district = district.strip() if district else None
            if source:
                sub.source = source.strip().upper()
            if product:
                sub.product = product.strip()
            if category:
                sub.category = category.strip()
            sub.parameter = parameter
            sub.bounds = bounds
            sub.zoom = zoom
            sub.last_timestamp = datetime.now(timezone.utc)

        logger.info(
            f"Client {client_id} subscription updated: source={sub.source}, product={sub.product}, "
            f"category={sub.category}, state={sub.state}, district={sub.district}"
        )

        # Send subscription confirmation
        ack_msg = {
            "type": "subscribed",
            "subscription": {
                "source": sub.source,
                "product": sub.product,
                "category": sub.category,
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
        source: Optional[str] = None,
        product: Optional[str] = None,
        category: Optional[str] = None,
        point_count: Optional[int] = None,
        active_rain_count: Optional[int] = None,
        max_rainfall: Optional[float] = None,
        unit: Optional[str] = None,
    ):
        """Broadcast a batch of incremental weather updates strictly to matching subscribers."""
        if not self._clients or not updates:
            return

        ts = timestamp or datetime.now(timezone.utc)
        self._version_counter += 1
        self.last_broadcast_time = ts
        self.last_broadcast_granule = granule_id or "REALTIME-WEATHER"
        self.last_broadcast_updates_count = len(updates)
        self.total_broadcasts += 1

        active_source = (source or getattr(settings, "WEATHER_DATA_SOURCE", "MOSDAC")).upper()
        prod = product or ("3SIMG_L2B_HEM" if active_source == "MOSDAC" else "IMERG")
        cat = category or ("weather" if "3SIMG" in prod or "IMERG" in prod else None)
        p_count = point_count if point_count is not None else (summary.get("total_points", len(updates)) if summary else len(updates))
        active_count = active_rain_count if active_rain_count is not None else (summary.get("active_rain_points", len(updates)) if summary else len(updates))
        max_r = max_rainfall if max_rainfall is not None else (summary.get("max_precipitation", 0.0) if summary else 0.0)

        payload = {
            "type": "weather_update",
            "action": "upsert",
            "source": active_source,
            "product": prod,
            "category": cat,
            "unit": unit or (summary.get("unit") if summary else ""),
            "version": self._version_counter,
            "granule_id": granule_id or f"REALTIME-{active_source}",
            "observation_time": ts.isoformat(),
            "timestamp": ts.isoformat(),
            "timestamp_ist": _to_ist_str(ts),
            "point_count": p_count,
            "active_rain_count": active_count,
            "max_rainfall": max_r,
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
                if sub.matches(target_state, target_district, active_source, prod, cat)
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
        source: Optional[str] = None,
    ):
        """Broadcast explicit expiration / deletion of obsolete weather observation points."""
        if not self._clients or not ids:
            return

        ts = timestamp or datetime.now(timezone.utc)
        active_source = (source or getattr(settings, "WEATHER_DATA_SOURCE", "MOSDAC")).upper()
        payload = json.dumps({
            "type": "weather_remove",
            "action": "remove",
            "source": active_source,
            "timestamp": ts.isoformat(),
            "timestamp_ist": _to_ist_str(ts),
            "ids": ids,
            "state": target_state,
            "district": target_district,
        })

        async with self._lock:
            targets = [
                sub for sub in self._clients.values()
                if sub.matches(target_state, target_district, active_source)
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
        source: Optional[str] = None,
    ):
        """Broadcast a single incremental weather event."""
        if not self._clients:
            return

        ts = timestamp or datetime.now(timezone.utc)
        self._version_counter += 1
        self.last_broadcast_time = ts
        self.last_broadcast_granule = data.get("granule_id") if data else None
        self.last_broadcast_updates_count = 1
        self.total_broadcasts += 1

        active_source = (source or (data.get("source") if data else None) or getattr(settings, "WEATHER_DATA_SOURCE", "MOSDAC")).upper()
        payload = {
            "type": event_type,
            "action": action,
            "source": active_source,
            "version": self._version_counter,
            "id": point_id or (data.get("id") if data else None),
            "granule_id": data.get("granule_id") if data else None,
            "observation_time": ts.isoformat(),
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
                if sub.matches(target_state, target_district, active_source)
            ]

        for sub in targets:
            try:
                sub.message_queue.put_nowait(encoded)
            except asyncio.QueueFull:
                logger.warning(f"Queue full for client {sub.client_id}; dropping message")



# Global singleton instance
weather_ws_manager = WeatherWebSocketManager()
