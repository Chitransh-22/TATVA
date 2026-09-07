import React from 'react';
import type { WeatherMetadata } from '../types';

interface NavbarProps {
  metadata: WeatherMetadata | null;
  selectedTime: string | null;
  onTimeChange: (time: string) => void;
  onFitIndia: () => void;
  onReset: () => void;
  opacity: number;
  onOpacityChange: (val: number) => void;
  basemap: 'carto' | 'esri' | 'osm';
  onBasemapChange: (bm: 'carto' | 'esri' | 'osm') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  metadata,
  selectedTime,
  onTimeChange,
  onFitIndia,
  onReset,
  opacity,
  onOpacityChange,
  basemap,
  onBasemapChange,
}) => {
  return (
    <header className="navbar-container">
      <div className="navbar-brand">
        <div className="brand-logo">🇮🇳</div>
        <div className="brand-text">
          <h1 className="brand-title">RITU / TATVA</h1>
          <p className="brand-subtitle">National Weather Big Data Analytics &bull; NASA IMERG Live</p>
        </div>
      </div>

      <div className="navbar-center">
        <div className="live-status-badge">
          <span className="pulsing-dot"></span>
          <span className="live-text">LIVE</span>
          <span className="divider">•</span>
          <span className="timestamp-text">
            Last updated: {metadata?.latest_observation_ist || 'Synchronizing with PostGIS...'}
          </span>
        </div>

        {metadata?.available_timestamps && metadata.available_timestamps.length > 1 && (
          <div className="timestamp-picker">
            <label htmlFor="time-select" className="time-label">Time Step:</label>
            <select
              id="time-select"
              className="time-dropdown"
              value={selectedTime || (metadata.latest_observation_time || '')}
              onChange={(e) => onTimeChange(e.target.value)}
            >
              {metadata.available_timestamps.map((t) => (
                <option key={t.observation_time} value={t.observation_time}>
                  {t.observation_ist} ({t.point_count.toLocaleString()} pts)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="navbar-actions">
        <div className="control-group">
          <label className="control-label">Basemap:</label>
          <select
            className="time-dropdown"
            value={basemap}
            onChange={(e) => onBasemapChange(e.target.value as any)}
            title="Switch Cartographic Basemap"
          >
            <option value="carto">Carto Light</option>
            <option value="esri">Esri Canvas</option>
            <option value="osm">OpenStreetMap</option>
          </select>
        </div>

        <div className="control-group">
          <label className="control-label">Opacity: {Math.round(opacity * 100)}%</label>
          <input
            type="range"
            min="20"
            max="100"
            value={Math.round(opacity * 100)}
            onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
            className="opacity-slider"
          />
        </div>

        <button type="button" className="btn btn-primary" onClick={onFitIndia}>
          Fit India
        </button>

        <button type="button" className="btn btn-secondary" onClick={onReset}>
          Reset
        </button>
      </div>
    </header>
  );
};
