import asyncio
import json
import logging
import ssl
from pathlib import Path
from typing import Callable, Dict, List, Any, Optional
from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
from app.config import settings, BACKEND_DIR
from app.ingestion.topics import (
    ALL_TOPICS,
    TOPIC_GRANULES_DISCOVERED,
    TOPIC_GRANULES_RAW,
    TOPIC_GRANULES_STATUS,
    TOPIC_GRANULES_TRANSFORMED,
    TOPIC_GRANULES_DLQ,
    TOPIC_WEATHER_OBSERVATION,
)

logger = logging.getLogger(__name__)


class KafkaBus:
    """Production Kafka Bus with fallback to in-memory asynchronous queue.
    
    Ensures seamless operation both in containerized Kafka clusters and 
    standalone development/testing environments.
    """

    def __init__(self):
        self.bootstrap_servers = settings.KAFKA_BOOTSTRAP_SERVERS
        self.producer: Optional[AIOKafkaProducer] = None
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.is_connected = False
        self._memory_queues: Dict[str, asyncio.Queue] = {topic: asyncio.Queue() for topic in ALL_TOPICS}
        self._handlers: Dict[str, List[Callable[[Dict[str, Any]], Any]]] = {topic: [] for topic in ALL_TOPICS}
        self._consumer_task: Optional[asyncio.Task] = None
        self._memory_dispatch_task: Optional[asyncio.Task] = None
        self._running = False

    def _build_connection_kwargs(self) -> Dict[str, Any]:
        """Construct authentication and SSL kwargs based on settings."""
        kwargs: Dict[str, Any] = {
            "bootstrap_servers": self.bootstrap_servers,
            "request_timeout_ms": 30000,
        }
        sec_proto = (settings.KAFKA_SECURITY_PROTOCOL or "PLAINTEXT").upper()
        if sec_proto in ("SSL", "SASL_SSL"):
            kwargs["security_protocol"] = sec_proto
            ssl_ctx = ssl.create_default_context()
            if settings.KAFKA_SSL_CA_LOCATION:
                ca_path = Path(settings.KAFKA_SSL_CA_LOCATION)
                if not ca_path.is_absolute():
                    ca_path = BACKEND_DIR / ca_path
                if ca_path.exists():
                    ssl_ctx.load_verify_locations(cafile=str(ca_path))
                else:
                    logger.info(f"CA certificate file not found at {ca_path}, proceeding with unverified SSL")
                    ssl_ctx.check_hostname = False
                    ssl_ctx.verify_mode = ssl.CERT_NONE
            else:
                ssl_ctx.check_hostname = False
                ssl_ctx.verify_mode = ssl.CERT_NONE
            kwargs["ssl_context"] = ssl_ctx

        if sec_proto.startswith("SASL"):
            if settings.KAFKA_SASL_MECHANISM:
                kwargs["sasl_mechanism"] = settings.KAFKA_SASL_MECHANISM
            if settings.KAFKA_SASL_USERNAME:
                kwargs["sasl_plain_username"] = settings.KAFKA_SASL_USERNAME
            if settings.KAFKA_SASL_PASSWORD:
                kwargs["sasl_plain_password"] = settings.KAFKA_SASL_PASSWORD

        return kwargs

    async def start(self) -> None:
        """Initialize connection to Kafka or activate in-memory mode."""
        self._running = True
        if settings.KAFKA_ENABLED:
            try:
                # Suppress noisy aiokafka broker discovery retries
                logging.getLogger("aiokafka").setLevel(logging.WARNING)

                # Route TLS SNI to the cloud cluster bootstrap host (required for Aiven & Confluent Cloud)
                sec_proto = (settings.KAFKA_SECURITY_PROTOCOL or "PLAINTEXT").upper()
                if sec_proto in ("SSL", "SASL_SSL") and ":" in self.bootstrap_servers:
                    sni_host = self.bootstrap_servers.split(":")[0].strip()
                    try:
                        sni_port = int(self.bootstrap_servers.split(":")[1].strip())
                    except Exception:
                        sni_port = 15321
                    loop = asyncio.get_running_loop()
                    orig_create_conn = getattr(loop, "_orig_create_conn", loop.create_connection)
                    loop._orig_create_conn = orig_create_conn

                    async def _sni_create_connection(*args, **kwargs):
                        # Strictly target Kafka broker connections (port matching sni_port)
                        dest_port = kwargs.get("port") or (args[2] if len(args) > 2 else None)
                        if dest_port == sni_port and kwargs.get("ssl") and not kwargs.get("server_hostname"):
                            kwargs["server_hostname"] = sni_host
                        return await orig_create_conn(*args, **kwargs)

                    loop.create_connection = _sni_create_connection

                conn_kwargs = self._build_connection_kwargs()
                logger.info(f"Connecting to Kafka cluster at {self.bootstrap_servers} (protocol: {settings.KAFKA_SECURITY_PROTOCOL})...")
                self.producer = AIOKafkaProducer(
                    value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
                    key_serializer=lambda k: k.encode("utf-8") if k else None,
                    **conn_kwargs,
                )
                await self.producer.start()

                # Consumer subscribes to pipeline execution topics
                consumer_topics = [
                    TOPIC_GRANULES_DISCOVERED,
                    TOPIC_GRANULES_RAW,
                    TOPIC_GRANULES_STATUS,
                    TOPIC_GRANULES_TRANSFORMED,
                ]
                self.consumer = AIOKafkaConsumer(
                    *consumer_topics,
                    group_id=settings.KAFKA_GROUP_ID,
                    client_id=f"{settings.KAFKA_CLIENT_ID}-consumer",
                    enable_auto_commit=False,
                    auto_offset_reset="latest",
                    session_timeout_ms=30000,
                    heartbeat_interval_ms=10000,
                    max_poll_interval_ms=300000,
                    value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                    key_deserializer=lambda k: k.decode("utf-8") if k else None,
                    **conn_kwargs,
                )
                await self.consumer.start()

                self.is_connected = True
                self._consumer_task = asyncio.create_task(self._consume_loop())
                logger.info("Kafka Producer and Consumer successfully connected and started.")
            except Exception as e:
                safe_err = str(e)
                if settings.KAFKA_SASL_PASSWORD:
                    safe_err = safe_err.replace(settings.KAFKA_SASL_PASSWORD, "******")
                logger.warning(
                    f"Could not connect to Kafka cluster ({safe_err}). "
                    "Operating in asynchronous in-memory event bus mode."
                )
                self.is_connected = False
                if self.consumer:
                    try:
                        await self.consumer.stop()
                    except Exception:
                        pass
                    self.consumer = None
                if self.producer:
                    try:
                        await self.producer.stop()
                    except Exception:
                        pass
                    self.producer = None

        if not self.is_connected:
            self._memory_dispatch_task = asyncio.create_task(self._dispatch_memory_events())
            logger.info("In-memory asynchronous event bus active (fallback mode).")

    async def stop(self) -> None:
        """Stop Kafka producer, consumer, and background tasks."""
        self._running = False
        if self._memory_dispatch_task:
            self._memory_dispatch_task.cancel()
            try:
                await self._memory_dispatch_task
            except asyncio.CancelledError:
                pass
        if self._consumer_task:
            self._consumer_task.cancel()
            try:
                await self._consumer_task
            except asyncio.CancelledError:
                pass
        if self.consumer and self.is_connected:
            try:
                await self.consumer.stop()
            except Exception as e:
                logger.error(f"Error stopping Kafka consumer: {e}")
            self.consumer = None
        if self.producer and self.is_connected:
            try:
                await self.producer.stop()
            except Exception as e:
                logger.error(f"Error stopping Kafka producer: {e}")
            self.producer = None
        self.is_connected = False

    async def publish(self, topic: str, key: str, payload: Dict[str, Any]) -> bool:
        """Publish a message to a Kafka topic or the in-memory bus."""
        if topic not in ALL_TOPICS:
            logger.warning(f"Publishing to unregistered topic: {topic}")

        if self.is_connected and self.producer:
            try:
                await self.producer.send_and_wait(topic, key=key, value=payload)
                logger.debug(f"[Kafka] Sent event to topic '{topic}' with key '{key}'")
                return True
            except Exception as e:
                logger.error(f"Failed to publish to Kafka topic '{topic}': {e}. Enqueuing in memory.")

        # Fallback to in-memory queue
        if topic not in self._memory_queues:
            self._memory_queues[topic] = asyncio.Queue()
        await self._memory_queues[topic].put((key, payload))
        logger.debug(f"[InMemory] Enqueued event to topic '{topic}' with key '{key}'")
        return True

    def register_handler(self, topic: str, handler: Callable[[Dict[str, Any]], Any]) -> None:
        """Register a handler callback for events on a topic."""
        if topic not in self._handlers:
            self._handlers[topic] = []
        self._handlers[topic].append(handler)

    async def _consume_loop(self) -> None:
        """Continuously polls Kafka topics and executes handlers with manual offset commit."""
        logger.info("Kafka consumer loop active.")
        try:
            while self._running and self.consumer:
                msg_dict = await self.consumer.getmany(timeout_ms=1000, max_records=50)
                for tp, messages in msg_dict.items():
                    for record in messages:
                        if not self._running:
                            break
                        topic = record.topic
                        payload = record.value
                        key = record.key
                        logger.info(f"[Kafka Consumer] Processing topic '{topic}' (partition {record.partition}, offset {record.offset})")

                        handlers = self._handlers.get(topic, [])
                        processing_succeeded = True
                        error_reason = ""

                        for handler in handlers:
                            try:
                                if asyncio.iscoroutinefunction(handler):
                                    await handler(payload)
                                else:
                                    await asyncio.to_thread(handler, payload)
                            except Exception as ex:
                                processing_succeeded = False
                                error_reason = str(ex)
                                logger.error(
                                    f"Handler failure on topic '{topic}' (offset {record.offset}): {ex}",
                                    exc_info=True,
                                )
                                break

                        if processing_succeeded:
                            # Commit offset ONLY after successful execution
                            try:
                                await self.consumer.commit({tp: record.offset + 1})
                                logger.debug(f"[Kafka Consumer] Committed offset {record.offset + 1} for '{topic}'")
                            except Exception as ce:
                                logger.warning(f"[Kafka Consumer] Offset commit notice for '{topic}' (offset {record.offset + 1}): {ce}")
                        else:
                            # Route failed message to DLQ
                            logger.warning(f"Routing failed event from '{topic}' to DLQ: {error_reason}")
                            try:
                                granule_id = payload.get("granule_id", "UNKNOWN") if isinstance(payload, dict) else "UNKNOWN"
                                dlq_payload = {
                                    "granule_id": granule_id,
                                    "source_stage": topic,
                                    "failed_file_path": (
                                        payload.get("transformed_file_path") or payload.get("raw_file_path")
                                        if isinstance(payload, dict) else None
                                    ),
                                    "error_reason": error_reason,
                                    "error_details": {
                                        "topic": topic,
                                        "partition": record.partition,
                                        "offset": record.offset,
                                    },
                                    "retryable": False,
                                }
                                await self.publish(TOPIC_GRANULES_DLQ, key=granule_id, payload=dlq_payload)
                                try:
                                    from app.ingestion.deduplication import dedup_ledger
                                    await dedup_ledger.update_status(granule_id, status="DLQ", error_message=error_reason)
                                except Exception as le:
                                    logger.warning(f"Could not update ledger for DLQ event {granule_id}: {le}")
                                # Commit poison pill after recording in DLQ to prevent pipeline stall
                                try:
                                    await self.consumer.commit({tp: record.offset + 1})
                                except Exception as ce:
                                    logger.warning(f"DLQ offset commit notice: {ce}")
                            except Exception as dlq_err:
                                logger.error(f"Failed to publish to DLQ or advance offset: {dlq_err}")

        except asyncio.CancelledError:
            logger.info("Kafka consumer loop cancelled.")
        except Exception as e:
            logger.error(f"Kafka consumer loop fatal error: {e}", exc_info=True)

    async def _dispatch_memory_events(self) -> None:
        """Continuously dispatches in-memory queue events to registered topic handlers."""
        while self._running:
            handled_any = False
            for topic, queue in self._memory_queues.items():
                if not queue.empty():
                    handled_any = True
                    try:
                        key, payload = queue.get_nowait()
                        handlers = self._handlers.get(topic, [])
                        for handler in handlers:
                            try:
                                if asyncio.iscoroutinefunction(handler):
                                    await handler(payload)
                                else:
                                    await asyncio.to_thread(handler, payload)
                            except Exception as ex:
                                logger.error(f"Error handling event on topic '{topic}': {ex}", exc_info=True)
                    except Exception as e:
                        logger.error(f"Error pulling from memory queue '{topic}': {e}")
            if not handled_any:
                await asyncio.sleep(0.05)


kafka_bus = KafkaBus()
