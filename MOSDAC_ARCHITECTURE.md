# TATVA &bull; MOSDAC Multi-Product Ingestion Platform Architecture

## 1. Executive Summary & Core Principles

The **TATVA MOSDAC Multi-Product Platform** is a high-throughput, modular satellite observation ingestion and visualization engine built for Indian Space Research Organisation (ISRO) earth observation streams. It ingests geostationary (INSAT-3DS) and polar-orbiting (Oceansat-3) products across three foundational domains: **Weather**, **Environment**, and **Ocean**.

```
                           +------------------------------------------+
                           | ISRO MOSDAC OpenSearch & Data Repositories|
                           +------------------------------------------+
                                                |
                                                v
                           +------------------------------------------+
                           |     MOSDAC Modular Discovery & Client    |
                           |   (Bearer Auth / OpenAPI 3.0.1 Protocol) |
                           +------------------------------------------+
                                                |
                                                v
                           +------------------------------------------+
                           |       HDF5 Raw Granule Cache & Hash      |
                           +------------------------------------------+
                                                |
                        +-----------------------+-----------------------+
                        |                       |                       |
                        v                       v                       v
               +-----------------+     +-----------------+     +-----------------+
               | Weather Adapter |     | Environ Adapter |     |  Ocean Adapter  |
               | (HEM, CTP, UTH, |     | (SNW, AOD, FIR, |     | (SST, WND, CHL) |
               |  OLR, FOG, ATD) |     |  SMK)           |     |                 |
               +-----------------+     +-----------------+     +-----------------+
                        |                       |                       |
                        +-----------------------+-----------------------+
                                                |
                                                v
                           +------------------------------------------+
                           | Vectorized Survey of India Geoclipping   |
                           +------------------------------------------+
                                                |
                        +-----------------------+-----------------------+
                        |                                               |
                        v                                               v
         +-----------------------------+                 +-----------------------------+
         |    PostgreSQL 17 Storage    |                 |   Kafka 5 Domain Topics     |
         |  - mosdac_product_ledger    |                 |   (Strict Maximum 5 Topics) |
         |  - mosdac_observations      |                 |  1. mosdac.raw              |
         |    (Monthly Partitioned)    |                 |  2. mosdac.weather          |
         |  - staging & indexes        |                 |  3. mosdac.environment      |
         +-----------------------------+                 |  4. mosdac.ocean            |
                                                         |  5. mosdac.dlq              |
                                                         +-----------------------------+
                                                                        |
                                                                        v
                                                         +-----------------------------+
                                                         | WebSocket Broadcast Bridge  |
                                                         | (Category/Product Dispatch) |
                                                         +-----------------------------+
                                                                        |
                                                +-----------------------+-----------------------+
                                                |                                               |
                                                v                                               v
                                 +-----------------------------+                 +-----------------------------+
                                 |  Main Production Frontend   |                 | Standalone Test Center Hub  |
                                 |  (100% Preserved & Untouched|                 | (/test/index.html + 8 Maps) |
                                 +-----------------------------+                 +-----------------------------+
```

### Absolute Constraints Maintained
1. **Zero Disruption to `/FRONTEND`**: The main user-facing application remains completely untouched.
2. **Strict Maximum 5 Kafka Topics Limit**: All satellite events route through strictly 5 domain topics.
3. **Data Authenticity**: Real ISRO satellite data only. Catalog gaps are strictly labeled as `UNAVAILABLE` with diagnostic reasons.
4. **Resilience & Fallback**: Seamless in-memory event queues if Kafka cluster is offline; local JSON snapshots for offline standalone visualization.

---

## 2. Kafka Architecture & 5-Topic Limit

To prevent topic explosion while scaling to dozens of satellite sensors, the messaging layer enforces a hard ceiling of **5 Kafka topics** organized strictly by domain.

### Topic Registry & Routing Matrix

| Topic Name | Purpose | Routing Criteria | Retention | Key Format |
|---|---|---|---|---|
| `mosdac.raw` | Raw Granule Ingestion Notifications | All newly downloaded, verified HDF5 raw granules prior to transformation | 7 Days | `MOSDAC:RAW:{product_id}:{granule_name}` |
| `mosdac.weather` | Atmospheric & Meteorological Observations | Rainfall (`HEM`), Clouds (`CTP`), Humidity (`UTH`), Radiation (`OLR`), Fog (`FOG`), Sounder (`ATD`) | 3 Days | `MOSDAC:{product_id}:{observation_time_iso}` |
| `mosdac.environment` | Terrestrial & Air Quality Indicators | Snow Cover (`SNW`), Aerosol Depth (`AOD`), Fire Hotspots (`FIR`), Smoke (`SMK`) | 3 Days | `MOSDAC:{product_id}:{observation_time_iso}` |
| `mosdac.ocean` | Marine & Maritime Observations | Sea Surface Temp (`SST`), Scatterometer Winds (`WND`), Chlorophyll (`CHL`) | 3 Days | `MOSDAC:{product_id}:{observation_time_iso}` |
| `mosdac.dlq` | Dead Letter Queue (Validation Failures & Errors) | Out-of-bounds observations, corrupted HDF5 files, parse exceptions | 14 Days | `MOSDAC:DLQ:{product_id}:{timestamp}` |

### Message Envelope Specification (`MosdacKafkaEnvelope`)

Every message published to Kafka conforms to a standardized JSON schema:

```json
{
  "source": "ISRO_MOSDAC",
  "satellite": "INSAT-3DS",
  "sensor": "IMAGER",
  "product_id": "3SIMG_L2B_CTP",
  "category": "weather",
  "granule_name": "3SIMG_12SEP2026_1400_L2B_CTP_V01R00",
  "observation_time": "2026-09-12T14:00:00+00:00",
  "ingested_at": "2026-09-12T15:45:10.123456+00:00",
  "envelope_version": "1.0",
  "summary": {
    "total_points": 1653,
    "valid_points": 1653,
    "min_value": 149.76,
    "max_value": 775.05,
    "mean_value": 482.31,
    "unit": "hPa"
  },
  "payload": {
    "points": [[28.54, 77.21, 420.5], [28.58, 77.25, 415.2]]
  }
}
```

---

## 3. Multi-Tier Configuration Hierarchy

Ingestion, processing, and broadcasting are controlled through a three-tier configuration hierarchy in [`BACKEND/app/config.py`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/BACKEND/app/config.py):

```
Level 1: Global Platform Switch
   └── MOSDAC_PIPELINE_ENABLED (bool)
         │
         ├── Level 2: Domain Switches
         │     ├── MOSDAC_WEATHER_ENABLED (bool)
         │     ├── MOSDAC_ENVIRONMENT_ENABLED (bool)
         │     └── MOSDAC_OCEAN_ENABLED (bool)
         │           │
         │           └── Level 3: Individual Product Switches
         │                 ├── MOSDAC_RAINFALL_ENABLED (HEM)
         │                 ├── MOSDAC_CLOUD_ENABLED (CTP)
         │                 ├── MOSDAC_HUMIDITY_ENABLED (UTH)
         │                 ├── MOSDAC_OLR_ENABLED (OLR)
         │                 ├── MOSDAC_FOG_ENABLED (FOG)
         │                 ├── MOSDAC_SNOW_ENABLED (SNW)
         │                 ├── MOSDAC_AEROSOL_ENABLED (AOD)
         │                 ├── MOSDAC_SST_ENABLED (SST)
         │                 └── ... (FIR, ATD, WND, CHL)
```

Retention policies and data storage directories:
- `MOSDAC_RAW_RETENTION_DAYS`: Auto-purge raw HDF5 files older than $N$ days (default: 7).
- `MOSDAC_TRANSFORMED_RETENTION_DAYS`: Retention for intermediate CSV outputs (default: 30).
- `MOSDAC_SAMPLE_STEP`: Subsampling factor for high-resolution 1 km datasets to optimize real-time streaming.

---

## 4. Modular Adapters & Mathematical Inversions

Located under [`BACKEND/app/ingestion/mosdac/adapters/`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/BACKEND/app/ingestion/mosdac/adapters/), adapters inherit from `BaseMosdacAdapter` and execute physical unit conversions, projection inversions, and Survey of India geoclipping:

### A. Weather Adapter (`weather_adapter.py`)
- **HEM (Precipitation)**: Reads `/HEM`, scales latitude/longitude by `0.01`, filters fill values (`-999.0`), computes rain rate ($0.1 \le v \le 250\text{ mm/hr}$).
- **CTP (Cloud Top Properties)**: Reads `/CTP`, outputs Cloud Top Pressure in hPa ($50 \le v \le 1050\text{ hPa}$) and CTT in Kelvin.
- **UTH (Tropospheric Humidity)**: Reads `/UTH`, extracts upper-tropospheric humidity ($0 \le v \le 100\%$).
- **OLR (Outgoing Longwave Radiation)**: Reads `/OLR`, extracts thermal radiant exitance ($50 \le v \le 400\text{ W/m}^2$).
- **FOG (Fog Mask)**: Employs `pyproj.Proj(proj='merc', lon_0=77.25, lat_ts=17.75)` to invert 1D meter grids `X` and `Y` into geographic WGS84 coordinates.

### B. Ocean Adapter (`ocean_adapter.py`)
- **SST (Sea Surface Temperature)**: Reads `/SST_REG`, converts Kelvin to Celsius ($T_{\text{Celsius}} = T_{\text{Kelvin}} - 273.15$), applies physical validity bounding ($-3^\circ\text{C} \le v \le 45^\circ\text{C}$).

### C. Environment Adapter (`environment_adapter.py`)
- **SNW (Fractional Snow Cover)**: Inverts Mercator projection `(lon_0=75.0, lat_ts=0.0)` for Himalayan catchments, extracts FSC percentage ($0 \le v \le 100\%$).
- **AOD (Aerosol Optical Depth)**: Reads 1D regular coordinates `/latitude` and `/longitude`, meshes into a 2D matrix, extracts 650 nm optical thickness ($0.01 \le \tau \le 3.0$).

### D. Geoclipping Engine
- Vectorized bounding check against Survey of India polygon geometry (`data/india_boundary.geojson`).
- Fast axis-aligned bounding box pre-filter followed by `shapely.prepared.prep` polygon containment test, filtering out non-Indian/transboundary cells within milliseconds.

---

## 5. PostgreSQL 17 Database Architecture

All multi-product observations are persisted to PostgreSQL 17 under partitioned tables designed for millions of geospatial rows.

```sql
-- Granule ingestion ledger
CREATE TABLE IF NOT EXISTS mosdac_product_ledger (
    id SERIAL PRIMARY KEY,
    product_id VARCHAR(32) NOT NULL,
    category VARCHAR(32) NOT NULL,
    granule_name VARCHAR(128) NOT NULL UNIQUE,
    observation_time TIMESTAMPTZ NOT NULL,
    ingestion_time TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(32) NOT NULL,
    point_count INT DEFAULT 0,
    min_value DOUBLE PRECISION,
    max_value DOUBLE PRECISION,
    mean_value DOUBLE PRECISION,
    unit VARCHAR(32),
    raw_h5_path VARCHAR(256),
    transformed_csv_path VARCHAR(256),
    error_message TEXT
);

-- Monthly partitioned observations table
CREATE TABLE IF NOT EXISTS mosdac_observations (
    id BIGSERIAL,
    granule_id VARCHAR(128) NOT NULL,
    product_id VARCHAR(32) NOT NULL,
    category VARCHAR(32) NOT NULL,
    observation_time TIMESTAMPTZ NOT NULL,
    latitude NUMERIC(7, 4) NOT NULL,
    longitude NUMERIC(7, 4) NOT NULL,
    value NUMERIC(9, 3) NOT NULL,
    secondary_value NUMERIC(9, 3),
    unit VARCHAR(32) NOT NULL,
    state VARCHAR(64),
    district VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, observation_time)
) PARTITION BY RANGE (observation_time);
```

---

## 6. Real-Time WebSocket Multi-Product Broadcast

The WebSocket manager ([`BACKEND/app/api/ws_manager.py`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/BACKEND/app/api/ws_manager.py)) supports selective channel subscriptions without breaking existing clients:

1. **Default Legacy Subscription**: Existing main frontend connects to `ws://127.0.0.1:8000/ws/weather` without parameters. It automatically receives `3SIMG_L2B_HEM` rainfall frames.
2. **Product-Specific Subscription**: Standalone test maps subscribe using `?product=3SIMG_L2B_CTP` or `?category=ocean`.
3. **Payload Structure**:
   ```json
   {
     "type": "MOSDAC_PRODUCT_UPDATE",
     "product_id": "3SIMG_L2B_CTP",
     "category": "weather",
     "granule_id": "3SIMG_12SEP2026_1400_L2B_CTP_V01R00",
     "observation_time": "2026-09-12T14:00:00Z",
     "observation_time_ist": "2026-09-12 19:30:00 IST",
     "points_count": 1653,
     "points": [[28.54, 77.21, 420.5], ...],
     "summary": { "min_value": 149.8, "max_value": 775.1, "mean_value": 482.3 }
   }
   ```

---

## 7. Standalone Test Center Hub (`/test`)

The test harness allows complete standalone verification of every satellite product before integration into any UI:

| Folder | Product ID | Satellite / Sensor | Metric / Unit | Status |
|---|---|---|---|---|
| [`/test/rainfall`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/rainfall/index.html) | `3SIMG_L2B_HEM` | INSAT-3DS Imager | Rain Rate (`mm/hr`) | **LIVE ACTIVE** |
| [`/test/cloud`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/cloud/index.html) | `3SIMG_L2B_CTP` | INSAT-3DS Imager | Cloud Top Pressure (`hPa`) | **LIVE ACTIVE** |
| [`/test/humidity`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/humidity/index.html) | `3SIMG_L2B_UTH` | INSAT-3DS Imager | Upper Tropospheric RH (`%`) | **LIVE ACTIVE** |
| [`/test/olr`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/olr/index.html) | `3SIMG_L2B_OLR` | INSAT-3DS Imager | Longwave Flux (`W/m²`) | **LIVE ACTIVE** |
| [`/test/fog`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/fog/index.html) | `3SIMG_L2C_FOG` | INSAT-3DS Imager | Fog Detection Mask & Extent | **LIVE ACTIVE** |
| [`/test/sst`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/sst/index.html) | `3SIMG_L2B_SST` | INSAT-3DS Imager | Sea Surface Temp (`°C`) | **LIVE ACTIVE** |
| [`/test/snow`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/snow/index.html) | `3SIMG_L2C_SNW` | INSAT-3DS Imager | Fractional Snow Cover (`%`) | **LIVE ACTIVE** |
| [`/test/aerosol`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/aerosol/index.html) | `3SIMG_L2G_AOD` | INSAT-3DS Imager | Aerosol Optical Depth | **LIVE ACTIVE** |
| [`/test/cloud-motion`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/cloud-motion/index.html) | `3SIMG_L2B_CMV` | INSAT-3DS Imager | Wind Vectors (`m/s`) | *Catalog Gapped* |
| [`/test/fire`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/fire/index.html) | `3SIMG_L2C_FIR` | INSAT-3DS Imager | Fire Radiative Power (`MW`) | *Catalog Gapped* |
| [`/test/atmospheric-profile`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/atmospheric-profile/index.html) | `3SSND_L2B_ATD` | INSAT-3DS Sounder | Vertical Temperature (`K`) | *Catalog Gapped* |
| [`/test/scatsat-wind`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/scatsat-wind/index.html) | `O3SCA_L2B_WND` | Oceansat-3 OSCAT | Ocean Wind Swaths (`m/s`) | *Catalog Gapped* |
