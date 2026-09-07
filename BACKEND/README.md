# RITU Platform — National Weather Big Data Analytics Backend
> **SIH 2026 PS 26069**: Scalable, high-throughput end-to-end weather data ingestion, transformation, analytics, and geospatial query platform.

---

## 1. System Architecture & End-to-End Pipeline

```
NASA PPS / OpenSearch Server (Authenticated)
              │
              ▼
   Periodic Async Scheduler (FastAPI Background)
              │
              ▼
   NASA Granule Discovery Service
              │
              ▼ [TOPIC: ritu.granules.discovered]
  Authenticated Downloader (HTTP Basic Auth + Streaming SHA-256)
              │
              ▼ [TOPIC: ritu.granules.raw]
  Deduplication & Idempotent Ledger (PostgreSQL ingestion_ledger)
              ├── If Duplicate ────► [TOPIC: ritu.granules.skipped]
              │
              └── If New ──────────► [TOPIC: ritu.granules.new]
                                            │
                                            ▼
                           NASA IMERG ZIP Archive Extractor
                                            │
                                            ▼
                           IMERG Affine Transform Converter
                           (6 GeoTIFF Bands ──► Standard CSV)
                                            │
                                            ▼
                                Strict CSV Data Validator
                                            ├── On Validation Failure ──► [TOPIC: ritu.granules.dlq]
                                            │
                                            └── On Success ─────────────► [TOPIC: ritu.granules.transformed]
                                                                                  │
                                                                                  ▼
                                                            PostgreSQL COPY Staging Table
                                                            (precipitation_observations_staging)
                                                                                  │
                                                                                  ▼
                                                            Partitioned PostGIS Table (ST_SetSRID(ST_MakePoint()))
                                                            (precipitation_observations partitioned by month)
                                                                                  │
                                                                                  ▼
                                                            Pre-aggregated Weather & Anomaly Detection
                                                            (aggregated_weather & weather_anomalies)
                                                                                  │
                                                                                  ▼
                                                            FastAPI High-Performance REST Endpoints
```

---

## 2. Kafka Topics & Event Payloads

All Kafka messages transmit lightweight JSON metadata and file pointers only — large binary archives and multi-gigabyte CSVs are stored on disk and referenced by path.

| Topic Name | Producer Stage | Consumer Stage | Description |
|---|---|---|---|
| `ritu.granules.discovered` | `GranuleDiscoveryService` | `GranuleDownloader` | Granules detected from NASA OpenSearch or PPS directory. |
| `ritu.granules.raw` | `GranuleDownloader` | `DeduplicationLedger` | Raw archive downloaded and verified with SHA-256. |
| `ritu.granules.new` | `DeduplicationLedger` | `GranuleExtractor` | New, uningested granule ready for extraction and transformation. |
| `ritu.granules.skipped` | `DeduplicationLedger` | Monitoring / Audit | Duplicate granule skipped due to existing ledger entry or checksum match. |
| `ritu.granules.transformed` | `GranuleValidator` | `BulkObservationLoader` | Validated standardized CSV ready for PostgreSQL COPY staging. |
| `ritu.granules.dlq` | `GranuleValidator` | Operations / DLQ API | Malformed or out-of-spec granule rejected during validation. |

---

## 3. Database Schema Design (PostgreSQL 16 + PostGIS)

### 3.1. Ingestion Ledger (`ingestion_ledger`)
Guarantees idempotency and complete visibility across the ingestion lifecycle:
```sql
CREATE TABLE IF NOT EXISTS ingestion_ledger (
    id BIGSERIAL PRIMARY KEY,
    granule_id VARCHAR(255) UNIQUE NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    source_url VARCHAR(1024) NOT NULL,
    observation_time TIMESTAMPTZ NOT NULL,
    file_size_bytes BIGINT,
    checksum_sha256 VARCHAR(64),
    raw_file_path VARCHAR(1024),
    transformed_file_path VARCHAR(1024),
    status VARCHAR(32) NOT NULL DEFAULT 'DISCOVERED',
    row_count BIGINT DEFAULT 0,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2. Staging Table (`precipitation_observations_staging`)
Unindexed table dedicated to high-speed bulk ingestion via `COPY FROM STDIN`:
```sql
CREATE TABLE IF NOT EXISTS precipitation_observations_staging (
    granule_id VARCHAR(128) NOT NULL,
    observation_time TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    precipitation DOUBLE PRECISION,
    ice DOUBLE PRECISION,
    liquid DOUBLE PRECISION,
    liquid_percent DOUBLE PRECISION,
    num_precip_half_hour INTEGER,
    num_valid_half_hour INTEGER
);
```

### 3.3. Partitioned Observations Table (`precipitation_observations`)
Range partitioned by `observation_time` with monthly partitions and spatial PostGIS indexing:
```sql
CREATE TABLE IF NOT EXISTS precipitation_observations (
    granule_id VARCHAR(128) NOT NULL,
    observation_time TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326),
    precipitation DOUBLE PRECISION,
    ice DOUBLE PRECISION,
    liquid DOUBLE PRECISION,
    liquid_percent DOUBLE PRECISION,
    num_precip_half_hour INTEGER,
    num_valid_half_hour INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (observation_time, granule_id, latitude, longitude)
) PARTITION BY RANGE (observation_time);
```

### 3.4. Analytics Rollups (`aggregated_weather` & `weather_anomalies`)
Pre-computed daily, 7-day, and 30-day statistics and detected extreme rainfall events.

---

## 4. IMERG Affine Transform Converter

Located at `app/ingestion/converter.py`, the converter adapts the core conversion function to read all 6 IMERG GeoTIFF layers:
1. `precipitation`: Base rainfall intensity (mm/hr).
2. `ice`: Solid precipitation content.
3. `liquid`: Liquid precipitation content.
4. `liquidPercent`: Percentage of liquid precipitation.
5. `numPrecipHalfHour`: Half-hour precipitation counts.
6. `numValidHalfHour`: Half-hour valid observation counts.

Computes precise pixel center coordinates using affine transform matrices:
$$\text{longitude} = c + (\text{col} + 0.5) \cdot a + (\text{row} + 0.5) \cdot b$$
$$\text{latitude} = f + (\text{col} + 0.5) \cdot d + (\text{row} + 0.5) \cdot e$$

Supports both global extents and spatial bounding filtering for India (`lat: 6.0° to 37.5°`, `lon: 68.0° to 97.5°`).

---

## 5. FastAPI REST API Reference

| Method | Endpoint | Query Parameters | Description |
|---|---|---|---|
| `GET` | `/health` | — | Health check, Kafka status, and scheduler status. |
| `GET` | `/api/weather/current` | `format` ('summary' or 'geojson'), `limit` | Most recent weather observations across India. |
| `GET` | `/api/weather/historical` | `start_time`, `end_time`, `min_lat`, `max_lat`, `min_lon`, `max_lon`, `limit` | Historical observations within spatial bounding box. |
| `GET` | `/api/weather/anomalies` | `limit` | Extreme rainfall and climate anomaly events. |
| `GET` | `/api/weather/point` | `latitude`, `longitude`, `radius_km`, `limit` | Point time-series for specific coordinate. |
| `GET` | `/api/ingestion/status` | — | Pipeline health, ledger metrics, scheduler state. |
| `POST` | `/api/ingestion/trigger` | — | Trigger on-demand NASA discovery and ingestion. |
| `GET` | `/api/ingestion/ledger` | `status`, `limit` | Granule records from ingestion ledger. |
| `GET` | `/api/ingestion/dlq` | — | Dead Letter Queue inspection and error reports. |

---

## 6. Running with Docker Compose

To start PostgreSQL 16 + PostGIS, Apache Kafka (KRaft mode), and the FastAPI backend:

```bash
docker-compose up -d --build
```

Interactive OpenAPI documentation will be accessible at:
- `http://localhost:8000/docs`
- `http://localhost:8000/redoc`

---

## 7. Running Unit & Integration Tests

Run the complete test suite:

```bash
pytest BACKEND/tests -v
```
