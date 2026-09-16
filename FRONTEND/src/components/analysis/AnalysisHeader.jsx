import { useState } from 'react';
import {
  MapPin,
  Calendar,
  Layers,
  Sparkles,
  RotateCcw,
  Play,
  Share2,
  Download,
  CheckCircle2,
} from 'lucide-react';
import { LOCATIONS, DATA_SOURCES } from '../../services/analysisService';

export function AnalysisHeader({
  selectedLocation,
  onSelectLocation,
  timeRange,
  onSelectTimeRange,
  dataSource,
  onSelectDataSource,
  activeMode,
  onSelectMode,
  onRunAnalysis,
  onReset,
  onOpenExport,
  isAnalyzing,
}) {
  const [copied, setCopied] = useState(false);

  const handleShareClick = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="relative w-full bg-[#081226]/95 backdrop-blur-xl border border-blue-900/40 rounded-2xl p-4 sm:p-6 shadow-xl mb-6 text-slate-100 overflow-hidden select-none">
      {/* Subtle atmospheric gradient light accent (#d4dcff) */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#d4dcff]/10 via-blue-500/5 to-transparent rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      <div className="absolute bottom-0 left-1/3 w-64 h-32 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />

      {/* Top Row: Title + National Weather Badge + Action Buttons */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#d4dcff]/15 text-[#d4dcff] border border-[#d4dcff]/30 shadow-xs">
              <Sparkles className="w-3 h-3 text-[#d4dcff] animate-pulse" />
              AI Weather Intelligence Workspace
            </span>
            <span className="text-[11px] text-slate-400 font-mono">TATVA-OBS-v2.4</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-['Plus_Jakarta_Sans',sans-serif]">
            Weather Intelligence
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-300 max-w-2xl font-medium leading-relaxed">
            Analyze, explain and forecast atmospheric events using multi-source weather intelligence.
          </p>
        </div>

        {/* Action Controls: Export & Share */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-slate-200 border border-white/15 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Export Analysis & Download Reports"
          >
            <Download className="w-3.5 h-3.5 text-[#d4dcff]" />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={handleShareClick}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-slate-200 border border-white/15 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Copy Sharable Analysis Link"
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-[#d4dcff]" />
                <span>Share</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bottom Controls Row: Selectors & Execution */}
      <div className="relative z-10 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4 items-center">
        {/* 1. Location Selector (3 cols) */}
        <div className="lg:col-span-3 flex flex-col gap-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#d4dcff]" />
            Location Scope
          </label>
          <div className="relative">
            <select
              value={selectedLocation.id}
              onChange={(e) => {
                const loc = LOCATIONS.find((l) => l.id === e.target.value);
                if (loc) onSelectLocation(loc);
              }}
              className="w-full pl-3 pr-8 py-2 bg-[#0d1c3a] border border-blue-800/60 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#d4dcff]/40 cursor-pointer shadow-inner appearance-none truncate"
            >
              <optgroup label="National">
                <option value="india">India (All-India Extent)</option>
              </optgroup>
              <optgroup label="States">
                <option value="gujarat">Gujarat (Statewide)</option>
                <option value="maharashtra">Maharashtra (Statewide)</option>
                <option value="rajasthan">Rajasthan (Statewide)</option>
                <option value="karnataka">Karnataka (Statewide)</option>
                <option value="tamilnadu">Tamil Nadu (Statewide)</option>
                <option value="odisha">Odisha (Statewide)</option>
                <option value="kerala">Kerala (Statewide)</option>
                <option value="westbengal">West Bengal (Statewide)</option>
                <option value="assam">Assam (Statewide)</option>
              </optgroup>
              <optgroup label="Key Districts & Cities">
                <option value="ahmedabad">Ahmedabad, Gujarat</option>
                <option value="gandhinagar">Gandhinagar, Gujarat</option>
                <option value="surat">Surat, Gujarat</option>
                <option value="rajkot">Rajkot, Gujarat</option>
                <option value="vadodara">Vadodara, Gujarat</option>
                <option value="mumbai">Mumbai, Maharashtra</option>
                <option value="pune">Pune, Maharashtra</option>
                <option value="bengaluru">Bengaluru, Karnataka</option>
                <option value="chennai">Chennai, Tamil Nadu</option>
                <option value="delhi">Delhi NCR</option>
                <option value="bhubaneswar">Bhubaneswar, Odisha</option>
              </optgroup>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">
              ▼
            </div>
          </div>
        </div>

        {/* 2. Date / Horizon Range Selector (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#d4dcff]" />
            Time Horizon
          </label>
          <select
            value={timeRange}
            onChange={(e) => onSelectTimeRange(e.target.value)}
            className="w-full px-3 py-2 bg-[#0d1c3a] border border-blue-800/60 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#d4dcff]/40 cursor-pointer shadow-inner truncate"
          >
            <option value="24h">Past 24h &bull; Now</option>
            <option value="48h">48 Hours Outlook</option>
            <option value="7d">Past 7d + 7d Forecast</option>
            <option value="30d">30-Day Climatology</option>
          </select>
        </div>

        {/* 3. Multi-Source Dataset Selector (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#d4dcff]" />
            Source
          </label>
          <select
            value={dataSource}
            onChange={(e) => onSelectDataSource(e.target.value)}
            className="w-full px-3 py-2 bg-[#0d1c3a] border border-blue-800/60 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#d4dcff]/40 cursor-pointer shadow-inner truncate"
          >
            {DATA_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Analysis Type Selector (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#d4dcff]" />
            Analysis Type
          </label>
          <select
            value={activeMode}
            onChange={(e) => onSelectMode(e.target.value)}
            className="w-full px-3 py-2 bg-[#0d1c3a] border border-blue-800/60 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#d4dcff]/40 cursor-pointer shadow-inner truncate"
          >
            <option value="descriptive">Descriptive (Observed)</option>
            <option value="diagnostic">Diagnostic (Causal)</option>
            <option value="predictive">Predictive (Forecast)</option>
            <option value="prescriptive">Prescriptive (Priority)</option>
            <option value="all">All Modes (Full Workspace)</option>
          </select>
        </div>

        {/* 5. Run Analysis & Reset Buttons (3 cols) */}
        <div className="lg:col-span-3 flex items-end justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Reset Filters to Default Baseline"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={onRunAnalysis}
            disabled={isAnalyzing}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all duration-200 cursor-pointer shadow-lg shadow-blue-600/30 active:scale-95 ${
              isAnalyzing
                ? 'bg-blue-700 text-white opacity-80 cursor-wait'
                : 'bg-gradient-to-r from-blue-600 via-blue-500 to-[#d4dcff]/90 hover:from-blue-500 hover:to-white text-white font-extrabold'
            }`}
          >
            {isAnalyzing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Synthesizing...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Analysis</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
