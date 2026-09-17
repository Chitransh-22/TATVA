import { MapPin, ChevronRight, Clock, RefreshCw, Globe, ChevronDown } from 'lucide-react';
import { ALL_INDIA_REGIONS } from '../../data/weatherData';

export function LocationSelector({
  selectedState,
  selectedDistrict,
  onSelectState,
  onSelectDistrict,
  onFitIndia,
  availableDistricts = [],
  selectedTime,
  onTimeChange,
  availableTimestamps = [],
  isUpdating = false,
  latestObservationIst = '',
}) {
  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 mb-6 transition-all">
      {/* Top Row: Location Hierarchy & Active Status Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
          <span className="text-slate-400 font-medium">Currently analysing:</span>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50/80 border border-blue-200/60 font-semibold text-blue-900">
            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>National (India)</span>
            {selectedState && (
              <>
                <ChevronRight className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="text-blue-700">{selectedState}</span>
              </>
            )}
            {selectedDistrict && (
              <>
                <ChevronRight className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="text-blue-950 underline decoration-blue-300 font-bold">{selectedDistrict}</span>
              </>
            )}
          </div>

          {(selectedState || selectedDistrict) && (
            <button
              type="button"
              onClick={onFitIndia}
              className="text-[11px] font-semibold text-slate-500 hover:text-blue-600 transition-colors cursor-pointer px-2 py-1 rounded-md hover:bg-slate-100"
              title="Reset scope to All India"
            >
              Reset to National
            </button>
          )}
        </div>

        {/* Right Status Badge */}
        <div className="flex items-center gap-2 shrink-0">
          {isUpdating ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
              <span>Updating analysis...</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Verified Telemetry</span>
              {latestObservationIst && (
                <span className="text-emerald-700 font-mono text-[11px] hidden sm:inline">
                  • {latestObservationIst}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls Row: State | District | Time Range Dropdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
        {/* 1. State Selector */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="analysis-state-select" className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            <span>State / Territory</span>
          </label>
          <div className="relative">
            <select
              id="analysis-state-select"
              value={selectedState || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  onFitIndia();
                } else {
                  onSelectState(val);
                }
              }}
              className="w-full appearance-none pl-3 pr-8 py-2 text-xs sm:text-sm bg-slate-50/80 hover:bg-white text-slate-800 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition-all cursor-pointer"
            >
              <option value="">All India (National Overview)</option>
              {ALL_INDIA_REGIONS.map((st) => (
                <option key={st.name} value={st.name}>
                  {st.name} ({st.code})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* 2. District Selector */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="analysis-district-select" className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>District</span>
          </label>
          <div className="relative">
            <select
              id="analysis-district-select"
              disabled={!selectedState}
              value={selectedDistrict || ''}
              onChange={(e) => {
                const val = e.target.value;
                onSelectDistrict(val || null);
              }}
              className={`w-full appearance-none pl-3 pr-8 py-2 text-xs sm:text-sm rounded-xl border font-medium transition-all ${
                !selectedState
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-slate-50/80 hover:bg-white text-slate-800 border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer'
              }`}
            >
              <option value="">
                {selectedState ? `All Districts in ${selectedState}` : 'Select a state first'}
              </option>
              {availableDistricts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* 3. Observation Timestamp Selector */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="analysis-time-select" className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Observation Time (IST)</span>
          </label>
          <div className="relative">
            <select
              id="analysis-time-select"
              value={selectedTime || ''}
              onChange={(e) => onTimeChange(e.target.value || null)}
              className="w-full appearance-none pl-3 pr-8 py-2 text-xs sm:text-sm bg-slate-50/80 hover:bg-white text-slate-800 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition-all cursor-pointer"
            >
              <option value="">Latest Realtime Telemetry</option>
              {availableTimestamps.map((t) => (
                <option key={t.observation_time} value={t.observation_time}>
                  {t.observation_ist || t.observation_time}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
