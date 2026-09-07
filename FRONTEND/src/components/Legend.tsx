import React from 'react';

/**
 * NASA IMERG Standard Color Ramp
 * - 0 mm: Transparent / light gray
 * - 0.1 - 2.5 mm: Light cyan / blue
 * - 2.5 - 7.5 mm: Green
 * - 7.5 - 15 mm: Yellow-green
 * - 15 - 30 mm: Yellow / Orange
 * - 30 - 50 mm: Red-Orange
 * - 50+ mm: Magenta / Purple / Deep violet
 */
export function getPrecipitationColor(val: number | null | undefined): string {
  if (val === null || val === undefined || val < 0.1) return 'transparent';
  if (val < 2.5) return 'rgba(56, 189, 248, 0.85)';   // Light cyan / blue (#38bdf8)
  if (val < 7.5) return 'rgba(34, 197, 94, 0.88)';    // Green (#22c55e)
  if (val < 15.0) return 'rgba(163, 230, 53, 0.90)';  // Yellow-green (#a3e635)
  if (val < 30.0) return 'rgba(250, 204, 21, 0.92)';  // Yellow (#facc15)
  if (val < 50.0) return 'rgba(249, 115, 22, 0.94)';  // Red-Orange (#f97316)
  if (val < 100.0) return 'rgba(239, 68, 68, 0.95)';  // Red (#ef4444)
  if (val < 200.0) return 'rgba(217, 70, 239, 0.96)'; // Magenta (#d946ef)
  return 'rgba(126, 34, 206, 0.98)';                  // Purple / Deep violet (#7e22ce)
}

export const Legend: React.FC = () => {
  return (
    <div className="map-legend">
      <div className="legend-title">
        <span className="legend-label">Rainfall Rate</span>
        <span className="legend-unit">mm</span>
      </div>
      <div className="legend-bar" />
      <div className="legend-ticks">
        <span>0.1</span>
        <span>2.5</span>
        <span>7.5</span>
        <span>15</span>
        <span>30</span>
        <span>50</span>
        <span>100+</span>
      </div>
    </div>
  );
};

