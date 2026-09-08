import React from 'react';

/**
 * NASA IMERG Standard Color Ramp
 * - < 0.1 mm: Transparent
 * - 0.1 - 2.5 mm: Light cyan / sky blue (#38bdf8)
 * - 2.5 - 7.5 mm: Vibrant green (#22c55e)
 * - 7.5 - 15 mm: Yellow-green (#a3e635)
 * - 15 - 30 mm: Amber-yellow (#facc15)
 * - 30 - 50 mm: Orange (#f97316)
 * - 50 - 100 mm: Crimson red (#ef4444)
 * - 100+ mm: Magenta / Deep violet (#a855f7 / #7e22ce)
 */
export function getPrecipitationColor(val: number | null | undefined): string {
  if (val === null || val === undefined || val < 0.1) return 'transparent';
  if (val < 2.5) return 'rgba(56, 189, 248, 0.88)';
  if (val < 7.5) return 'rgba(34, 197, 94, 0.90)';
  if (val < 15.0) return 'rgba(163, 230, 53, 0.92)';
  if (val < 30.0) return 'rgba(250, 204, 21, 0.94)';
  if (val < 50.0) return 'rgba(249, 115, 22, 0.95)';
  if (val < 100.0) return 'rgba(239, 68, 68, 0.96)';
  if (val < 200.0) return 'rgba(217, 70, 239, 0.98)';
  return 'rgba(126, 34, 206, 1.0)';
}

export function getCategoryBadgeStyle(category: string): { bg: string; text: string; border: string } {
  const cat = category.toLowerCase();
  if (cat.includes('extremely') || cat.includes('violent')) {
    return { bg: '#fdf4ff', text: '#7e22ce', border: '#f0abfc' };
  }
  if (cat.includes('very heavy')) {
    return { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' };
  }
  if (cat.includes('heavy')) {
    return { bg: '#fff7ed', text: '#c2410c', border: '#fdba74' };
  }
  if (cat.includes('moderate')) {
    return { bg: '#fefce8', text: '#854d0e', border: '#fde047' };
  }
  if (cat.includes('light')) {
    return { bg: '#f0fdf4', text: '#15803d', border: '#86efac' };
  }
  return { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
}

export const Legend: React.FC = () => {
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
};
