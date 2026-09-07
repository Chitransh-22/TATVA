import React from 'react';
import type {
  NationalSummary,
  StateSummary,
  DistrictSummary,
  HistoricalTimelinePoint,
} from '../types';

interface AnalyticsSidebarProps {
  selectedState: string | null;
  selectedDistrict: string | null;
  nationalSummary: NationalSummary | null;
  stateSummaries: StateSummary[];
  stateSummary: {
    avg_precipitation: number;
    max_precipitation: number;
    min_precipitation: number;
    total_points: number;
    rain_category: string;
  } | null;
  districtSummaries: DistrictSummary[];
  districtSummary: {
    avg_precipitation: number;
    max_precipitation: number;
    min_precipitation: number;
    total_points: number;
    rain_category: string;
  } | null;
  anomalies?: Array<{
    time: string;
    latitude: number;
    longitude: number;
    precipitation: number;
    type: string;
    description: string;
  }>;
  historicalTimeline: HistoricalTimelinePoint[];
  onSelectState: (stateName: string) => void;
  onSelectDistrict: (districtName: string) => void;
  onBackToState: () => void;
  onBackToIndia: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const AnalyticsSidebar: React.FC<AnalyticsSidebarProps> = ({
  selectedState,
  selectedDistrict,
  nationalSummary,
  stateSummaries,
  stateSummary,
  districtSummaries,
  districtSummary,
  anomalies,
  historicalTimeline,
  onSelectState,
  onSelectDistrict,
  onBackToState,
  onBackToIndia,
  isCollapsed,
  onToggleCollapse,
}) => {
  if (isCollapsed) {
    return (
      <button
        type="button"
        className="sidebar-expand-btn"
        onClick={onToggleCollapse}
        title="Open Analytics Panel"
      >
        📊 Analytics &bull; Open
      </button>
    );
  }

  // Top 5 states by rainfall
  const topStates = [...stateSummaries]
    .sort((a, b) => b.max_precipitation - a.max_precipitation)
    .slice(0, 6);

  // Maximum value for historical bar scaling
  const maxHistP = Math.max(1, ...historicalTimeline.map((h) => h.avg_precipitation));

  return (
    <aside className="analytics-sidebar">
      <div className="sidebar-header">
        <div className="header-title-row">
          <span className="sidebar-icon">📊</span>
          <h2 className="sidebar-title">
            {!selectedState && "India Weather Overview"}
            {selectedState && !selectedDistrict && `${selectedState}`}
            {selectedDistrict && `${selectedDistrict}, ${selectedState}`}
          </h2>
          <button
            type="button"
            className="btn-close-sidebar"
            onClick={onToggleCollapse}
            title="Minimize"
          >
            ✕
          </button>
        </div>

        <div className="header-nav-row">
          {selectedDistrict && (
            <button type="button" className="btn-back" onClick={onBackToState}>
              &larr; Back to {selectedState}
            </button>
          )}
          {selectedState && !selectedDistrict && (
            <button type="button" className="btn-back" onClick={onBackToIndia}>
              &larr; Back to India Overview
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-content">
        {/* LEVEL 1: NATIONAL OVERVIEW */}
        {!selectedState && nationalSummary && (
          <>
            <div className="stat-cards-grid">
              <div className="stat-card">
                <span className="stat-label">National Average</span>
                <span className="stat-value">{nationalSummary.avg_precipitation.toFixed(2)} mm</span>
              </div>
              <div className="stat-card highlight">
                <span className="stat-label">Peak Intensity</span>
                <span className="stat-value">{nationalSummary.max_precipitation.toFixed(1)} mm</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Observed Grids</span>
                <span className="stat-value">{nationalSummary.total_points.toLocaleString()}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Overall Category</span>
                <span className="stat-badge">{nationalSummary.rain_category}</span>
              </div>
            </div>

            <div className="section-block">
              <h3 className="section-title">🏆 Top Rainfall States</h3>
              <div className="item-list">
                {topStates.map((s) => (
                  <button
                    key={s.state_name}
                    type="button"
                    className="list-item-btn"
                    onClick={() => onSelectState(s.state_name)}
                  >
                    <div className="item-main">
                      <span className="item-name">{s.state_name}</span>
                      <span className="item-sub">Avg {s.avg_precipitation.toFixed(1)} mm</span>
                    </div>
                    <div className="item-metric">
                      <span className="metric-val">{s.max_precipitation.toFixed(1)} mm</span>
                      <span className="metric-cat">{s.rain_category}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* LEVEL 2: STATE VIEW */}
        {selectedState && !selectedDistrict && stateSummary && (
          <>
            <div className="stat-cards-grid">
              <div className="stat-card">
                <span className="stat-label">State Average</span>
                <span className="stat-value">{stateSummary.avg_precipitation.toFixed(2)} mm</span>
              </div>
              <div className="stat-card highlight">
                <span className="stat-label">State Peak</span>
                <span className="stat-value">{stateSummary.max_precipitation.toFixed(1)} mm</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Districts Loaded</span>
                <span className="stat-value">{districtSummaries.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Weather Status</span>
                <span className="stat-badge">{stateSummary.rain_category}</span>
              </div>
            </div>

            <div className="section-block">
              <h3 className="section-title">📍 Districts in {selectedState}</h3>
              <p className="section-subtitle">Click a district to zoom and view weather points</p>
              <div className="item-list scrollable">
                {districtSummaries.map((d) => (
                  <button
                    key={d.district_name}
                    type="button"
                    className="list-item-btn"
                    onClick={() => onSelectDistrict(d.district_name)}
                  >
                    <div className="item-main">
                      <span className="item-name">{d.district_name}</span>
                      <span className="item-sub">{d.total_points} observation points</span>
                    </div>
                    <div className="item-metric">
                      <span className="metric-val">{d.max_precipitation.toFixed(1)} mm</span>
                      <span className="metric-cat">{d.rain_category}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* LEVEL 3: DISTRICT VIEW */}
        {selectedDistrict && districtSummary && (
          <>
            <div className="stat-cards-grid">
              <div className="stat-card">
                <span className="stat-label">District Average</span>
                <span className="stat-value">{districtSummary.avg_precipitation.toFixed(2)} mm</span>
              </div>
              <div className="stat-card highlight">
                <span className="stat-label">District Peak</span>
                <span className="stat-value">{districtSummary.max_precipitation.toFixed(1)} mm</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Active Points</span>
                <span className="stat-value">{districtSummary.total_points}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Rain Category</span>
                <span className="stat-badge">{districtSummary.rain_category}</span>
              </div>
            </div>

            {anomalies && anomalies.length > 0 && (
              <div className="section-block anomaly-box">
                <h3 className="section-title">⚠️ Detected Weather Anomalies</h3>
                {anomalies.map((anom, i) => (
                  <div key={i} className="anomaly-item">
                    <strong>{anom.type}</strong> ({anom.precipitation} mm/hr)
                    <p>{anom.description}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* HISTORICAL TIMELINE CHART */}
        {historicalTimeline && historicalTimeline.length > 0 && (
          <div className="section-block">
            <h3 className="section-title">📈 Precipitation Time-Series (IST)</h3>
            <div className="history-chart-container">
              {historicalTimeline.map((pt) => {
                const heightPercent = Math.min(100, Math.max(8, (pt.avg_precipitation / maxHistP) * 100));
                return (
                  <div key={pt.observation_time} className="chart-bar-group" title={`${pt.observation_ist}: Avg ${pt.avg_precipitation.toFixed(1)} mm, Peak ${pt.max_precipitation.toFixed(1)} mm`}>
                    <div className="bar-wrapper">
                      <div
                        className="chart-bar"
                        style={{ height: `${heightPercent}%` }}
                      ></div>
                    </div>
                    <span className="chart-bar-label">
                      {pt.observation_ist.split(' ')[1] || ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
