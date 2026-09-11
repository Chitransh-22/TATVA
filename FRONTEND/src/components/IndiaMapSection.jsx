import { useState } from 'react';
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

export function IndiaMapSection({
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
}) {
  const [showAllStatesModal, setShowAllStatesModal] = useState(false);
  const [showMapControls, setShowMapControls] = useState(false);

  // Compute live national/state/district metrics prioritizing live WebSocket summary
  const activeAvgRainfall = (liveSummary?.avg_precipitation != null)
    ? Number(liveSummary.avg_precipitation).toFixed(2)
    : (overviewData?.national_summary?.avg_precipitation != null)
    ? Number(overviewData.national_summary.avg_precipitation).toFixed(2)
    : Number(metrics?.averageRainfall ?? 0).toFixed(2);

  const activePeakIntensity = (liveSummary?.max_precipitation != null)
    ? Number(liveSummary.max_precipitation).toFixed(1)
    : (overviewData?.national_summary?.max_precipitation != null)
    ? Number(overviewData.national_summary.max_precipitation).toFixed(1)
    : Number(metrics?.peakIntensity ?? 0).toFixed(1);

  const activeObservations = (liveSummary?.total_points != null)
    ? Number(liveSummary.total_points).toLocaleString()
    : (overviewData?.national_summary?.total_points != null)
    ? Number(overviewData.national_summary.total_points).toLocaleString()
    : Number(metrics?.totalObservations ?? 0).toLocaleString();

  const activeDominantCategory = liveSummary?.rain_category
    || overviewData?.national_summary?.rain_category
    || metrics?.dominantCategory
    || 'Clear / Dry';

  const activeTimestamp = wsTelemetry?.lastUpdateIst
    ? `${wsTelemetry.lastUpdateIst} (Live WS)`
    : overviewData?.observation_ist
    ? overviewData.observation_ist
    : metadata?.latest_observation_ist
    ? metadata.latest_observation_ist
    : metrics?.timestamp || 'Live Active Dataset';

  // Real top states from overviewData, or fallback to mock data
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

  // All states list for modal
  const allStatesList = overviewData?.state_summaries && overviewData.state_summaries.length > 0
    ? [...overviewData.state_summaries]
        .sort((a, b) => Number(b?.max_precipitation ?? 0) - Number(a?.max_precipitation ?? 0))
        .map((s, idx) => ({
          rank: idx + 1,
          name: s?.state_name || 'Unknown',
          rainfall: Number(s?.max_precipitation ?? 0),
          category: s?.rain_category || 'Clear / Dry',
          stationCount: Number(s?.total_points ?? 0),
        }))
    : [...INDIA_STATES_DATA]
        .sort((a, b) => Number(b?.rainfall ?? 0) - Number(a?.rainfall ?? 0))
        .map((s, idx) => ({
          rank: idx + 1,
          name: s.name,
          rainfall: Number(s.rainfall ?? 0),
          category: s.category || 'Clear / Dry',
          stationCount: Number(s.stationCount ?? 0),
        }));

  // Districts list for active state
  const stateDistricts = stateData?.district_summaries
    ? [...stateData.district_summaries]
        .sort((a, b) => b.max_precipitation - a.max_precipitation)
        .slice(0, 5)
    : [];

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* REAL TATVA MAP CONTAINER (Left 7-8 cols on lg) */}
      <div className="lg:col-span-7 xl:col-span-8 bg-[#e8f1fb] rounded-2xl p-3 sm:p-4 border border-[#cbe0f5] relative overflow-hidden shadow-sm flex flex-col justify-between select-none">
        {/* Map Top Toolbar: Breadcrumbs + Controls Dropdown Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 z-20">
          {/* Breadcrumb Navigation Trail */}
          <div className="flex items-center">
            <Breadcrumbs
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
              onSelectIndia={onFitIndia}
              onSelectState={onSelectState}
            />
          </div>

          {/* Quick Controls Bar: Basemap, Opacity, Timestamp */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMapControls(!showMapControls)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                showMapControls
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white/90 hover:bg-white text-slate-700 border-slate-200/90 shadow-xs'
              }`}
              title="Toggle Map Display Controls"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Map Layer Controls</span>
            </button>
          </div>
        </div>

        {/* Collapsible Map Display Controls Panel */}
        {showMapControls && (
          <div className="mb-3 p-3 bg-white/95 backdrop-blur-md rounded-xl border border-blue-100 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs z-20 animate-in fade-in slide-in-from-top-2">
            {/* Basemap Indicator (OpenStreetMap exclusively) */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                Base Map:
              </span>
              <span className="px-2.5 py-0.5 rounded-md font-medium text-[11px] bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                OpenStreetMap (OSM)
              </span>
            </div>

            {/* Opacity Control */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">
                Opacity: {Math.round(opacity * 100)}%
              </span>
              <input
                type="range"
                min="20"
                max="100"
                value={Math.round(opacity * 100)}
                onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
                className="w-24 accent-blue-600 cursor-pointer"
              />
            </div>

            {/* Step / Observation Time Selector */}
            {metadata?.available_timestamps && metadata.available_timestamps.length > 1 && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-semibold text-slate-600">Step:</span>
                <select
                  value={selectedTime || metadata.latest_observation_time || ''}
                  onChange={(e) => onTimeChange(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
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
          {/* Loading Spinner / Progress Overlay */}
          <LoadingOverlay isLoading={isLoading} message={loadingMsg} />

          {/* Actual Leaflet Weather Map Component */}
          <WeatherMap
            overviewData={overviewData}
            stateData={stateData}
            districtData={districtData}
            selectedState={selectedState}
            selectedDistrict={selectedDistrict}
            onSelectState={onSelectState}
            onSelectDistrict={onSelectDistrict}
            onFitIndia={onFitIndia}
            opacity={opacity}
          />
        </div>

        {/* Bottom Bar: Telemetry Info + Timestamp pill */}
        <div className="relative z-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span
              className={`w-2 h-2 rounded-full ${
                wsStatus === 'connected'
                  ? 'bg-emerald-500 animate-pulse'
                  : wsStatus === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span className="font-medium">
              {wsStatus === 'connected'
                ? `⚡ Live WebSocket: Connected (${wsTelemetry?.totalPointsUpdated || 0} pts incrementally synced)`
                : wsStatus === 'connecting'
                ? '⚡ Connecting to live weather WebSocket...'
                : '⚡ WebSocket offline — Reconnecting with backoff...'}
            </span>
          </div>

          {/* Time indicator pill (Bottom-Right) */}
          <div className="flex items-center gap-2 bg-white/90 backdrop-blur rounded-xl p-1.5 px-3 border border-slate-200/80 shadow-xs text-xs text-slate-700">
            <span className="px-2 py-0.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold">
              Observation Time
            </span>
            <span className="font-semibold text-slate-800 text-[11px]">
              {activeTimestamp}
            </span>
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </div>

      {/* OVERVIEW STATS & TOP REGIONS (Right 4-5 cols on lg) */}
      <div className="lg:col-span-5 xl:col-span-4 bg-[#f8fbff] rounded-2xl p-5 border border-slate-200/90 shadow-sm flex flex-col justify-between min-h-[580px]">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-600">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  {selectedDistrict
                    ? `${selectedDistrict}`
                    : selectedState
                    ? `${selectedState}`
                    : 'India Overview'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedDistrict
                    ? `District Telemetry • ${selectedState}`
                    : selectedState
                    ? 'State Meteorological Telemetry'
                    : 'Live Weather Statistics'}
                </p>
              </div>
            </div>

            {/* Back Button if drilled down */}
            {selectedState && (
              <button
                onClick={selectedDistrict ? onBackToState : onFitIndia}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors cursor-pointer"
                title={selectedDistrict ? `Back to ${selectedState}` : 'Reset to India'}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{selectedDistrict ? 'State' : 'India'}</span>
              </button>
            )}
          </div>

          {/* 4 Metrics Tiles Grid */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {/* Tile 1: Average Rainfall */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-blue-200 transition-colors">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <CloudRain className="w-4 h-4 text-blue-500" />
                <span className="text-[11px] font-medium">Average Rainfall</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl font-extrabold text-slate-900">
                  {selectedDistrict && districtData?.district_summary?.avg_precipitation != null
                    ? Number(districtData.district_summary.avg_precipitation).toFixed(2)
                    : selectedState && stateData?.state_summary?.avg_precipitation != null
                    ? Number(stateData.state_summary.avg_precipitation).toFixed(2)
                    : activeAvgRainfall}
                </span>
                <span className="text-xs font-semibold text-slate-400">mm/hr</span>
              </div>
            </div>

            {/* Tile 2: Peak Intensity */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-blue-200 transition-colors">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <TrendingUp className="w-4 h-4 text-purple-600" />
                <span className="text-[11px] font-medium">Peak Intensity</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl font-extrabold text-slate-900">
                  {selectedDistrict && districtData?.district_summary?.max_precipitation != null
                    ? Number(districtData.district_summary.max_precipitation).toFixed(1)
                    : selectedState && stateData?.state_summary?.max_precipitation != null
                    ? Number(stateData.state_summary.max_precipitation).toFixed(1)
                    : activePeakIntensity}
                </span>
                <span className="text-xs font-semibold text-slate-400">mm/hr</span>
              </div>
            </div>

            {/* Tile 3: Total Observations */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-blue-200 transition-colors">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Database className="w-4 h-4 text-emerald-500" />
                <span className="text-[11px] font-medium">Observations</span>
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-slate-900">
                {selectedDistrict && districtData?.district_summary?.total_points != null
                  ? Number(districtData.district_summary.total_points).toLocaleString()
                  : selectedState && stateData?.state_summary?.total_points != null
                  ? Number(stateData.state_summary.total_points).toLocaleString()
                  : activeObservations}
              </div>
            </div>

            {/* Tile 4: Dominant Category */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-red-200 transition-colors">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-[11px] font-medium">Rain Category</span>
              </div>
              <div className="text-xs font-bold text-red-600 leading-tight">
                {selectedDistrict && districtData?.district_summary?.rain_category
                  ? districtData.district_summary.rain_category
                  : selectedState && stateData?.state_summary?.rain_category
                  ? stateData.state_summary.rain_category
                  : activeDominantCategory}
              </div>
            </div>
          </div>

          {/* Drill-down Section: District list if state selected, or Top Rainfall States if India selected */}
          {selectedState && stateDistricts.length > 0 ? (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Districts in {selectedState}
                </h4>
                <span className="text-[11px] text-slate-500">
                  Click district to inspect points
                </span>
              </div>

              <div className="space-y-2">
                {stateDistricts.map((dist, idx) => {
                  const isSelected = selectedDistrict === dist.district_name;
                  return (
                    <div
                      key={dist.district_name}
                      onClick={() => onSelectDistrict(dist.district_name)}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-blue-50 border border-blue-300 shadow-xs'
                          : 'bg-white hover:bg-slate-50 border border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="text-xs sm:text-sm font-semibold text-slate-800">
                            {dist.district_name}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-2 font-medium">
                            {dist.rain_category}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs sm:text-sm font-bold text-blue-600">
                          {Number(dist?.max_precipitation ?? 0).toFixed(1)}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium ml-1">
                          mm/hr
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* National Top Rainfall States */
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Top Rainfall States
                </h4>
                <button
                  onClick={() => setShowAllStatesModal(true)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 group cursor-pointer"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>

              {/* List of top 5 states */}
              <div className="space-y-2">
                {topStatesList.map((state) => {
                  const isSelected = selectedState === state.name;
                  return (
                    <div
                      key={state.id}
                      onClick={() => onSelectState(state.name)}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-blue-50 border border-blue-200 shadow-sm'
                          : 'bg-white hover:bg-slate-50 border border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                          {state.rank}
                        </span>
                        <div>
                          <span className="text-xs sm:text-sm font-semibold text-slate-800">
                            {state.name}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-2 font-medium">
                            {state.category}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs sm:text-sm font-bold text-blue-600">
                          {Number(state?.rainfall ?? 0).toFixed(1)}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium ml-1">
                          mm/hr
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Informational banner at bottom */}
        <div className="mt-6 pt-3 border-t border-slate-200/80 flex items-center gap-2 text-[11px] text-slate-500">
          <Info className="w-4 h-4 text-blue-500 shrink-0" />
          <span>Real-time telemetry updated every 5 minutes from IMD & ISRO Doppler sensors.</span>
        </div>
      </div>

      {/* Modal: View All States */}
      {showAllStatesModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 max-h-[85vh] flex flex-col shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  All Indian States Precipitation
                </h3>
                <p className="text-xs text-slate-500">
                  Sorted by current precipitation rate (mm/hr)
                </p>
              </div>
              <button
                onClick={() => setShowAllStatesModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 pr-1 flex-1">
              {allStatesList.map((state) => (
                <div
                  key={state.name}
                  onClick={() => {
                    onSelectState(state.name);
                    setShowAllStatesModal(false);
                  }}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-blue-50 border border-slate-100 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-800 text-xs font-bold flex items-center justify-center">
                      {state.rank}
                    </span>
                    <div>
                      <span className="text-sm font-semibold text-slate-800">
                        {state.name}
                      </span>
                      <span className="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {state.category}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-blue-600">
                      {Number(state?.rainfall ?? 0).toFixed(1)} mm/hr
                    </span>
                    {state?.stationCount != null && (
                      <div className="text-[11px] text-slate-400">
                        {Number(state.stationCount).toLocaleString()} observations
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
