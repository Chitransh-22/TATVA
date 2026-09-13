/**
 * Canonical MOSDAC Product Definitions, Color Scales, and Rendering Configurations.
 * Reuses validated test-map schemas and supports all available and registered products.
 */

export const MOSDAC_PRODUCTS = {
  // =========================================================================
  // WEATHER PRODUCTS
  // =========================================================================
  '3SIMG_L2B_HEM': {
    productId: '3SIMG_L2B_HEM',
    productName: 'INSAT-3DS Hydro-Estimator Precipitation (HEM)',
    shortName: 'HEM Rain',
    category: 'weather',
    unit: 'mm/hr',
    icon: '🌧️',
    meta: 'ISRO SAC Ahmedabad • 3SIMG_L2B_HEM • 0.04° (~4 km) • 30-min Cadence',
    defaultMinThreshold: 0.1,
    renderType: 'fluid_raster',
    clipToBoundary: true,
    legendTitle: 'Precipitation Rate',
    status: 'LIVE DATA',
    metricLabels: {
      primary: 'Average Rainfall',
      primaryUnit: 'mm/hr',
      secondary: 'Peak Intensity',
      secondaryUnit: 'mm/hr',
      total: 'Active Rain Cells',
      mean: 'Mean Rainfall',
    },
    thresholdOptions: [
      { value: '0.1', label: 'All (> 0.1 mm/h)' },
      { value: '2.5', label: 'Light+ (> 2.5 mm/h)' },
      { value: '7.5', label: 'Moderate+ (> 7.5 mm/h)' },
      { value: '15.0', label: 'Heavy+ (> 15.0 mm/h)' },
      { value: '50.0', label: 'Extreme (> 50.0 mm/h)' }
    ],
    colorScale: [
      { min: 100.0, color: '#a855f7', label: 'Extreme Downpour', range: '> 100.0 mm/hr' },
      { min: 50.0,  color: '#ef4444', label: 'Torrential Rain', range: '50.0 – 100.0' },
      { min: 30.0,  color: '#f97316', label: 'Very Heavy Rain', range: '30.0 – 50.0' },
      { min: 15.0,  color: '#eab308', label: 'Heavy Rain', range: '15.0 – 30.0' },
      { min: 7.5,   color: '#22c55e', label: 'Moderate Rain', range: '7.5 – 15.0' },
      { min: 2.5,   color: '#0284c7', label: 'Light Rain', range: '2.5 – 7.5' },
      { min: 0.1,   color: '#38bdf8', label: 'Very Light Rain', range: '0.1 – 2.5' }
    ]
  },

  '3SIMG_L2G_IMR': {
    productId: '3SIMG_L2G_IMR',
    productName: 'INSAT-3DS Multispectral Rainfall (IMR)',
    shortName: 'IMR Rain',
    category: 'weather',
    unit: 'mm/hr',
    icon: '🌧️',
    meta: 'ISRO SAC Ahmedabad • 3SIMG_L2G_IMR • 0.04° (~4 km) • 30-min Cadence',
    defaultMinThreshold: 0.1,
    renderType: 'fluid_raster',
    clipToBoundary: true,
    legendTitle: 'Precipitation Rate (IMR)',
    status: 'LIVE DATA',
    metricLabels: {
      primary: 'Average Rainfall',
      primaryUnit: 'mm/hr',
      secondary: 'Peak Intensity',
      secondaryUnit: 'mm/hr',
      total: 'Observed Rain Cells',
      mean: 'Mean Rainfall',
    },
    thresholdOptions: [
      { value: '0.1', label: 'All (> 0.1 mm/h)' },
      { value: '2.5', label: 'Light+ (> 2.5 mm/h)' },
      { value: '7.5', label: 'Moderate+ (> 7.5 mm/h)' },
      { value: '15.0', label: 'Heavy+ (> 15.0 mm/h)' },
      { value: '50.0', label: 'Extreme (> 50.0 mm/h)' }
    ],
    colorScale: [
      { min: 100.0, color: '#a855f7', label: 'Extreme Downpour', range: '> 100.0 mm/hr' },
      { min: 50.0,  color: '#ef4444', label: 'Torrential Rain', range: '50.0 – 100.0' },
      { min: 30.0,  color: '#f97316', label: 'Very Heavy Rain', range: '30.0 – 50.0' },
      { min: 15.0,  color: '#eab308', label: 'Heavy Rain', range: '15.0 – 30.0' },
      { min: 7.5,   color: '#22c55e', label: 'Moderate Rain', range: '7.5 – 15.0' },
      { min: 2.5,   color: '#0284c7', label: 'Light Rain', range: '2.5 – 7.5' },
      { min: 0.1,   color: '#38bdf8', label: 'Very Light Rain', range: '0.1 – 2.5' }
    ]
  },

  '3SIMG_L2B_CTP': {
    productId: '3SIMG_L2B_CTP',
    productName: 'Cloud Top Pressure & Temperature (CTP)',
    shortName: 'CTP Cloud',
    category: 'weather',
    unit: 'hPa',
    icon: '☁️',
    meta: 'ISRO SAC Ahmedabad • 3SIMG_L2B_CTP • 0.04° (~4 km) • 30-min Cadence',
    defaultMinThreshold: 50.0,
    renderType: 'fluid_raster',
    clipToBoundary: true,
    legendTitle: 'Cloud Top Pressure',
    status: 'LIVE DATA',
    metricLabels: {
      primary: 'Mean Pressure',
      primaryUnit: 'hPa',
      secondary: 'Deepest Convective Top',
      secondaryUnit: 'hPa',
      total: 'Cloud Cells',
      mean: 'Average Pressure',
    },
    thresholdOptions: [
      { value: '50', label: 'All (> 50 hPa)' },
      { value: '250', label: 'Mid-to-Low (< 400 hPa)' },
      { value: '550', label: 'Low Stratiform (> 550 hPa)' },
      { value: '700', label: 'Boundary Layer (> 700 hPa)' }
    ],
    colorScale: [
      { min: 850.0, color: '#f97316', label: 'Boundary Layer Stratus', range: '850 – 1013 hPa' },
      { min: 700.0, color: '#eab308', label: 'Low Stratocumulus', range: '700 – 850' },
      { min: 550.0, color: '#10b981', label: 'Lower-Middle Cloud', range: '550 – 700' },
      { min: 400.0, color: '#06b6d4', label: 'Mid-Level Altocumulus', range: '400 – 550' },
      { min: 250.0, color: '#3b82f6', label: 'Upper Tropospheric Cloud', range: '250 – 400' },
      { min: 50.0,  color: '#a855f7', label: 'Deep Convective Storm Top', range: '50 – 250' }
    ]
  },

  '3SIMG_L2B_UTH': {
    productId: '3SIMG_L2B_UTH',
    productName: 'Upper Tropospheric Humidity (UTH)',
    shortName: 'UTH Humidity',
    category: 'weather',
    unit: '%',
    icon: '💧',
    meta: 'ISRO SAC Ahmedabad • 3SIMG_L2B_UTH • 0.04° (~4 km) • 30-min Cadence',
    defaultMinThreshold: 0.0,
    renderType: 'fluid_raster',
    clipToBoundary: true,
    legendTitle: 'Upper Tropospheric Humidity',
    status: 'LIVE DATA',
    metricLabels: {
      primary: 'Mean Humidity',
      primaryUnit: '%',
      secondary: 'Max Moisture',
      secondaryUnit: '%',
      total: 'Observed Cells',
      mean: 'Mean Moisture',
    },
    thresholdOptions: [
      { value: '0', label: 'All (>= 0%)' },
      { value: '20', label: 'Moderate+ (> 20%)' },
      { value: '40', label: 'High+ (> 40%)' },
      { value: '60', label: 'Very High (> 60%)' },
      { value: '80', label: 'Saturated (> 80%)' }
    ],
    colorScale: [
      { min: 80.0, color: '#1e3a8a', label: 'Saturated Moisture', range: '> 80%' },
      { min: 60.0, color: '#0284c7', label: 'High Moisture', range: '60 – 80%' },
      { min: 40.0, color: '#06b6d4', label: 'Moderate Humidity', range: '40 – 60%' },
      { min: 20.0, color: '#f59e0b', label: 'Dry Subsidence', range: '20 – 40%' },
      { min: 0.0,  color: '#d97706', label: 'Arid Upper Air', range: '0 – 20%' }
    ]
  },

  '3SIMG_L2B_OLR': {
    productId: '3SIMG_L2B_OLR',
    productName: 'Outgoing Longwave Radiation (OLR)',
    shortName: 'OLR Radiation',
    category: 'weather',
    unit: 'W/m²',
    icon: '🌡️',
    meta: 'ISRO SAC Ahmedabad • 3SIMG_L2B_OLR • 0.04° (~4 km) • 30-min Cadence',
    defaultMinThreshold: 50.0,
    renderType: 'fluid_raster',
    clipToBoundary: true,
    legendTitle: 'Outgoing Longwave Radiation',
    status: 'LIVE DATA',
    metricLabels: {
      primary: 'Mean Flux',
      primaryUnit: 'W/m²',
      secondary: 'Peak Thermal Radiance',
      secondaryUnit: 'W/m²',
      total: 'Radiation Cells',
      mean: 'Mean Thermal Flux',
    },
    thresholdOptions: [
      { value: '50', label: 'All (> 50 W/m²)' },
      { value: '130', label: 'Convective+ (> 130)' },
      { value: '160', label: 'Mid-Level+ (> 160)' },
      { value: '200', label: 'Haze/Clear (> 200)' },
      { value: '240', label: 'Warm Land (> 240)' }
    ],
    colorScale: [
      { min: 280.0, color: '#dc2626', label: 'Arid / Hot Land Surface', range: '> 280 W/m²' },
      { min: 240.0, color: '#f97316', label: 'Warm Clear Sky', range: '240 – 280' },
      { min: 200.0, color: '#eab308', label: 'Moderate Cloud / Haze', range: '200 – 240' },
      { min: 160.0, color: '#10b981', label: 'Thick Mid-Level Cloud', range: '160 – 200' },
      { min: 130.0, color: '#06b6d4', label: 'Deep Convective Cloud', range: '130 – 160' },
      { min: 50.0,  color: '#a855f7', label: 'Cold High Cloud Tops', range: '50 – 130' }
    ]
  },

  '3SIMG_L2C_FOG': {
    productId: '3SIMG_L2C_FOG',
    productName: 'Night & Day Fog Detection (FOG)',
    shortName: 'Fog Detection',
    category: 'weather',
    unit: 'Fog State',
    icon: '🌫️',
    meta: 'ISRO SAC Ahmedabad • 3SIMG_L2C_FOG • 1 km / 4 km • 30-min Cadence',
    defaultMinThreshold: 0.5,
    renderType: 'categorical_mask',
    clipToBoundary: true,
    legendTitle: 'Fog Detection Mask',
    status: 'LIVE DATA',
    metricLabels: {
      primary: 'Fog Occurrence',
      primaryUnit: 'Mask',
      secondary: 'Active Fog Pixels',
      secondaryUnit: 'cells',
      total: 'Scanned Cells',
      mean: 'Fog Fraction',
    },
    thresholdOptions: [
      { value: '0.0', label: 'All Points (Clear + Fog)' },
      { value: '0.5', label: 'Fog Pixels Only (val = 1)' }
    ],
    colorScale: [
      { min: 0.5, color: '#0891b2', label: 'Fog Layer Detected', range: '1 (Fog)' },
      { min: 0.0, color: '#bae6fd', label: 'Clear Sky / No Fog', range: '0 (Clear)' }
    ]
  },

  // =========================================================================
  // ENVIRONMENT PRODUCTS
  // =========================================================================
  '3SIMG_L2C_SNW': {
    productId: '3SIMG_L2C_SNW',
    productName: 'Fractional Snow Cover (SNW)',
    shortName: 'Snow Cover',
    category: 'environment',
    unit: '%',
    icon: '❄️',
    meta: 'ISRO SAC Ahmedabad • 3SIMG_L2C_SNW • 1 km projected • Daily',
    defaultMinThreshold: 1.0,
    renderType: 'fluid_raster',
    clipToBoundary: true,
    legendTitle: 'Fractional Snow Cover',
    status: 'LIVE DATA',
    metricLabels: {
      primary: 'Mean Snowpack',
      primaryUnit: '%',
      secondary: 'Dense Glacier Snow',
      secondaryUnit: '%',
      total: 'Snow Cells',
      mean: 'Mean Coverage',
    },
    thresholdOptions: [
      { value: '1.0', label: 'All Snow (> 1%)' },
      { value: '20.0', label: 'Partial+ (> 20%)' },
      { value: '40.0', label: 'Moderate+ (> 40%)' },
      { value: '60.0', label: 'Dense+ (> 60%)' },
      { value: '80.0', label: 'Glacier Only (> 80%)' }
    ],
    colorScale: [
      { min: 80.0, color: '#e0f2fe', label: 'Glacier / Heavy Snowpack', range: '80 – 100%' },
      { min: 60.0, color: '#38bdf8', label: 'Dense Snow Cover', range: '60 – 80%' },
      { min: 40.0, color: '#0284c7', label: 'Moderate Snow Cover', range: '40 – 60%' },
      { min: 20.0, color: '#0369a1', label: 'Partial Snow', range: '20 – 40%' },
      { min: 1.0,  color: '#0f766e', label: 'Trace Snow', range: '1 – 20%' }
    ]
  },

  '3SIMG_L2G_AOD': {
    productId: '3SIMG_L2G_AOD',
    productName: 'Aerosol Optical Depth (AOD)',
    shortName: 'AOD Aerosol',
    category: 'environment',
    unit: 'Optical Depth',
    icon: '💨',
    meta: 'ISRO SAC Ahmedabad • 3SIMG_L2G_AOD • 0.05° (~5 km) • Daytime 30-min',
    defaultMinThreshold: 0.0,
    renderType: 'fluid_raster',
    clipToBoundary: true,
    legendTitle: 'Aerosol Optical Depth',
    status: 'LIVE DATA',
    metricLabels: {
      primary: 'Mean Aerosol Loading',
      primaryUnit: 'AOD',
      secondary: 'Max Smog / Dust Peak',
      secondaryUnit: 'AOD',
      total: 'Sounding Points',
      mean: 'Average Optical Depth',
    },
    thresholdOptions: [
      { value: '0.0', label: 'All (>= 0.0)' },
      { value: '0.1', label: 'Light+ (> 0.1)' },
      { value: '0.3', label: 'Moderate+ (> 0.3)' },
      { value: '0.6', label: 'Poor Air+ (> 0.6)' },
      { value: '1.0', label: 'Hazardous+ (> 1.0)' }
    ],
    colorScale: [
      { min: 1.5, color: '#7f1d1d', label: 'Hazardous Dust / Extreme Haze', range: '> 1.5' },
      { min: 1.0, color: '#dc2626', label: 'Very Heavy Aerosol Loading', range: '1.0 – 1.5' },
      { min: 0.6, color: '#ea580c', label: 'Poor Air Quality / Smog', range: '0.6 – 1.0' },
      { min: 0.3, color: '#eab308', label: 'Moderate Aerosol Burden', range: '0.3 – 0.6' },
      { min: 0.1, color: '#16a34a', label: 'Clean Atmospheric Air', range: '0.1 – 0.3' },
      { min: 0.0, color: '#0284c7', label: 'Pristine Atmosphere', range: '0.0 – 0.1' }
    ]
  },

  // =========================================================================
  // OCEAN PRODUCTS
  // =========================================================================
  '3SIMG_L2B_SST': {
    productId: '3SIMG_L2B_SST',
    productName: 'Sea Surface Temperature (SST)',
    shortName: 'SST Ocean',
    category: 'ocean',
    unit: '°C',
    icon: '🌊',
    meta: 'ISRO SAC Ahmedabad • 3SIMG_L2B_SST • 0.04° (~4 km) • 30-min Cadence',
    defaultMinThreshold: 15.0,
    renderType: 'fluid_raster',
    clipToBoundary: false, // SST is strictly oceanic; must NOT be clipped to land!
    legendTitle: 'Sea Surface Temperature',
    status: 'LIVE DATA',
    metricLabels: {
      primary: 'Mean Sea Temp',
      primaryUnit: '°C',
      secondary: 'Tropical Warm Pool',
      secondaryUnit: '°C',
      total: 'Marine Grid Cells',
      mean: 'Average Ocean Temp',
    },
    thresholdOptions: [
      { value: '15.0', label: 'All Marine (> 15°C)' },
      { value: '23.0', label: 'Mild+ (> 23°C)' },
      { value: '25.0', label: 'Warm+ (> 25°C)' },
      { value: '28.0', label: 'Tropical Pool (> 28°C)' }
    ],
    colorScale: [
      { min: 31.0, color: '#dc2626', label: 'Extreme Warm Pool', range: '> 31 °C' },
      { min: 29.0, color: '#f97316', label: 'Very Warm Tropical Waters', range: '29 – 31 °C' },
      { min: 27.0, color: '#eab308', label: 'Warm Arabian/Bengal Basin', range: '27 – 29 °C' },
      { min: 25.0, color: '#10b981', label: 'Moderate Oceanic Waters', range: '25 – 27 °C' },
      { min: 23.0, color: '#06b6d4', label: 'Mild Marine Upwelling', range: '23 – 25 °C' },
      { min: 15.0, color: '#0284c7', label: 'Cool Coastal Upwelling', range: '15 – 23 °C' }
    ]
  },

  // =========================================================================
  // REGISTERED BUT CURRENTLY UNAVAILABLE MOSDAC PRODUCTS
  // =========================================================================
  '3SIMG_L2B_CMV': {
    productId: '3SIMG_L2B_CMV',
    productName: 'Cloud Motion Vector (Atmospheric Wind)',
    shortName: 'Cloud Motion',
    category: 'weather',
    unit: 'm/s',
    icon: '🌀',
    meta: 'INSAT-3DS Imager • Atmospheric wind vectors',
    status: 'UNAVAILABLE',
    unavailabilityReason: 'Upstream calibration in progress by SAC Ahmedabad',
    renderType: 'points',
    clipToBoundary: true,
    colorScale: []
  },
  '3SIMG_L2B_WVW': {
    productId: '3SIMG_L2B_WVW',
    productName: 'Water Vapour Wind Vectors',
    shortName: 'Water Vapour Wind',
    category: 'weather',
    unit: 'm/s',
    icon: '💨',
    meta: 'INSAT-3DS Imager • Mid-level moisture winds',
    status: 'UNAVAILABLE',
    unavailabilityReason: 'Upstream sensor channel offline',
    renderType: 'points',
    clipToBoundary: true,
    colorScale: []
  },
  '3SSND_L2B_ATD': {
    productId: '3SSND_L2B_ATD',
    productName: 'Atmospheric Sounder Profile',
    shortName: 'Temp & Humidity Profile',
    category: 'weather',
    unit: 'K & g/kg',
    icon: '📊',
    meta: 'INSAT-3DS Sounder • Vertical temperature & humidity profile',
    status: 'UNAVAILABLE',
    unavailabilityReason: 'Sounder operational verification cycle',
    renderType: 'points',
    clipToBoundary: true,
    colorScale: []
  },
  '3SSND_L2B_TPW': {
    productId: '3SSND_L2B_TPW',
    productName: 'Total Precipitable Water',
    shortName: 'Precipitable Water',
    category: 'weather',
    unit: 'mm',
    icon: '💧',
    meta: 'INSAT-3DS Sounder • Column integrated moisture',
    status: 'UNAVAILABLE',
    unavailabilityReason: 'Upstream sounder data pipeline queued',
    renderType: 'points',
    clipToBoundary: true,
    colorScale: []
  },
  '3SIMG_L2C_FIR': {
    productId: '3SIMG_L2C_FIR',
    productName: 'Active Fire & Thermal Anomalies',
    shortName: 'Fire Detection',
    category: 'environment',
    unit: 'Fire Pixels',
    icon: '🔥',
    meta: 'INSAT-3DS Imager • Shortwave infrared hot-spot detection',
    status: 'UNAVAILABLE',
    unavailabilityReason: 'Agricultural burning season cycle inactive',
    renderType: 'points',
    clipToBoundary: true,
    colorScale: []
  },
  '3SIMG_L2C_SMK': {
    productId: '3SIMG_L2C_SMK',
    productName: 'Smoke & Haze Plume Boundary',
    shortName: 'Smoke Plume',
    category: 'environment',
    unit: 'Smoke Mask',
    icon: '🌫️',
    meta: 'INSAT-3DS Imager • Visible channel smoke plume boundary',
    status: 'UNAVAILABLE',
    unavailabilityReason: 'Post-harvest stubble monitoring inactive',
    renderType: 'points',
    clipToBoundary: true,
    colorScale: []
  },
  'O3SCA_L2B_WND': {
    productId: 'O3SCA_L2B_WND',
    productName: 'Oceansat-3 / SCATSAT-1 Ocean Surface Wind',
    shortName: 'Ocean Wind',
    category: 'ocean',
    unit: 'm/s',
    icon: '🌬️',
    meta: 'Oceansat-3 Ku-band Scatterometer • Marine wind vectors',
    status: 'UNAVAILABLE',
    unavailabilityReason: 'Oceansat-3 L2B telemetry ingestion queued',
    renderType: 'points',
    clipToBoundary: false,
    colorScale: []
  },
  'O3OCM_L2B_CHL': {
    productId: 'O3OCM_L2B_CHL',
    productName: 'Ocean Colour & Chlorophyll-a',
    shortName: 'Chlorophyll',
    category: 'ocean',
    unit: 'mg/m³',
    icon: '🌱',
    meta: 'Oceansat-3 Ocean Colour Monitor • Phytoplankton bloom index',
    status: 'UNAVAILABLE',
    unavailabilityReason: 'Optical ocean color processing window closed',
    renderType: 'points',
    clipToBoundary: false,
    colorScale: []
  }
};

export const DEFAULT_PRODUCT_ID = '3SIMG_L2B_HEM';

export const AVAILABLE_PRODUCT_IDS = [
  '3SIMG_L2B_HEM',
  '3SIMG_L2G_IMR',
  '3SIMG_L2B_CTP',
  '3SIMG_L2B_UTH',
  '3SIMG_L2B_OLR',
  '3SIMG_L2C_FOG',
  '3SIMG_L2C_SNW',
  '3SIMG_L2G_AOD',
  '3SIMG_L2B_SST'
];

export function getProductDefinition(productId) {
  return MOSDAC_PRODUCTS[productId] || MOSDAC_PRODUCTS[DEFAULT_PRODUCT_ID];
}

export function getProductColor(config, val) {
  if (!config || !config.colorScale || config.colorScale.length === 0) {
    return '#0284c7';
  }
  for (const step of config.colorScale) {
    if (val >= step.min) return step.color;
  }
  return config.colorScale[config.colorScale.length - 1]?.color || '#38bdf8';
}

export function getProductCategoryDesc(config, val) {
  if (!config || !config.colorScale || config.colorScale.length === 0) {
    return '';
  }
  for (const step of config.colorScale) {
    if (val >= step.min) return step.label;
  }
  return '';
}

/**
 * Converts hex color string (#rrggbb) to [r, g, b] array.
 */
export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return [56, 189, 248];
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16)
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.substring(0, 2), 16),
      parseInt(clean.substring(2, 4), 16),
      parseInt(clean.substring(4, 6), 16)
    ];
  }
  return [56, 189, 248];
}

export function getProductRgb(config, val) {
  const hex = getProductColor(config, val);
  return hexToRgb(hex);
}
