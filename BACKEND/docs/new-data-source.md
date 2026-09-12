# New Data Source Documentation: ISRO MOSDAC INSAT-3DS HEM

## 1. Source Name
**Meteorological and Oceanographic Satellite Data Archival Centre (MOSDAC)**
Space Applications Centre (SAC), Indian Space Research Organisation (ISRO), Ahmedabad, India.
Satellite Mission: **INSAT-3DS**
Sensor: **IMAGER (IMG)**
Product: **Level-2B Hydro-Estimator Method (HEM) Precipitation Rate** (`3SIMG_L2B_HEM`)

---

## 2. API / Base URL
- **Base Domain**: `https://mosdac.gov.in`
- **Search Catalog Endpoint**: `https://mosdac.gov.in/apios/datasets.json`
- **Token Authentication Endpoint**: `https://mosdac.gov.in/download_api/gettoken`
- **Token Refresh Endpoint**: `https://mosdac.gov.in/download_api/refresh-token`
- **File Download Endpoint**: `https://mosdac.gov.in/download_api/download`
- **Session Logout Endpoint**: `https://mosdac.gov.in/download_api/logout`

---

## 3. Authentication Mechanism
- **Method**: OAuth2 Bearer Token via JSON POST authentication.
- **Flow**:
  1. POST JSON credentials payload `{"username": "<MOSDAC_USER>", "password": "<MOSDAC_PASS>"}` to `/download_api/gettoken`.
  2. Server returns `{ "access_token": "<JWT_STRING>", "refresh_token": "<REFRESH_JWT>" }`.
  3. Attach HTTP Header: `Authorization: Bearer <access_token>` to download requests.
  4. Session refresh supported at `/download_api/refresh-token`.

---

## 4. Required Parameters
- **Search API**:
  - `datasetId` (required): `"3SIMG_L2B_HEM"`
  - `count` (optional): Maximum records returned per page (e.g. `10`)
  - `startIndex` (optional): 1-based index for pagination
  - `startTime`, `endTime` (optional): Date range (`YYYY-MM-DD`)
  - `boundingBox` (optional): Bounding box `"68.0,6.0,98.0,38.0"` for India
- **Download API**:
  - `id` (required): Numeric record ID from search catalog entry (e.g. `18399150`)
  - Header: `Authorization: Bearer <access_token>`

---

## 5. Response Schema
- **Search Catalog**: JSON with `totalResults`, `itemsPerPage`, `entries: [ { id, identifier, updated } ]`.
- **Download File**: Hierarchical Data Format version 5 (`HDF5` / `.h5`) containing:
  - `/HEM`: 3D Float32 array of shape `(1, 2816, 2805)`
  - `/Latitude`: 2D Int16 array of shape `(2816, 2805)` (scale: 0.01)
  - `/Longitude`: 2D Int16 array of shape `(2816, 2805)` (scale: 0.01)
  - `/time`: 1D Float64 array (minutes since 2000-01-01 00:00:00)

---

## 6. Rainfall Field
- **Dataset**: `/HEM`
- **Attributes**: `standard_name: "Precipitation"`, `long_name: "Hydro Estimator Precipitation"`
- **Fill Value**: `-999.0`
- **Range**: `0.0` to `~150.0+ mm/hr`

---

## 7. Rainfall Unit
- **Unit**: `mm/hr` (instantaneous rain rate).
- **Unit Conversion**: Identical to canonical platform rain rate unit (`mm/hr`). No conversion factor required.

---

## 8. Timestamp Field
- In Search Catalog: `entry["updated"]` (ISO8601 UTC string, e.g. `"2026-09-11T17:00:00Z"`).
- In Filename: `3SIMG_<DDMMMYYYY>_<HHMM>_L2B_HEM_V01R00.h5`.
- In HDF5 Attributes: `Acquisition_Start_Time`, `Acquisition_End_Time`, `Acquisition_Time_in_GMT`.

---

## 9. Timestamp Timezone
- **Timezone**: UTC (Coordinated Universal Time / GMT).
- **IST Conversion**: $\text{IST} = \text{UTC} + 5\text{h } 30\text{m}$. Example: `2026-09-11 17:00 UTC` = `2026-09-11 22:30 IST`.

---

## 10. Latitude Field
- **Dataset**: `/Latitude` (`int16`), scaled by `scale_factor = 0.01` (`degrees_north`). Fill = `32767`.

---

## 11. Longitude Field
- **Dataset**: `/Longitude` (`int16`), scaled by `scale_factor = 0.01` (`degrees_east`). Fill = `32767`.

---

## 12. Geographic Coverage
- Geostationary satellite coverage centered over Indian Ocean ($82^\circ$E). Subsetting to India region (`lat 6-38`, `lon 68-98`) yields ~572,215 observations per half hour.

---

## 13. Temporal Resolution
- **Cadence**: Every 30 minutes (scans completed at `:00` and `:30` of each hour).
- **Dissemination Latency**: ~35 to 80 minutes after scan start.

---

## 14. How Latest Data is Discovered
- Query `https://mosdac.gov.in/apios/datasets.json?datasetId=3SIMG_L2B_HEM&count=5`.
- Catalog returns entries sorted reverse chronologically; the first entry `entry[0]` contains the newest available observation.

---

## 15. Example Raw Response Structure
```json
{
  "id": "18399150",
  "identifier": "3SIMG_11SEP2026_1700_L2B_HEM_V01R00.h5",
  "updated": "2026-09-11T17:00:00Z"
}
```

---

## 16. Known Limitations
1. **Cloud Top Infrared Estimation**: Uses cloud top brightness temperature gradients; high thin cirrus may occasionally create edge artifacts.
2. **Download Rate Limits**: MOSDAC enforces minute-level rate limits (`minute_limit`), requiring backoff/retry.
3. **Authentication Token Lifecycle**: Access tokens expire and must be refreshed.
