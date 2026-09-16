import { useState, useMemo } from 'react';

export function HistoricalForecastChart({
  data,
  horizonHours = 72,
  onSelectHorizon,
  locationName = 'Selected Region',
}) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [movingAvgType, setMovingAvgType] = useState('none'); // 'none' | '7d' | '14d'

  const series = useMemo(() => data?.series || [], [data?.series]);

  // Compute Moving Average
  const computedSeries = useMemo(() => {
    if (!series || series.length === 0 || movingAvgType === 'none') return series || [];
    const windowSize = movingAvgType === '7d' ? 4 : 8; // steps of 12h

    return series.map((pt, idx) => {
      const start = Math.max(0, idx - windowSize + 1);
      const slice = series.slice(start, idx + 1);
      const vals = slice.map((s) => s.observed ?? s.forecast ?? s.baseline);
      const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      return {
        ...pt,
        movingAvg: Number(avg.toFixed(1)),
      };
    });
  }, [series, movingAvgType]);

  const maxVal = useMemo(() => {
    if (!computedSeries || computedSeries.length === 0) return 20;
    const allVals = computedSeries.flatMap((s) => [
      s.observed,
      s.forecast,
      s.forecastUpper,
      s.baseline,
      s.movingAvg,
    ]).filter((v) => v != null);
    if (allVals.length === 0) return 20;
    return Math.max(12, Math.ceil(Math.max(...allVals) * 1.15));
  }, [computedSeries]);

  if (!data || !series || series.length === 0) {
    return (
      <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-6 shadow-xl mb-6 flex items-center justify-center min-h-[260px]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-2" />
          <span className="text-xs text-slate-400 font-mono">Loading continuous atmospheric observations & forecast...</span>
        </div>
      </div>
    );
  }

  // Chart dimensions & scaling
  const width = 860;
  const height = 320;
  const padLeft = 50;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Coordinate mappers
  const getX = (idx) => padLeft + (idx / Math.max(1, computedSeries.length - 1)) * chartW;
  const getY = (val) => padTop + chartH - (val / maxVal) * chartH;

  // Find index of 'now' point
  const nowIdx = computedSeries.findIndex((s) => s.type === 'now');

  // SVG Paths
  // 1. Baseline curve
  const baselinePath = computedSeries.reduce((acc, pt, idx) => {
    const x = getX(idx);
    const y = getY(pt.baseline);
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }, '');

  // 2. Observed path (0 to nowIdx)
  const observedSlice = computedSeries.slice(0, nowIdx >= 0 ? nowIdx + 1 : 0);
  const observedPath = observedSlice.reduce((acc, pt, idx) => {
    const x = getX(idx);
    const y = getY(pt.observed ?? pt.baseline);
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }, '');

  // 3. Forecast path (nowIdx to end)
  const forecastSlice = nowIdx >= 0 ? computedSeries.slice(nowIdx) : [];
  const forecastPath = forecastSlice.reduce((acc, pt, idx) => {
    const origIdx = nowIdx + idx;
    const x = getX(origIdx);
    const y = getY(pt.forecast ?? pt.observed ?? pt.baseline);
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }, '');

  // 4. Uncertainty Region polygon
  let uncertaintyPolygon = '';
  if (forecastSlice.length > 1) {
    const upperPoints = forecastSlice.map((pt, idx) => {
      const origIdx = nowIdx + idx;
      return `${getX(origIdx).toFixed(1)},${getY(pt.forecastUpper ?? pt.forecast ?? 0).toFixed(1)}`;
    });
    const lowerPoints = [...forecastSlice].reverse().map((pt, idx) => {
      const origIdx = nowIdx + (forecastSlice.length - 1 - idx);
      return `${getX(origIdx).toFixed(1)},${getY(pt.forecastLower ?? pt.forecast ?? 0).toFixed(1)}`;
    });
    uncertaintyPolygon = `M ${upperPoints.join(' L ')} L ${lowerPoints.join(' L ')} Z`;
  }

  // 5. Moving Average path
  let movingAvgPath = '';
  if (movingAvgType !== 'none') {
    movingAvgPath = computedSeries.reduce((acc, pt, idx) => {
      if (pt.movingAvg == null) return acc;
      const x = getX(idx);
      const y = getY(pt.movingAvg);
      return `${acc} ${acc === '' ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }, '');
  }

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none relative">
      {/* Card Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Historical Observations vs Forecast Horizon
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              {locationName}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Continuous atmospheric time-series combining ground telemetry, satellite retrievals, and ensemble forecasts.
          </p>
        </div>

        {/* Toggles: Moving Average & Horizon */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Moving Average Selector */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-[11px]">
            <span className="text-slate-400 px-1 font-bold">MA:</span>
            {['none', '7d', '14d'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setMovingAvgType(type)}
                className={`px-2 py-0.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  movingAvgType === type
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {type === 'none' ? 'Off' : type}
              </button>
            ))}
          </div>

          {/* Forecast Horizon Selector */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-[11px]">
            <span className="text-slate-400 px-1 font-bold">Horizon:</span>
            {[24, 48, 72, 168].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onSelectHorizon(h)}
                className={`px-2 py-0.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  horizonHours === h
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {h === 168 ? '7d' : `${h}h`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Chart Viewport */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[620px] overflow-visible"
        >
          <defs>
            {/* Uncertainty gradient */}
            <linearGradient id="uncertaintyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.08" />
            </linearGradient>

            {/* Observed gradient under curve */}
            <linearGradient id="observedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Labels */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
            const val = Math.round(maxVal * frac);
            const y = getY(val);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  fill="#94a3b8"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Uncertainty Band (Confidence Interval) */}
          {uncertaintyPolygon && (
            <path
              d={uncertaintyPolygon}
              fill="url(#uncertaintyGrad)"
              stroke="rgba(129, 140, 248, 0.4)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}

          {/* Historical Climatological Baseline curve */}
          <path
            d={baselinePath}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.65"
          />

          {/* Observed Series Line */}
          {observedPath && (
            <path
              d={observedPath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}

          {/* Forecast Series Line */}
          {forecastPath && (
            <path
              d={forecastPath}
              fill="none"
              stroke="#a78bfa"
              strokeWidth="2.5"
              strokeDasharray="5 3"
              strokeLinecap="round"
            />
          )}

          {/* Moving Average Line if enabled */}
          {movingAvgPath && (
            <path
              d={movingAvgPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}

          {/* NOW Vertical Marker Line */}
          {nowIdx >= 0 && (
            <g>
              <line
                x1={getX(nowIdx)}
                y1={padTop - 8}
                x2={getX(nowIdx)}
                y2={height - padBottom}
                stroke="#d4dcff"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
              <rect
                x={getX(nowIdx) - 22}
                y={padTop - 18}
                width="44"
                height="16"
                rx="4"
                fill="#d4dcff"
              />
              <text
                x={getX(nowIdx)}
                y={padTop - 6}
                fill="#0b1226"
                fontSize="9"
                fontWeight="900"
                fontFamily="sans-serif"
                textAnchor="middle"
              >
                NOW
              </text>
            </g>
          )}

          {/* Interactive Observation Data Dots */}
          {computedSeries.map((pt, idx) => {
            const x = getX(idx);
            const val = pt.observed ?? pt.forecast ?? pt.baseline;
            const y = getY(val);
            const isHovered = hoveredPoint?.idx === idx;
            const isObs = pt.observed != null;

            return (
              <g key={idx}>
                {/* Hit area */}
                <circle
                  cx={x}
                  cy={y}
                  r="12"
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredPoint({ ...pt, idx, x, y, val })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                {/* Visual Dot */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? '5.5' : isObs ? '3' : '3'}
                  fill={isObs ? '#38bdf8' : '#a78bfa'}
                  stroke="#081226"
                  strokeWidth="1.5"
                  className="pointer-events-none transition-all duration-150"
                />
              </g>
            );
          })}

          {/* X-Axis Timeline Labels */}
          {computedSeries.map((pt, idx) => {
            // Render every 3rd or 4th label to prevent overcrowding
            if (idx % 3 !== 0 && idx !== nowIdx && idx !== computedSeries.length - 1) return null;
            const x = getX(idx);
            return (
              <text
                key={`lbl-${idx}`}
                x={x}
                y={height - padBottom + 18}
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

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="absolute pointer-events-none z-30 bg-[#071022]/95 border border-[#d4dcff]/40 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs text-white min-w-[200px]"
            style={{
              left: `${Math.min(chartW - 80, Math.max(10, (hoveredPoint.x / width) * 100))}%`,
              top: '15px',
            }}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-1.5 mb-1.5 font-bold text-[#d4dcff]">
              <span>{hoveredPoint.label}</span>
              <span className="uppercase text-[9px] px-1.5 py-0.5 rounded bg-blue-900/60">
                {hoveredPoint.type}
              </span>
            </div>

            <div className="space-y-1 font-mono text-[11px]">
              {hoveredPoint.observed != null && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Observed Rain:</span>
                  <span className="font-bold text-sky-400">{hoveredPoint.observed} mm/h</span>
                </div>
              )}
              {hoveredPoint.forecast != null && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Forecast Rain:</span>
                  <span className="font-bold text-indigo-300">{hoveredPoint.forecast} mm/h</span>
                </div>
              )}
              {hoveredPoint.forecastUpper != null && (
                <div className="flex justify-between text-[10px] text-indigo-200">
                  <span className="text-slate-400">Confidence Band:</span>
                  <span>{hoveredPoint.forecastLower} - {hoveredPoint.forecastUpper} mm</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Normal Baseline:</span>
                <span className="text-slate-300">{hoveredPoint.baseline} mm/h</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1 font-bold">
                <span className="text-slate-300">Anomaly Deviation:</span>
                <span className={hoveredPoint.deviation >= 0 ? 'text-rose-400' : 'text-emerald-400'}>
                  {hoveredPoint.deviation >= 0 ? '+' : ''}{hoveredPoint.deviation} mm/h
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend & Unit Footer */}
      <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 font-medium">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#38bdf8] rounded" />
            <span className="text-slate-300">Observed (Ground/Satellite)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#a78bfa] border-b border-dashed border-[#a78bfa]" />
            <span className="text-slate-300">Ensemble Forecast</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 bg-[#818cf8]/30 rounded-xs border border-indigo-400/40" />
            <span>Uncertainty Region (±1σ)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-slate-400 border-b border-dotted" />
            <span>Historical Normal Baseline</span>
          </div>
          {movingAvgType !== 'none' && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-400" />
              <span className="text-amber-300">{movingAvgType} Moving Avg</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <span>Units: mm/hr precipitation</span>
          <span>&bull;</span>
          <span>Source: {data?.summary?.source || 'IMD + ISRO Multi-Sensor'}</span>
        </div>
      </div>
    </div>
  );
}
