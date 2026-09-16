import { getForecastPerformanceMetrics } from '../../services/analysisService';

export function ForecastPerformance() {
  const perf = getForecastPerformanceMetrics();

  const width = 640;
  const height = 180;
  const padLeft = 45;
  const padRight = 25;
  const padTop = 20;
  const padBottom = 35;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxError = 10;
  const getX = (idx) => padLeft + (idx / (perf.errorByHorizon.length - 1)) * chartW;
  const getY = (val) => padTop + chartH - (val / maxError) * chartH;

  const maePath = perf.errorByHorizon.reduce(
    (acc, pt, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(pt.mae).toFixed(1)}`,
    ''
  );

  const rmsePath = perf.errorByHorizon.reduce(
    (acc, pt, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(pt.rmse).toFixed(1)}`,
    ''
  );

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Numerical Model Verification & Forecast Skill
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              {perf.model}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Standard WMO quantitative precipitation verification metrics evaluated against ground observation networks.
          </p>
        </div>

        <div className="text-[11px] font-mono text-slate-400">
          {perf.evaluationWindow}
        </div>
      </div>

      {/* 5 Core Verification Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {Object.entries(perf.metrics).map(([key, item]) => (
          <div
            key={key}
            className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between"
          >
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {item.label}
            </span>
            <div className="my-1">
              <span className="text-base sm:text-lg font-black text-white font-mono">
                {item.value}
              </span>
            </div>
            <span className="text-[9px] font-mono font-bold text-emerald-400">
              &bull; {item.rating}
            </span>
          </div>
        ))}
      </div>

      {/* Error Growth by Horizon SVG Chart */}
      <div className="mt-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-300">
            Forecast Error Growth over Lead Time (Degradation Curve)
          </span>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <span className="w-2.5 h-0.5 bg-cyan-400" /> MAE (mm)
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-2.5 h-0.5 bg-rose-400" /> RMSE (mm)
            </span>
          </div>
        </div>

        <div className="relative w-full overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[500px] overflow-visible">
            {/* Grid */}
            {[0, 2.5, 5.0, 7.5, 10.0].map((val) => {
              const y = getY(val);
              return (
                <g key={val}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padLeft - 6}
                    y={y + 3.5}
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {val.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* RMSE Line */}
            <path d={rmsePath} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" />

            {/* MAE Line */}
            <path d={maePath} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />

            {/* Data Points */}
            {perf.errorByHorizon.map((pt, idx) => {
              const x = getX(idx);
              return (
                <g key={idx}>
                  {/* MAE Point */}
                  <circle cx={x} cy={getY(pt.mae)} r="4" fill="#38bdf8" stroke="#081226" strokeWidth="1.5" />
                  <text
                    x={x}
                    y={getY(pt.mae) - 7}
                    fill="#38bdf8"
                    fontSize="9.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {pt.mae}
                  </text>

                  {/* RMSE Point */}
                  <circle cx={x} cy={getY(pt.rmse)} r="4" fill="#f43f5e" stroke="#081226" strokeWidth="1.5" />
                  <text
                    x={x}
                    y={getY(pt.rmse) - 7}
                    fill="#f43f5e"
                    fontSize="9.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {pt.rmse}
                  </text>

                  {/* X Axis Label */}
                  <text
                    x={x}
                    y={height - padBottom + 16}
                    fill="#94a3b8"
                    fontSize="9.5"
                    fontFamily="sans-serif"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {pt.horizon}
                  </text>
                  <text
                    x={x}
                    y={height - padBottom + 28}
                    fill="#10b981"
                    fontSize="8.5"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    Skill: {pt.skill}%
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="mt-2.5 text-[10px] text-slate-500 font-medium">
        *{perf.note}
      </div>
    </div>
  );
}
