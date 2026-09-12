# New Data Source: ISRO MOSDAC INSAT-3DS (HEM)

This document provides complete technical specification and architecture details for the **ISRO MOSDAC (Meteorological and Oceanographic Satellite Data Archival Centre)** data source integrated into the RITU weather analytics platform.

---

## 1. Source Name
- **Provider**: ISRO (Indian Space Research Organisation) / Space Applications Centre (SAC), Ahmedabad, India
- **Platform/Portal**: MOSDAC (Meteorological and Oceanographic Satellite Data Archival Centre)
- **Satellite**: INSAT-3DS (India's advanced third-generation dedicated meteorological satellite positioned in geostationary orbit at 82.0°E, altitude ~36,000 km)
- **Sensor**: IMAGER (6-channel optical/infrared imaging radiometer)
- **Product Name**: Level-2B Hydro-Estimator Method Precipitation (`3SIMG_L2B_HEM`)

---

## 2. API / Base URLs
- **OpenSearch Metadata & Catalog Endpoint**:  
  `https://mosdac.gov.in/apios/datasets.json`
- **Authentication & Token Issuance**:  
  `https://mosdac.gov.in/download_api/gettoken`
- **Token Refresh**:  
  `https://mosdac.gov.in/download_api/refresh-token`
- **Granule Download Stream**:  
  `https://mosdac.gov.in/download_api/download`
- **Session Logout**:  
  `https://mosdac.gov.in/download_api/logout`

---

## 3. Authentication Mechanism
- **Type**: OAuth2 / Bearer Token based authentication.
- **Credential Flow**:
  1. Client sends POST request to `/download_api/gettoken` with JSON payload containing `username` and `password`.
  2. Server responds with HTTP 200 containing:
     - `access_token` (Bearer JWT, ~1550 chars)
     - `refresh_token` (JWT, ~640 chars)
     - `expires_in` (seconds)
  3. Granule download requests include `Authorization: Bearer <access_token>` in HTTP headers.
  4. If token expires (HTTP 401 `INVALID_TOKEN`), client posts `refresh_token` to `/download_api/refresh-token` to acquire a new access token without re-entering credentials.
- **Search API**: Does **not** require authentication. Catalog querying is publicly accessible.
- **Security Note**: All credentials must be provided via environment variables (`MOSDAC_USERNAME`, `MOSDAC_PASSWORD`). Secrets are never committed or logged.

---

## 4. Required Parameters

### Catalog Search Parameters (GET `https://mosdac.gov.in/apios/datasets.json`)
| Parameter | Type | Required | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `datasetId` | string | **Yes** | Dataset identifier for INSAT-3DS HEM | `3SIMG_L2B_HEM` |
| `count` | integer | No | Maximum entries to return per query page | `10` |
| `startIndex` | integer | No | Pagination offset (1-based) | `1` |
| `startTime` | string | No | Search window start (ISO date / date-time) | `2026-09-12` |
| `endTime` | string | No | Search window end (ISO date / date-time) | `2026-09-12` |
| `boundingBox` | string | No | Geospatial bounding box (`W,S,E,N`) | `68.0,6.0,98.0,38.0` |
| `gId` | string | No | Granule record ID for targeted lookup | `18403102` |

### Download Parameters (GET `https://mosdac.gov.in/download_api/download`)
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | string/int | **Yes** | Granule record ID from search response (e.g. `18403102`) |

---

## 5. Response Schema & File Structure

### OpenSearch Response Format (JSON)
The OpenSearch catalog endpoint returns a standard GeoJSON-style metadata payload:
```json
{
  "title": "OpenSearch Description",
  "updated": "2026-09-12T11:00:00Z",
  "totalResults": 41830,
  "totalSizeMB": 411846,
  "itemsPerPage": 5,
  "entries": [
    {
      "identifier": "3SIMG_12SEP2026_1100_L2B_HEM_V01R00.h5",
      "id": "18403102",
      "summary": "This product is derived on the basis of Hydro-Estimator method. It measures precipitation over Indian Region...",
      "updated": "2026-09-12T11:00:00Z",
      "dcDate": "2026-09-12T11:00:00Z/2026-09-12T11:30:00Z",
      "enclosureLink": "https://mosdac.gov.in/uops/?metaid=18403102",
      "searchLink": "https://mosdac.gov.in/apios/datasets.json?gId=18403102",
      "boundbox": [
        {
          "west": "0.84",
          "south": "-81.04",
          "east": "163.15",
          "north": "81.04"
        }
      ]
    }
  ]
}
```

### Granule Payload Format (HDF5 `.h5`)
Granules are binary HDF5 files adhering to the CF-1.6 conventions (~9.7 MB compressed).
Inside the HDF5 container:
- `/HEM`: 3D Array `(1, 2816, 2805)` of `float32` — Rain rate matrix
- `/Latitude`: 2D Array `(2816, 2805)` of `int16` — Geocentric latitudes
- `/Longitude`: 2D Array `(2816, 2805)` of `int16` — Geocentric longitudes
- `/time`: 1D Array `(1,)` of `float64` — Minutes since 2000-01-01 00:00:00
- `/GeoX`, `/GeoY`: 1D Projection dimension scales

---

## 6. Rainfall Field
- **HDF5 Dataset Path**: `/HEM`
- **Data Type**: `float32`
- **Fill/Missing Value**: `-999.0` (indicates space/off-disk or uncalculated pixels)
- **Valid Range**: `0.0` to `250.0+` mm/hr

---

## 7. Rainfall Unit
- **Source Unit**: `mm/hr` (Millimeters per hour)
- **Attribute**: `units = "mm/hr"`
- **Canonical Unit**: `mm/hr` (Exact match with RITU platform canonical standard; no conversion required)

---

## 8. Timestamp Field
- **Granule Filename**: Encodes date and UTC time, e.g. `3SIMG_12SEP2026_1100_L2B_HEM_V01R00.h5` -> `2026-09-12 11:00 UTC`
- **Catalog Field**: `entry["updated"]` (e.g. `2026-09-12T11:00:00Z`)
- **HDF5 Root Attributes**:
  - `Acquisition_Date`: `12SEP2026`
  - `Acquisition_Start_Time`: `12-SEP-2026T11:00:26.661`
  - `Acquisition_End_Time`: `12-SEP-2026T11:27:20.359`
  - `Acquisition_Time_in_GMT`: `1100`

---

## 9. Timestamp Timezone
- **Timezone**: UTC (GMT / Coordinated Universal Time), designated with `Z`.
- **Indian Standard Time (IST)**: UTC + 5 hours 30 minutes (e.g. `11:00 UTC` = `16:30 IST`).

---

## 10. Latitude Field
- **HDF5 Dataset Path**: `/Latitude`
- **Raw Type**: `int16`
- **Scale Factor**: `0.01` (`attr: scale_factor = [0.01]`)
- **Add Offset**: `0.0`
- **Fill Value**: `32767`
- **Conversion Equation**:  
  $$\text{Latitude (degrees North)} = \text{Latitude}_{\text{raw}} \times 0.01$$

---

## 11. Longitude Field
- **HDF5 Dataset Path**: `/Longitude`
- **Raw Type**: `int16`
- **Scale Factor**: `0.01` (`attr: scale_factor = [0.01]`)
- **Add Offset**: `0.0`
- **Fill Value**: `32767`
- **Conversion Equation**:  
  $$\text{Longitude (degrees East)} = \text{Longitude}_{\text{raw}} \times 0.01$$

---

## 12. Geographic Coverage
- **Raw Satellite Disk**: Encompasses $0.84^\circ\text{E}$ to $163.15^\circ\text{E}$, $-81.04^\circ\text{S}$ to $81.04^\circ\text{N}$.
- **India Subcontinent Window**:
  - Rows: 473 to 1244 (height: 772 cells)
  - Columns: 1022 to 1834 (width: 813 cells)
  - Grid points over India bounding box: ~572,710 cells
- **Spatial Resolution**: ~0.04° (~4 km ground resolution at nadir), offering significantly finer detail than NASA IMERG (0.1° / 10 km).

---

## 13. Temporal Resolution
- **Frequency**: Every **30 minutes** continuously (48 observation cycles per 24-hour day).
- **Latency**: Operational granules are published within 30 to 60 minutes of acquisition completion.

---

## 14. How Latest Data is Discovered
1. Issue GET request to `https://mosdac.gov.in/apios/datasets.json?datasetId=3SIMG_L2B_HEM&count=5`.
2. The entries array is sorted descending by publication time.
3. The first item (`entries[0]`) represents the latest available satellite observation.
4. Extract `id`, `identifier`, and `updated` timestamp.
5. Compare `updated` with the latest ingested timestamp in `ingestion_ledger` where `source = 'MOSDAC'`.
6. If newer, trigger ingestion for granule `id`.

---

## 15. Example Raw Response Structure
```json
{
  "identifier": "3SIMG_12SEP2026_1100_L2B_HEM_V01R00.h5",
  "id": "18403102",
  "summary": "This product is derived on the basis of Hydro-Estimator method. It measures precipitation over Indian Region...",
  "updated": "2026-09-12T11:00:00Z",
  "dcDate": "2026-09-12T11:00:00Z/2026-09-12T11:30:00Z",
  "enclosureLink": "https://mosdac.gov.in/uops/?metaid=18403102",
  "boundbox": [{"west": "0.84", "south": "-81.04", "east": "163.15", "north": "81.04"}]
}
```

---

## 16. Known Limitations & Edge Cases
1. **Rate Limits**: MOSDAC enforces per-minute and daily download quotas on the download API. Token and file downloads should use exponential backoff retries. Search queries are unmetered.
2. **Missing/Corrupt Granules**: During satellite orbital eclipse or calibration cycles, specific half-hour slots may occasionally be absent or contain fill values (`-999.0`).
3. **Off-Disk Geometry**: Full-disk HDF5 files contain earth-horizon pixels where latitude and longitude are `32767`. These must be filtered out before spatial processing.
4. **Projection Nature**: The geostationary projection has slightly varying pixel ground-footprint from south to north ($0.0408^\circ$ to $0.0425^\circ$), requiring explicit pixel coordinates rather than assuming a rigid equirectangular grid.
