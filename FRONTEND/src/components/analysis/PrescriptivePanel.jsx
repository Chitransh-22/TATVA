import { getPrescriptiveAdvisory } from '../../services/analysisService';
import { AlertTriangle } from 'lucide-react';

export function PrescriptivePanel({ locationId = 'ahmedabad', locationName = 'Selected Region' }) {
  const pres = getPrescriptiveAdvisory(locationId) || {};
  const priorityAreas = pres.priorityAreas || [];

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-6 shadow-xl mb-6 select-none relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Prescriptive Decision Support &amp; Priority Zones
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              {locationName}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            AI-derived operational recommendations, exposure rankings, and proactive monitoring mitigations.
          </p>
        </div>

        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800/50">
          STATUS: ADVISORY ACTIVE
        </span>
      </div>

      {/* Official Warning Demarcation Notice */}
      <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/40 mb-5 flex items-start gap-2.5 text-xs text-amber-200">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="font-bold text-amber-300 mr-1">Advisory Demarcation Notice:</strong>
          {pres.disclaimer}
        </div>
      </div>

      {/* Priority Action Areas */}
      <div className="space-y-3.5 mb-5">
        <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
          Recommended Priority Zones &amp; Hotspots:
        </div>

        {priorityAreas.map((area, idx) => (
          <div
            key={idx}
            className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-bold text-xs flex items-center justify-center">
                  0{idx + 1}
                </span>
                <h4 className="text-sm font-bold text-white tracking-tight">
                  {area.zone}
                </h4>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                    area.vulnerability === 'High'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {area.vulnerability} Exposure
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                <strong className="text-slate-200 font-semibold">Causal Trigger: </strong>
                {area.reason}
              </p>

              <div className="text-[11px] text-slate-400 font-mono">
                Underlying Datasets: {area.supportingEvidence}
              </div>
            </div>

            {/* Suggested Action Pill */}
            <div className="md:w-72 p-3 rounded-lg bg-[#0d1c3a] border border-blue-900/60 flex flex-col justify-between shrink-0">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#d4dcff] mb-1">
                Suggested Mitigation Action:
              </span>
              <p className="text-xs text-white font-semibold leading-tight">
                {area.suggestedAction}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Monitoring Frequency Callout */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
        <span className="font-semibold text-slate-200">
          Recommended Monitoring Cadence:
        </span>
        <span className="font-mono text-[#d4dcff] font-bold">
          {pres.recommendedMonitoringFrequency}
        </span>
      </div>
    </div>
  );
}
