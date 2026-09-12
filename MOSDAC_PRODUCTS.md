# TATVA &bull; MOSDAC Satellite Product Catalog Specifications

## 1. Product Catalog Index

The platform supports a total of 15 ISRO Earth Observation products spanning Geostationary (INSAT-3DS) and Polar Orbiting (Oceansat-3 / EOS-06) missions.

| Product ID | Product Name | Domain Category | Satellite | Sensor | Data Level | Cadence | Operational Status |
|---|---|---|---|---|---|---|---|
| `3SIMG_L2B_HEM` | Hydro-Estimator Precipitation | Weather | INSAT-3DS | IMAGER | L2B | 30 min | **AVAILABLE (Active)** |
| `3SIMG_L2G_IMR` | INSAT Multispectral Rainfall | Weather | INSAT-3DS | IMAGER | L2G | 30 min | **AVAILABLE (Active)** |
| `3SIMG_L2B_CTP` | Cloud Top Pressure & Temp | Weather | INSAT-3DS | IMAGER | L2B | 30 min | **AVAILABLE (Active)** |
| `3SIMG_L2B_UTH` | Upper Tropospheric Humidity | Weather | INSAT-3DS | IMAGER | L2B | 30 min | **AVAILABLE (Active)** |
| `3SIMG_L2B_OLR` | Outgoing Longwave Radiation | Weather | INSAT-3DS | IMAGER | L2B | 30 min | **AVAILABLE (Active)** |
| `3SIMG_L2C_FOG` | Day & Night Fog Detection | Weather | INSAT-3DS | IMAGER | L2C | 30-60 min | **AVAILABLE (Active)** |
| `3SIMG_L2B_SST` | Sea Surface Temperature | Ocean | INSAT-3DS | IMAGER | L2B | 30 min | **AVAILABLE (Active)** |
| `3SIMG_L2C_SNW` | Snow Cover & Fractional Snow | Environment | INSAT-3DS | IMAGER | L2C | Daily | **AVAILABLE (Active)** |
| `3SIMG_L2G_AOD` | Aerosol Optical Depth (650 nm) | Environment | INSAT-3DS | IMAGER | L2G | 30 min (Day) | **AVAILABLE (Active)** |
| `3SIMG_L2B_CMV` | Cloud Motion Vectors | Weather | INSAT-3DS | IMAGER | L2B | 30 min | *UNAVAILABLE (Catalog Gap)* |
| `3SIMG_L2B_WVW` | Water Vapour Wind Vectors | Weather | INSAT-3DS | IMAGER | L2B | 30 min | *UNAVAILABLE (Catalog Gap)* |
| `3SIMG_L2C_FIR` | Active Fire & Biomass Burning | Environment | INSAT-3DS | IMAGER | L2C | 30 min | *UNAVAILABLE (Catalog Gap)* |
| `3SIMG_L2C_SMK` | Smoke & Haze Boundary Mask | Environment | INSAT-3DS | IMAGER | L2C | 30 min (Day) | *UNAVAILABLE (Catalog Gap)* |
| `3SSND_L2B_ATD` | Atmospheric Sounder T & RH Profile | Weather | INSAT-3DS | SOUNDER | L2B | Hourly | *UNAVAILABLE (Catalog Gap)* |
| `3SSND_L2B_TPW` | Total Precipitable Water | Weather | INSAT-3DS | SOUNDER | L2B | Hourly | *UNAVAILABLE (Catalog Gap)* |
| `O3SCA_L2B_WND` | Ocean Surface Wind Vectors | Ocean | Oceansat-3 | OSCAT | L2B | Daily swath | *UNAVAILABLE (Auth Gap)* |
| `O3OCM_L2B_CHL` | Chlorophyll-a Concentration | Ocean | Oceansat-3 | OCM-3 | L2B | 2-Day swath | *UNAVAILABLE (Auth Gap)* |

---

## 2. Ingested & Verified Active Product Specifications

### 1. 3SIMG_L2B_HEM (Hydro-Estimator Precipitation)
- **Sensor**: INSAT-3DS 6-Channel Imager (Thermal IR 10.8 µm).
- **Physical Metric**: Instantaneous Rain Rate ($0.1$ to $250.0\text{ mm/hr}$).
- **HDF5 Paths**: `/HEM` (Rain rate), `/Latitude` (scaled $\times 0.01$), `/Longitude` (scaled $\times 0.01$).
- **Fill Value**: `-999.0`.
- **Target Kafka Topic**: `mosdac.weather`.
- **Verified Granule**: `3SIMG_12SEP2026_1500_L2B_HEM_V01R00.h5` &bull; Range: $[0.0, 69.28]\text{ mm/hr}$ &bull; India Cells: 172,712.
- **Standalone Test Map**: [`/test/rainfall/index.html`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/rainfall/index.html).

### 2. 3SIMG_L2B_CTP (Cloud Top Properties)
- **Sensor**: INSAT-3DS Imager (Thermal IR & Water Vapour bands).
- **Physical Metric**: Cloud Top Pressure ($50.0$ to $1050.0\text{ hPa}$) & Temperature ($180.0$ to $320.0\text{ K}$).
- **HDF5 Paths**: `/CTP` (Pressure in hPa), `/Latitude`, `/Longitude`.
- **Target Kafka Topic**: `mosdac.weather`.
- **Verified Granule**: `3SIMG_12SEP2026_1400_L2B_CTP_V01R00.h5` &bull; Range: $[149.76, 775.05]\text{ hPa}$ &bull; India Cells: 1,653.
- **Standalone Test Map**: [`/test/cloud/index.html`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/cloud/index.html).

### 3. 3SIMG_L2B_UTH (Upper Tropospheric Humidity)
- **Sensor**: INSAT-3DS Imager (6.7 µm Water Vapour absorption channel).
- **Physical Metric**: Relative Humidity in 500-200 hPa upper troposphere ($0.0$ to $100.0\%$).
- **HDF5 Paths**: `/UTH` (Percentage), `/Latitude`, `/Longitude`.
- **Target Kafka Topic**: `mosdac.weather`.
- **Verified Granule**: `3SIMG_12SEP2026_1400_L2B_UTH_V01R00.h5` &bull; Range: $[6.58, 99.99]\%$ &bull; India Cells: 73,836.
- **Standalone Test Map**: [`/test/humidity/index.html`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/humidity/index.html).

### 4. 3SIMG_L2B_OLR (Outgoing Longwave Radiation)
- **Sensor**: INSAT-3DS Imager (Broadband thermal infrared regression).
- **Physical Metric**: Radiant Energy Flux Emitted to Space ($50.0$ to $400.0\text{ W/m}^2$).
- **HDF5 Paths**: `/OLR` ($\text{W/m}^2$), `/Latitude`, `/Longitude`.
- **Target Kafka Topic**: `mosdac.weather`.
- **Verified Granule**: `3SIMG_12SEP2026_1400_L2B_OLR_V01R00.h5` &bull; Range: $[92.91, 320.06]\text{ W/m}^2$ &bull; India Cells: 172,712.
- **Standalone Test Map**: [`/test/olr/index.html`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/olr/index.html).

### 5. 3SIMG_L2C_FOG (Night & Day Fog Detection)
- **Sensor**: INSAT-3DS Imager (Split thermal $10.8\text{ µm} - 12.0\text{ µm}$ and mid-IR $3.9\text{ µm}$).
- **Physical Metric**: Binary and categorical fog presence mask ($0.0 = \text{Clear}$, $1.0 = \text{Fog Layer}$).
- **Projection**: Mercator projection with 1D coordinate vectors `/X` and `/Y` in meters. Georeferenced via `pyproj.Proj(proj='merc', lon_0=77.25, lat_ts=17.75)`.
- **Target Kafka Topic**: `mosdac.weather`.
- **Verified Granule**: `3SIMG_12SEP2026_1030_L2C_FOG_V01R00.h5` &bull; Range: $[0.0, 1.0]$ &bull; Grid Footprints: 222,330.
- **Standalone Test Map**: [`/test/fog/index.html`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/fog/index.html).

### 6. 3SIMG_L2B_SST (Sea Surface Temperature)
- **Sensor**: INSAT-3DS Imager (Split-window thermal channels over ocean).
- **Physical Metric**: Ocean Skin Temperature in Celsius (Converted from raw Kelvin: $T_{\text{C}} = T_{\text{K}} - 273.15$). Valid bounds: $-3.0^\circ\text{C}$ to $45.0^\circ\text{C}$.
- **HDF5 Paths**: `/SST_REG` (Raw Kelvin values), `/Latitude`, `/Longitude`.
- **Target Kafka Topic**: `mosdac.ocean`.
- **Verified Granule**: `3SIMG_12SEP2026_1330_L2B_SST_V01R00.h5` &bull; Range: $[21.72, 34.73]^\circ\text{C}$ &bull; Maritime Points: 123,861.
- **Standalone Test Map**: [`/test/sst/index.html`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/sst/index.html).

### 7. 3SIMG_L2C_SNW (Snow Cover & Fractional Snow)
- **Sensor**: INSAT-3DS Imager (NDSI using Visible $0.65\text{ µm}$ and SWIR $1.6\text{ µm}$).
- **Physical Metric**: Fractional Snow Cover percentage ($0.0$ to $100.0\%$).
- **Projection**: Mercator projection with 1D meters `/X` and `/Y`. Inverted via `pyproj.Proj(proj='merc', lon_0=75.0, lat_ts=0.0)`.
- **Target Kafka Topic**: `mosdac.environment`.
- **Verified Granule**: `3SIMG_12SEP2026_0600_L2C_SNW_V01R00.h5` &bull; Range: $[0.0, 100.0]\%$ &bull; Himalayan Cells: 236,351.
- **Standalone Test Map**: [`/test/snow/index.html`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/snow/index.html).

### 8. 3SIMG_L2G_AOD (Aerosol Optical Depth)
- **Sensor**: INSAT-3DS Imager (Visible $0.65\text{ µm}$ radiance inversion).
- **Physical Metric**: Columnar Aerosol Optical Depth ($0.01$ to $3.0$, unitless).
- **Grid Structure**: 1D regular vectors `/latitude` ($0.05^\circ$ grid) and `/longitude`, meshed into a 2D regular matrix.
- **Target Kafka Topic**: `mosdac.environment`.
- **Verified Granule**: `3SIMG_12SEP2026_0830_L2G_AOD_V01R00.h5` &bull; Range: $[0.013, 2.994]$ &bull; Cells: 1,221.
- **Standalone Test Map**: [`/test/aerosol/index.html`](file:///F:/Shashwat_Mandali/Coding%20Script/RITU-platform/test/aerosol/index.html).

---

## 3. Upstream Catalog Diagnostic Log & Technical Status

For products not currently distributed by ISRO SAC's public OpenSearch ring:

```
[MOSDAC OpenSearch Probe 2026-09-12T14:30:00Z]
Target: https://mosdac.gov.in/opensearch/search/{datasetId}
Param Protocol: datasetId={datasetId}&time=recent (OpenAPI 3.0.1 Specification)

Results:
- 3SIMG_L2B_CMV  -> HTTP 500 (Internal Server Error: Dataset not staged in active ring)
- 3SIMG_L2C_FIR  -> HTTP 500 (Internal Server Error: Dataset pipeline disabled at upstream source)
- 3SSND_L2B_ATD  -> HTTP 500 (Internal Server Error: Sounder processing chain offline)
- O3SCA_L2B_WND  -> HTTP 403 / 500 (Access Restricted: Requires specialized institutional authorization)
```

**System Compliance**:
1. Zero mock or fake observations are fabricated for these products.
2. Every unavailable product displays a dedicated technical status and explanation page under `/test/{folder}/index.html`.
3. Adapters, database schemas, and Kafka topics (`mosdac.weather`, `mosdac.environment`, `mosdac.ocean`) are fully coded and tested so that the moment upstream distribution starts, ingestion commences automatically without software modification.
