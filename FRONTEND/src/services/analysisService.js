/**
 * TATVA Analysis Service - Authoritative Backend Data Integration Layer
 * 
 * Provides robust, asynchronous data fetching from real TATVA FastAPI & PostGIS endpoints:
 * - National overview & state rollups: /api/weather/india/overview
 * - State-level observations & district rollups: /api/weather/state/{state_name}
 * - District-level observations: /api/weather/district/{state_name}/{district_name}
 * - Historical precipitation time-series: /api/weather/historical-series
 * - Satellite metadata & telemetry: /api/weather/metadata
 * 
 * ZERO mock values, ZERO random generators, ZERO fake datasets.
 * Respects AbortController signals to guarantee cancellation of stale in-flight requests.
 */

import { ALL_INDIA_REGIONS } from '../data/weatherData';

/**
 * IMD Standard Precipitation Intensity Classification
 */
export function classifyRainfall(value) {
  const p = Number(value);
  if (!isFinite(p) || p <= 0) return 'Clear / Dry';
  if (p < 1.0) return 'Very Light Trace';
  if (p < 15.0) return 'Light Rain';
  if (p < 50.0) return 'Moderate Rain';
  if (p < 100.0) return 'Heavy Rainfall';
  return 'Torrential Downpour';
}

/**
 * Safely format numeric weather values with appropriate decimal places
 */
export function formatMetricValue(val, decimals = 2, fallback = '—') {
  if (val == null || val === '') return fallback;
  const num = Number(val);
  if (!isFinite(num)) return fallback;
  return num.toFixed(decimals);
}

/**
 * Fetch authoritative national precipitation overview
 */
export async function fetchAnalysisOverview(observationTime = null, signal = null) {
  let url = '/api/weather/india/overview?grid_step=0.5';
  if (observationTime) {
    url += `&observation_time=${encodeURIComponent(observationTime)}`;
  }

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch India overview: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data;
}

/**
 * Fetch authoritative state observations and district summaries
 */
export async function fetchAnalysisState(stateName, observationTime = null, signal = null) {
  if (!stateName) {
    throw new Error('State name is required');
  }

  let url = `/api/weather/state/${encodeURIComponent(stateName)}`;
  if (observationTime) {
    url += `?observation_time=${encodeURIComponent(observationTime)}`;
  }

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch state observations for ${stateName}: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data;
}

/**
 * Fetch authoritative district observations
 */
export async function fetchAnalysisDistrict(stateName, districtName, observationTime = null, signal = null) {
  if (!stateName || !districtName) {
    throw new Error('Both state name and district name are required');
  }

  let url = `/api/weather/district/${encodeURIComponent(stateName)}/${encodeURIComponent(districtName)}`;
  if (observationTime) {
    url += `?observation_time=${encodeURIComponent(observationTime)}`;
  }

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch district observations for ${districtName}, ${stateName}: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data;
}

/**
 * Fetch real historical precipitation time-series for India, a State, or a District
 */
export async function fetchHistoricalSeries({ stateName = null, districtName = null, limit = 24 } = {}, signal = null) {
  let url = `/api/weather/historical-series?limit=${encodeURIComponent(limit)}`;
  if (districtName) {
    url += `&district_name=${encodeURIComponent(districtName)}`;
  } else if (stateName) {
    url += `&state_name=${encodeURIComponent(stateName)}`;
  }

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch historical series: HTTP ${res.status}`);
  }
  const data = await res.json();

  // Validate and sort timeline chronologically (earliest to latest)
  const rawTimeline = Array.isArray(data.timeline) ? data.timeline : [];
  const validatedTimeline = rawTimeline
    .filter((item) => item && (item.observation_time || item.observation_ist))
    .map((item) => {
      const avgP = Number(item.avg_precipitation);
      const maxP = Number(item.max_precipitation);
      const minP = Number(item.min_precipitation);
      const pts = Number(item.total_points);

      return {
        observation_time: item.observation_time,
        observation_ist: item.observation_ist || new Date(item.observation_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        avg_precipitation: isFinite(avgP) ? avgP : 0.0,
        max_precipitation: isFinite(maxP) ? maxP : 0.0,
        min_precipitation: isFinite(minP) ? minP : 0.0,
        total_points: isFinite(pts) ? Math.round(pts) : 0,
        rain_category: item.rain_category || classifyRainfall(isFinite(maxP) ? maxP : avgP),
      };
    })
    .sort((a, b) => new Date(a.observation_time).getTime() - new Date(b.observation_time).getTime());

  return {
    ...data,
    timeline: validatedTimeline,
  };
}

/**
 * Fetch metadata and telemetry status
 */
export async function fetchAnalysisMetadata(signal = null) {
  const res = await fetch('/api/weather/metadata', { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch metadata: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch real weather anomalies recorded in the database
 */
export async function fetchAnalysisAnomalies(limit = 20, signal = null) {
  try {
    const res = await fetch(`/api/weather/anomalies?limit=${limit}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.anomalies) ? data.anomalies : [];
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.warn('Anomalies fetch warning:', err.message);
    return [];
  }
}

export { ALL_INDIA_REGIONS };
