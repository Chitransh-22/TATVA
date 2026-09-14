import { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, X, ArrowRight, ShieldAlert, CloudRain } from 'lucide-react';
import { INDIA_STATES_DATA } from '../data/weatherData';

export function AllStatesModal({
  isOpen,
  onClose,
  onSelectState,
  selectedState,
  overviewData,
}) {
  const [search, setSearch] = useState('');

  // Reset search on modal open
  useEffect(() => {
    if (isOpen) setSearch('');
  }, [isOpen]);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Canonical list of all 36 States and Union Territories of India
  const ALL_INDIA_REGIONS = [
    { name: 'Andhra Pradesh', code: 'AP' },
    { name: 'Arunachal Pradesh', code: 'AR' },
    { name: 'Assam', code: 'AS' },
    { name: 'Bihar', code: 'BR' },
    { name: 'Chhattisgarh', code: 'CG' },
    { name: 'Goa', code: 'GA' },
    { name: 'Gujarat', code: 'GJ' },
    { name: 'Haryana', code: 'HR' },
    { name: 'Himachal Pradesh', code: 'HP' },
    { name: 'Jharkhand', code: 'JH' },
    { name: 'Karnataka', code: 'KA' },
    { name: 'Kerala', code: 'KL' },
    { name: 'Madhya Pradesh', code: 'MP' },
    { name: 'Maharashtra', code: 'MH' },
    { name: 'Manipur', code: 'MN' },
    { name: 'Meghalaya', code: 'ML' },
    { name: 'Mizoram', code: 'MZ' },
    { name: 'Nagaland', code: 'NL' },
    { name: 'Odisha', code: 'OD' },
    { name: 'Punjab', code: 'PB' },
    { name: 'Rajasthan', code: 'RJ' },
    { name: 'Sikkim', code: 'SK' },
    { name: 'Tamil Nadu', code: 'TN' },
    { name: 'Telangana', code: 'TS' },
    { name: 'Tripura', code: 'TR' },
    { name: 'Uttar Pradesh', code: 'UP' },
    { name: 'Uttarakhand', code: 'UK' },
    { name: 'West Bengal', code: 'WB' },
    { name: 'Andaman and Nicobar Islands', code: 'AN' },
    { name: 'Chandigarh', code: 'CH' },
    { name: 'Dadra and Nagar Haveli and Daman and Diu', code: 'DD' },
    { name: 'Delhi', code: 'DL' },
    { name: 'Jammu and Kashmir', code: 'JK' },
    { name: 'Ladakh', code: 'LA' },
    { name: 'Lakshadweep', code: 'LD' },
    { name: 'Puducherry', code: 'PY' },
  ];

  // Combine canonical 36 states with static definitions and live API state summaries
  const statesList = useMemo(() => {
    const summaryMap = new Map();
    if (overviewData?.state_summaries && Array.isArray(overviewData.state_summaries)) {
      overviewData.state_summaries.forEach((s) => {
        if (s?.state_name) {
          summaryMap.set(s.state_name.toLowerCase(), s);
        }
      });
    }

    const staticMap = new Map();
    INDIA_STATES_DATA.forEach((s) => staticMap.set(s.name.toLowerCase(), s));

    return ALL_INDIA_REGIONS.map((region) => {
      const live = summaryMap.get(region.name.toLowerCase());
      const staticData = staticMap.get(region.name.toLowerCase());
      const rainfall = live?.max_precipitation != null
        ? Number(live.max_precipitation)
        : staticData?.rainfall != null
        ? Number(staticData.rainfall)
        : 0;
      const category = live?.rain_category || staticData?.category || (rainfall > 50 ? 'Heavy Rain' : rainfall > 15 ? 'Moderate Rain' : 'Light / Dry');
      return {
        id: staticData?.id || `in-${region.code.toLowerCase()}`,
        name: region.name,
        code: region.code,
        rainfall,
        category,
      };
    }).sort((a, b) => b.rainfall - a.rainfall);
  }, [overviewData]);

  const filteredStates = useMemo(() => {
    if (!search.trim()) return statesList;
    const q = search.trim().toLowerCase();
    return statesList.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [search, statesList]);

  if (!isOpen) return null;

  return (
    <div
      id="all-states-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="all-states-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full p-5 sm:p-7 shadow-2xl border border-slate-100 relative flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
        {/* Modal Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close All States Modal"
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 pr-10">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <MapPin className="w-4 h-4" />
              </div>
              <h3
                id="all-states-modal-title"
                className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight"
              >
                All India States & Union Territories
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Select any region to drill down into district-level meteorological telemetry.
            </p>
          </div>

          <span className="self-start sm:self-auto px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs border border-blue-100">
            {statesList.length} States & UTs
          </span>
        </div>

        {/* Search Input Bar */}
        <div className="pt-4 pb-3">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by state name or code (e.g. Maharashtra, MH, Kerala)..."
              className="w-full pl-10 pr-9 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-white text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear Search"
                className="absolute right-3 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Scrollable States Grid */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 min-h-[260px] max-h-[50vh]">
          {filteredStates.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filteredStates.map((st, idx) => {
                const isSelected = selectedState && selectedState.toLowerCase() === st.name.toLowerCase();
                return (
                  <button
                    key={st.id || st.name}
                    type="button"
                    onClick={() => {
                      onSelectState(st.name);
                      onClose();
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm ring-2 ring-blue-500/20'
                        : 'bg-white border-slate-200/90 hover:border-blue-300 hover:bg-blue-50/50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-1">
                      <span
                        className={`w-5 text-center font-bold text-[10px] shrink-0 ${
                          isSelected ? 'text-blue-200' : 'text-slate-400'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 truncate">
                        <div className="font-semibold truncate">{st.name}</div>
                        <div
                          className={`text-[10px] ${
                            isSelected ? 'text-blue-100' : 'text-slate-400'
                          }`}
                        >
                          {st.code} &bull; {st.category}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="font-bold">
                        {st.rainfall.toFixed(1)} <span className="text-[10px] font-normal">mm/h</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              No states or union territories found matching &quot;{search}&quot;.
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Click any state to inspect weather observations</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
