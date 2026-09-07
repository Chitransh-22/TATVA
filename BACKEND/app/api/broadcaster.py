import asyncio
import json
import logging
from typing import Set, Dict, Any

logger = logging.getLogger(__name__)

class WeatherEventBroadcaster:
    """In-memory pub/sub broadcaster for SSE live updates to connected map clients."""
    
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        """Create and register a new client queue."""
        q = asyncio.Queue(maxsize=50)
        self._subscribers.add(q)
        logger.debug(f"SSE client connected. Active subscribers: {len(self._subscribers)}")
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        """Remove a disconnected client queue."""
        self._subscribers.discard(q)
        logger.debug(f"SSE client disconnected. Active subscribers: {len(self._subscribers)}")

    async def broadcast(self, event_type: str, data: Dict[str, Any]) -> None:
        """Send an event payload to all active SSE subscribers."""
        if not self._subscribers:
            return
        
        payload = json.dumps({"type": event_type, "data": data})
        dead_queues = set()

        for q in list(self._subscribers):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                dead_queues.add(q)

        for dq in dead_queues:
            self._subscribers.discard(dq)

weather_broadcaster = WeatherEventBroadcaster()
