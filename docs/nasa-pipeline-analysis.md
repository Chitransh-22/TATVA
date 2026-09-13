# NASA Data Pipeline Analysis & Architecture Specification

## 1. Actual End-to-End Flow

The RITU platform implements an asynchronous, distributed, event-driven national weather data pipeline designed for NASA IMERG precipitation data. The pipeline executes end-to-end from remote NASA HTTP/OpenSearch servers all the way to a hardware-accelerated HTML5 Canvas Leaflet map on the frontend.

```
NASA PPS / OpenSearch Server (NASA GSFC)
                  │
                  ▼
       IngestionScheduler (Async loop / Startup trigger)
                  │
                  ▼
     GranuleDiscoveryService (OpenSearch + PPS Directory Scraping)
                  │
                  ▼ [Kafka Topic: ritu.granules.discovered]
       GranuleDownloader (HTTP Basic Auth + Streaming 128KB chunks + CRC32 ZIP test)
                  │
                  ▼ [Kafka Topic: ritu.granules.raw]
   DeduplicationLedgerService (PostgreSQL ingestion_ledger + SHA-256 Content Dedup)
                  ├── If Duplicate ──► [Kafka Topic: ritu.granules.status (SKIPPED)]
                  │
                  └── If New ────────► [Kafka Topic: ritu.granules.status (NEW)]
                                             │
                                             ▼
                                      GranuleExtractor (Safe ZIP decompression)
                                             │
                                             ▼
                               Affine Transform Converter (Rasterio 6-layer extraction + India clip)
                                             │
                                             ▼
                                      GranuleValidator (10-column schema, bounds & sanity checks)
                                             ├── On Failure ──► [Kafka Topic: ritu.granules.dlq + Disk JSON]
                                             │
                                             └── On Success ──► [Kafka Topic: ritu.granules.transformed]
                                                                      │
                                                                      ▼
                                                            BulkObservationLoader
                                                (asyncpg COPY -> precipitation_observations_staging)
                                                                      │
                                                                      ▼
                                                Partitioned PostGIS Table (ST_SetSRID(ST_MakePoint()))
                                                (precipitation_observations partitioned by month)
                                                                      │
                                         ┌────────────────────────────┴────────────────────────────┐
                                         ▼                                                         ▼
                             Pre-Aggregated Analytics                                  Real-Time Incremental Broadcast
                      (aggregated_weather & weather_anomalies)                      (_broadcast_granule_websocket -> WeatherWebSocketManager)
                                         │                                                         │
                                         ▼                                                         ▼
                             FastAPI REST Endpoints                                     WebSocket Server (/api/weather/ws)
                      (/api/weather/india/overview, etc.)                                          │
                                         │                                                         ▼
                                         ▼                                              useWeatherWebSocket Hook
                              React 19 Frontend App                                                │
                          (Initial snapshot synchronization)                                      ▼
                                         │                                             weatherStore (In-Memory Map)
                                         └────────────────────────────┬────────────────────────────┘
                                                                      ▼
                                                          WeatherMap Component
                                                    (Leaflet 1.9.4 + CanvasWeatherLayer)
                                                                      │
                                                                      ▼
                                                       Strict Vector Clipping Path
                                                       (data/boundaries/india_boundary.geojson)
                                                                      │
                                                                      ▼
                                                   User-Visible Rainfall Cells Plotted on Map
```

---

## 2. NASA Source

### 2.1. Exact Service and Hostnames
The platform acquires real satellite observation data from the **NASA Precipitation Processing System (PPS)** at the **NASA Goddard Space Flight Center (GSFC)** in Greenbelt, Maryland, USA:
- **Base Domain**: `https://jsimpsonhttps.pps.eosdis.nasa.gov`
- **OpenSearch Catalog Endpoint**: `https://pmmpublisher.pps.eosdis.nasa.gov/opensearch`
- **PPS Text Directory Fallback**: `https://jsimpsonhttps.pps.eosdis.nasa.gov/text/imerg/gis/{year}/{month:02d}/`
- **PPS Direct File Download Endpoint**: `https://jsimpsonhttps.pps.eosdis.nasa.gov/imerg/gis/{year}/{month:02d}/{filename}`

### 2.2. Data Products
1. **NASA IMERG Early Run Half-Hourly Precipitation Rate (`.30min.zip`)**:
   - Product Code: `3B-HHR-L.MS.MRG.3IMERG.<YYYYMMDD>-S<HHMMSS>-E<HHMMSS>.<SLOT>.V07C.30min.zip`
   - Temporal Resolution: Every 30 minutes (instantaneous rain rate).
   - Measurement Unit: `mm/hr`.
   - Spatial Resolution: $0.1^\circ \times 0.1^\circ$ (~10 km resolution).
   - Global Extent: $90^\circ\text{N} - 90^\circ\text{S}$, $180^\circ\text{W} - 180^\circ\text{E}$.
2. **NASA IMERG Multi-Day Accumulation Products (`.7day.zip`, `.3day.zip`, `.1day.zip`)**:
   - Measurement Unit: `mm` (cumulative precipitation over time window).

### 2.3. Acquisition Mechanism & Authentication
- **Protocol**: HTTPS GET requests.
- **Authentication**: HTTP Basic Authentication (`requests.auth.HTTPBasicAuth`) using `NASA_USERNAME` and `NASA_PASSWORD` configured in `BACKEND/.env` (`techy.tron321@gmail.com`).
- **SSL Verification**: Strict verification via `settings.get_nasa_ssl_verify()`, supporting custom CA certificate bundles (`NASA_SSL_CA_BUNDLE`, `REQUESTS_CA_BUNDLE`, or `CURL_CA_BUNDLE`).

### 2.4. Raw Response Format
Each granule is a ZIP archive containing 6 GeoTIFF (`.tif`) raster files and accompanying ESRI world files (`.tfw`):
1. `*.tif`: Primary precipitation rate raster (`precipitation` in mm/hr).
2. `*.ice.tif`: Solid ice precipitation content.
3. `*.liquid.tif`: Liquid precipitation content.
4. `*.liquidPercent.tif`: Percentage of liquid precipitation ($0 - 100\%$).
5. `*.numPrecipHalfHour.tif`: Number of precipitation half-hours.
6. `*.numValidHalfHour.tif`: Number of valid observation half-hours.

### 2.5. Distinction: Experimental Testing (`api-testing`) vs Production Pipeline
- `api-testing/api-testing/config.json` and `api-testing/api-testing/mdapi.py` contain testing code for **ISRO MOSDAC INSAT-3DS HEM** data (`mosdac.gov.in`), which is documented as a prospective new data source in `BACKEND/docs/new-data-source.md`.
- **The production backend does not import or call `api-testing`**.
- The production NASA pipeline is implemented in `BACKEND/app/ingestion/` and `BACKEND/app/scheduler/`.

---

## 3. Ingestion

The ingestion stage discovers, tracks, downloads, and stages raw NASA data:

1. **Discovery (`BACKEND/app/ingestion/discovery.py`)**:
   - Class: `GranuleDiscoveryService`.
   - Function: `run_discovery(emit_to_kafka=True, limit=50, product_suffix=".30min")`.
   - Queries `discover_from_opensearch(query="precip_7d", limit=50)`.
   - If OpenSearch is unavailable or returns non-JSON, falls back to `discover_from_pps_directory(year, month, limit, product_suffix)`.
   - Regular expression parsing (`parse_imerg_filename`):
     ```python
     IMERG_FILENAME_PATTERN = re.compile(
         r"^(3B-HHR.*\.(\d{8})-S(\d{6})-E(\d{6})\..*\.zip)$",
         re.IGNORECASE
     )
     ```
   - Registers discovered granules in PostgreSQL `ingestion_ledger` with initial status `DISCOVERED`.
   - Publishes `GranuleDiscoveredMessage` to Kafka topic `ritu.granules.discovered`.

2. **Downloader (`BACKEND/app/ingestion/downloader.py`)**:
   - Class: `GranuleDownloader`.
   - Method: `download_granule(source_url, file_name, expected_size, granule_id)`.
   - Concurrency Control: In-memory `asyncio.Lock` and `_active_downloads` mapping preventing duplicate simultaneous downloads for the same granule.
   - Streaming: Downloads in $128\text{ KB}$ chunks into a `.part` temporary file (`data/raw/{filename}.part`).
   - ZIP Verification: `is_valid_zip()` verifies that file size $\ge 1000$ bytes and tests archive CRC32 integrity using `zipfile.ZipFile.testzip() == None`.
   - Atomic Promotion: Once verified, renames `.part` to `target_path` (`data/raw/{filename}.zip`).
   - Checksum: Computes cryptographic SHA-256 hash across the binary file using 64 KB chunks (`compute_file_sha256`).
   - Updates `ingestion_ledger` status: `DOWNLOADING` $\to$ `DOWNLOADED`.
   - Publishes `GranuleRawMessage` to Kafka topic `ritu.granules.raw`.

3. **Scheduler (`BACKEND/app/scheduler/scheduler_service.py`)**:
   - Class: `IngestionScheduler`.
   - Asynchronous background task initiated on FastAPI startup lifespan (`app/main.py`).
   - Periodic Discovery: Executes `run_now(limit=50)` every `SCHEDULER_INTERVAL_MINUTES` (30 minutes).
   - Startup Auto-Ingest: Checks recent un-ingested 30-min granules (`.30min.zip`) and directly auto-ingests up to 4 missing granules using `download_granule_safe()` and `pipeline_service.process_granule_direct()`.
   - Rolling 7-Day Retention Cleanup: Runs every 180 seconds (3 minutes), deleting observations older than `MAX(observation_time) - INTERVAL '7 days'` and broadcasting removed IDs to WebSocket clients.

---

## 4. Kafka / Streaming

The streaming message bus decouples ingestion stages and enforces sequential delivery with manual offset commits.

### 4.1. Kafka Configuration
- **Broker**: Aiven Cloud Kafka cluster: `kafka-3b6fff-tatva-sih-2026.h.aivencloud.com:15321` (or local container in Docker Compose).
- **Security Protocol**: `SASL_SSL`
- **SASL Mechanism**: `SCRAM-SHA-256`
- **Client ID**: `ritu-weather-ingestor`
- **Consumer Group**: `ritu-pipeline-group`
- **CA Certificate**: `certs/ca.pem`
- **In-Memory Fallback**: If Kafka cluster is unreachable, `KafkaBus` (`app/ingestion/kafka_bus.py`) activates an asynchronous in-memory queue (`asyncio.Queue` per topic) to ensure zero pipeline interruption during testing or offline work.

### 4.2. Kafka Topics & Schemas

| Topic Name | Producer Class | Consumer Class | Payload Schema (`app/ingestion/topics.py`) | Description |
|---|---|---|---|---|
| `ritu.granules.discovered` | `GranuleDiscoveryService` | `WeatherIngestionPipeline.on_granule_discovered` | `GranuleDiscoveredMessage`: `{granule_id, file_name, source_url, observation_time, file_size_bytes, product_type}` | Granule detected from NASA catalog. |
| `ritu.granules.raw` | `GranuleDownloader` | `WeatherIngestionPipeline.on_granule_raw` | `GranuleRawMessage`: `{granule_id, file_name, raw_file_path, observation_time, file_size_bytes, checksum_sha256, source_url}` | Verified raw ZIP archive saved on disk. |
| `ritu.granules.status` | `DeduplicationLedgerService` | `WeatherIngestionPipeline.on_granule_status` | `GranuleLedgerMessage`: `{granule_id, file_name, observation_time, raw_file_path, action, reason, checksum_sha256}` | Evaluated action: `"NEW"` (proceed) or `"SKIPPED"` (duplicate). |
| `ritu.granules.transformed` | `GranuleValidator` | `WeatherIngestionPipeline.on_granule_transformed` | `GranuleTransformedMessage`: `{granule_id, transformed_file_path, observation_time, row_count, columns, checksum_sha256}` | Standardized, validated CSV ready for database loading. |
| `ritu.granules.dlq` | `GranuleValidator` | Dead Letter Queue / Operations | `GranuleDLQMessage`: `{granule_id, source_stage, failed_file_path, error_reason, error_details, retryable}` | Rejected granule due to schema or sanity failure. |

---

## 5. Data Processing & Transformation

Data transformation is handled by three specialized services:

### 5.1. Granule Extractor (`BACKEND/app/ingestion/extractor.py`)
- Class: `GranuleExtractor`.
- Method: `extract_zip(zip_path, granule_id)`.
- Decompresses archive to `BACKEND/data/extracted/{granule_id}/`.
- Protects against Zip Slip directory traversal vulnerabilities by discarding directory prefixes with `os.path.basename`.
- Identifies and maps all 6 GeoTIFF layer files (`precipitation`, `ice`, `liquid`, `liquidPercent`, `numPrecipHalfHour`, `numValidHalfHour`).
- Ledger status transition: `EXTRACTING` $\to$ `EXTRACTED`.

### 5.2. Affine Transform Converter (`BACKEND/app/ingestion/converter.py`)
- Function: `convert_imerg_to_standard_csv(files, granule_id, observation_time, output_file, clip_to_india)`.
- **Raster Reading**: Uses `rasterio.open()` to extract 2D numpy float32 arrays and affine georeferencing matrix (`src.transform`).
- **Coordinate Meshgrid Calculation**:
  Computes precise pixel-center geographical coordinates:
  $$\text{longitude} = c + (\text{col} + 0.5) \cdot a + (\text{row} + 0.5) \cdot b$$
  $$\text{latitude} = f + (\text{col} + 0.5) \cdot d + (\text{row} + 0.5) \cdot e$$
  where $a, b, c, d, e, f$ are affine transform coefficients from the primary GeoTIFF.
- **Geographic Clipping (India Extent)**:
  Filters coordinates to India national bounding box:
  $$\text{lat} \in [6.0^\circ\text{N}, 37.5^\circ\text{N}], \quad \text{lon} \in [68.0^\circ\text{E}, 97.5^\circ\text{E}]$$
- **Nodata & Quality Sanitization**:
  - Replaces IMERG nodata values ($-9999.0$) with `NaN` for precipitation.
  - Negative values in secondary layers clamped to $0.0$ (or $100.0$ for liquid percent).
- **Output CSV**:
  Writes standardized CSV to `BACKEND/data/transformed/{granule_id}.csv` with columns:
  `granule_id`, `observation_time`, `latitude`, `longitude`, `precipitation`, `ice`, `liquid`, `liquid_percent`, `num_precip_half_hour`, `num_valid_half_hour`.
- Ledger status transition: `TRANSFORMING`.

### 5.3. Granule Validator (`BACKEND/app/ingestion/validator.py`)
- Class: `GranuleValidator`.
- Method: `validate_csv(csv_path)`.
- Validations:
  1. File exists and size $> 0$ bytes.
  2. All 10 required columns present.
  3. Latitude $\in [-90.0, 90.0]$, Longitude $\in [-180.0, 180.0]$.
  4. No null values in latitude or longitude coordinates.
  5. Minimum precipitation $\ge 0.0\text{ mm/hr}$.
  6. Maximum precipitation $\le 5000.0\text{ mm/hr}$ for half-hourly rate (or $\le 50000.0\text{ mm}$ for multi-day accumulation).
  7. No null values in `granule_id` or `observation_time`.
- Failure Path: Writes error report to `BACKEND/data/dlq/{granule_id}_dlq_error.json`, marks ledger `FAILED_VALIDATION`, emits `ritu.granules.dlq`.
- Success Path: Marks ledger `VALIDATED`, emits `ritu.granules.transformed`.

---

## 6. Database

The platform utilizes **PostgreSQL 16 with the PostGIS extension**, hosted on Azure Database for PostgreSQL Flexible Server.

### 6.1. Database Tables

#### 1. Ingestion Ledger (`ingestion_ledger`)
Guarantees strict lifecycle tracking and idempotency:
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
CREATE INDEX IF NOT EXISTS idx_ledger_status_time ON ingestion_ledger (status, observation_time);
CREATE INDEX IF NOT EXISTS idx_ledger_granule ON ingestion_ledger (granule_id);
```

#### 2. Staging Table (`precipitation_observations_staging`)
Unindexed table dedicated to high-speed bulk ingestion via `asyncpg copy_to_table`:
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
    num_valid_half_hour INTEGER,
    source VARCHAR(64) DEFAULT 'NASA',
    product VARCHAR(64) DEFAULT 'IMERG',
    state VARCHAR(128),
    district VARCHAR(128)
);
```

#### 3. Partitioned Observations Table (`precipitation_observations`)
Range partitioned by `observation_time` with dynamic monthly child tables (e.g. `precipitation_observations_y2026m09`):
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
    source VARCHAR(64) DEFAULT 'NASA',
    product VARCHAR(64) DEFAULT 'IMERG',
    state VARCHAR(128),
    district VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (observation_time, granule_id, latitude, longitude)
) PARTITION BY RANGE (observation_time);

CREATE INDEX IF NOT EXISTS idx_precip_obs_time_only ON precipitation_observations (observation_time DESC);
CREATE INDEX IF NOT EXISTS idx_precip_obs_state_district ON precipitation_observations (state, district);
```

### 6.2. Bulk Loading & Upsert Execution (`app/ingestion/loader.py`)
1. Purges prior partial staging records for the granule:
   `DELETE FROM precipitation_observations_staging WHERE granule_id = $1;`
2. Creates monthly partition if missing (`ensure_monthly_partition`).
3. Streams CSV using `conn.copy_to_table("precipitation_observations_staging", source=f, format="csv", header=True)`.
4. Executes atomic upsert with spatial point geometry generation:
   ```sql
   INSERT INTO precipitation_observations (
       granule_id, observation_time, latitude, longitude, geom,
       precipitation, ice, liquid, liquid_percent,
       num_precip_half_hour, num_valid_half_hour, source, product
   )
   SELECT
       granule_id, observation_time, latitude, longitude,
       ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
       precipitation, ice, liquid, liquid_percent,
       num_precip_half_hour, num_valid_half_hour,
       COALESCE(source, $2), COALESCE(product, $3)
   FROM precipitation_observations_staging
   WHERE granule_id = $1
   ON CONFLICT (observation_time, granule_id, latitude, longitude) DO UPDATE
   SET precipitation = EXCLUDED.precipitation,
       ice = EXCLUDED.ice,
       liquid = EXCLUDED.liquid,
       liquid_percent = EXCLUDED.liquid_percent,
       num_precip_half_hour = EXCLUDED.num_precip_half_hour,
       num_valid_half_hour = EXCLUDED.num_valid_half_hour,
       source = EXCLUDED.source,
       product = EXCLUDED.product;
   ```
5. Cleans up staging table: `DELETE FROM precipitation_observations_staging WHERE granule_id = $1;`
6. Updates ledger status: `PERSISTED` $\to$ `COMPLETED`.

---

## 7. Backend API

The FastAPI application provides high-performance REST endpoints for visualization and pipeline administration:

| Method | Endpoint | Query Parameters | Description |
|---|---|---|---|
| `GET` | `/api/weather/india/overview` | `observation_time`, `window_days` (default 7), `grid_step` (default 0.2/0.5) | Canonical India overview: national metrics, state summaries, canvas grid points. |
| `GET` | `/api/weather/state/{state_name}` | `observation_time`, `grid_step` | State metrics, district summaries, observation points within state boundary. |
| `GET` | `/api/weather/district/{state}/{district}` | `observation_time` | District metrics, rainfall history, point observations. |
| `GET` | `/api/weather/snapshot/7day` | `state`, `district`, `grid_step`, `min_precipitation`, `limit` | Direct database-level 7-day rolling window query. |
| `GET` | `/api/weather/metadata` | — | Latest observation timestamps (UTC & IST), active granule ID, point count. |
| `GET` | `/api/weather/diagnostic` | — | Pipeline health check: PPS source latest vs ingestion ledger latest vs database latest. |
| `POST` | `/api/ingestion/nasa/imerg` | Request body: `{limit, query, local_test_zip}` | Asynchronously triggers background NASA IMERG ingestion run. |
| `GET` | `/api/ingestion/nasa/imerg/status/{run_id}` | Path parameter: `run_id` | Polls progress and stage counts of NASA IMERG ingestion run. |
| `POST` | `/api/ingestion/trigger` | — | Triggers on-demand discovery run in background. |
| `GET` | `/api/ingestion/status` | — | Ingestion pipeline health, Kafka mode, ledger metrics. |
| `GET` | `/api/ingestion/ledger` | `status`, `limit` | Lists recent entries in `ingestion_ledger`. |
| `GET` | `/api/ingestion/dlq` | — | Lists validation error reports from Dead Letter Queue. |

---

## 8. WebSocket / Real-Time Telemetry

Real-time telemetry streams live NASA weather updates directly into frontend clients without polling.

### 8.1. Endpoint & Manager
- **Endpoint**: `WebSocket /api/weather/ws` (`BACKEND/app/api/weather.py`).
- **Manager**: `WeatherWebSocketManager` (`BACKEND/app/api/ws_manager.py`).
- **Client Protocol**:
  - `{"action": "subscribe", "state": "<state>", "district": "<district>", "parameter": "precipitation"}`
  - `{"action": "ping"}` $\to$ responds with `{"type": "pong"}`
  - `{"action": "unsubscribe"}`

### 8.2. Broadcast Triggering & Payload
1. **Upon Granule Ingestion (`app/ingestion/pipeline.py`)**:
   Method `_broadcast_granule_websocket(csv_path, granule_id, obs_time)` samples up to 400 points with precipitation $\ge 0.1\text{ mm/hr}$ and calls `weather_ws_manager.broadcast_batch(...)`.
2. **WebSocket Message Payload**:
   ```json
   {
     "type": "weather_batch",
     "action": "upsert",
     "version": 1001,
     "timestamp": "2026-09-01T00:00:00+00:00",
     "timestamp_ist": "2026-09-01 05:30 IST",
     "granule_id": "3B-HHR-L.MS.MRG.3IMERG.20260901-S000000-E002959.0000.V07C.30min",
     "updates_count": 400,
     "updates": [
       {
         "id": "28.50_77.20",
         "lat": 28.5,
         "lon": 77.2,
         "value": 14.8,
         "precipitation": 14.8,
         "liquid": 14.8,
         "ice": 0.0,
         "liquid_percent": 100.0,
         "timestamp": "2026-09-01T00:00:00+00:00"
       }
     ],
     "removals": [],
     "summary": {
       "avg_precipitation": 8.4,
       "max_precipitation": 64.2,
       "total_points": 185850,
       "rain_category": "Heavy Rainfall"
     }
   }
   ```
3. **Upon Rolling 7-Day Cleanup**:
   Scheduler broadcasts `{"type": "weather_remove", "ids": ["28.50_77.20", ...]}` to drop expired records.

---

## 9. Frontend Architecture

The frontend is built using React 19, Vite, and Tailwind CSS v4:

1. **State Management (`FRONTEND/src/App.jsx`)**:
   - Single source of truth for navigation state (`mapLevel`: `india` | `state` | `district`, `selectedState`, `selectedDistrict`).
   - Caches previous responses in `overviewCacheRef`, `stateCacheRef`, `districtCacheRef`.
   - Uses `AbortController` (`abortAllInFlight()`) to cancel stale in-flight requests during rapid clicks.

2. **Persistent WebSocket Client (`FRONTEND/src/hooks/useWeatherWebSocket.js`)**:
   - Connects to `/api/weather/ws`.
   - Heartbeat: Sends `{"action": "ping"}` every 20 seconds.
   - Reconnect: Exponential backoff ($1\text{s}, 2\text{s}, 4\text{s}, 8\text{s}$, up to $15\text{s}$).
   - On reconnect, triggers `onReconnect` snapshot resynchronization.

3. **In-Memory Weather Store (`FRONTEND/src/data/weatherStore.js`)**:
   - High-performance `Map` keyed by `${lat.toFixed(2)}_${lon.toFixed(2)}`.
   - `loadSnapshot()`: Loads REST initial state; protects against race conditions by never overwriting points that received newer WebSocket events.
   - `applyBatch()`: Rejects out-of-order updates by timestamp; updates existing points in place; adds new points.
   - `removeIds()`: Removes pruned points.
   - `pruneExpiredRecords()`: Periodic timer (every 30 seconds) purges points older than 7 days.
   - Notifies map rendering listeners.

---

## 10. Map Plotting

Map visualization is implemented in `FRONTEND/src/components/WeatherMap.jsx`:

1. **Leaflet Base**:
   - Library: Leaflet 1.9.4 (`L.map`).
   - Base Tile Layer: CartoDB Positron / OSM tiles (`L.tileLayer`).
   - Boundary Layers: `india_boundary.geojson` and `india_states.geojson` fetched and cached at module load.

2. **Custom Canvas Weather Layer (`CanvasWeatherLayer`)**:
   - Inherits from `L.Layer.extend`.
   - Injects an HTML5 `<canvas>` element into Leaflet's `overlayPane`.
   - Repositioned and resized on Leaflet map pan, zoom, and container resize events.

3. **Strict Vector Boundary Clipping**:
   - Traces official India polygon geometry onto the 2D canvas context via `addGeometryToCanvasPath(ctx, map, clipGeometry)`.
   - Invokes `ctx.clip('evenodd')` to create a pixel-perfect clipping mask. Rainfall pixels outside the official international boundary of India are clipped.

4. **Viewport Culling & Cell Drawing**:
   - Checks bounding box:
     $$\text{south} - \text{step} \le \text{lat} \le \text{north} + \text{step}, \quad \text{west} - \text{step} \le \text{lon} \le \text{east} + \text{step}$$
   - Converts geographic coordinates to pixel coordinates:
     ```javascript
     const nw = map.latLngToContainerPoint([lat + step / 2, lon - step / 2]);
     const se = map.latLngToContainerPoint([lat - step / 2, lon + step / 2]);
     const x = Math.min(nw.x, se.x);
     const y = Math.min(nw.y, se.y);
     const w = Math.max(Math.ceil(Math.abs(se.x - nw.x)), 2);
     const h = Math.max(Math.ceil(Math.abs(se.y - nw.y)), 2);
     ```
   - Color Mapping (`Legend.jsx`):
     - $\ge 100.0\text{ mm/hr}$: `#8b5cf6` (Torrential Downpour)
     - $\ge 50.0\text{ mm/hr}$: `#ef4444` (Very Heavy Rain)
     - $\ge 15.0\text{ mm/hr}$: `#f59e0b` (Heavy Rain)
     - $\ge 2.5\text{ mm/hr}$: `#3b82f6` (Moderate Rain)
     - $\ge 0.1\text{ mm/hr}$: `#38bdf8` (Light Rain)
   - Paints raster cell: `ctx.fillStyle = color; ctx.fillRect(x, y, w, h);`.
   - Render Loop: Throttled using `requestAnimationFrame` on `weatherStore.subscribe()` for smooth 60fps rendering without re-creating DOM or Leaflet layers.

---

## 11. Data Schema

### 11.1. Core PostgreSQL Observation Model (`PrecipitationObservation`)
```sql
Table: precipitation_observations
-----------------------------------------------------------------------------
Column Name             Type                Constraints / Details
-----------------------------------------------------------------------------
observation_time        TIMESTAMPTZ         PRIMARY KEY, Range Partition Key
granule_id              VARCHAR(128)        PRIMARY KEY, Unique NASA Granule ID
latitude                DOUBLE PRECISION    PRIMARY KEY, Decimal Degrees North
longitude               DOUBLE PRECISION    PRIMARY KEY, Decimal Degrees East
geom                    GEOMETRY(Point,4326) PostGIS 2D Point (SRID 4326), GIST Index
precipitation           DOUBLE PRECISION    Rainfall Rate (mm/hr)
ice                     DOUBLE PRECISION    Solid precipitation content
liquid                  DOUBLE PRECISION    Liquid precipitation content
liquid_percent          DOUBLE PRECISION    Percentage of liquid precipitation (0-100%)
num_precip_half_hour    INTEGER             Half-hour precipitation counts
num_valid_half_hour     INTEGER             Half-hour valid observation counts
source                  VARCHAR(64)         Default 'NASA'
product                 VARCHAR(64)         Default 'IMERG'
state                   VARCHAR(128)        State name (indexed)
district                VARCHAR(128)        District name (indexed)
created_at              TIMESTAMPTZ         Record insertion timestamp
```

### 11.2. Transformed CSV Schema (`data/transformed/{granule_id}.csv`)
```csv
granule_id,observation_time,latitude,longitude,precipitation,ice,liquid,liquid_percent,num_precip_half_hour,num_valid_half_hour
3B-HHR-L.MS.MRG.3IMERG.20260901-S000000-E002959.0000.V07C.30min,2026-09-01T00:00:00+00:00,28.5,77.2,14.8,0.0,14.8,100.0,1,1
```

---

## 12. Historical Data Flow

1. **Active Rolling Window**:
   - The platform enforces an active rolling 7-day retention window in PostgreSQL.
   - Queries to `/api/weather/snapshot/7day` and `/api/weather/india/overview` filter:
     ```sql
     WHERE observation_time >= NOW() - INTERVAL '7 days'
       AND observation_time <= NOW()
     ```
2. **Scheduled Automated Purging (`app/scheduler/scheduler_service.py`)**:
   - Every 180 seconds, `cleanup_expired_observations(days=7)` executes:
     ```sql
     DELETE FROM precipitation_observations
     WHERE observation_time < :cutoff
     RETURNING latitude, longitude;
     ```
   - Cutoff anchor $T$ is determined from `MAX(observation_time)` in the database.
   - Discovers deleted points and calls `weather_ws_manager.broadcast_removals(removed_ids)`.
3. **Frontend Historical Resynchronization**:
   - When user adjusts the timeline or reconnects, the frontend requests `/api/weather/india/overview?observation_time=<ISO>`.
   - The response populates `weatherStore.loadSnapshot()`.

---

## 13. Real-Time Data Flow

1. **Granule Arrival**:
   - Every 30 minutes, NASA publishes a new half-hourly IMERG granule (`.30min.zip`).
   - The `IngestionScheduler` or `POST /api/ingestion/nasa/imerg` triggers discovery.
2. **Stream Processing**:
   - Discovered $\to$ Downloaded $\to$ Extracted $\to$ Affine Transformed $\to$ Validated $\to$ Loaded into `precipitation_observations`.
3. **Incremental Push**:
   - Once loaded, `pipeline_service._broadcast_granule_websocket()` extracts active precipitation points ($p \ge 0.1$).
   - Calls `weather_ws_manager.broadcast_batch()` with `action: "upsert"`.
4. **Instant Map Update**:
   - Frontend `useWeatherWebSocket` receives JSON frame.
   - Calls `weatherStore.applyBatch()`.
   - `weatherStore` validates timestamp and updates in-memory map.
   - `CanvasWeatherLayer` triggers `requestAnimationFrame` redraw.
   - Updated precipitation cells appear on the Leaflet map in real time without refreshing or recreating layers.

---

## 14. Error / Retry Handling

| Failure Scenario | Component Responsible | Strategy & Behavior |
|---|---|---|
| NASA PPS SSL handshake failure | `Settings.get_nasa_ssl_verify()` | Custom CA certificate resolution via `NASA_SSL_CA_BUNDLE` or standard environment variables (`REQUESTS_CA_BUNDLE`). |
| Network timeout during granule download | `GranuleDownloader` | Streaming chunks into `.part` temporary file; stale partial files cleaned up before retry; concurrency lock prevents duplicate requests. |
| Corrupt or incomplete ZIP archive | `GranuleDownloader.is_valid_zip` | CRC32 archive test (`testzip()`); corrupted files discarded and redownloaded; status set to `FAILED`. |
| Missing local ZIP file on extraction | `WeatherIngestionPipeline.on_granule_new` | Automatic recovery download from NASA PPS; up to 3 retries before marking status `FAILED`. |
| Duplicate granule or duplicate content hash | `DeduplicationLedgerService` | Verifies `granule_id` and SHA-256 file checksum against `ingestion_ledger`; routes to `SKIPPED` topic without re-extraction or re-loading. |
| CSV validation failure (schema/bounds/range) | `GranuleValidator` | Rejects malformed records; writes diagnostic JSON to `data/dlq/{granule_id}_dlq_error.json`; marks status `FAILED_VALIDATION`; emits to `ritu.granules.dlq`. |
| PostgreSQL database connection loss | `BulkObservationLoader` | Connection retry with exponential backoff (`connect_asyncpg_with_retry`, 3 retries); rollback of staging records. |
| Kafka broker unreachable | `KafkaBus` | Seamless automatic fallback to in-memory asynchronous queues (`asyncio.Queue` per topic); zero application crash. |
| Frontend WebSocket disconnect | `useWeatherWebSocket` | Exponential backoff reconnection (1s, 2s, 4s, 8s, up to 15s max); on reconnection, triggers REST snapshot resynchronization. |
| Out-of-order WebSocket frames | `WeatherStore` | Compares incoming ISO timestamp against stored point timestamp; drops older out-of-order packets. |

---

## 15. Verified Files and Functions

| Pipeline Stage | File | Function / Class | Responsibility |
|---|---|---|---|
| Configuration | `BACKEND/app/config.py` | `Settings` | Environment variables, NASA credentials, PPS base URLs, Kafka SASL_SSL, database connection strings, spatial bounds. |
| Discovery | `BACKEND/app/ingestion/discovery.py` | `GranuleDiscoveryService.discover_from_opensearch` | Queries NASA OpenSearch REST API (`q=precip_7d&limit=50`). |
| Discovery | `BACKEND/app/ingestion/discovery.py` | `GranuleDiscoveryService.discover_from_pps_directory` | Scrapes NASA PPS text directory for `.zip` listings. |
| Discovery | `BACKEND/app/ingestion/discovery.py` | `parse_imerg_filename` | Regex extraction of observation timestamp and granule ID from IMERG filename. |
| Download | `BACKEND/app/ingestion/downloader.py` | `GranuleDownloader.download_granule` | Authenticated streaming HTTP download, `.part` temporary staging, ZIP CRC32 test. |
| Download | `BACKEND/app/ingestion/downloader.py` | `is_valid_zip` | Validates archive integrity via `zipfile.ZipFile.testzip()`. |
| Deduplication | `BACKEND/app/ingestion/deduplication.py` | `DeduplicationLedgerService.evaluate_and_route` | Evaluates file existence, SHA-256 hash, and ledger completion; routes to `NEW` or `SKIPPED`. |
| Extraction | `BACKEND/app/ingestion/extractor.py` | `GranuleExtractor.extract_zip` | Safe archive decompression and resolution of 6 GeoTIFF layer files. |
| Conversion | `BACKEND/app/ingestion/converter.py` | `convert_imerg_to_standard_csv` | Reads GeoTIFF rasters via `rasterio`, computes pixel center coordinates via Affine transformation, clips to India bounds, outputs standardized CSV. |
| Validation | `BACKEND/app/ingestion/validator.py` | `GranuleValidator.validate_csv` | Checks 10 required columns, coordinate ranges, null thresholds, and precipitation sanity limits ($\le 5000\text{ mm/hr}$). |
| DLQ Handling | `BACKEND/app/ingestion/validator.py` | `GranuleValidator.handle_transformed_file` | Writes validation failure report to `data/dlq/` and publishes to `ritu.granules.dlq`. |
| Bulk Loading | `BACKEND/app/ingestion/loader.py` | `BulkObservationLoader.load_csv` | Executes `asyncpg copy_to_table` into staging, creates monthly partitions, and performs idempotent PostGIS upsert. |
| Orchestration | `BACKEND/app/ingestion/pipeline.py` | `WeatherIngestionPipeline.setup_event_subscribers` | Registers event handlers on Kafka topics (`discovered`, `raw`, `status`, `transformed`). |
| Orchestration | `BACKEND/app/ingestion/pipeline.py` | `WeatherIngestionPipeline._broadcast_granule_websocket` | Downsamples loaded CSV (up to 400 points, $p \ge 0.1$) and triggers real-time WebSocket broadcast. |
| Scheduling | `BACKEND/app/scheduler/scheduler_service.py` | `IngestionScheduler.run_now` | Triggers immediate discovery and auto-ingests recent un-ingested 30-min granules. |
| Retention | `BACKEND/app/scheduler/scheduler_service.py` | `IngestionScheduler.cleanup_expired_observations` | Purges observations older than 7 days and triggers removal broadcasts. |
| Message Bus | `BACKEND/app/ingestion/kafka_bus.py` | `KafkaBus.start` / `publish` / `_consume_loop` | AIOKafka producer and consumer management with SASL_SSL and in-memory queue fallback. |
| Database Models | `BACKEND/app/database/models.py` | `PrecipitationObservation`, `IngestionLedger` | Declarative SQLAlchemy schema models for partitioned observations and ledger. |
| Migrations | `BACKEND/app/database/migrations.py` | `run_migrations`, `ensure_monthly_partition` | DDL execution, PostGIS extension initialization, dynamic monthly partition creation. |
| REST API | `BACKEND/app/api/weather.py` | `get_india_overview` | Returns national summary, state summaries, and canvas grid points. |
| REST API | `BACKEND/app/api/weather.py` | `get_7day_weather_snapshot` | Queries 7-day active observation window directly from database. |
| REST API | `BACKEND/app/api/ingestion.py` | `trigger_nasa_imerg_ingestion` | Triggers background execution of NASA IMERG pipeline with run status tracking. |
| Real-Time WS | `BACKEND/app/api/ws_manager.py` | `WeatherWebSocketManager.broadcast_batch` | Broadcasts incremental `weather_batch` updates to active subscribers. |
| Real-Time WS | `BACKEND/app/api/weather.py` | `weather_websocket_endpoint` | Bidirectional WebSocket route (`/api/weather/ws`) handling client subscriptions. |
| Frontend Store | `FRONTEND/src/data/weatherStore.js` | `WeatherStore.loadSnapshot` / `applyBatch` | Client-side in-memory coordinate Map, race condition resolution, timestamp sorting. |
| Frontend Hook | `FRONTEND/src/hooks/useWeatherWebSocket.js` | `useWeatherWebSocket` | WebSocket connection lifecycle, heartbeat ping, exponential backoff reconnection. |
| Map Layer | `FRONTEND/src/components/WeatherMap.jsx` | `WeatherMap` / `CanvasWeatherLayer` | Leaflet canvas layer, vector polygon clipping (`india_boundary.geojson`), viewport culling, 60fps requestAnimationFrame redraw. |
| Map Legend | `FRONTEND/src/components/Legend.jsx` | `getPrecipitationColor` | Maps rainfall values (mm/hr) to color palette. |

---

## 16. Unknown / Unverified Components

1. **ISRO MOSDAC Production Ingestion**:
   - `api-testing/api-testing/mdapi.py` and `BACKEND/docs/new-data-source.md` document ISRO MOSDAC INSAT-3DS HEM data acquisition.
   - Status: **EXPERIMENTAL TESTING ONLY**.
   - Not imported or invoked in the current backend runtime.
2. **NASA CMR (Common Metadata Repository)**:
   - Setting `NASA_CMR_URL = "https://cmr.earthdata.nasa.gov/search/granules.json"` is defined in `BACKEND/app/config.py`.
   - Status: **NOT CURRENTLY QUERIED BY PRODUCTION PIPELINE** (pipeline currently uses NASA OpenSearch and NASA PPS text directory).
3. **EXPLABS API**:
   - Setting `EXPLABS_API_KEY` is present in `BACKEND/app/config.py`.
   - Status: **UNUSED IN ACTIVE INGESTION CODE**.
