import { useState } from 'react';
import { getDistributionData } from '../../services/analysisService';

export function WeatherDistribution({ locationId = 'ahmedabad', locationName = 'Selected Region' }) {
  const [selectedVar, setSelectedVar] = useState('rainfall');
  const dist = getDistributionData(selectedVar, locationId);

  const width = 760;
  const height = 240;
  const padLeft = 40;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 45;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const histogram = dist?.histogram || [];
  const counts = histogram.map((h) => h.count || 0);
  const maxCount = Math.max(1, ...(counts.length > 0 ? counts : [1]));
  const histLen = Math.max(1, histogram.length);
  const getX = (idx) => padLeft + (idx / histLen) * chartW;
  const barW = Math.max(8, chartW / histLen - 8);

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none relative">
      {/* Header & Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-pink-400" />
              Climatological Distribution & Percentile Rank
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              {locationName}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Statistical distribution of events relative to 30-year historical percentiles and outlier boundaries.
          </p>
        </div>

        {/* Variable Switcher */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
          {[
            { id: 'rainfall', label: 'Rainfall' },
            { id: 'temperature', label: 'Temperature' },
            { id: 'wind', label: 'Wind Speed' },
          ].map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedVar(v.id)}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                selectedVar === v.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Percentiles Summary Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 mb-4 text-xs font-mono">
        <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase font-bold">Current Obs</span>
          <span className="text-sm font-extrabold text-cyan-300 mt-0.5">
            {dist.current} {dist.unit}
          </span>
        </div>
        <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase font-bold">Percentile Rank</span>
          <span className="text-sm font-extrabold text-rose-400 mt-0.5">
            {dist.percentileRank}th %ile
          </span>
        </div>
        <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase font-bold">Median (50th)</span>
          <span className="text-sm font-extrabold text-slate-200 mt-0.5">
            {dist.median} {dist.unit}
          </span>
        </div>
        <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase font-bold">Mean Average</span>
          <span className="text-sm font-extrabold text-slate-200 mt-0.5">
            {dist.mean} {dist.unit}
          </span>
        </div>
        <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase font-bold">25th - 75th IQR</span>
          <span className="text-sm font-extrabold text-slate-300 mt-0.5">
            {dist.p25} – {dist.p75}
          </span>
        </div>
        <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase font-bold">90th %ile Outlier</span>
          <span className="text-sm font-extrabold text-amber-300 mt-0.5">
            &gt; {dist.p90} {dist.unit}
          </span>
        </div>
      </div>

      {/* SVG Histogram */}
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[560px] overflow-visible">
          {/* Horizontal Grid */}
          {[0, 0.5, 1.0].map((frac, idx) => {
            const y = padTop + chartH - frac * chartH;
            return (
              <line
                key={idx}
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeDasharray="3 3"
              />
            );
          })}

          {/* Histogram Bars */}
          {dist.histogram.map((bin, idx) => {
            const x = getX(idx);
            const barH = (bin.count / maxCount) * chartH;
            const y = padTop + chartH - barH;
            const isCurrent = bin.isCurrent;

            return (
              <g key={idx} className="cursor-pointer group">
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx="4"
                  fill={isCurrent ? '#f43f5e' : '#38bdf8'}
                  opacity={isCurrent ? 0.95 : 0.65}
                  className="transition-all duration-150 group-hover:opacity-100"
                />

                {/* Count Badge on Top */}
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  fill={isCurrent ? '#f43f5e' : '#94a3b8'}
                  fontSize="9.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {bin.count}
                </text>

                {/* Current Marker Pin */}
                {isCurrent && (
                  <g>
                    <polygon
                      points={`${x + barW / 2 - 5},${y - 14} ${x + barW / 2 + 5},${y - 14} ${x + barW / 2},${y - 8}`}
                      fill="#f43f5e"
                    />
                    <text
                      x={x + barW / 2}
                      y={y - 20}
                      fill="#f43f5e"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                      textAnchor="middle"
                    >
                      CURRENT
                    </text>
                  </g>
                )}

                {/* X Axis Bin Label */}
                <text
                  x={x + barW / 2}
                  y={height - padBottom + 16}
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {bin.bin}
                </text>
                <text
                  x={x + barW / 2}
                  y={height - padBottom + 28}
                  fill="#64748b"
                  fontSize="8"
                  fontFamily="sans-serif"
                  textAnchor="middle"
                >
                  {bin.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Commentary Box */}
      <div className="mt-3 p-3 rounded-xl bg-blue-950/60 border border-blue-800/40 text-xs text-slate-200 flex items-center justify-between">
        <span>{dist.commentary}</span>
        <span className="font-mono text-[10px] text-[#d4dcff] shrink-0 font-bold">
          {dist.isOutlier ? '⚠️ STATISTICAL OUTLIER' : 'NORMAL ENVELOPE'}
        </span>
      </div>
    </div>
  );
}
