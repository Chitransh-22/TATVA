import logging
from typing import AsyncGenerator
import asyncpg
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings

logger = logging.getLogger(__name__)

from sqlalchemy.pool import NullPool

# Async SQLAlchemy engine
engine_kwargs = {
    "echo": settings.DEBUG,
    "connect_args": {"timeout": 3.0},
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


async def get_asyncpg_connection() -> asyncpg.Connection:
    """Create a raw asyncpg connection for high-throughput COPY operations."""
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
    return await asyncpg.connect(**conn_kwargs)
