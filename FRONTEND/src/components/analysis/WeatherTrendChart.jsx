import { useState, useMemo, useRef, useCallback } from 'react';
import { CloudRain, Thermometer, Droplets, Wind, Info, Layers, Maximize2 } from 'lucide-react';
import { formatMetricValue } from '../../services/analysisService';

export function WeatherTrendChart({
  timeline = [],
  isLoading = false,
  activeMetric = 'rainfall',
  onChangeMetric,
  locationName = 'National (India)',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [showPeakLine, setShowPeakLine] = useState(true);
  const containerRef = useRef(null);

  const metricsConfig = [
    { id: 'rainfall', label: 'Rainfall', unit: 'mm/hr', icon: CloudRain, available: true },
    { id: 'temperature', label: 'Temperature', unit: '°C', icon: Thermometer, available: false },
    { id: 'humidity', label: 'Humidity', unit: '%', icon: Droplets, available: false },
    { id: 'wind', label: 'Wind Speed', unit: 'km/h', icon: Wind, available: false },
  ];

  // Validate numeric values and sort chronologically
  const validData = useMemo(() => {
    if (!Array.isArray(timeline)) return [];
    return timeline
      .filter((d) => d && d.observation_time && isFinite(Number(d.avg_precipitation)))
      .map((d) => ({
        ...d,
        avg: Math.max(0, Number(d.avg_precipitation)),
        max: Math.max(0, Number(d.max_precipitation ?? d.avg_precipitation)),
        min: Math.max(0, Number(d.min_precipitation ?? 0)),
        points: Number(d.total_points ?? 0),
        timeLabel: d.observation_ist
          ? d.observation_ist.replace(/ IST$/, '').slice(-11) // e.g. "09-16 18:00"
          : new Date(d.observation_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));
  }, [timeline]);

  // Derived statistics for the rainfall time window
  const stats = useMemo(() => {
    if (validData.length === 0) return { avg: 0, max: 0, min: 0, totalPts: 0 };
    let sum = 0;
    let max = 0;
    let min = Infinity;
    let totalPts = 0;

    validData.forEach((d) => {
      sum += d.avg;
      if (d.max > max) max = d.max;
      if (d.avg < min) min = d.avg;
      totalPts += d.points;
    });

    return {
      avg: sum / validData.length,
      max,
      min: min === Infinity ? 0 : min,
      totalPts,
    };
  }, [validData]);

  // Compute clean SVG chart coordinates
  const chartDims = { width: 800, height: 260, padL: 55, padR: 25, padT: 20, padB: 45 };
  const plotW = chartDims.width - chartDims.padL - chartDims.padR;
  const plotH = chartDims.height - chartDims.padT - chartDims.padB;

  // Compute Y-scale max with clean upper ceiling
  const yMax = useMemo(() => {
    const highest = showPeakLine ? Math.max(stats.max, 1) : Math.max(stats.avg, 1);
    // Round up nicely: e.g. 2.4 -> 3, 14.5 -> 20, 72 -> 80
    if (highest <= 2) return 2.5;
    if (highest <= 5) return 6;
    if (highest <= 10) return 12;
    if (highest <= 25) return 30;
    if (highest <= 50) return 60;
    if (highest <= 100) return 120;
    return Math.ceil(highest * 1.2 / 50) * 50;
  }, [stats.max, stats.avg, showPeakLine]);

  // Compute 4 evenly spaced Y ticks
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

  // Coordinate generators
  const getX = useCallback(
    (index) => {
      if (validData.length <= 1) return chartDims.padL + plotW / 2;
      return chartDims.padL + (index / (validData.length - 1)) * plotW;
    },
    [validData.length, chartDims.padL, plotW]
  );

  const getY = useCallback(
    (val) => {
      const clamped = Math.max(0, Math.min(yMax, val));
      return chartDims.padT + plotH - (clamped / yMax) * plotH;
    },
    [yMax, chartDims.padT, plotH]
  );

  // SVG Line & Area Paths for Average Rainfall
  const avgLinePath = useMemo(() => {
    if (validData.length === 0) return '';
    return validData
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(d.avg).toFixed(1)}`)
      .join(' ');
  }, [validData, getX, getY]);

  const avgAreaPath = useMemo(() => {
    if (validData.length === 0) return '';
    const firstX = getX(0).toFixed(1);
    const lastX = getX(validData.length - 1).toFixed(1);
    const bottomY = (chartDims.padT + plotH).toFixed(1);
    return `${avgLinePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [avgLinePath, validData.length, getX, chartDims.padT, plotH]);

  // SVG Line Path for Peak Intensity
  const peakLinePath = useMemo(() => {
    if (!showPeakLine || validData.length === 0) return '';
    return validData
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(d.max).toFixed(1)}`)
      .join(' ');
  }, [showPeakLine, validData, getX, getY]);

  // Mouse interaction on chart SVG
  const handleMouseMove = useCallback(
    (e) => {
      if (validData.length === 0 || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const svgRelativeX = (relativeX / rect.width) * chartDims.width;

      // Find closest index
      let closestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < validData.length; i++) {
        const x = getX(i);
        const dist = Math.abs(x - svgRelativeX);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      }

      setHoverIndex(closestIdx);
    },
    [validData.length, chartDims.width, getX]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  const activeHoverPoint = hoverIndex !== null && validData[hoverIndex] ? validData[hoverIndex] : null;

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-6 mb-6">
      {/* Top Header: Title, Scope, and Metric Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
              Precipitation Trend Over Time
            </h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Real Backend Series
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Chronological observation interval series for {locationName}. Single primary visualization.
          </p>
        </div>

        {/* Metric Switcher Controls */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 select-none">
          {metricsConfig.map((m) => {
            const Icon = m.icon;
            const isActive = activeMetric === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChangeMetric(m.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Content: Rainfall Chart OR Graceful Data Unavailable Notice */}
      {activeMetric !== 'rainfall' ? (
        <div className="py-14 px-6 text-center flex flex-col items-center justify-center my-4 bg-slate-50/60 border border-dashed border-slate-200 rounded-xl">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <Info className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">
            {metricsConfig.find((m) => m.id === activeMetric)?.label} Data Unavailable in Current Stream
          </h4>
          <p className="text-xs text-slate-500 mt-1.5 max-w-md leading-relaxed">
            The active operational data ingestion pipeline is streaming ISRO MOSDAC INSAT-3DS geostationary precipitation observations. Ground-based AWS/Sounder parameters for {activeMetric} are not present in this telemetry granule.
          </p>
          <button
            type="button"
            onClick={() => onChangeMetric('rainfall')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <CloudRain className="w-3.5 h-3.5" />
            <span>Switch to Rainfall Trend</span>
          </button>
        </div>
      ) : validData.length === 0 ? (
        <div className="py-14 text-center flex flex-col items-center justify-center text-slate-500">
          <CloudRain className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-xs font-medium">No chronological observations recorded for this location.</p>
          <span className="text-[11px] text-slate-400 mt-0.5">Please select another State or verify backend ingestion status.</span>
        </div>
      ) : (
        <div className="pt-4">
          {/* Chart Controls & Legend Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-1 rounded-full bg-blue-600" />
                <span className="font-semibold text-slate-700">Average Rainfall</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPeakLine}
                  onChange={(e) => setShowPeakLine(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 w-3.5 h-3.5 cursor-pointer"
                />
                <span className="w-3.5 h-1 rounded-full bg-amber-500 border-t border-dashed border-amber-600" />
                <span className="text-slate-600 font-medium">Peak Cell Intensity</span>
              </label>
            </div>

            <span className="text-[11px] font-mono text-slate-400">
              {validData.length} observations • {locationName}
            </span>
          </div>

          {/* SVG Chart Drawing Canvas */}
          <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="w-full relative select-none cursor-crosshair"
          >
            <svg
              viewBox={`0 0 ${chartDims.width} ${chartDims.height}`}
              className="w-full h-auto overflow-visible"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="tatvaRainAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid Lines & Y-Axis Labels */}
              {yTicks.map((tickVal) => {
                const y = getY(tickVal);
                return (
                  <g key={tickVal}>
                    <line
                      x1={chartDims.padL}
                      x2={chartDims.width - chartDims.padR}
                      y1={y}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={chartDims.padL - 10}
                      y={y + 4}
                      textAnchor="end"
                      className="text-[11px] font-mono fill-slate-400"
                    >
                      {tickVal.toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {/* Y-Axis Title */}
              <text
                x={14}
                y={chartDims.padT + plotH / 2}
                textAnchor="middle"
                transform={`rotate(-90, 14, ${chartDims.padT + plotH / 2})`}
                className="text-[10px] font-bold fill-slate-400 uppercase tracking-wider"
              >
                Precipitation (mm/hr)
              </text>

              {/* X-Axis Horizontal Baseline */}
              <line
                x1={chartDims.padL}
                x2={chartDims.width - chartDims.padR}
                y1={chartDims.padT + plotH}
                y2={chartDims.padT + plotH}
                stroke="#cbd5e1"
                strokeWidth="1.2"
              />

              {/* Area Fill for Average Rainfall */}
              <path d={avgAreaPath} fill="url(#tatvaRainAreaGradient)" />

              {/* Peak Intensity Line */}
              {showPeakLine && peakLinePath && (
                <path
                  d={peakLinePath}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.8"
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                />
              )}

              {/* Average Rainfall Primary Line */}
              <path
                d={avgLinePath}
                fill="none"
                stroke="#0284c7"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* X-Axis Ticks and Timestamps */}
              {validData.map((d, i) => {
                const total = validData.length;
                // Show approx 5-6 timestamps evenly distributed
                const step = Math.max(1, Math.floor(total / 6));
                const isTick = i === 0 || i === total - 1 || i % step === 0;
                if (!isTick) return null;

                const x = getX(i);
                return (
                  <g key={d.observation_time || i}>
                    <line
                      x1={x}
                      x2={x}
                      y1={chartDims.padT + plotH}
                      y2={chartDims.padT + plotH + 5}
                      stroke="#94a3b8"
                      strokeWidth="1"
                    />
                    <text
                      x={x}
                      y={chartDims.padT + plotH + 18}
                      textAnchor="middle"
                      className="text-[10px] font-mono fill-slate-500 font-medium"
                    >
                      {d.timeLabel}
                    </text>
                  </g>
                );
              })}

              {/* Interactive Hover Crosshair & Data Node */}
              {activeHoverPoint && hoverIndex !== null && (
                <g>
                  {/* Vertical indicator line */}
                  <line
                    x1={getX(hoverIndex)}
                    x2={getX(hoverIndex)}
                    y1={chartDims.padT}
                    y2={chartDims.padT + plotH}
                    stroke="#0284c7"
                    strokeWidth="1.2"
                    strokeDasharray="2 2"
                  />
                  {/* Peak dot */}
                  {showPeakLine && (
                    <circle
                      cx={getX(hoverIndex)}
                      cy={getY(activeHoverPoint.max)}
                      r="4"
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  )}
                  {/* Average dot */}
                  <circle
                    cx={getX(hoverIndex)}
                    cy={getY(activeHoverPoint.avg)}
                    r="5"
                    fill="#0284c7"
                    stroke="#ffffff"
                    strokeWidth="2"
                    className="shadow-md"
                  />
                </g>
              )}
            </svg>

            {/* Hover Tooltip Overlay Box */}
            {activeHoverPoint && hoverIndex !== null && (
              <div
                style={{
                  left: `${(getX(hoverIndex) / chartDims.width) * 100}%`,
                  top: '10px',
                  transform: getX(hoverIndex) > chartDims.width * 0.7 ? 'translateX(-105%)' : 'translateX(10%)',
                }}
                className="absolute z-30 pointer-events-none bg-slate-900/95 text-white rounded-xl shadow-xl p-2.5 sm:p-3 text-xs border border-slate-700 min-w-[170px] backdrop-blur-md"
              >
                <div className="font-semibold text-slate-300 border-b border-slate-800 pb-1 mb-1.5 flex items-center justify-between">
                  <span>{activeHoverPoint.observation_ist || activeHoverPoint.timeLabel}</span>
                  <span className="text-[10px] text-blue-400 font-mono">IST</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 text-[11px]">Avg Rainfall:</span>
                    <span className="font-mono font-bold text-white">
                      {activeHoverPoint.avg.toFixed(2)} mm/hr
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-amber-300 text-[11px]">Peak Intensity:</span>
                    <span className="font-mono font-bold text-amber-300">
                      {activeHoverPoint.max.toFixed(2)} mm/hr
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
                    <span>Active Cells:</span>
                    <span className="font-mono text-slate-200">
                      {activeHoverPoint.points.toLocaleString()} pts
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-400 font-medium">
                    {activeHoverPoint.rain_category}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Time-Window Aggregation Summary Statistics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-4 border-t border-slate-100 bg-slate-50/60 rounded-xl p-3">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Series Average
              </span>
              <span className="text-base font-extrabold text-slate-800 font-mono mt-0.5">
                {stats.avg.toFixed(2)} <span className="text-xs font-medium text-slate-500">mm/hr</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-amber-600/90 uppercase tracking-wider">
                Series Peak
              </span>
              <span className="text-base font-extrabold text-amber-700 font-mono mt-0.5">
                {stats.max.toFixed(2)} <span className="text-xs font-medium text-amber-600">mm/hr</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Series Minimum
              </span>
              <span className="text-base font-extrabold text-slate-800 font-mono mt-0.5">
                {stats.min.toFixed(2)} <span className="text-xs font-medium text-slate-500">mm/hr</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Total Grid Observations
              </span>
              <span className="text-base font-extrabold text-slate-800 font-mono mt-0.5">
                {stats.totalPts.toLocaleString()} <span className="text-xs font-medium text-slate-500">pts</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
