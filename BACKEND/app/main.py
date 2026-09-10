import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
from app.config import settings
from app.database.migrations import run_migrations
from app.ingestion.kafka_bus import kafka_bus
from app.ingestion.pipeline import pipeline_service
from app.ingestion.topics import ALL_TOPICS
from app.scheduler.scheduler_service import ingestion_scheduler
from app.api.ws_manager import weather_ws_manager
from app.api.weather import router as weather_router
from app.api.ingestion import router as ingestion_router

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ritu")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown lifecycle."""
    logger.info("Initializing RITU Weather Big Data Platform...")
    
    # 1. Database migrations
    try:
        await run_migrations()
    except Exception as me:
        logger.warning(f"Database migration deferred or skipped during startup: {me}")

    # 2. Setup pipeline topic subscribers
    pipeline_service.setup_event_subscribers()

    # 3. Start Kafka Event Bus
    await kafka_bus.start()

    # 4. Start periodic scheduler
    if settings.SCHEDULER_ENABLED:
        await ingestion_scheduler.start()

    # 5. Start real-time WebSocket incremental broadcaster
    await weather_ws_manager.start()

    logger.info("RITU Weather Big Data Platform is ready.")
    yield

    # Shutdown
    logger.info("Shutting down RITU Platform...")
    await weather_ws_manager.stop()
    await ingestion_scheduler.stop()
    await kafka_bus.stop()
    logger.info("Shutdown complete.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="SIH 2026 PS 26069 — National Weather Big Data Analytics Platform",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(weather_router, prefix="/api")
app.include_router(ingestion_router, prefix="/api")


@app.get("/")
async def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "HEALTHY",
        "docs_url": "/docs",
    }


@app.get("/health")
async def health_check():
    db_ok = False
    try:
        conn_kwargs = {
            "host": settings.POSTGRES_HOST,
            "port": settings.POSTGRES_PORT,
            "user": settings.POSTGRES_USER,
            "password": settings.POSTGRES_PASSWORD,
            "database": settings.POSTGRES_DB,
            "timeout": 5.0,
        }
        if settings.POSTGRES_SSL:
            conn_kwargs["ssl"] = settings.POSTGRES_SSL
        conn = await asyncpg.connect(**conn_kwargs)
        await conn.close()
        db_ok = True
    except Exception:
        db_ok = False

    kafka_ok = kafka_bus.is_connected
    if not settings.KAFKA_ENABLED:
        kafka_ok = True
    elif not kafka_ok:
        try:
            import socket
            server_entry = settings.KAFKA_BOOTSTRAP_SERVERS.split(",")[0].strip().strip("\"'")
            host, port_s = server_entry.split(":")
            s = socket.create_connection((host, int(port_s)), timeout=2.0)
            s.close()
            kafka_ok = True
        except Exception:
            kafka_ok = False

    status = "HEALTHY" if (db_ok and kafka_ok) else ("DEGRADED" if (db_ok or kafka_ok) else "UNHEALTHY")

    return {
        "status": status,
        "service": settings.PROJECT_NAME,
        "fastapi_reachable": True,
        "postgresql_reachable": db_ok,
        "kafka_reachable": kafka_ok,
        "database_connected": db_ok,
        "kafka_connected": kafka_bus.is_connected,
        "scheduler_active": getattr(ingestion_scheduler, "_running", False),
    }


@app.get("/health/db")
async def health_db():
    """Verify PostgreSQL connectivity and PostGIS extension status."""
    try:
        conn_kwargs = {
            "host": settings.POSTGRES_HOST,
            "port": settings.POSTGRES_PORT,
            "user": settings.POSTGRES_USER,
            "password": settings.POSTGRES_PASSWORD,
            "database": settings.POSTGRES_DB,
            "timeout": 5.0,
        }
        if settings.POSTGRES_SSL:
            conn_kwargs["ssl"] = settings.POSTGRES_SSL
        conn = await asyncpg.connect(**conn_kwargs)
        postgis_ver = None
        postgis_ok = False
        try:
            postgis_ver = await conn.fetchval("SELECT PostGIS_Version();")
            postgis_ok = True
        except Exception:
            postgis_ok = False
        pg_ver = await conn.fetchval("SHOW server_version;")
        await conn.close()
        return {
            "status": "HEALTHY",
            "postgresql_reachable": True,
            "database": settings.POSTGRES_DB,
            "host": settings.POSTGRES_HOST,
            "port": settings.POSTGRES_PORT,
            "postgresql_version": pg_ver,
            "postgis_version": postgis_ver,
            "postgis_enabled": postgis_ok,
        }
    except Exception as e:
        safe_error = str(e)
        if settings.POSTGRES_PASSWORD:
            safe_error = safe_error.replace(settings.POSTGRES_PASSWORD, "******")
        return {
            "status": "UNHEALTHY",
            "postgresql_reachable": False,
            "database": settings.POSTGRES_DB,
            "host": settings.POSTGRES_HOST,
            "port": settings.POSTGRES_PORT,
            "error": safe_error,
            "postgis_enabled": False,
        }


@app.get("/health/kafka")
async def health_kafka():
    """Verify Kafka broker connectivity, KRaft mode, and topic registration."""
    if not settings.KAFKA_ENABLED:
        return {
            "status": "DISABLED",
            "kafka_reachable": False,
            "mode": "in-memory",
            "bootstrap_servers": settings.KAFKA_BOOTSTRAP_SERVERS,
            "connected": False,
            "registered_topics": ALL_TOPICS,
        }

    broker_reachable = False
    try:
        import socket
        server_entry = settings.KAFKA_BOOTSTRAP_SERVERS.split(",")[0].strip().strip("\"'")
        host, port_s = server_entry.split(":")
        s = socket.create_connection((host, int(port_s)), timeout=2.0)
        s.close()
        broker_reachable = True
    except Exception:
        broker_reachable = False

    is_connected = kafka_bus.is_connected

    return {
        "status": "HEALTHY" if (is_connected or broker_reachable) else "UNHEALTHY",
        "kafka_reachable": is_connected or broker_reachable,
        "mode": "KRaft" if broker_reachable else "in-memory fallback",
        "bootstrap_servers": settings.KAFKA_BOOTSTRAP_SERVERS,
        "connected": is_connected,
        "client_id": settings.KAFKA_CLIENT_ID,
        "group_id": settings.KAFKA_GROUP_ID,
        "registered_topics": ALL_TOPICS,
    }
