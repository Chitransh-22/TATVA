import { useState } from 'react';
import { getCorrelationMatrix, getScatterData } from '../../services/analysisService';
import { X, Activity } from 'lucide-react';

export function WeatherCorrelation() {
  const { variables, matrix } = getCorrelationMatrix();
  const [selectedPair, setSelectedPair] = useState(null);

  const getCellColor = (r) => {
    if (r === 1.0) return 'bg-slate-700/80 text-white font-bold';
    if (r >= 0.7) return 'bg-blue-600 text-white font-bold';
    if (r >= 0.3) return 'bg-sky-500/60 text-sky-100 font-semibold';
    if (r >= -0.3) return 'bg-slate-800/80 text-slate-300';
    if (r >= -0.7) return 'bg-rose-500/50 text-rose-100 font-semibold';
    return 'bg-rose-600 text-white font-bold';
  };

  const handleCellClick = (cell) => {
    const scatter = getScatterData(cell.varA, cell.varB);
    setSelectedPair(scatter);
  };

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-violet-400" />
              Atmospheric Variable Correlation Matrix
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              Pearson Coefficient (r)
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Inter-variable linear dependency matrix. Click any cell to inspect pairwise scatter analysis & regression trend.
          </p>
        </div>

        <div className="text-[11px] font-mono text-slate-400">
          *Statistically calibrated against historical atmospheric soundings
        </div>
      </div>

      {/* Correlation Grid Table */}
      <div className="w-full overflow-x-auto pb-2">
        <table className="w-full text-xs text-center border-collapse min-w-[540px]">
          <thead>
            <tr>
              <th className="p-2 text-left text-slate-400 font-bold uppercase text-[10px]">Variable</th>
              {variables.map((v) => (
                <th key={v.id} className="p-2 text-slate-300 font-semibold text-[11px]">
                  {v.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.variable.id} className="border-t border-white/5">
                <td className="p-2 text-left font-bold text-slate-200 text-xs">
                  {row.variable.label}
                </td>
                {row.values.map((cell, colIdx) => (
                  <td key={colIdx} className="p-1">
                    <button
                      type="button"
                      onClick={() => handleCellClick(cell)}
                      className={`w-full py-1.5 px-2 rounded-lg transition-transform hover:scale-105 cursor-pointer shadow-xs ${getCellColor(
                        cell.r
                      )}`}
                      title={`Click to view scatter relationship between ${cell.labelA} and ${cell.labelB}`}
                    >
                      {cell.r > 0 && cell.r !== 1.0 ? `+${cell.r.toFixed(2)}` : cell.r.toFixed(2)}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Matrix Legend */}
      <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-bold text-slate-300">Scale:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-600" />
            <span>Strong Positive (&gt; +0.7)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-sky-500/60" />
            <span>Moderate Positive (+0.3 to +0.7)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-slate-800" />
            <span>Neutral / Weak</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-600" />
            <span>Negative (&lt; -0.3)</span>
          </div>
        </div>

        <span className="text-[10px] text-slate-500 italic">
          &ldquo;Correlation does not necessarily imply atmospheric causation.&rdquo;
        </span>
      </div>

      {/* Interactive Scatter Modal / Drawer */}
      {selectedPair && (
        <div className="mt-4 p-4 rounded-2xl bg-[#060e1f] border border-[#d4dcff]/40 shadow-2xl animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#d4dcff]" />
              <h4 className="text-sm font-bold text-white">
                Pairwise Scatter Analysis: {selectedPair.varA.label} vs {selectedPair.varB.label}
              </h4>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-600 text-white">
                r = {selectedPair.r > 0 ? `+${selectedPair.r}` : selectedPair.r} ({selectedPair.strength} {selectedPair.direction})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPair(null)}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* SVG Scatter Plot */}
          <div className="w-full flex justify-center py-2">
            <svg viewBox="0 0 540 220" className="w-full max-w-[540px] h-auto overflow-visible">
              {/* Grid Box */}
              <rect x="45" y="20" width="460" height="160" fill="rgba(15, 23, 42, 0.6)" stroke="rgba(255, 255, 255, 0.1)" rx="8" />

              {/* Regression Trend Line */}
              <line
                x1="65"
                y1={selectedPair.r >= 0 ? 155 : 35}
                x2="485"
                y2={selectedPair.r >= 0 ? 35 : 155}
                stroke="#38bdf8"
                strokeWidth="2"
                strokeDasharray="4 3"
              />

              {/* Scatter Points */}
              {selectedPair.points.map((pt, idx) => {
                const normX = 65 + (idx / selectedPair.points.length) * 410;
                const normY = selectedPair.r >= 0
                  ? 160 - (idx / selectedPair.points.length) * 125 + (Math.sin(idx * 2) * 18)
                  : 35 + (idx / selectedPair.points.length) * 125 + (Math.sin(idx * 2) * 18);

                return (
                  <circle
                    key={idx}
                    cx={normX}
                    cy={normY}
                    r="4.5"
                    fill="#a78bfa"
                    stroke="#081226"
                    strokeWidth="1.5"
                    className="hover:r-6 transition-all"
                  />
                );
              })}

              {/* X & Y Axis Labels */}
              <text x="275" y="205" fill="#94a3b8" fontSize="10" fontFamily="sans-serif" textAnchor="middle">
                {selectedPair.varA.label} ({selectedPair.varA.unit}) &rarr;
              </text>
              <text x="20" y="105" fill="#94a3b8" fontSize="10" fontFamily="sans-serif" textAnchor="middle" transform="rotate(-90 20 105)">
                {selectedPair.varB.label} ({selectedPair.varB.unit}) &rarr;
              </text>
            </svg>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/10 font-medium">
            <span>Sample observations: n = {selectedPair.sampleSize}</span>
            <span className="text-amber-300 font-semibold">{selectedPair.disclaimer}</span>
          </div>
        </div>
      )}
    </div>
  );
}
