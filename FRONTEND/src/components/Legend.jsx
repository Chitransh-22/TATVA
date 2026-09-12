import {
  getRainfallColor,
  getCategoryBadgeStyle,
  getPrecipitationRgb,
  CANONICAL_RAIN_RATE_UNIT,
} from '../utils/rainfallMetrics';

export { getRainfallColor, getCategoryBadgeStyle, getPrecipitationRgb };
export const getPrecipitationColor = getRainfallColor;


export function Legend() {
  return (
    <div className="map-legend" role="region" aria-label="Precipitation Intensity Legend">
      <div className="legend-header">
        <span className="legend-title">Precipitation Rate</span>
        <span className="legend-unit">mm/hr</span>
      </div>
      <div className="legend-bar-track">
        <div className="legend-gradient-bar" />
      </div>
      <div className="legend-ticks">
        <span>0</span>
        <span>2.5</span>
        <span>7.5</span>
        <span>15</span>
        <span>30</span>
        <span>50</span>
        <span>100+</span>
      </div>
    </div>
  );
}
