import { useState, useRef, useCallback } from 'react';
import {
  Calendar,
  CloudRain,
  TrendingUp,
  Database,
  AlertTriangle,
  ArrowRight,
  Info,
  Layers,
  Sliders,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { INDIA_STATES_DATA } from '../data/weatherData';
import { WeatherMap } from './WeatherMap';
import { Breadcrumbs } from './Breadcrumbs';
import { LoadingOverlay } from './LoadingOverlay';
import { MosdacProductSelector } from './MosdacProductSelector';
import { AllStatesModal } from './AllStatesModal';
import { getProductDefinition, DEFAULT_PRODUCT_ID } from '../data/mosdacProducts';

export function IndiaMapSection({
  mapLevel = 'india',
  metrics,
  selectedState,
  selectedDistrict,
  onSelectState,
  onSelectDistrict,
  onFitIndia,
  onBackToState,
  overviewData,
  stateData,
  districtData,
  isLoading,
  loadingMsg,
  opacity,
  onOpacityChange,
  selectedTime,
  onTimeChange,
  metadata,
  wsStatus = 'connected',
  wsTelemetry,
  liveSummary,
  activeSource = 'MOSDAC',
  activeProductId = DEFAULT_PRODUCT_ID,
  onSelectProduct,
  productData = null,
  productStatusMap = {},
}) {
  const [showAllStatesModal, setShowAllStatesModal] = useState(false);
  const [showMapControls, setShowMapControls] = useState(false);

  // Debounced Controls drawer toggle to prevent rapid double-click animation glitches
  const lastControlsToggleRef = useRef(0);
  const handleToggleControls = useCallback(() => {
    const now = Date.now();
    if (now - lastControlsToggleRef.current < 200) return;
    lastControlsToggleRef.current = now;
    setShowMapControls((prev) => !prev);
  }, []);

  const productConfig = getProductDefinition(activeProductId);
  const summary = productData?.summary || {};

  // Compute active observation timestamp prioritizing productData
  const activeObservationIst = summary.observation_time_ist
    ? summary.observation_time_ist
    : wsTelemetry?.lastUpdateIst
    ? `${wsTelemetry.lastUpdateIst}`
    : overviewData?.observation_ist
    ? overviewData.observation_ist
    : metadata?.latest_observation_ist
    ? metadata.latest_observation_ist
    : 'Live Observation Active';

  // Compute dynamic metrics for the 4 tiles based on active product
  const isRainfall = activeProductId === '3SIMG_L2B_HEM' || activeProductId === '3SIMG_L2G_IMR';

  // Tile 1: Primary Metric
  const tile1Label = isRainfall
    ? 'Average Rainfall'
    : productConfig.metricLabels?.primary || 'Mean Value';
  const tile1Unit = isRainfall
    ? 'mm/hr'
    : productConfig.metricLabels?.primaryUnit || productConfig.unit;
  const tile1Value = isRainfall
    ? (selectedDistrict && districtData?.district_summary?.avg_precipitation != null
        ? Number(districtData.district_summary.avg_precipitation).toFixed(2)
        : selectedState && stateData?.state_summary?.avg_precipitation != null
        ? Number(stateData.state_summary.avg_precipitation).toFixed(2)
        : liveSummary?.avg_precipitation != null
        ? Number(liveSummary.avg_precipitation).toFixed(2)
        : summary.mean_value != null
        ? Number(summary.mean_value).toFixed(2)
        : Number(metrics?.averageRainfall ?? 0).toFixed(2))
    : summary.mean_value != null
    ? Number(summary.mean_value).toFixed(2)
    : '—';

  // Tile 2: Secondary / Peak Metric
  const tile2Label = isRainfall
    ? 'Peak Intensity'
    : productConfig.metricLabels?.secondary || 'Max Value';
  const tile2Unit = isRainfall
    ? 'mm/hr'
    : productConfig.metricLabels?.secondaryUnit || productConfig.unit;
  const tile2Value = isRainfall
    ? (selectedDistrict && districtData?.district_summary?.max_precipitation != null
        ? Number(districtData.district_summary.max_precipitation).toFixed(1)
        : selectedState && stateData?.state_summary?.max_precipitation != null
        ? Number(stateData.state_summary.max_precipitation).toFixed(1)
        : liveSummary?.max_precipitation != null
        ? Number(liveSummary.max_precipitation).toFixed(1)
        : summary.max_value != null
        ? Number(summary.max_value).toFixed(1)
        : Number(metrics?.peakIntensity ?? 0).toFixed(1))
    : summary.max_value != null
    ? Number(summary.max_value).toFixed(1)
    : '—';

  // Tile 3: Total Observed Points
  const tile3Label = isRainfall
    ? 'Total Observations'
    : productConfig.metricLabels?.total || 'Total Cells';
  const tile3Value = summary.total_points != null
    ? Number(summary.total_points).toLocaleString()
    : productData?.points?.length
    ? Number(productData.points.length).toLocaleString()
    : liveSummary?.total_points != null
    ? Number(liveSummary.total_points).toLocaleString()
    : overviewData?.national_summary?.total_points != null
    ? Number(overviewData.national_summary.total_points).toLocaleString()
    : Number(metrics?.totalObservations ?? 0).toLocaleString();

  // Tile 4: Status / Min / Granule Metric
  const tile4Label = isRainfall
    ? 'Weather State'
    : 'Min Value';
  const tile4Value = isRainfall
    ? (liveSummary?.rain_category || overviewData?.national_summary?.rain_category || metrics?.dominantCategory || 'Clear / Dry')
    : summary.min_value != null
    ? `${Number(summary.min_value).toFixed(1)} ${productConfig.unit}`
    : '—';

  // Top regions list
  const topStatesList = overviewData?.state_summaries && overviewData.state_summaries.length > 0
    ? [...overviewData.state_summaries]
        .sort((a, b) => Number(b?.max_precipitation ?? 0) - Number(a?.max_precipitation ?? 0))
        .slice(0, 5)
        .map((s, idx) => ({
          rank: idx + 1,
          id: s?.state_name || `state-${idx}`,
          name: s?.state_name || 'Unknown',
          rainfall: Number(s?.max_precipitation ?? 0),
          category: s?.rain_category || 'Clear / Dry',
        }))
    : [...INDIA_STATES_DATA]
        .sort((a, b) => Number(b?.rainfall ?? 0) - Number(a?.rainfall ?? 0))
        .slice(0, 5)
        .map((s, idx) => ({
          rank: idx + 1,
          id: s.name,
          name: s.name,
          rainfall: Number(s.rainfall ?? 0),
          category: s.category || 'Clear / Dry',
        }));

  // Top districts list when a state is selected
  const districtsList = stateData?.district_summaries && stateData.district_summaries.length > 0
    ? [...stateData.district_summaries]
        .sort((a, b) => Number(b?.max_precipitation ?? b?.avg_precipitation ?? 0) - Number(a?.max_precipitation ?? a?.avg_precipitation ?? 0))
        .map((d, idx) => ({
          rank: idx + 1,
          id: d?.district_name || `dist-${idx}`,
          name: d?.district_name || 'Unknown',
          rainfall: Number(d?.max_precipitation ?? d?.avg_precipitation ?? 0),
          category: d?.rain_category || 'Moderate Rain',
        }))
    : [];

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* REAL TATVA MAP CONTAINER (Left 7-8 cols on lg) */}
      <div className="lg:col-span-7 xl:col-span-8 bg-[#e8f1fb] rounded-2xl p-3 sm:p-4 border border-[#cbe0f5] relative overflow-hidden shadow-sm flex flex-col justify-between select-none">
        {/* Map Top Toolbar: Breadcrumbs + In-Map Product Selector + Controls Dropdown Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 z-20">
          {/* Breadcrumb Navigation Trail & In-Map Product Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <Breadcrumbs
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
              onSelectIndia={onFitIndia}
              onSelectState={onSelectState}
            />

            {/* In-Map Compact Product Selector */}
            <MosdacProductSelector
              activeProductId={activeProductId}
              onSelectProduct={onSelectProduct}
              productStatusMap={productStatusMap}
              compact={true}
            />
          </div>

          {/* Quick Controls Bar: Basemap, Opacity, Timestamp */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="map-controls-toggle-btn"
              onClick={handleToggleControls}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                showMapControls
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Controls</span>
            </button>
          </div>
        </div>

        {/* Map Controls Drawer */}
        {showMapControls && (
          <div className="mb-3 p-3 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 z-20 animate-in fade-in duration-150">
            {/* Layer Opacity Slider */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">
                Layer Opacity:
              </span>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={opacity}
                onInput={(e) => onOpacityChange(parseFloat(e.target.value))}
                onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                className="w-24 accent-blue-600 cursor-pointer"
              />
              <span className="text-xs font-mono font-bold text-slate-800">
                {Math.round(opacity * 100)}%
              </span>
            </div>

            {/* Active Granule Info */}
            <div className="text-[11px] text-slate-500 font-medium">
              Granule: <b className="text-slate-700">{summary.granule_id || 'Latest Satellite Pass'}</b>
            </div>

            {/* Historical Timestamp Selector if available */}
            {metadata?.available_timestamps?.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedTime || ''}
                  onChange={(e) => onTimeChange(e.target.value || null)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Live Latest Observation</option>
                  {metadata.available_timestamps.map((t) => (
                    <option key={t.observation_time} value={t.observation_time}>
                      {t.observation_ist}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* REAL LEAFLET WEATHER MAP VIEWPORT */}
        <div className="relative w-full h-[520px] sm:h-[560px] rounded-xl overflow-hidden border border-slate-200/90 shadow-inner bg-[#cbd5e1]">
          {/* Loading Overlay */}
          <LoadingOverlay isLoading={isLoading} message={loadingMsg} />

          {/* Canonical Leaflet Weather / MOSDAC Map Component */}
          <WeatherMap
            mapLevel={mapLevel}
            overviewData={overviewData}
            stateData={stateData}
            districtData={districtData}
            selectedState={selectedState}
            selectedDistrict={selectedDistrict}
            onSelectState={onSelectState}
            onSelectDistrict={onSelectDistrict}
            onFitIndia={onFitIndia}
            opacity={opacity}
            activeSource={activeSource}
            activeProductId={activeProductId}
            productData={productData}
          />
        </div>

        {/* Bottom Bar: Telemetry Info + Timestamp pill */}
        <div className="relative z-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span
              className={`w-2 h-2 rounded-full ${
                wsStatus === 'connected'
                  ? 'bg-emerald-500 animate-pulse'
                  : wsStatus === 'reconnecting' || wsStatus === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span className="font-medium">
              {wsStatus === 'connected'
                ? `⚡ Live WebSocket: Connected (${(wsTelemetry?.totalPointsUpdated || summary.total_points || 0).toLocaleString()} pts synced)`
                : wsStatus === 'reconnecting'
                ? '⚡ Live WebSocket: Reconnecting...'
                : wsStatus === 'disconnected'
                ? '⚡ Live WebSocket: Disconnected'
                : '⚡ Live WebSocket: Connecting...'}
            </span>
          </div>

          {/* Time indicator pill (Bottom-Right) */}
          <div className="flex items-center gap-2 bg-white/90 backdrop-blur rounded-xl p-1.5 px-3 border border-slate-200/80 shadow-xs text-xs text-slate-700">
            <span className="px-2 py-0.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold">
              Observation Time
            </span>
            <span className="font-semibold text-slate-800 text-[11px]">
              {activeObservationIst}
            </span>
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </div>

      {/* OVERVIEW STATS & TELEMETRY (Right 4-5 cols on lg) */}
      <div className="lg:col-span-5 xl:col-span-4 bg-[#f8fbff] rounded-2xl p-5 border border-slate-200/90 shadow-sm flex flex-col justify-between min-h-[580px]">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-600 text-lg">
                <span>{productConfig.icon}</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  {selectedDistrict
                    ? `${selectedDistrict}`
                    : selectedState
                    ? `${selectedState}`
                    : productConfig.shortName}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedDistrict
                    ? `District Telemetry • ${selectedState}`
                    : selectedState
                    ? 'State Meteorological Telemetry'
                    : productConfig.meta}
                </p>
              </div>
            </div>

            {/* Back Button if drilled down */}
            {selectedState && (
              <button
                type="button"
                onClick={selectedDistrict ? onBackToState : onFitIndia}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors cursor-pointer"
                title={selectedDistrict ? `Back to ${selectedState}` : 'Reset to India'}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{selectedDistrict ? 'State' : 'India'}</span>
              </button>
            )}
          </div>

          {/* 4 Dynamic Metrics Tiles Grid */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {/* Tile 1: Primary Metric */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-blue-200 transition-colors">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <CloudRain className="w-4 h-4 text-blue-500" />
                <span className="text-[11px] font-medium truncate">{tile1Label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl font-extrabold text-slate-900">
                  {tile1Value}
                </span>
                <span className="text-xs font-semibold text-slate-400">{tile1Unit}</span>
              </div>
            </div>

            {/* Tile 2: Peak / Max Metric */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-blue-200 transition-colors">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <TrendingUp className="w-4 h-4 text-purple-600" />
                <span className="text-[11px] font-medium truncate">{tile2Label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl font-extrabold text-slate-900">
                  {tile2Value}
                </span>
                <span className="text-xs font-semibold text-slate-400">{tile2Unit}</span>
              </div>
            </div>

            {/* Tile 3: Total Observations */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-blue-200 transition-colors">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Database className="w-4 h-4 text-emerald-600" />
                <span className="text-[11px] font-medium truncate">{tile3Label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl font-extrabold text-slate-900">
                  {tile3Value}
                </span>
                <span className="text-xs font-semibold text-slate-400">cells</span>
              </div>
            </div>

            {/* Tile 4: Min / Status */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-blue-200 transition-colors">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Info className="w-4 h-4 text-amber-500" />
                <span className="text-[11px] font-medium truncate">{tile4Label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                  {tile4Value}
                </span>
              </div>
            </div>
          </div>

          {/* Product Satellite Information Badge */}
          <div className="mt-4 p-3 bg-blue-50/60 rounded-xl border border-blue-100/80">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-blue-900">{productConfig.productName}</span>
              <span className="px-1.5 py-0.5 rounded bg-blue-200/60 text-blue-800 text-[10px] font-bold uppercase">
                {productConfig.category}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 leading-relaxed">
              {productConfig.meta}
            </div>
            {summary.granule_id && (
              <div className="mt-2 pt-2 border-t border-blue-100 text-[10.5px] text-slate-500 font-mono">
                Granule: <span className="font-bold text-slate-700">{summary.granule_id}</span>
              </div>
            )}
          </div>

          {/* Regional Table (States or Districts) */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {selectedState ? `${selectedState} Districts` : 'Top Active Regions'}
              </span>
              {!selectedState ? (
                <button
                  type="button"
                  id="view-all-states-btn"
                  onClick={() => setShowAllStatesModal(true)}
                  className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              ) : selectedDistrict ? (
                <button
                  type="button"
                  onClick={onBackToState}
                  className="text-[11px] text-blue-600 font-semibold hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  All Districts
                </button>
              ) : null}
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
              {selectedState ? (
                districtsList.length > 0 ? (
                  districtsList.map((dist) => {
                    const isDistrictSelected =
                      selectedDistrict &&
                      selectedDistrict.toLowerCase() === dist.name.toLowerCase();
                    return (
                      <button
                        key={dist.id}
                        type="button"
                        onClick={() => onSelectDistrict(dist.name)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg border transition-all text-left text-xs cursor-pointer ${
                          isDistrictSelected
                            ? 'bg-blue-600 border-blue-600 text-white shadow-xs font-semibold'
                            : 'bg-white border-slate-100 hover:border-blue-300 hover:bg-blue-50/40 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <span
                            className={`w-4 text-center font-bold text-[11px] shrink-0 ${
                              isDistrictSelected ? 'text-blue-100' : 'text-slate-400'
                            }`}
                          >
                            {dist.rank}
                          </span>
                          <span className="font-semibold truncate">{dist.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`font-bold ${
                              isDistrictSelected ? 'text-white' : 'text-slate-700'
                            }`}
                          >
                            {dist.rainfall.toFixed(1)} mm/h
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              isDistrictSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {dist.category}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400 bg-white rounded-lg border border-slate-100">
                    Loading district observations for {selectedState}...
                  </div>
                )
              ) : (
                topStatesList.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => onSelectState(st.name)}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-white border border-slate-100 hover:border-blue-300 hover:bg-blue-50/40 transition-all text-left text-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-1">
                      <span className="w-4 text-center font-bold text-slate-400 text-[11px] shrink-0">
                        {st.rank}
                      </span>
                      <span className="font-semibold text-slate-800 truncate">{st.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-slate-700">
                        {st.rainfall.toFixed(1)} mm/h
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-slate-100 text-slate-600">
                        {st.category}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Bottom Attribution Notice */}
        <div className="mt-6 pt-3 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
          <span>ISRO SAC MOSDAC Geospatial Platform</span>
          <span className="font-semibold text-blue-600">TATVA 2026</span>
        </div>
      </div>

      {/* All States & Union Territories Modal */}
      <AllStatesModal
        isOpen={showAllStatesModal}
        onClose={() => setShowAllStatesModal(false)}
        onSelectState={onSelectState}
        selectedState={selectedState}
        overviewData={overviewData}
      />
    </div>
  );
}
