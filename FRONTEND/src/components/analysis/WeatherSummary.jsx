import { useMemo } from 'react';
import { CloudRain, AlertTriangle, ArrowRight, ShieldCheck, MapPin, BarChart2 } from 'lucide-react';
import { classifyRainfall, formatMetricValue } from '../../services/analysisService';

export function WeatherSummary({
  scopeType = 'national', // 'national' | 'state' | 'district'
  locationName = 'National (India)',
  summary = null, // { avg_precipitation, max_precipitation, min_precipitation, total_points, rain_category }
  stateSummaries = [],
  districtSummaries = [],
  onSelectState,
  onSelectDistrict,
}) {
  const avg = Number(summary?.avg_precipitation ?? 0);
  const max = Number(summary?.max_precipitation ?? 0);
  const min = Number(summary?.min_precipitation ?? 0);
  const pts = Number(summary?.total_points ?? 0);
  const rainCategory = summary?.rain_category || classifyRainfall(max || avg);

  // Category badge colors
  const categoryThemes = {
    'Clear / Dry': {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      icon: ShieldCheck,
      desc: 'Normal clear atmospheric conditions with no precipitation signatures observed.',
    },
    'Very Light Trace': {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      icon: CloudRain,
      desc: 'Trace atmospheric moisture below 1.0 mm/hr.',
    },
    'Light Rain': {
      bg: 'bg-sky-50',
      text: 'text-sky-700',
      border: 'border-sky-200',
      icon: CloudRain,
      desc: 'Light rain showers between 1.0 mm/hr and 15.0 mm/hr.',
    },
    'Moderate Rain': {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
      icon: CloudRain,
      desc: 'Sustained precipitation between 15.0 mm/hr and 50.0 mm/hr.',
    },
    'Heavy Rainfall': {
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      border: 'border-orange-200',
      icon: AlertTriangle,
      desc: 'Intense precipitation between 50.0 mm/hr and 100.0 mm/hr requiring regional vigilance.',
    },
    'Torrential Downpour': {
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200',
      icon: AlertTriangle,
      desc: 'Extreme convective torrential downpour exceeding 100.0 mm/hr.',
    },
  };

  const theme = categoryThemes[rainCategory] || categoryThemes['Clear / Dry'];
  const StatusIcon = theme.icon;

  // Ranked sub-regions list (Top 5 states if National, or Top 5 districts if State)
  const rankedItems = useMemo(() => {
    if (scopeType === 'national' && Array.isArray(stateSummaries) && stateSummaries.length > 0) {
      return [...stateSummaries]
        .filter((s) => s && s.state_name)
        .sort((a, b) => Number(b.max_precipitation ?? 0) - Number(a.max_precipitation ?? 0))
        .slice(0, 5)
        .map((s) => ({
          name: s.state_name,
          rainfall: Number(s.max_precipitation ?? s.avg_precipitation ?? 0),
          category: s.rain_category || classifyRainfall(s.max_precipitation),
          type: 'state',
        }));
    }

    if (scopeType === 'state' && Array.isArray(districtSummaries) && districtSummaries.length > 0) {
      return [...districtSummaries]
        .filter((d) => d && d.district_name)
        .sort((a, b) => Number(b.max_precipitation ?? 0) - Number(a.max_precipitation ?? 0))
        .slice(0, 5)
        .map((d) => ({
          name: d.district_name,
          rainfall: Number(d.max_precipitation ?? d.avg_precipitation ?? 0),
          category: d.rain_category || classifyRainfall(d.max_precipitation),
          type: 'district',
        }));
    }

    return [];
  }, [scopeType, stateSummaries, districtSummaries]);

  const maxRankedVal = useMemo(() => {
    if (rankedItems.length === 0) return 1;
    return Math.max(...rankedItems.map((r) => r.rainfall), 1);
  }, [rankedItems]);

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
      {/* Left 7 Cols: Weather Condition & IMD Classification */}
      <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-4">
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-600" />
              <span>Weather & Rainfall Summary</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">IMD Standard Criteria</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/70 mb-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${theme.border} ${theme.bg}`}>
              <StatusIcon className={`w-6 h-6 ${theme.text}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Condition Status:</span>
                <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${theme.border} ${theme.bg} ${theme.text}`}>
                  {rainCategory}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {theme.desc}
              </p>
            </div>
          </div>
        </div>

        {/* Core Statistical Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div className="p-2.5 rounded-xl bg-slate-50/80">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Average</span>
            <span className="text-base font-extrabold text-slate-800 font-mono">
              {formatMetricValue(avg, 2)} <span className="text-[11px] font-medium text-slate-500">mm/hr</span>
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-100/80">
            <span className="text-[11px] font-bold text-amber-700/80 uppercase tracking-wider block">Peak Intensity</span>
            <span className="text-base font-extrabold text-amber-800 font-mono">
              {formatMetricValue(max, 2)} <span className="text-[11px] font-medium text-amber-700">mm/hr</span>
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50/80">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Minimum</span>
            <span className="text-base font-extrabold text-slate-800 font-mono">
              {formatMetricValue(min, 2)} <span className="text-[11px] font-medium text-slate-500">mm/hr</span>
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50/80">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Active Grid Points</span>
            <span className="text-base font-extrabold text-slate-800 font-mono">
              {pts.toLocaleString()} <span className="text-[11px] font-medium text-slate-500">pts</span>
            </span>
          </div>
        </div>
      </div>

      {/* Right 5 Cols: Regional Ranking / Distribution Breakdown */}
      <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-3">
            <h4 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>
                {scopeType === 'national'
                  ? 'Top States by Rainfall'
                  : scopeType === 'state'
                  ? 'Top Districts in State'
                  : 'District Observation Coverage'}
              </span>
            </h4>
            <span className="text-[11px] text-slate-400 font-medium">Click to drill down</span>
          </div>

          {rankedItems.length > 0 ? (
            <div className="space-y-2.5 my-2">
              {rankedItems.map((item, idx) => {
                const pct = Math.max(8, Math.min(100, (item.rainfall / maxRankedVal) * 100));
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => {
                      if (item.type === 'state' && onSelectState) onSelectState(item.name);
                      else if (item.type === 'district' && onSelectDistrict) onSelectDistrict(item.name);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-50/70 hover:bg-blue-50/80 border border-slate-200/60 hover:border-blue-300/80 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-800 group-hover:text-blue-700 flex items-center gap-1.5">
                        <span className="text-slate-400 font-mono text-[11px]">#{idx + 1}</span>
                        <span>{item.name}</span>
                      </span>
                      <span className="font-mono font-extrabold text-slate-900 group-hover:text-blue-700">
                        {item.rainfall.toFixed(1)} <span className="text-[10px] font-normal text-slate-500">mm/hr</span>
                      </span>
                    </div>

                    {/* Progress representation bar */}
                    <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full bg-blue-600 rounded-full transition-all duration-300 group-hover:bg-blue-500"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              <p>Observation points mapped across {locationName}.</p>
              <span className="text-[11px] text-slate-400">Total {pts.toLocaleString()} PostGIS spatial observation cells active.</span>
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span>Source: PostGIS spatial rollups</span>
          <span className="font-mono">{pts.toLocaleString()} cells</span>
        </div>
      </div>
    </div>
  );
}
