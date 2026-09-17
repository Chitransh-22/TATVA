import { useState, useMemo } from 'react';
import { Download, Table as TableIcon, ChevronUp, ChevronDown, Check } from 'lucide-react';
import { formatMetricValue } from '../../services/analysisService';

export function AnalysisTable({
  timeline = [],
  locationName = 'National (India)',
}) {
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' (latest first) | 'asc' (oldest first)
  const [copied, setCopied] = useState(false);

  // Validated and sorted rows
  const sortedRows = useMemo(() => {
    if (!Array.isArray(timeline)) return [];
    return [...timeline].sort((a, b) => {
      const tA = new Date(a.observation_time).getTime();
      const tB = new Date(b.observation_time).getTime();
      return sortOrder === 'desc' ? tB - tA : tA - tB;
    });
  }, [timeline, sortOrder]);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (sortedRows.length === 0) return;

    const headers = ['Observation Time (IST)', 'Observation Time (UTC)', 'Avg Precipitation (mm/hr)', 'Peak Intensity (mm/hr)', 'Min Precipitation (mm/hr)', 'Grid Points Sampled', 'Condition'];
    const rows = sortedRows.map((r) => [
      `"${r.observation_ist || ''}"`,
      `"${r.observation_time || ''}"`,
      r.avg_precipitation != null ? r.avg_precipitation.toFixed(2) : '0.00',
      r.max_precipitation != null ? r.max_precipitation.toFixed(2) : '0.00',
      r.min_precipitation != null ? r.min_precipitation.toFixed(2) : '0.00',
      r.total_points != null ? r.total_points : '0',
      `"${r.rain_category || 'Clear / Dry'}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = locationName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    link.setAttribute('download', `tatva_weather_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-6 mb-8">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <TableIcon className="w-4 h-4 text-blue-600" />
            <span>Observation Records & Data Details</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Granular time-series observation records for {locationName}.
          </p>
        </div>

        {/* Action Controls: Sort Order & CSV Export */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            title="Toggle chronological sort order"
          >
            {sortOrder === 'desc' ? (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                <span>Latest First</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                <span>Oldest First</span>
              </>
            )}
          </button>

          {sortedRows.length > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Exported!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      {sortedRows.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">
          No observation data recorded for this location in the selected window.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="max-h-[380px] overflow-y-auto rounded-xl border border-slate-100">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-4">Observation Time (IST)</th>
                  <th className="py-3 px-4">Avg Rainfall</th>
                  <th className="py-3 px-4">Peak Intensity</th>
                  <th className="py-3 px-4">Min Reading</th>
                  <th className="py-3 px-4">Grid Points</th>
                  <th className="py-3 px-4">Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {sortedRows.map((row, idx) => (
                  <tr
                    key={row.observation_time || idx}
                    className="hover:bg-blue-50/50 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-800 whitespace-nowrap">
                      {row.observation_ist || row.observation_time}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                      {formatMetricValue(row.avg_precipitation, 2)} <span className="text-[10px] text-slate-400 font-normal">mm/hr</span>
                    </td>
                    <td className="py-2.5 px-4 font-bold text-amber-700 whitespace-nowrap">
                      {formatMetricValue(row.max_precipitation, 2)} <span className="text-[10px] text-amber-600 font-normal">mm/hr</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                      {formatMetricValue(row.min_precipitation, 2)} <span className="text-[10px] text-slate-400 font-normal">mm/hr</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                      {row.total_points ? row.total_points.toLocaleString() : '—'}
                    </td>
                    <td className="py-2.5 px-4 font-sans whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {row.rain_category || 'Clear / Dry'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3 px-1">
            <span>Showing {sortedRows.length} chronological observation records</span>
            <span>Values authenticated by PostgreSQL / PostGIS spatial geometry</span>
          </div>
        </div>
      )}
    </div>
  );
}
