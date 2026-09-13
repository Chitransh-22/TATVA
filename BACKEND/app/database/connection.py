import logging
from typing import AsyncGenerator, Optional
import asyncpg
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings

logger = logging.getLogger(__name__)

from sqlalchemy.pool import NullPool

# Async SQLAlchemy engine
engine_kwargs = {
    "echo": settings.DEBUG,
    "connect_args": {"timeout": 60.0, "command_timeout": 60.0},
}
if settings.ENVIRONMENT == "test":
    engine_kwargs["poolclass"] = NullPool
else:
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 10,
        "pool_recycle": 3600,
        "pool_pre_ping": True,
    })

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


import time
import socket

_last_db_check_time: float = 0.0
_last_db_check_status: Optional[bool] = None


def is_database_reachable(force_check: bool = False, timeout: float = 1.0) -> bool:
    """Check if PostgreSQL host is reachable via TCP without hanging on Windows."""
    global _last_db_check_time, _last_db_check_status
    now = time.time()
    if not force_check and _last_db_check_status is not None and (now - _last_db_check_time) < 10.0:
        return _last_db_check_status

    try:
        s = socket.create_connection((settings.POSTGRES_HOST, settings.POSTGRES_PORT), timeout=timeout)
        s.close()
        _last_db_check_status = True
    except Exception:
        _last_db_check_status = False
    _last_db_check_time = now
    return _last_db_check_status


async def connect_asyncpg_with_retry(
    max_retries: int = 3,
    initial_delay: float = 1.0,
    timeout: float = 30.0,
    **extra_kwargs
) -> asyncpg.Connection:
    """Establish asyncpg connection with exponential backoff to withstand cloud cold-starts."""
    import asyncio
    conn_kwargs = {
        "host": settings.POSTGRES_HOST,
        "port": settings.POSTGRES_PORT,
        "user": settings.POSTGRES_USER,
        "password": settings.POSTGRES_PASSWORD,
        "database": settings.POSTGRES_DB,
        "timeout": timeout,
    }
    if settings.POSTGRES_SSL:
        conn_kwargs["ssl"] = settings.POSTGRES_SSL
    conn_kwargs.update(extra_kwargs)

    if not is_database_reachable():
        logger.warning(f"[PostgreSQL] Host {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT} is unreachable")
        raise ConnectionError(f"PostgreSQL host unreachable: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}")

    delay = initial_delay
    last_error: Optional[Exception] = None

    for attempt in range(1, max_retries + 1):
        try:
            return await asyncpg.connect(**conn_kwargs)
        except (asyncio.TimeoutError, TimeoutError, OSError, asyncpg.PostgresError) as ex:
            last_error = ex
            if attempt < max_retries:
                logger.warning(
                    f"[PostgreSQL] Connection attempt {attempt}/{max_retries} failed ({type(ex).__name__}: {ex}). "
                    f"Retrying in {delay:.1f}s..."
                )
                await asyncio.sleep(delay)
                delay *= 2.0
            else:
                logger.error(f"[PostgreSQL] Failed to connect after {max_retries} attempts: {ex}")
                raise last_error


async def get_asyncpg_connection() -> asyncpg.Connection:
    """Create a raw asyncpg connection for high-throughput COPY operations with retry resilience."""
    return await connect_asyncpg_with_retry()
