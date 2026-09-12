import os
from pathlib import Path
from typing import List, Tuple, Optional, Union, Any
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
    NASA_SSL_CA_BUNDLE: Optional[str] = None
    EXPLABS_API_KEY: str = ""

    # ISRO MOSDAC Configuration (INSAT-3DS)
    MOSDAC_USERNAME: str = "techy.tron321@gmail.com"
    MOSDAC_PASSWORD: str = "@Aizen-Zoro-11"
    MOSDAC_TOKEN_URL: str = "https://mosdac.gov.in/download_api/gettoken"
    MOSDAC_SEARCH_URL: str = "https://mosdac.gov.in/apios/datasets.json"
    MOSDAC_DOWNLOAD_URL: str = "https://mosdac.gov.in/download_api/download"
    MOSDAC_DEFAULT_DATASET: str = "3SIMG_L2B_HEM"

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
    DATA_MOSDAC_RAW_DIR: Path = BACKEND_DIR / "data" / "mosdac" / "raw"
    DATA_MOSDAC_TRANSFORMED_DIR: Path = BACKEND_DIR / "data" / "mosdac" / "transformed"

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
        self.DATA_MOSDAC_RAW_DIR.mkdir(parents=True, exist_ok=True)
        self.DATA_MOSDAC_TRANSFORMED_DIR.mkdir(parents=True, exist_ok=True)

    def resolve_raw_path(self, raw_path: Optional[Any] = None, file_name: Optional[str] = None) -> Path:
        """Dynamically resolve raw ZIP archive path to current DATA_RAW_DIR.

        Safely rebases incoming paths from different developer machines or environments
        onto the current project's DATA_RAW_DIR.
        """
        if raw_path:
            p = Path(raw_path)
            if p.is_file() and p.exists():
                return p.resolve()
            return (self.DATA_RAW_DIR / p.name).resolve()
        if file_name:
            return (self.DATA_RAW_DIR / file_name).resolve()
        return self.DATA_RAW_DIR.resolve()

    def get_nasa_ssl_verify(self) -> Union[str, bool]:
        """Resolve SSL verification parameter for NASA HTTP requests.
        
        Supports custom CA certificates via NASA_SSL_CA_BUNDLE or standard env vars.
        Defaults to True for strict certificate verification. Never disables verification globally.
        """
        if self.NASA_SSL_CA_BUNDLE:
            p = Path(self.NASA_SSL_CA_BUNDLE)
            if not p.is_absolute():
                p = BACKEND_DIR / p
            if p.exists():
                return str(p.resolve())
        # Check standard environment variables
        for env_key in ("REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "SSL_CERT_FILE"):
            val = os.getenv(env_key)
            if val and Path(val).exists():
                return val
        return True


settings = Settings()
settings.ensure_directories()
