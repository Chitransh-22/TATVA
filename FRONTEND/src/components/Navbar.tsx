import React from 'react';
import type { WeatherMetadata } from '../types';

export type BasemapOption = 'carto' | 'dark' | 'osm';

interface NavbarProps {
  metadata: WeatherMetadata | null;
  selectedTime: string | null;
  onTimeChange: (time: string) => void;
  onFitIndia: () => void;
  opacity: number;
  onOpacityChange: (val: number) => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  metadata,
  selectedTime,
  onTimeChange,
  onFitIndia,
  opacity,
  onOpacityChange,
  isSidebarCollapsed,
  onToggleSidebar,
}) => {
  return (
    <header className="navbar-container">
      {/* Brand Section */}
      <div className="navbar-brand">
        <div className="brand-badge">
          <svg className="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-title-wrap">
            <span className="brand-title">RITU</span>
            <span className="brand-org">TATVA</span>
          </div>
          <span className="brand-subtitle">National Weather Intelligence</span>
        </div>
      </div>

      {/* Center Live Status & Timestamp Selector */}
      <div className="navbar-center">
        <div className="live-pill" title="Live streaming from NASA IMERG & Azure PostGIS">
          <span className="live-dot" />
          <span className="live-tag">LIVE</span>
          <span className="live-sep">&bull;</span>
          <span className="live-time">
            {metadata?.latest_observation_ist ? metadata.latest_observation_ist : 'Synchronizing PostGIS...'}
          </span>
        </div>

        {metadata?.available_timestamps && metadata.available_timestamps.length > 1 && (
          <div className="time-select-wrap">
            <label htmlFor="timestamp-select" className="time-select-label">Step:</label>
            <select
              id="timestamp-select"
              className="time-select"
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

      {/* Right Controls */}
      <div className="navbar-actions">
        {/* Basemap Indicator */}
        <div className="segmented-control" role="group" aria-label="Basemap Selection">
          <span className="segment-btn active" style={{ cursor: 'default' }}>
            OpenStreetMap
          </span>
        </div>

        {/* Opacity Control */}
        <div className="opacity-control" title={`Precipitation Layer Opacity: ${Math.round(opacity * 100)}%`}>
          <span className="control-caption">{Math.round(opacity * 100)}%</span>
          <input
            type="range"
            min="20"
            max="100"
            value={Math.round(opacity * 100)}
            onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
            className="compact-slider"
            aria-label="Precipitation Opacity"
          />
        </div>

        {/* Fit India */}
        <button
          type="button"
          className="btn-action"
          onClick={onFitIndia}
          title="Reset View to National Extent"
        >
          <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 100 2h2v2a1 1 0 102 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 110-2h2v-2a1 1 0 112 0v3z" clipRule="evenodd" />
          </svg>
          <span className="btn-label">Fit India</span>
        </button>

        {/* Toggle Sidebar */}
        <button
          type="button"
          className={`btn-action btn-sidebar-toggle ${!isSidebarCollapsed ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title={isSidebarCollapsed ? 'Open Analytics Panel' : 'Collapse Analytics Panel'}
          aria-label="Toggle Analytics Sidebar"
        >
          <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm11 2H5v8h9V6z" clipRule="evenodd" />
          </svg>
          <span className="btn-label">{isSidebarCollapsed ? 'Analytics' : 'Hide'}</span>
        </button>
      </div>
    </header>
  );
};
