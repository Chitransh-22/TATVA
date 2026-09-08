import os
from pathlib import Path
from typing import List, Tuple, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator

# Base backend directory
BACKEND_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "RITU National Weather Big Data Platform"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"

    # NASA PPS & OpenSearch Configuration
    NASA_USERNAME: str = ""
    NASA_PASSWORD: str = ""
    NASA_PPS_BASE_URL: str = "https://jsimpsonhttps.pps.eosdis.nasa.gov"
    NASA_OPENSEARCH_URL: str = "https://pmmpublisher.pps.eosdis.nasa.gov/opensearch"
    NASA_CMR_URL: str = "https://cmr.earthdata.nasa.gov/search/granules.json"
    EXPLABS_API_KEY: str = ""

    # Kafka Configuration
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_ENABLED: bool = True
    KAFKA_CLIENT_ID: str = "ritu-weather-ingestor"
    KAFKA_GROUP_ID: str = "ritu-pipeline-group"
    KAFKA_SECURITY_PROTOCOL: str = "PLAINTEXT"
    KAFKA_SASL_MECHANISM: Optional[str] = None
    KAFKA_SASL_USERNAME: Optional[str] = None
    KAFKA_SASL_PASSWORD: Optional[str] = None
    KAFKA_SSL_CA_LOCATION: Optional[str] = None
    
    # Database Configuration (PostgreSQL + PostGIS)
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "ritu_db"
    POSTGRES_SSL: Optional[str] = None
    DATABASE_URL: Optional[str] = None
    DATABASE_URL_SYNC: Optional[str] = None

    @model_validator(mode="after")
    def assemble_db_urls(self) -> "Settings":
        """Construct database connection URLs from discrete parameters if not provided."""
        from urllib.parse import quote_plus
        escaped_pwd = quote_plus(self.POSTGRES_PASSWORD) if self.POSTGRES_PASSWORD else ""
        ssl_suffix = f"?ssl={self.POSTGRES_SSL}" if self.POSTGRES_SSL else ""
        ssl_sync_suffix = f"?sslmode={self.POSTGRES_SSL}" if self.POSTGRES_SSL else ""

        if not self.DATABASE_URL or "<YOUR_AZURE_PASSWORD>" in self.DATABASE_URL:
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{self.POSTGRES_USER}:{escaped_pwd}@"
                f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}{ssl_suffix}"
            )
        if not self.DATABASE_URL_SYNC or "<YOUR_AZURE_PASSWORD>" in self.DATABASE_URL_SYNC:
            self.DATABASE_URL_SYNC = (
                f"postgresql://{self.POSTGRES_USER}:{escaped_pwd}@"
                f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}{ssl_sync_suffix}"
            )
        return self

    # Data Storage Directories
    DATA_RAW_DIR: Path = BACKEND_DIR / "data" / "raw"
    DATA_EXTRACTED_DIR: Path = BACKEND_DIR / "data" / "extracted"
    DATA_TRANSFORMED_DIR: Path = BACKEND_DIR / "data" / "transformed"
    DATA_DLQ_DIR: Path = BACKEND_DIR / "data" / "dlq"

    # Scheduler Settings
    SCHEDULER_INTERVAL_MINUTES: int = 30
    SCHEDULER_ENABLED: bool = True

    # Spatial Bounds & Clipping Configuration
    # India bounding box (approx lat: 6.0 to 37.5, lon: 68.0 to 97.5)
    CLIP_TO_INDIA: bool = True
    INDIA_LAT_MIN: float = 6.0
    INDIA_LAT_MAX: float = 37.5
    INDIA_LON_MIN: float = 68.0
    INDIA_LON_MAX: float = 97.5

    # Ingestion Batch & Threading Limits
    DOWNLOAD_TIMEOUT_SECONDS: int = 300
    MAX_CONCURRENT_DOWNLOADS: int = 4
    BULK_COPY_CHUNK_SIZE: int = 50000

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def ensure_directories(self) -> None:
        """Ensure all storage directories exist."""
        self.DATA_RAW_DIR.mkdir(parents=True, exist_ok=True)
        self.DATA_EXTRACTED_DIR.mkdir(parents=True, exist_ok=True)
        self.DATA_TRANSFORMED_DIR.mkdir(parents=True, exist_ok=True)
        self.DATA_DLQ_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_directories()
