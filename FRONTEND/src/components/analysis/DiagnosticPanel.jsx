import { getDiagnosticReport } from '../../services/analysisService';
import { Database, CheckCircle2 } from 'lucide-react';

export function DiagnosticPanel({ locationId = 'ahmedabad', locationName = 'Selected Region' }) {
  const diag = getDiagnosticReport(locationId) || {};
  const causalChain = diag.causalChain || [];
  const contributingFactors = diag.contributingFactors || [];
  const supportingDatasets = diag.supportingDatasets || [];

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-6 shadow-xl mb-6 select-none relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Atmospheric Diagnostic Engine &amp; Causal Attribution
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              {locationName}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Multi-sensor causal chain tracing why atmospheric signals deviated from baseline.
          </p>
        </div>

        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/50">
          DIAGNOSTIC STATUS: SYNTHESIZED
        </span>
      </div>

      {/* Synoptic Summary Callout */}
      <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-800/40 mb-6 text-xs sm:text-sm text-cyan-100 font-medium leading-relaxed">
        <strong className="text-white block font-bold text-xs uppercase tracking-wider mb-1">
          SYNOPTIC CONCLUSION:
        </strong>
        {diag.synopticSummary}
      </div>

      {/* Causal Chain Vertical Flow */}
      <div className="relative mb-6">
        <div className="text-xs font-mono font-extrabold uppercase tracking-wider text-slate-400 mb-3">
          ATMOSPHERIC CAUSAL STACK:
        </div>

        <div className="space-y-3 relative">
          {causalChain.map((step, idx) => (
            <div key={idx} className="relative flex flex-col sm:flex-row sm:items-start gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
              {/* Step Badge */}
              <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-500/50 text-[#d4dcff] flex items-center justify-center font-mono font-bold text-xs shrink-0">
                0{step.step}
              </div>

              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                    {step.title}
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {step.status}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed font-medium mb-2">
                  {step.detail}
                </p>

                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                  <Database className="w-3 h-3 text-[#d4dcff]" />
                  <span>Evidence: {step.evidence}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contributing Factors Breakdown + Supporting Datasets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contributing Signals */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-3">
            Contributing Atmospheric Signals:
          </div>
          <div className="space-y-2.5">
            {contributingFactors.map((factor, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300 font-medium">
                  <span>{factor.name}</span>
                  <span className="font-mono text-cyan-300 font-bold">{factor.weight}% ({factor.direction})</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-cyan-400 h-1.5 rounded-full"
                    style={{ width: `${factor.weight}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Evidence Verification Panel */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-3">
            Multi-Sensor Evidence Verification:
          </div>
          <div className="space-y-2">
            {supportingDatasets.map((ds, idx) => (
              <div key={idx} className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-slate-200 font-semibold">{ds.name}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Latency: {ds.latency}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-slate-500 italic">
        *{diag.disclaimer}
      </div>
    </div>
  );
}
