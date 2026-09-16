import { useState, useEffect } from 'react';
import { runScenarioSimulation } from '../../services/analysisService';
import { Play, Droplets, Wind, Thermometer, CloudRain } from 'lucide-react';

export function ScenarioSimulator({ locationId = 'ahmedabad', locationName = 'Selected Region' }) {
  const [params, setParams] = useState({
    rainfallDeltaPct: 30,
    tempDeltaC: 1.5,
    windDeltaPct: 20,
    humidityDeltaPct: 10,
    durationHours: 24,
  });

  const [simResult, setSimResult] = useState(() => runScenarioSimulation(locationId, params));
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    setSimResult(runScenarioSimulation(locationId, params));
  }, [locationId]);

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const res = runScenarioSimulation(locationId, params);
      setSimResult(res);
      setIsSimulating(false);
    }, 250);
  };

  const handleResetDefaults = () => {
    const defaults = {
      rainfallDeltaPct: 0,
      tempDeltaC: 0,
      windDeltaPct: 0,
      humidityDeltaPct: 0,
      durationHours: 24,
    };
    setParams(defaults);
    setSimResult(runScenarioSimulation(locationId, defaults));
  };

  const curve = simResult?.hourlyCurve || [];
  const curveMaxes = curve.map((c) => Math.max(c.baseline || 0, c.scenario || 0));
  const maxVal = Math.max(
    10,
    ...(curveMaxes.length > 0 ? curveMaxes.map((m) => m * 1.25) : [10])
  );
  const width = 680;
  const height = 180;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const getX = (idx) => padLeft + (idx / Math.max(1, curve.length - 1)) * chartW;
  const getY = (val) => padTop + chartH - (val / (maxVal || 1)) * chartH;

  const basePath = curve.reduce((acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(p.baseline).toFixed(1)}`, '');
  const scenPath = curve.reduce((acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(p.scenario).toFixed(1)}`, '');

  return (
    <div className="w-full bg-[#081226]/95 border-2 border-indigo-500/40 rounded-2xl p-4 sm:p-6 shadow-2xl mb-6 select-none relative">
      {/* Simulation Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
              Weather Scenario Simulator (What-If Stress Testing)
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-700/50">
              {locationName}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Simulate hypothetical perturbation scenarios to evaluate infrastructure resilience and hydrological runoff stress.
          </p>
        </div>

        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-indigo-950/80 text-[#d4dcff] border border-indigo-800/40">
          HYPOTHETICAL SIMULATION ENGINE
        </span>
      </div>

      {/* Parameter Sliders Box */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 mb-5">
        <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center justify-between">
          <span>Hypothetical Perturbation Parameters:</span>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
          >
            Reset to Baseline
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Rainfall Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-1">
                <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
                Rainfall Perturbation
              </span>
              <span className="font-mono text-cyan-400 font-bold">
                {params.rainfallDeltaPct >= 0 ? '+' : ''}{params.rainfallDeltaPct}%
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="100"
              step="5"
              value={params.rainfallDeltaPct}
              onChange={(e) => setParams({ ...params, rainfallDeltaPct: parseInt(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Temperature Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                Temperature Anomaly
              </span>
              <span className="font-mono text-amber-400 font-bold">
                {params.tempDeltaC >= 0 ? '+' : ''}{params.tempDeltaC}°C
              </span>
            </div>
            <input
              type="range"
              min="-5"
              max="5"
              step="0.5"
              value={params.tempDeltaC}
              onChange={(e) => setParams({ ...params, tempDeltaC: parseFloat(e.target.value) })}
              className="w-full accent-amber-400 cursor-pointer"
            />
          </div>

          {/* Wind Speed Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-1">
                <Wind className="w-3.5 h-3.5 text-rose-400" />
                Wind Speed Gusts
              </span>
              <span className="font-mono text-rose-400 font-bold">
                {params.windDeltaPct >= 0 ? '+' : ''}{params.windDeltaPct}%
              </span>
            </div>
            <input
              type="range"
              min="-40"
              max="60"
              step="5"
              value={params.windDeltaPct}
              onChange={(e) => setParams({ ...params, windDeltaPct: parseInt(e.target.value) })}
              className="w-full accent-rose-400 cursor-pointer"
            />
          </div>

          {/* Humidity Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5 text-emerald-400" />
                Moisture Saturation
              </span>
              <span className="font-mono text-emerald-400 font-bold">
                {params.humidityDeltaPct >= 0 ? '+' : ''}{params.humidityDeltaPct}%
              </span>
            </div>
            <input
              type="range"
              min="-30"
              max="30"
              step="5"
              value={params.humidityDeltaPct}
              onChange={(e) => setParams({ ...params, humidityDeltaPct: parseInt(e.target.value) })}
              className="w-full accent-emerald-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Duration selector & Run Button */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-semibold">Duration:</span>
            {[6, 12, 24, 48, 72].map((dur) => (
              <button
                key={dur}
                type="button"
                onClick={() => setParams({ ...params, durationHours: dur })}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  params.durationHours === dur
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {dur}h
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isSimulating ? 'Running Model...' : 'Run Scenario'}</span>
          </button>
        </div>
      </div>

      {/* Output Comparison Grid: Baseline vs Scenario */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {/* Baseline Card */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
              BASELINE OBSERVATION
            </span>
            <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-300">
              Reference Climatology
            </span>
          </div>
          <div className="space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Accumulated Rain:</span>
              <span className="font-bold text-white">{simResult.metrics.baselinePrecip}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Runoff Yield:</span>
              <span className="font-bold text-white">{simResult.metrics.baselineRunoff}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Inundation Risk:</span>
              <span className="font-bold text-slate-300">Moderate Baseline</span>
            </div>
          </div>
        </div>

        {/* Scenario Output Card */}
        <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300">
              SIMULATED SCENARIO
            </span>
            <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
              {simResult.metrics.riskLevel}
            </span>
          </div>
          <div className="space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-slate-300">Simulated Rain:</span>
              <span className="font-extrabold text-cyan-300">{simResult.metrics.scenarioPrecip} ({simResult.metrics.precipDelta})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Simulated Runoff:</span>
              <span className="font-extrabold text-amber-300">{simResult.metrics.scenarioRunoff} ({simResult.metrics.runoffDelta})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Impacted Spatial Area:</span>
              <span className="font-bold text-white">{simResult.metrics.affectedArea}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Comparative SVG Curve */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 mb-4">
        <div className="flex items-center justify-between mb-2 text-xs">
          <span className="font-bold text-slate-300">
            Temporal Hydrograph Comparison: Baseline vs Perturbed Scenario
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-2.5 h-0.5 bg-slate-400 border-b border-dashed" /> Baseline (mm/h)
            </span>
            <span className="flex items-center gap-1.5 text-indigo-300">
              <span className="w-2.5 h-0.5 bg-indigo-400" /> Simulated (mm/h)
            </span>
          </div>
        </div>

        <div className="relative w-full overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[500px] overflow-visible">
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

            {/* Baseline Path */}
            <path d={basePath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4 3" opacity="0.7" />

            {/* Scenario Path */}
            <path d={scenPath} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" />

            {/* Data Points */}
            {curve.map((pt, idx) => {
              const x = getX(idx);
              return (
                <g key={idx}>
                  <circle cx={x} cy={getY(pt.scenario)} r="3.5" fill="#818cf8" />
                  <text
                    x={x}
                    y={height - padBottom + 16}
                    fill="#94a3b8"
                    fontSize="9.5"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {pt.step}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="text-[10px] text-amber-300/80 font-medium">
        *{simResult.disclaimer}
      </div>
    </div>
  );
}
