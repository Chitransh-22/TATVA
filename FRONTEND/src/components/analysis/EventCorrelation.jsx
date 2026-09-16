import { useState } from 'react';
import { getScatterData } from '../../services/analysisService';

export function EventCorrelation() {
  const [eventA, setEventA] = useState('rainfall');
  const [eventB, setEventB] = useState('lightning');

  const eventOptions = [
    { id: 'rainfall', label: 'Heavy Rainfall Intensity (>64.5 mm/h)' },
    { id: 'temperature', label: 'Surface Temperature Anomaly' },
    { id: 'pressure', label: 'Barometric Pressure Drop' },
    { id: 'humidity', label: 'Upper Tropospheric Moisture Surge' },
    { id: 'wind', label: 'Peak Wind Gust Exceedance' },
    { id: 'lightning', label: 'Convective Lightning Strike Density' },
    { id: 'cloudCover', label: 'Cloud Optical Thickness (TIR)' },
  ];

  const scatter = getScatterData(eventA, eventB, 36);

  const width = 640;
  const height = 220;
  const padLeft = 45;
  const padRight = 25;
  const padTop = 20;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const pts = scatter?.points || [];
  const minX = pts.length > 0 ? Math.min(...pts.map((p) => p.x)) : 0;
  const maxX = pts.length > 0 ? Math.max(...pts.map((p) => p.x)) : 100;
  const minY = pts.length > 0 ? Math.min(...pts.map((p) => p.y)) : 0;
  const maxY = pts.length > 0 ? Math.max(...pts.map((p) => p.y)) : 100;

  const getX = (val) => padLeft + ((val - minX) / (maxX - minX || 1)) * chartW;
  const getY = (val) => padTop + chartH - ((val - minY) / (maxY - minY || 1)) * chartH;

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Event Correlation Engine (Atmospheric Coupling)
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              Bi-Variate Regression
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Analyze physical dependency and statistical association between co-occurring atmospheric hazards.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-600 text-white">
            Pearson r = {scatter.r > 0 ? `+${scatter.r}` : scatter.r} ({scatter.strength})
          </span>
        </div>
      </div>

      {/* Selectors for Event A & Event B */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Atmospheric Event / Variable A:
          </label>
          <select
            value={eventA}
            onChange={(e) => setEventA(e.target.value)}
            className="w-full px-3 py-2 bg-[#0d1c3a] border border-blue-800/60 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {eventOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Atmospheric Event / Variable B:
          </label>
          <select
            value={eventB}
            onChange={(e) => setEventB(e.target.value)}
            className="w-full px-3 py-2 bg-[#0d1c3a] border border-blue-800/60 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {eventOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scatter Chart */}
      <div className="relative w-full overflow-x-auto bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[520px] overflow-visible">
          {/* Border Rect */}
          <rect x={padLeft} y={padTop} width={chartW} height={chartH} fill="rgba(15, 23, 42, 0.5)" stroke="rgba(255, 255, 255, 0.08)" rx="6" />

          {/* Regression Line */}
          <line
            x1={getX(scatter.trendLine.start.x)}
            y1={getY(scatter.trendLine.start.y)}
            x2={getX(scatter.trendLine.end.x)}
            y2={getY(scatter.trendLine.end.y)}
            stroke="#38bdf8"
            strokeWidth="2"
            strokeDasharray="4 2"
          />

          {/* Scatter Points */}
          {scatter.points.map((p, idx) => (
            <circle
              key={idx}
              cx={getX(p.x)}
              cy={getY(p.y)}
              r="4.5"
              fill="#818cf8"
              stroke="#081226"
              strokeWidth="1.5"
              className="hover:r-6 transition-all"
            />
          ))}

          {/* Labels */}
          <text x={padLeft + chartW / 2} y={height - 8} fill="#94a3b8" fontSize="10" fontFamily="sans-serif" textAnchor="middle">
            {scatter.varA.label} ({scatter.varA.unit}) &rarr;
          </text>
          <text x="18" y={padTop + chartH / 2} fill="#94a3b8" fontSize="10" fontFamily="sans-serif" textAnchor="middle" transform={`rotate(-90 18 ${padTop + chartH / 2})`}>
            {scatter.varB.label} ({scatter.varB.unit}) &rarr;
          </text>
        </svg>
      </div>

      {/* Footer Info & Causation Disclaimer */}
      <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div>
          <span>Sample Size: <strong>{scatter.sampleSize} soundings</strong></span>
          <span className="mx-2">&bull;</span>
          <span>Sources: <strong>ISRO MOSDAC + IMD AWS Grid</strong></span>
        </div>
        <div className="text-amber-300 font-semibold text-[11px]">
          &ldquo;Correlation does not necessarily imply atmospheric causation.&rdquo;
        </div>
      </div>
    </div>
  );
}
