import { useState } from 'react';
import { getPredictiveOutlook } from '../../services/analysisService';
import { CheckCircle2 } from 'lucide-react';

export function PredictivePanel({ locationId = 'ahmedabad', locationName = 'Selected Region' }) {
  const [horizon, setHorizon] = useState('48h');
  const outlook = getPredictiveOutlook(locationId, horizon) || {};
  const ensembleSpread = outlook.ensembleSpread || { lowerBound: '0 mm', upperBound: '0 mm', medianForecast: '0 mm' };
  const primaryDrivers = outlook.primaryDrivers || [];
  const advisories = outlook.advisories || [];

  const horizonOptions = ['6h', '12h', '24h', '48h', '72h', '7d'];

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-6 shadow-xl mb-6 select-none relative">
      {/* Header & Horizon Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              Predictive Outlook &amp; Ensemble Forecast Synthesis
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              {locationName}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Multi-model numerical ensemble guidance with probabilistic uncertainty boundaries.
          </p>
        </div>

        {/* Horizon Picker */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
          {horizonOptions.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHorizon(h)}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                horizon === h
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Forecast Summary Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-indigo-950/40 border border-indigo-800/50 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
              Forecast Horizon: +{horizon}
            </span>
            <span className="text-xs font-mono text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Confidence: {outlook.confidence}
            </span>
          </div>

          <span className="text-xs text-slate-400 font-mono">
            Model: NCMRWF NEPS-G + IMD MME 00Z Run
          </span>
        </div>

        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
          {outlook.summary}
        </p>
      </div>

      {/* Quantitative Forecast Metric Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">
            Expected Accumulation
          </span>
          <span className="text-xl font-black text-white font-mono my-1">
            {outlook.expectedAccumulation}
          </span>
          <span className="text-[11px] text-slate-400">
            Peak Intensity: {outlook.peakIntensityWindow}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">
            Ensemble Spread (10th - 90th)
          </span>
          <span className="text-lg font-black text-indigo-300 font-mono my-1">
            {ensembleSpread.lowerBound} to {ensembleSpread.upperBound}
          </span>
          <span className="text-[11px] text-slate-400">
            Median: {ensembleSpread.medianForecast}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">
            Primary Atmospheric Driver
          </span>
          <span className="text-xs font-bold text-white leading-tight my-1">
            {primaryDrivers[0] || 'Monsoon Convective Flux'}
          </span>
          <span className="text-[11px] text-emerald-400 font-mono">
            Agreement Index: 86% High
          </span>
        </div>
      </div>

      {/* Advisories & Drivers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Drivers */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-2.5">
            Key Numerical Atmospheric Drivers:
          </div>
          <ul className="space-y-2 text-xs text-slate-300">
            {primaryDrivers.map((driver, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <span>{driver}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Operational Advisories */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-2.5">
            Operational Atmospheric Advisories:
          </div>
          <div className="space-y-2">
            {advisories.map((adv, idx) => (
              <div key={idx} className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start gap-2 text-xs">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 mt-0.5 ${
                    adv.severity === 'Watch'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-blue-500/20 text-blue-300'
                  }`}
                >
                  {adv.severity}
                </span>
                <span className="text-slate-200">{adv.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
