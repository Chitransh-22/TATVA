/**
 * CANONICAL RAINFALL METRICS & CLASSIFICATION MODULE
 *
 * Single source of truth for:
 * - Rain Units: mm/hr for rate, mm for accumulated
 * - Valid observation filtering (excludes null, undefined, NaN, negatives, and IMERG fill value >= 29990)
 * - Rain classification categories
 * - Color scale mappings (synchronized with map legend)
 * - Metric aggregation from raw observation point collections
 */

export const CANONICAL_RAIN_RATE_UNIT = 'mm/hr';
export const CANONICAL_ACCUMULATION_UNIT = 'mm';

// NASA IMERG nodata / fill value threshold
export const IMERG_NODATA_THRESHOLD = 29990;

/**
 * Validates whether a raw precipitation reading is a genuine, valid measurement.
 */
export function isValidRainfall(val) {
  if (val === null || val === undefined) return false;
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num)) return false;
  if (num < 0) return false;
  if (num >= IMERG_NODATA_THRESHOLD) return false;
  return true;
}

/**
 * Authoritative precipitation intensity classification.
 * Matches backend IMD / IMERG rate standards:
 * - < 1.0 mm/hr: Clear / Dry
 * - 1.0 - 14.99 mm/hr: Light Rain
 * - 15.0 - 49.99 mm/hr: Moderate Rain
 * - 50.0 - 99.99 mm/hr: Heavy Rainfall
 * - >= 100.0 mm/hr: Very Heavy Torrential Downpour
 */
export function classifyRainfall(peakRain) {
  if (!isValidRainfall(peakRain) || peakRain < 1.0) return 'Clear / Dry';
  if (peakRain < 15.0) return 'Light Rain';
  if (peakRain < 50.0) return 'Moderate Rain';
  if (peakRain < 100.0) return 'Heavy Rainfall';
  return 'Very Heavy Torrential Downpour';
}

/**
 * Calculates canonical aggregate metrics from an array of observations or grid points.
 * Handles both object representations ({ precipitation }) and array representations ([lat, lon, precip]).
 */
export function calculateRainfallMetrics(points) {
  if (!points || !Array.isArray(points) || points.length === 0) {
    return {
      average: 0.0,
      peak: 0.0,
      min: 0.0,
      observationCount: 0,
      measurableRainCount: 0,
      unit: CANONICAL_RAIN_RATE_UNIT,
      category: 'Clear / Dry',
    };
  }

  let sum = 0;
  let count = 0;
  let measurableCount = 0;
  let max = 0;
  let min = Infinity;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!pt) continue;

    let p = null;
    if (typeof pt === 'number') {
      p = pt;
    } else if (pt.precipitation !== undefined) {
      p = pt.precipitation;
    } else if (Array.isArray(pt) && pt.length >= 3) {
      p = pt[2];
    } else if (pt.p !== undefined) {
      p = pt.p;
    }

    if (!isValidRainfall(p)) continue;

    sum += p;
    count++;
    if (p >= 0.1) {
      measurableCount++;
    }
    if (p > max) max = p;
    if (p < min) min = p;
  }

  const avg = count > 0 ? Number((sum / count).toFixed(2)) : 0.0;
  const peak = count > 0 ? Number(max.toFixed(1)) : 0.0;
  const lowest = count > 0 && min !== Infinity ? Number(min.toFixed(2)) : 0.0;

  return {
    average: avg,
    peak: peak,
    min: lowest,
    observationCount: count,
    measurableRainCount: measurableCount,
    unit: CANONICAL_RAIN_RATE_UNIT,
    category: classifyRainfall(peak),
  };
}

/**
 * NASA IMERG Standard Continuous Precipitation Rate Color Scale
 * Strictly synchronized with Map Legend ticks (0, 2.5, 7.5, 15, 30, 50, 100+ mm/hr)
 */
export function getRainfallColor(val) {
  if (!isValidRainfall(val) || val < 0.1) return 'transparent';
  if (val < 2.5) return 'rgba(56, 189, 248, 0.88)';    // Sky Blue
  if (val < 7.5) return 'rgba(34, 197, 94, 0.90)';     // Vibrant Green
  if (val < 15.0) return 'rgba(163, 230, 53, 0.92)';   // Lime / Yellow-Green
  if (val < 30.0) return 'rgba(250, 204, 21, 0.94)';   // Amber-Yellow
  if (val < 50.0) return 'rgba(249, 115, 22, 0.95)';   // Vivid Orange
  if (val < 100.0) return 'rgba(239, 68, 68, 0.96)';   // Crimson Red
  if (val < 200.0) return 'rgba(217, 70, 239, 0.98)';  // Magenta
  return 'rgba(126, 34, 206, 1.0)';                    // Deep Violet
}

/**
 * Returns canonical [r, g, b] array for fluid canvas interpolation.
 */
export function getPrecipitationRgb(val) {
  if (!isValidRainfall(val) || val < 0.1) return null;
  if (val < 2.5) return [56, 189, 248];    // Sky Blue
  if (val < 7.5) return [34, 197, 94];     // Vibrant Green
  if (val < 15.0) return [163, 230, 53];   // Lime / Yellow-Green
  if (val < 30.0) return [250, 204, 21];   // Amber-Yellow
  if (val < 50.0) return [249, 115, 22];   // Vivid Orange
  if (val < 100.0) return [239, 68, 68];   // Crimson Red
  if (val < 200.0) return [217, 70, 239];  // Magenta
  return [126, 34, 206];                   // Deep Violet
}

/**
 * Visual styling tokens for category pill badges across dashboard and sidebar.
 */
export function getCategoryBadgeStyle(category) {
  if (!category) return { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
  const cat = category.toLowerCase();
  if (cat.includes('very heavy') || cat.includes('downpour') || cat.includes('torrential')) {
    return { bg: '#fdf4ff', text: '#7e22ce', border: '#f0abfc' };
  }
  if (cat.includes('heavy')) {
    return { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' };
  }
  if (cat.includes('moderate')) {
    return { bg: '#fff7ed', text: '#c2410c', border: '#fdba74' };
  }
  if (cat.includes('light')) {
    return { bg: '#f0fdf4', text: '#15803d', border: '#86efac' };
  }
  return { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
}
