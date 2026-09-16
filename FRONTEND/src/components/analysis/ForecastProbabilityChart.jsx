import { useState } from 'react';

export function ForecastProbabilityChart({ probData, locationName = 'Selected Region' }) {
  const [activeHazard, setActiveHazard] = useState('heavyRain');

  const { timeline = [], currentRisks = [], thresholds = { watch: 60, normal: 30 } } = probData || {};

  if (!probData || !timeline || timeline.length === 0) {
    return (
      <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-6 shadow-xl mb-6 flex items-center justify-center min-h-[220px]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin mx-auto mb-2" />
          <span className="text-xs text-slate-400 font-mono">Loading hazard exceedance probabilities...</span>
        </div>
      </div>
    );
  }

  const hazardOptions = [
    { id: 'heavyRain', label: 'Heavy Rain (>64.5 mm/h)', color: '#38bdf8' },
    { id: 'extremeRain', label: 'Extreme Rain (>115 mm/h)', color: '#818cf8' },
    { id: 'lightning', label: 'Convective Lightning', color: '#f59e0b' },
    { id: 'highWind', label: 'Wind Gusts (>50 km/h)', color: '#ec4899' },
    { id: 'heatwave', label: 'Heatwave Departure', color: '#f43f5e' },
  ];

  const activeHazardDef = hazardOptions.find((h) => h.id === activeHazard) || hazardOptions[0];

  const width = 800;
  const height = 260;
  const padLeft = 45;
  const padRight = 25;
  const padTop = 25;
  const padBottom = 35;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const getX = (idx) => padLeft + (idx / Math.max(1, timeline.length - 1)) * chartW;
  const getY = (prob) => padTop + chartH - (prob / 100) * chartH;

  // Build polygon under curve
  const points = timeline.map((t, idx) => ({
    x: getX(idx),
    y: getY(t[activeHazard] || 0),
    val: t[activeHazard] || 0,
    hour: t.hour,
  }));

  const lastX = points.length > 0 ? points[points.length - 1].x.toFixed(1) : chartW.toFixed(1);
  const firstX = points.length > 0 ? points[0].x.toFixed(1) : padLeft.toFixed(1);
  const curveLine = points.reduce((acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
  const areaPoly = `${curveLine} L ${lastX} ${(padTop + chartH).toFixed(1)} L ${firstX} ${(padTop + chartH).toFixed(1)} Z`;

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none">
      {/* Header & Hazard Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Atmospheric Hazard Probability Curves
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              {locationName}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Calibrated ensemble probabilities for exceedance of severe meteorological thresholds.
          </p>
        </div>

        {/* Hazard Metric Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          {hazardOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setActiveHazard(opt.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeHazard === opt.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt.label.split(' ')[0]} {opt.label.split(' ')[1]}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Probability Curve */}
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[580px] overflow-visible">
          <defs>
            <linearGradient id={`probGrad-${activeHazard}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={activeHazardDef.color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={activeHazardDef.color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Gridlines & Probability Percentages */}
          {[0, 20, 40, 60, 80, 100].map((pVal) => {
            const y = getY(pVal);
            return (
              <g key={pVal}>
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
                  y={y + 3.5}
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  {pVal}%
                </text>
              </g>
            );
          })}

          {/* Threshold Zone Bands */}
          {/* Warning Zone (>60%) */}
          <rect
            x={padLeft}
            y={getY(100)}
            width={chartW}
            height={getY(thresholds.watch) - getY(100)}
            fill="rgba(244, 63, 94, 0.06)"
          />
          {/* Watch Zone (30-60%) */}
          <rect
            x={padLeft}
            y={getY(thresholds.watch)}
            width={chartW}
            height={getY(thresholds.normal) - getY(thresholds.watch)}
            fill="rgba(245, 158, 11, 0.04)"
          />

          {/* Threshold Marker Lines */}
          <line
            x1={padLeft}
            y1={getY(thresholds.watch)}
            x2={width - padRight}
            y2={getY(thresholds.watch)}
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.8"
          />
          <text
            x={width - padRight - 5}
            y={getY(thresholds.watch) - 4}
            fill="#f59e0b"
            fontSize="9"
            fontFamily="sans-serif"
            fontWeight="bold"
            textAnchor="end"
          >
            WATCH THRESHOLD (60%)
          </text>

          <line
            x1={padLeft}
            y1={getY(thresholds.normal)}
            x2={width - padRight}
            y2={getY(thresholds.normal)}
            stroke="#38bdf8"
            strokeWidth="1.2"
            strokeDasharray="4 3"
            opacity="0.6"
          />
          <text
            x={width - padRight - 5}
            y={getY(thresholds.normal) - 4}
            fill="#38bdf8"
            fontSize="9"
            fontFamily="sans-serif"
            fontWeight="bold"
            textAnchor="end"
          >
            ADVISORY THRESHOLD (30%)
          </text>

          {/* Area polygon fill */}
          <path d={areaPoly} fill={`url(#probGrad-${activeHazard})`} />

          {/* Line stroke */}
          <path
            d={curveLine}
            fill="none"
            stroke={activeHazardDef.color}
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Interactive Value Dots */}
          {points.map((pt, idx) => (
            <g key={idx} className="group cursor-pointer">
              <circle
                cx={pt.x}
                cy={pt.y}
                r="4.5"
                fill={activeHazardDef.color}
                stroke="#081226"
                strokeWidth="2"
              />
              <text
                x={pt.x}
                y={pt.y - 8}
                fill="#ffffff"
                fontSize="10"
                fontFamily="monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                {pt.val}%
              </text>
              <text
                x={pt.x}
                y={height - padBottom + 16}
                fill="#94a3b8"
                fontSize="10"
                fontFamily="sans-serif"
                fontWeight="bold"
                textAnchor="middle"
              >
                {pt.hour}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Threshold Legend & Current Exceedance Summary */}
      <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {currentRisks.map((risk, idx) => (
          <div
            key={idx}
            className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between"
          >
            <span className="text-[10px] text-slate-400 font-semibold truncate" title={risk.hazard}>
              {risk.hazard}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-extrabold text-white font-mono">{risk.probability}%</span>
              <span
                className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase border ${
                  risk.status === 'Warning'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : risk.status === 'Watch'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}
              >
                {risk.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-slate-500 font-medium">
        *Threshold markers represent meteorological watch levels derived from multi-model ensemble consensus.
      </div>
    </div>
  );
}
