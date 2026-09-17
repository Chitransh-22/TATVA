import { useState } from 'react';
import { ShieldCheck, ChevronDown, ChevronUp, Database, Clock, MapPin, Layers } from 'lucide-react';

/**
 * EvidencePanel - Reusable Evidence & Provenance Component
 *
 * Displays verifiable data proof, observed values, authoritative data sources,
 * observation windows, and mathematical derivation methodology.
 *
 * Used across Descriptive, Diagnostic, Predictive, and Prescriptive pipeline stages.
 */
export function EvidencePanel({
  title = 'Supporting Evidence & Data Provenance',
  metrics = [],
  sources = [],
  observationPeriod = '',
  lastUpdated = '',
  geographicScope = '',
  methodology = '',
  notes = '',
  defaultExpanded = false,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="mt-4 rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden transition-all duration-200">
      {/* Header / Toggle Button */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full px-4 py-3 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors cursor-pointer"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-blue-50 border border-blue-200/80 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-900 block">
              {title}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              {metrics.length} verified parameters • Source-traceable
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-blue-700 hover:text-blue-800">
            {isExpanded ? 'Hide Evidence' : 'View Evidence'}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </button>

      {/* Expandable Body */}
      {isExpanded && (
        <div className="p-4 sm:p-5 border-t border-slate-200/80 space-y-4 bg-white">
          {/* 1. Metrics Evidence Table */}
          {metrics.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3.5">Metric / Parameter</th>
                    <th className="py-2.5 px-3.5">Observed / Derived Value</th>
                    <th className="py-2.5 px-3.5">Authoritative Source</th>
                    <th className="py-2.5 px-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                  {metrics.map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2 px-3.5 font-medium text-slate-900">
                        {m.label}
                        {m.note && (
                          <span className="block text-[10px] text-slate-400 font-normal">
                            {m.note}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3.5 font-mono font-semibold text-slate-900">
                        {m.value != null ? m.value : '—'} {m.unit || ''}
                      </td>
                      <td className="py-2 px-3.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                          <Database className="w-3 h-3 text-slate-400 shrink-0" />
                          {m.source || 'TATVA PostGIS Mesh'}
                        </span>
                      </td>
                      <td className="py-2 px-3.5">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            m.isAlert
                              ? 'bg-amber-100 text-amber-800'
                              : m.isEstimated
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {m.status || (m.isEstimated ? 'Derived' : 'Observed')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 2. Metadata Grid: Period, Updated, Scope, Sources */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50/70 p-3 rounded-lg border border-slate-100">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                Observation Period
              </span>
              <span className="font-semibold text-slate-800 text-[11px] mt-0.5 block truncate">
                {observationPeriod || 'Active 7-Day Rolling Mesh'}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                Last Telemetry Update
              </span>
              <span className="font-semibold text-slate-800 text-[11px] mt-0.5 block truncate">
                {lastUpdated || 'Real-time telemetry'}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" />
                Spatial Scope
              </span>
              <span className="font-semibold text-slate-800 text-[11px] mt-0.5 block truncate">
                {geographicScope || 'All India'}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider flex items-center gap-1">
                <Layers className="w-3 h-3 text-slate-400" />
                Data Sources
              </span>
              <span className="font-semibold text-slate-800 text-[11px] mt-0.5 block truncate">
                {sources.length > 0 ? sources.join(', ') : 'ISRO MOSDAC, PostGIS'}
              </span>
            </div>
          </div>

          {/* 3. Methodology & Criteria Note */}
          {methodology && (
            <div className="text-xs text-slate-600 bg-blue-50/40 p-3 rounded-lg border border-blue-100/60 leading-relaxed">
              <span className="font-bold text-blue-900 block mb-0.5">Methodology & Thresholds:</span>
              {methodology}
            </div>
          )}

          {notes && (
            <div className="text-[11px] text-slate-500 italic">
              Note: {notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EvidencePanel;
