import { useState, useMemo } from 'react';
import { getCategoryBadgeStyle } from './Legend';

export function AnalyticsSidebar({
  selectedState,
  selectedDistrict,
  nationalSummary,
  stateSummaries = [],
  stateSummary,
  districtSummaries = [],
  districtSummary,
  anomalies,
  historicalTimeline = [],
  onSelectState,
  onSelectDistrict,
  onBackToState,
  onBackToIndia,
  isCollapsed,
  onToggleCollapse,
}) {
  const [districtSearch, setDistrictSearch] = useState('');

  // Top states sorted by peak rainfall
  const topStates = useMemo(() => {
    return [...stateSummaries]
      .sort((a, b) => b.max_precipitation - a.max_precipitation)
      .slice(0, 6);
  }, [stateSummaries]);

  // Filtered districts for active state
  const filteredDistricts = useMemo(() => {
    const list = [...districtSummaries].sort((a, b) => b.max_precipitation - a.max_precipitation);
    if (!districtSearch.trim()) return list;
    const query = districtSearch.toLowerCase();
    return list.filter((d) => d.district_name.toLowerCase().includes(query));
  }, [districtSummaries, districtSearch]);

  // Max value for historical bar scaling
  const maxHistP = useMemo(() => {
    return Math.max(1, ...historicalTimeline.map((h) => h.avg_precipitation));
  }, [historicalTimeline]);

  if (isCollapsed) return null;

  // Active Summary computation
  const activeSummary = selectedDistrict
    ? districtSummary
    : selectedState
    ? stateSummary
    : nationalSummary;

  const badgeStyle = activeSummary?.rain_category
    ? getCategoryBadgeStyle(activeSummary.rain_category)
    : { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1' };

  return (
    <aside className="analytics-sidebar" aria-label="Weather Intelligence Sidebar">
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <div className="sidebar-heading-wrap">
            <span className="sidebar-level-badge">
              {!selectedState && 'NATIONAL'}
              {selectedState && !selectedDistrict && 'STATE'}
              {selectedDistrict && 'DISTRICT'}
            </span>
            <h2 className="sidebar-title" title={selectedDistrict || selectedState || 'National Overview'}>
              {!selectedState && 'India Overview'}
              {selectedState && !selectedDistrict && selectedState}
              {selectedDistrict && `${selectedDistrict}`}
            </h2>
          </div>

          <button
            type="button"
            className="btn-close-sidebar"
            onClick={onToggleCollapse}
            title="Collapse Sidebar"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* Back Navigation Button */}
        {(selectedState || selectedDistrict) && (
          <div className="sidebar-nav-actions">
            {selectedDistrict ? (
              <button type="button" className="btn-sidebar-back" onClick={onBackToState}>
                <svg className="back-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                <span>Back to {selectedState}</span>
              </button>
            ) : (
              <button type="button" className="btn-sidebar-back" onClick={onBackToIndia}>
                <svg className="back-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                <span>Back to India</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-body">
        {/* 1. 4 Primary KPI Summary Cards */}
        {activeSummary && (
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Average Rate</span>
              <div className="kpi-value-row">
                <span className="kpi-value">{activeSummary.avg_precipitation.toFixed(2)}</span>
                <span className="kpi-unit">mm/hr</span>
              </div>
            </div>

            <div className="kpi-card highlight">
              <span className="kpi-label">Peak Intensity</span>
              <div className="kpi-value-row">
                <span className="kpi-value peak">{activeSummary.max_precipitation.toFixed(1)}</span>
                <span className="kpi-unit">mm/hr</span>
              </div>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Observations</span>
              <div className="kpi-value-row">
                <span className="kpi-value">{activeSummary.total_points.toLocaleString()}</span>
                <span className="kpi-unit">pts</span>
              </div>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Rain Category</span>
              <div className="kpi-badge-wrap">
                <span
                  className="kpi-category-badge"
                  style={{
                    backgroundColor: badgeStyle.bg,
                    color: badgeStyle.text,
                    borderColor: badgeStyle.border,
                  }}
                >
                  {activeSummary.rain_category}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 2. Top Rainfall Regions List */}
        {!selectedState && (
          <div className="sidebar-section">
            <div className="section-head">
              <h3 className="section-title">Top Rainfall States</h3>
              <span className="section-meta">Sorted by Peak</span>
            </div>
            <div className="region-list">
              {topStates.map((st, idx) => {
                const stBadge = getCategoryBadgeStyle(st.rain_category);
                return (
                  <button
                    key={st.state_name}
                    type="button"
                    className="region-item-row"
                    onClick={() => onSelectState(st.state_name)}
                    title={`Click to inspect ${st.state_name}`}
                  >
                    <span className="rank-badge">{idx + 1}</span>
                    <div className="region-details">
                      <span className="region-name">{st.state_name}</span>
                      <span className="region-sub">Avg: {st.avg_precipitation.toFixed(1)} mm</span>
                    </div>
                    <div className="region-metrics">
                      <span className="region-peak">{st.max_precipitation.toFixed(1)} mm</span>
                      <span
                        className="region-tag"
                        style={{
                          backgroundColor: stBadge.bg,
                          color: stBadge.text,
                          borderColor: stBadge.border,
                        }}
                      >
                        {st.rain_category}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* State Districts List */}
        {selectedState && !selectedDistrict && (
          <div className="sidebar-section">
            <div className="section-head">
              <h3 className="section-title">Districts ({districtSummaries.length})</h3>
              <span className="section-meta">Click to zoom</span>
            </div>

            {districtSummaries.length > 8 && (
              <div className="search-input-wrap">
                <input
                  type="text"
                  placeholder="Filter district..."
                  value={districtSearch}
                  onChange={(e) => setDistrictSearch(e.target.value)}
                  className="district-search-input"
                />
                {districtSearch && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setDistrictSearch('')}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            <div className="region-list scrollable-districts">
              {filteredDistricts.length === 0 ? (
                <div className="empty-state">No matching districts</div>
              ) : (
                filteredDistricts.map((dist, idx) => {
                  const distBadge = getCategoryBadgeStyle(dist.rain_category);
                  return (
                    <button
                      key={dist.district_name}
                      type="button"
                      className="region-item-row"
                      onClick={() => onSelectDistrict(dist.district_name)}
                      title={`Inspect ${dist.district_name}`}
                    >
                      <span className="rank-badge secondary">{idx + 1}</span>
                      <div className="region-details">
                        <span className="region-name">{dist.district_name}</span>
                        <span className="region-sub">{dist.total_points} grid points</span>
                      </div>
                      <div className="region-metrics">
                        <span className="region-peak">{dist.max_precipitation.toFixed(1)} mm</span>
                        <span
                          className="region-tag"
                          style={{
                            backgroundColor: distBadge.bg,
                            color: distBadge.text,
                            borderColor: distBadge.border,
                          }}
                        >
                          {dist.rain_category}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* 3. Anomalies Section */}
        {anomalies && anomalies.length > 0 && (
          <div className="sidebar-section anomaly-section">
            <div className="anomaly-header">
              <span className="anomaly-icon">⚠️</span>
              <span className="anomaly-title">Severe Weather Anomalies ({anomalies.length})</span>
            </div>
            <div className="anomaly-list">
              {anomalies.map((anom, i) => (
                <div key={i} className="anomaly-card">
                  <div className="anomaly-card-top">
                    <span className="anomaly-type">{anom.type}</span>
                    <span className="anomaly-val">{anom.precipitation.toFixed(1)} mm/hr</span>
                  </div>
                  <p className="anomaly-desc">{anom.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Time-Series Trend Mini-Chart */}
        {historicalTimeline && historicalTimeline.length > 0 && (
          <div className="sidebar-section">
            <div className="section-head">
              <h3 className="section-title">Precipitation Trend</h3>
              <span className="section-meta">Last 12 granules (IST)</span>
            </div>
            <div className="timeline-chart">
              {historicalTimeline.map((pt) => {
                const heightPct = Math.min(100, Math.max(10, (pt.avg_precipitation / maxHistP) * 100));
                const timeLabel = pt.observation_ist.split(' ')[1] || '';
                return (
                  <div
                    key={pt.observation_time}
                    className="chart-col"
                    title={`${pt.observation_ist}\nAvg: ${pt.avg_precipitation.toFixed(2)} mm\nPeak: ${pt.max_precipitation.toFixed(1)} mm`}
                  >
                    <div className="col-bar-container">
                      <div
                        className="col-bar"
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="col-label">{timeLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
