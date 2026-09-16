import { useState } from 'react';

export function AnomalyChart({ anomalyData, onSelectMetric, locationName = 'Selected Region' }) {
  const [hoveredAnomaly, setHoveredAnomaly] = useState(null);

  const { anomalies = [], metric = 'rainfall', activeSeverities = {} } = anomalyData || {};

  if (!anomalyData || !anomalies || anomalies.length === 0) {
    return (
      <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-6 shadow-xl mb-6 flex items-center justify-center min-h-[220px]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-rose-500/30 border-t-rose-400 rounded-full animate-spin mx-auto mb-2" />
          <span className="text-xs text-slate-400 font-mono">Loading climatological anomaly departure series...</span>
        </div>
      </div>
    );
  }

  const width = 800;
  const height = 280;
  const padLeft = 50;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Max absolute delta for symmetric scale around 0
  const anomalyDeltas = anomalies.map((a) => Math.abs(a.delta || 0));
  const maxAbsDelta = Math.max(
    2.0,
    ...(anomalyDeltas.length > 0 ? anomalyDeltas.map((d) => d * 1.2) : [2.0])
  );

  const getX = (idx) => padLeft + (idx / Math.max(1, anomalies.length - 1)) * chartW;
  const getY = (val) => padTop + chartH / 2 - (val / (maxAbsDelta || 1)) * (chartH / 2);
  const zeroY = padTop + chartH / 2;

  const normalBandDist = metric === 'temperature' ? 1.0 : metric === 'pressure' ? 2.0 : 1.5;
  const normalUpperY = getY(normalBandDist);
  const normalLowerY = getY(-normalBandDist);

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none relative">
      {/* Header & Metric Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              Atmospheric Anomaly Departure Engine
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              {locationName}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Deviations from 30-year climatological normal baseline (Actual &minus; Climatology).
          </p>
        </div>

        {/* Metric Selector Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
          {[
            { id: 'rainfall', label: 'Rainfall (mm/h)' },
            { id: 'temperature', label: 'Temperature (°C)' },
            { id: 'pressure', label: 'Pressure (hPa)' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMetric(m.id)}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                metric === m.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Anomaly Bars & Normal Envelope */}
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[580px] overflow-visible">
          {/* Normal Range Band Envelope */}
          <rect
            x={padLeft}
            y={normalUpperY}
            width={chartW}
            height={normalLowerY - normalUpperY}
            fill="rgba(56, 189, 248, 0.07)"
            stroke="rgba(56, 189, 248, 0.2)"
            strokeDasharray="4 2"
          />
          <text
            x={width - padRight - 6}
            y={normalUpperY + 12}
            fill="#38bdf8"
            fontSize="8.5"
            fontFamily="sans-serif"
            fontWeight="bold"
            textAnchor="end"
            opacity="0.8"
          >
            NORMAL CLIMATOLOGICAL ENVELOPE (±{normalBandDist})
          </text>

          {/* Zero Baseline Reference Line */}
          <line
            x1={padLeft}
            y1={zeroY}
            x2={width - padRight}
            y2={zeroY}
            stroke="#ffffff"
            strokeWidth="1.5"
            opacity="0.75"
          />
          <text
            x={padLeft - 8}
            y={zeroY + 3.5}
            fill="#ffffff"
            fontSize="10"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="end"
          >
            0.0
          </text>

          {/* Upper & Lower Bound Reference Grid */}
          <line
            x1={padLeft}
            y1={padTop}
            x2={width - padRight}
            y2={padTop}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeDasharray="3 3"
          />
          <text
            x={padLeft - 8}
            y={padTop + 4}
            fill="#94a3b8"
            fontSize="9"
            fontFamily="monospace"
            textAnchor="end"
          >
            +{maxAbsDelta.toFixed(1)}
          </text>

          <line
            x1={padLeft}
            y1={height - padBottom}
            x2={width - padRight}
            y2={height - padBottom}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeDasharray="3 3"
          />
          <text
            x={padLeft - 8}
            y={height - padBottom + 4}
            fill="#94a3b8"
            fontSize="9"
            fontFamily="monospace"
            textAnchor="end"
          >
            -{maxAbsDelta.toFixed(1)}
          </text>

          {/* Diverging Anomaly Bars */}
          {anomalies.map((a, idx) => {
            const x = getX(idx);
            const barW = Math.max(12, Math.min(26, chartW / (anomalies.length * 1.5)));
            const isPos = a.delta >= 0;
            const barY = isPos ? getY(a.delta) : zeroY;
            const barH = Math.max(2, Math.abs(getY(a.delta) - zeroY));

            const isSevere = Math.abs(a.delta) > normalBandDist * 2;
            const isElevated = Math.abs(a.delta) > normalBandDist;

            const barFill = isPos
              ? isSevere
                ? '#f43f5e'
                : isElevated
                ? '#fb923c'
                : '#38bdf8'
              : isSevere
              ? '#0284c7'
              : isElevated
              ? '#0ea5e9'
              : '#64748b';

            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredAnomaly({ ...a, idx, x, y: barY })}
                onMouseLeave={() => setHoveredAnomaly(null)}
              >
                <rect
                  x={x - barW / 2}
                  y={barY}
                  width={barW}
                  height={barH}
                  rx="3"
                  fill={barFill}
                  opacity={hoveredAnomaly?.idx === idx ? 1.0 : 0.85}
                  className="transition-all duration-150"
                />

                {/* X Axis Date Label */}
                <text
                  x={x}
                  y={height - padBottom + 16}
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontFamily="sans-serif"
                  textAnchor="middle"
                >
                  {a.date}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredAnomaly && (
          <div
            className="absolute pointer-events-none z-30 bg-[#071022]/95 border border-[#d4dcff]/40 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs text-white min-w-[190px]"
            style={{
              left: `${Math.min(chartW - 60, Math.max(10, (hoveredAnomaly.x / width) * 100))}%`,
              top: '15px',
            }}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-1 mb-1 font-bold text-[#d4dcff]">
              <span>{hoveredAnomaly.date}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 uppercase">
                {hoveredAnomaly.severity}
              </span>
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Observed Value:</span>
                <span className="font-bold text-white">{hoveredAnomaly.actual} {hoveredAnomaly.unit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Climatological Normal:</span>
                <span className="text-slate-300">{hoveredAnomaly.baseline} {hoveredAnomaly.unit}</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1 font-bold">
                <span className="text-slate-200">Anomaly Departure:</span>
                <span className={hoveredAnomaly.delta >= 0 ? 'text-rose-400' : 'text-sky-400'}>
                  {hoveredAnomaly.delta >= 0 ? '+' : ''}{hoveredAnomaly.delta} {hoveredAnomaly.unit}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Anomaly Severity Counters & Legend */}
      <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 font-medium">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-500" />
            <span className="text-slate-300">Extreme Positive Departure ({activeSeverities.extreme || 0})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-400" />
            <span className="text-slate-300">Moderate Departure ({activeSeverities.moderate || 0})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-sky-400" />
            <span className="text-slate-300">Nominal Envelope</span>
          </div>
        </div>

        <div className="text-[11px] font-mono text-slate-400">
          Baseline: 1991–2020 IMD Climatological Standard Normals
        </div>
      </div>
    </div>
  );
}
