import React from 'react';
import {
  Satellite,
  Radio,
  Cpu,
  Activity,
  Database,
  Waves,
  CloudRain,
  Map,
  Layers,
  AlertTriangle,
  Send,
  TrendingUp,
  Award,
  Shield,
  Zap,
} from 'lucide-react';

export function StepGraphic({ stepNumber }) {
  switch (stepNumber) {
    case 1:
      return (
        <div className="relative w-full h-full min-h-[220px] bg-[#071126] rounded-xl overflow-hidden flex flex-col items-center justify-center p-6 border border-blue-900/40 select-none">
          {/* Orbital rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
            <div className="w-52 h-52 rounded-full border border-dashed border-blue-400 animate-[spin_25s_linear_infinite]" />
            <div className="absolute w-36 h-36 rounded-full border border-blue-500/50" />
            <div className="absolute w-20 h-20 rounded-full border border-cyan-400/60" />
          </div>

          {/* Central Satellite & Radar Dish */}
          <div className="relative z-10 flex items-center gap-6">
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-400/60 text-cyan-300 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Satellite className="w-8 h-8 animate-pulse" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 mt-2">
                INSAT-3DS L2C
              </span>
            </div>

            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping mb-1" />
              <div className="w-12 h-0.5 bg-gradient-to-r from-cyan-400 to-blue-500" />
              <span className="text-[9px] font-mono text-cyan-200 mt-1">5-Min Stream</span>
            </div>

            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-400/60 text-indigo-300 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Radio className="w-8 h-8" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 mt-2">
                DWR RADAR 250km
              </span>
            </div>
          </div>

          <div className="absolute bottom-3 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/60 text-[10px] font-mono text-cyan-300">
            SATELLITE & RADAR TELEMETRY
          </div>
        </div>
      );

    case 2:
      return (
        <div className="relative w-full h-full min-h-[220px] bg-[#071126] rounded-xl overflow-hidden flex flex-col items-center justify-center p-6 border border-blue-900/40 select-none">
          {/* Kafka Lakehouse Pipeline Graphic */}
          <div className="relative z-10 w-full max-w-xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-amber-400 animate-pulse" />
                <span className="text-xs font-bold text-slate-200">Kafka Streaming</span>
              </div>
              <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">
                1.2M msgs/sec
              </span>
            </div>

            {/* Queue pipelines */}
            <div className="space-y-1.5 font-mono text-[10px]">
              <div className="p-2 rounded-lg bg-blue-950/70 border border-blue-800/60 flex items-center justify-between text-cyan-300">
                <span>topic: telemetry.mosdac.raw</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <div className="p-2 rounded-lg bg-indigo-950/70 border border-indigo-800/60 flex items-center justify-between text-indigo-300">
                <span>topic: telemetry.dwr.reflectivity</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <div className="p-2 rounded-lg bg-purple-950/70 border border-purple-800/60 flex items-center justify-between text-purple-300">
                <span>lakehouse: duckdb.timeseries.store</span>
                <span className="text-emerald-400 font-bold">LOCKED</span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-3 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/60 text-[10px] font-mono text-amber-300">
            KAFKA INGESTION & DATA LAKEHOUSE
          </div>
        </div>
      );

    case 3:
      return (
        <div className="relative w-full h-full min-h-[220px] bg-[#071126] rounded-xl overflow-hidden flex flex-col items-center justify-center p-6 border border-blue-900/40 select-none">
          {/* Convective physics vortex */}
          <div className="relative z-10 flex items-center gap-6">
            <div className="w-20 h-20 rounded-full border-2 border-dashed border-rose-500/70 flex items-center justify-center animate-[spin_10s_linear_infinite] bg-rose-950/20">
              <Waves className="w-10 h-10 text-rose-400" />
            </div>

            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded bg-rose-500" />
                <span className="text-slate-200 font-bold">Cloudburst Core:</span>
                <span className="text-rose-400 font-mono font-bold">&gt;48 dBZ</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded bg-amber-500" />
                <span className="text-slate-200 font-bold">Convective Updraft:</span>
                <span className="text-amber-400 font-mono font-bold">22.4 m/s</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded bg-cyan-500" />
                <span className="text-slate-200 font-bold">Precipitation Rate:</span>
                <span className="text-cyan-400 font-mono font-bold">115 mm/hr</span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-3 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/60 text-[10px] font-mono text-rose-300">
            NUMERICAL PHYSICS & VELOCITY ENGINE
          </div>
        </div>
      );

    case 4:
      return (
        <div className="relative w-full h-full min-h-[220px] bg-[#071126] rounded-xl overflow-hidden flex flex-col items-center justify-center p-6 border border-blue-900/40 select-none">
          {/* GIS Choropleth Matrix */}
          <div className="relative z-10 grid grid-cols-4 gap-2 w-56">
            <div className="h-10 rounded-lg bg-blue-600/60 border border-blue-400/60 flex items-center justify-center text-[10px] font-mono text-white">
              0.01°
            </div>
            <div className="h-10 rounded-lg bg-emerald-500/60 border border-emerald-400/60 flex items-center justify-center text-[10px] font-mono text-white">
              Norm
            </div>
            <div className="h-10 rounded-lg bg-amber-500/60 border border-amber-400/60 flex items-center justify-center text-[10px] font-mono text-white">
              Watch
            </div>
            <div className="h-10 rounded-lg bg-rose-600/70 border border-rose-400/80 flex items-center justify-center text-[10px] font-mono text-white font-bold animate-pulse">
              Alert
            </div>
            <div className="h-10 rounded-lg bg-cyan-600/60 border border-cyan-400/60 flex items-center justify-center text-[10px] font-mono text-white">
              GIS
            </div>
            <div className="h-10 rounded-lg bg-rose-700/80 border border-rose-500/80 flex items-center justify-center text-[10px] font-mono text-white font-bold animate-pulse">
              Extr
            </div>
            <div className="h-10 rounded-lg bg-amber-600/60 border border-amber-400/60 flex items-center justify-center text-[10px] font-mono text-white">
              High
            </div>
            <div className="h-10 rounded-lg bg-blue-700/60 border border-blue-400/60 flex items-center justify-center text-[10px] font-mono text-white">
              Sub
            </div>
          </div>

          <div className="absolute bottom-3 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/60 text-[10px] font-mono text-cyan-300">
            GIS SPATIAL CHOROPLETH RESOLUTION
          </div>
        </div>
      );

    case 5:
      return (
        <div className="relative w-full h-full min-h-[220px] bg-[#1a0c16] rounded-xl overflow-hidden flex flex-col items-center justify-center p-6 border border-rose-900/50 select-none">
          {/* Flash flood warning strobe */}
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-600/30 border-2 border-rose-500 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-600/30 mb-3 animate-bounce">
              <AlertTriangle className="w-9 h-9" />
            </div>
            <h4 className="text-sm font-black text-rose-300 tracking-wider uppercase">
              CRITICAL FLOOD TRIGGER
            </h4>
            <p className="text-xs text-rose-200/80 mt-1 font-mono">
              Rainfall &gt; 100mm/hr • SDMA Dispatched
            </p>
          </div>

          <div className="absolute bottom-3 px-3 py-1 rounded-full bg-rose-950/90 border border-rose-700/70 text-[10px] font-mono text-rose-300">
            AUTOMATED DISASTER ALERT BROADCAST
          </div>
        </div>
      );

    case 6:
      return (
        <div className="relative w-full h-full min-h-[220px] bg-[#071126] rounded-xl overflow-hidden flex flex-col items-center justify-center p-6 border border-blue-900/40 select-none">
          {/* Trend lines */}
          <div className="relative z-10 w-64">
            <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
              <span className="font-bold flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Monsoon Anomaly
              </span>
              <span className="font-mono text-emerald-400 font-bold">+18.4% IMD Base</span>
            </div>

            {/* Sparkline bars */}
            <div className="flex items-end justify-between h-20 gap-1.5 px-2 bg-slate-900/60 rounded-lg p-2 border border-slate-800">
              <div className="w-4 bg-blue-600/50 rounded-t h-8" title="1990" />
              <div className="w-4 bg-blue-600/60 rounded-t h-12" title="2000" />
              <div className="w-4 bg-blue-600/70 rounded-t h-10" title="2010" />
              <div className="w-4 bg-blue-500/80 rounded-t h-14" title="2020" />
              <div className="w-4 bg-amber-500/80 rounded-t h-16" title="2024" />
              <div className="w-4 bg-rose-500 rounded-t h-full animate-pulse" title="2026 SURGE" />
            </div>
          </div>

          <div className="absolute bottom-3 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/60 text-[10px] font-mono text-emerald-300">
            PREDICTIVE TREND & CLIMATE BENCHMARK
          </div>
        </div>
      );

    case 7:
    default:
      return (
        <div className="relative w-full h-full min-h-[220px] bg-[#071126] rounded-xl overflow-hidden flex flex-col items-center justify-center p-6 border border-blue-900/40 select-none">
          {/* Bharat Resilient Emblem & Shield */}
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-300 shadow-xl shadow-emerald-600/20 mb-2">
              <Shield className="w-9 h-9" />
            </div>
            <h4 className="text-sm font-extrabold text-white tracking-wide">
              WEATHER RESILIENT BHARAT
            </h4>
            <p className="text-xs text-emerald-300/90 mt-1 font-mono">
              36 States & UTs • 700+ Districts Covered
            </p>
          </div>

          <div className="absolute bottom-3 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/60 text-[10px] font-mono text-emerald-300">
            PUBLIC SAFETY & RESILIENT BHARAT
          </div>
        </div>
      );
  }
}
