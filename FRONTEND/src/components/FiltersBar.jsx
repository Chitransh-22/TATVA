import { useState } from 'react';
import { Search, MapPin, ChevronDown, Check } from 'lucide-react';
import { INDIA_STATES_DATA } from '../data/weatherData';
import { MosdacProductSelector } from './MosdacProductSelector';

export function FiltersBar({
  searchQuery,
  onSearchChange,
  selectedState,
  onSelectState,
  regionFilter,
  onRegionChange,
  activeProductId = '3SIMG_L2B_HEM',
  onSelectProduct,
  productStatusMap = {},
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const filteredStates = INDIA_STATES_DATA.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const regionOptions = [
    { id: 'all', label: 'India (All Regions)' },
    { id: 'north', label: 'Northern Himalayan Zone' },
    { id: 'east', label: 'Eastern & Gangetic Plain' },
    { id: 'west', label: 'Western Coastal & Arid' },
    { id: 'south', label: 'Southern Peninsular Zone' },
  ];

  return (
    <div className="w-full mb-6">
      {/* Top Header Row: Titles & Search/Scope Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
        {/* Left: Titles */}
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-blue-600">
            ISRO MOSDAC PLATFORM
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
            National Meteorological & Satellite Big Data
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Live geostationary observations from INSAT-3DS Imager & Sounder. Select any satellite product layer below.
          </p>
        </div>

        {/* Right: Search & Region Dropdown */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 relative z-30">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-64 md:w-72">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                id="weather-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                placeholder="Search state or district..."
                className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm bg-white/90 hover:bg-white text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200/90 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                    onSelectState(null);
                  }}
                  className="absolute right-3 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Autocomplete popup */}
            {showSearchResults && searchQuery.trim().length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-100 max-h-56 overflow-y-auto z-40 py-1">
                {filteredStates.length > 0 ? (
                  filteredStates.map((state) => (
                    <button
                      key={state.id}
                      type="button"
                      onClick={() => {
                        onSelectState(state.name);
                        onSearchChange(state.name);
                        setShowSearchResults(false);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-blue-50 flex items-center justify-between text-xs text-slate-700 transition-colors cursor-pointer"
                    >
                      <span className="font-medium">{state.name}</span>
                      <span className="text-[11px] font-semibold text-blue-600">
                        {state.rainfall} mm/hr
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-xs text-slate-400 text-center">
                    No states found matching &quot;{searchQuery}&quot;
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Region Dropdown Filter */}
          <div className="relative">
            <button
              id="region-filter-dropdown"
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white text-slate-700 text-xs sm:text-sm font-medium border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>
                {selectedState
                  ? selectedState
                  : regionFilter === 'all'
                  ? 'India'
                  : regionOptions.find((r) => r.id === regionFilter)?.label.split(' ')[0]}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-40">
                <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Select Scope
                </div>
                {regionOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onRegionChange(opt.id);
                      onSelectState(null);
                      onSearchChange('');
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-blue-50 transition-colors cursor-pointer ${
                      regionFilter === opt.id && !selectedState
                        ? 'text-blue-600 font-semibold bg-blue-50/50'
                        : 'text-slate-700'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {regionFilter === opt.id && !selectedState && (
                      <Check className="w-3.5 h-3.5 text-blue-600" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOSDAC Product Filter Bar */}
      <MosdacProductSelector
        activeProductId={activeProductId}
        onSelectProduct={onSelectProduct}
        productStatusMap={productStatusMap}
      />
    </div>
  );
}
