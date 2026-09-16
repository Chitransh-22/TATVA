import { useState } from 'react';
import { History, SkipBack, SkipForward, Clock } from 'lucide-react';

export function TimeMachine({ onTimeStepChange, selectedTimeLabel }) {
  const [sliderPos, setSliderPos] = useState(50); // 0 = Past 7d, 50 = Now, 100 = +7d Forecast

  // Derive time label based on slider position
  const getTimeLabel = (pos) => {
    if (pos === 50) return 'NOW (Real-Time Live State)';
    if (pos < 50) {
      const daysAgo = Math.round(((50 - pos) / 50) * 7);
      const hoursAgo = Math.round(((50 - pos) / 50) * 168);
      return daysAgo === 0 ? `-${hoursAgo}h (Past Observation)` : `-${daysAgo} Days Ago (Historical)`;
    }
    const daysAhead = Math.round(((pos - 50) / 50) * 7);
    const hoursAhead = Math.round(((pos - 50) / 50) * 168);
    return daysAhead === 0 ? `+${hoursAhead}h (Forecast Outlook)` : `+${daysAhead} Days Ahead (Forecast)`;
  };

  const handleSliderChange = (e) => {
    const val = parseInt(e.target.value);
    setSliderPos(val);
    const label = getTimeLabel(val);
    onTimeStepChange?.(val, label);
  };

  const handleStepToNow = () => {
    setSliderPos(50);
    onTimeStepChange?.(50, 'NOW (Real-Time Live State)');
  };

  const handleStepPast = () => {
    const newVal = Math.max(0, sliderPos - 10);
    setSliderPos(newVal);
    onTimeStepChange?.(newVal, getTimeLabel(newVal));
  };

  const handleStepFuture = () => {
    const newVal = Math.min(100, sliderPos + 10);
    setSliderPos(newVal);
    onTimeStepChange?.(newVal, getTimeLabel(newVal));
  };

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[#d4dcff]" />
          <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
            Atmospheric Time Machine (Temporal Scrubber)
          </h3>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
            Temporal Axis
          </span>
        </div>

        {/* Current Active Slice Pill */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-blue-950/80 border border-blue-700/60 text-xs font-mono font-bold text-cyan-300 shadow-sm">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span>{selectedTimeLabel || getTimeLabel(sliderPos)}</span>
        </div>
      </div>

      {/* Timeline Controls & Scrubber */}
      <div className="space-y-3">
        {/* Scrubber Labels */}
        <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400">
          <span className="text-slate-400">&larr; PAST 7 DAYS (HISTORICAL)</span>
          <button
            type="button"
            onClick={handleStepToNow}
            className="px-2.5 py-0.5 rounded-full bg-[#d4dcff]/20 text-[#d4dcff] border border-[#d4dcff]/40 hover:bg-[#d4dcff]/30 transition-colors cursor-pointer text-[10px] font-extrabold"
          >
            NOW (LIVE)
          </button>
          <span className="text-indigo-300">FUTURE +7 DAYS (FORECAST) &rarr;</span>
        </div>

        {/* Slider Input */}
        <div className="relative flex items-center">
          <input
            type="range"
            min="0"
            max="100"
            step="2"
            value={sliderPos}
            onChange={handleSliderChange}
            className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#d4dcff]"
          />
          {/* Now indicator tick at 50% */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-1 h-4 bg-white rounded-full pointer-events-none opacity-80"
            style={{ top: 'calc(50% - 8px)' }}
          />
        </div>

        {/* Playback Step Buttons */}
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleStepPast}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition-colors"
            title="Step backward in time"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleStepToNow}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 cursor-pointer transition-colors"
          >
            Jump to Present
          </button>

          <button
            type="button"
            onClick={handleStepFuture}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition-colors"
            title="Step forward into forecast"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
