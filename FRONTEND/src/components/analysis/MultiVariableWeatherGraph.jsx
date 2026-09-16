import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function MultiVariableWeatherGraph({ seriesData = [], locationName = 'Selected Region' }) {
  const [activeVars, setActiveVars] = useState({
    rainfall: true,
    temperature: true,
    humidity: true,
    pressure: false,
    wind: true,
  });

  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!seriesData || seriesData.length === 0) {
    return (
      <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-6 shadow-xl mb-6 flex items-center justify-center min-h-[220px]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mx-auto mb-2" />
          <span className="text-xs text-slate-400 font-mono">Loading synchronized multi-variable trace...</span>
        </div>
      </div>
    );
  }

  const variables = [
    { id: 'rainfall', label: 'Rainfall', unit: 'mm/h', color: '#38bdf8', min: 0, max: 25 },
    { id: 'temperature', label: 'Temperature', unit: '°C', color: '#f59e0b', min: 15, max: 45 },
    { id: 'humidity', label: 'Humidity', unit: '%', color: '#10b981', min: 30, max: 100 },
    { id: 'pressure', label: 'Pressure', unit: 'hPa', color: '#a855f7', min: 990, max: 1020 },
    { id: 'wind', label: 'Wind Speed', unit: 'km/h', color: '#ec4899', min: 0, max: 60 },
  ];

  const toggleVar = (varId) => {
    setActiveVars((prev) => ({ ...prev, [varId]: !prev[varId] }));
  };

  const width = 840;
  const height = 300;
  const padLeft = 45;
  const padRight = 45;
  const padTop = 25;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const getX = (idx) => padLeft + (idx / Math.max(1, seriesData.length - 1)) * chartW;

  // Normalized scaling function for each variable (0 to 1) so all fit on the synchronized chart
  const getNormalizedY = (val, min, max) => {
    const clamped = Math.max(min, Math.min(max, val));
    const fraction = (clamped - min) / (max - min || 1);
    return padTop + chartH - fraction * chartH;
  };

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none relative">
      {/* Header & Variable Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Synchronized Multi-Variable Atmospheric Trace
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              {locationName}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Cross-variable atmospheric coupling with independent normalized scales & synchronized crosshair.
          </p>
        </div>

        {/* Variable Toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {variables.map((v) => {
            const isActive = activeVars[v.id];
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => toggleVar(v.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-900/50 text-slate-500 border-slate-800 hover:text-slate-300'
                }`}
                style={{ borderColor: isActive ? `${v.color}80` : undefined }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: isActive ? v.color : '#64748b' }}
                />
                <span>{v.label}</span>
                {isActive ? <Eye className="w-3 h-3 opacity-60" /> : <EyeOff className="w-3 h-3 opacity-40" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Synchronized SVG Chart */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[620px] overflow-visible"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {/* Synchronized Gridlines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
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

          {/* Left Axis: Precipitation & Wind Scale */}
          <text x={padLeft - 6} y={padTop + 4} fill="#38bdf8" fontSize="9" fontFamily="monospace" textAnchor="end">
            25 mm/h
          </text>
          <text x={padLeft - 6} y={padTop + chartH + 4} fill="#38bdf8" fontSize="9" fontFamily="monospace" textAnchor="end">
            0 mm/h
          </text>

          {/* Right Axis: Temperature Scale */}
          <text x={width - padRight + 6} y={padTop + 4} fill="#f59e0b" fontSize="9" fontFamily="monospace" textAnchor="start">
            45°C
          </text>
          <text x={width - padRight + 6} y={padTop + chartH + 4} fill="#f59e0b" fontSize="9" fontFamily="monospace" textAnchor="start">
            15°C
          </text>

          {/* Render Active Variable Lines */}
          {variables.map((v) => {
            if (!activeVars[v.id]) return null;

            const pathStr = seriesData.reduce((acc, pt, idx) => {
              const rawVal =
                v.id === 'rainfall'
                  ? (pt.observed ?? pt.forecast ?? pt.baseline)
                  : pt[v.id];

              if (rawVal == null) return acc;
              const x = getX(idx);
              const y = getNormalizedY(rawVal, v.min, v.max);
              return `${acc} ${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
            }, '');

            return (
              <path
                key={v.id}
                d={pathStr}
                fill="none"
                stroke={v.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
            );
          })}

          {/* Hover Crosshair Cursor */}
          {hoveredIdx != null && (
            <g>
              <line
                x1={getX(hoveredIdx)}
                y1={padTop}
                x2={getX(hoveredIdx)}
                y2={height - padBottom}
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeDasharray="4 2"
                opacity="0.75"
              />
            </g>
          )}

          {/* Interactive Invisible Columns for hovering */}
          {seriesData.map((pt, idx) => {
            const x = getX(idx);
            return (
              <rect
                key={idx}
                x={x - chartW / Math.max(1, seriesData.length * 2)}
                y={padTop}
                width={chartW / Math.max(1, seriesData.length)}
                height={chartH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoveredIdx(idx)}
              />
            );
          })}

          {/* X Axis Timeline Labels */}
          {seriesData.map((pt, idx) => {
            if (idx % 3 !== 0 && idx !== seriesData.length - 1) return null;
            return (
              <text
                key={idx}
                x={getX(idx)}
                y={height - padBottom + 16}
                fill="#94a3b8"
                fontSize="9.5"
                fontFamily="sans-serif"
                textAnchor="middle"
              >
                {typeof pt.label === 'string' ? pt.label.split(',')[0] : (pt.label || '')}
              </text>
            );
          })}
        </svg>

        {/* Hover Crosshair Multi-Value Card */}
        {hoveredIdx != null && seriesData[hoveredIdx] && (
          <div
            className="absolute pointer-events-none z-30 bg-[#071022]/95 border border-[#d4dcff]/40 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs text-white min-w-[210px]"
            style={{
              left: `${Math.min(chartW - 60, Math.max(10, (getX(hoveredIdx) / width) * 100))}%`,
              top: '15px',
            }}
          >
            <div className="font-bold text-[#d4dcff] border-b border-white/15 pb-1 mb-1.5">
              {seriesData[hoveredIdx].label}
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              {variables.map((v) => {
                if (!activeVars[v.id]) return null;
                const val =
                  v.id === 'rainfall'
                    ? (seriesData[hoveredIdx].observed ?? seriesData[hoveredIdx].forecast ?? seriesData[hoveredIdx].baseline)
                    : seriesData[hoveredIdx][v.id];

                return (
                  <div key={v.id} className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                      <span>{v.label}:</span>
                    </span>
                    <span className="font-bold" style={{ color: v.color }}>
                      {val != null ? `${val} ${v.unit}` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 pt-2 border-t border-white/10 text-[10px] text-slate-500 font-medium">
        *Multi-axis normalization maps independent physical units onto a synchronized temporal dimension.
      </div>
    </div>
  );
}
