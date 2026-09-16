import { useState } from 'react';
import { X, Download, Share2, FileSpreadsheet, FileCode, CheckCircle2 } from 'lucide-react';

export function ExportShareModal({ isOpen, onClose, analysisData, locationName = 'Selected Region' }) {
  const [copied, setCopied] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportJSON = () => {
    const payload = {
      platform: 'TATVA National Weather Intelligence Platform',
      version: '2.4',
      exportTimestamp: new Date().toISOString(),
      location: locationName,
      analysisSummary: analysisData,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TATVA_Weather_Intelligence_${locationName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadMsg('JSON dataset generated and downloaded successfully.');
    setTimeout(() => setDownloadMsg(''), 3000);
  };

  const handleExportCSV = () => {
    const csvContent = [
      ['Timestamp', 'Observed (mm/h)', 'Forecast (mm/h)', 'Baseline Normal (mm/h)', 'Deviation (mm/h)'],
      ...(analysisData?.series || []).map((s) => [
        s.label || s.timestamp,
        s.observed ?? '',
        s.forecast ?? '',
        s.baseline ?? '',
        s.deviation ?? '',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TATVA_TimeSeries_${locationName.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadMsg('CSV time-series exported successfully.');
    setTimeout(() => setDownloadMsg(''), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#081226] border border-blue-900/60 rounded-2xl p-6 shadow-2xl text-slate-100">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-2.5 mb-1">
          <Download className="w-5 h-5 text-[#d4dcff]" />
          <h3 className="text-lg font-bold text-white tracking-tight">
            Export &amp; Share Weather Intelligence
          </h3>
        </div>
        <p className="text-xs text-slate-300 mb-5">
          Download structured observation telemetry or share live analytical workspace configuration.
        </p>

        {/* Feedback message */}
        {downloadMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{downloadMsg}</span>
          </div>
        )}

        {/* Export Options Grid */}
        <div className="space-y-3 mb-5">
          <button
            type="button"
            onClick={handleExportJSON}
            className="w-full p-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-blue-700/60 flex items-center justify-between text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-[#d4dcff] flex items-center justify-center">
                <FileCode className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white group-hover:text-blue-300">
                  Export Structured JSON Dataset
                </h4>
                <p className="text-[11px] text-slate-400">
                  Full atmospheric telemetry, ensemble intervals, and anomaly metrics.
                </p>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0" />
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="w-full p-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-blue-700/60 flex items-center justify-between text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-300 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white group-hover:text-emerald-300">
                  Download CSV Time-Series
                </h4>
                <p className="text-[11px] text-slate-400">
                  Tabular spreadsheet format compatible with GIS, Python Pandas, and R.
                </p>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0" />
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full p-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-blue-700/60 flex items-center justify-between text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-300 flex items-center justify-center">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white group-hover:text-indigo-300">
                  Copy Sharable Workspace Link
                </h4>
                <p className="text-[11px] text-slate-400">
                  Preserves current location ({locationName}) and active horizon configuration.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold font-mono text-cyan-300">
              {copied ? 'Copied!' : 'Copy'}
            </span>
          </button>
        </div>

        <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-500 text-center font-mono">
          TATVA Analytics Export Engine &bull; Compliant with OGC &amp; NetCDF Standards
        </div>
      </div>
    </div>
  );
}
