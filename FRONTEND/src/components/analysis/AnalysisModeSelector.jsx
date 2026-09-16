import { Eye, Search, TrendingUp, ShieldAlert, ArrowRight } from 'lucide-react';

export function AnalysisModeSelector({ activeMode, onSelectMode }) {
  const modes = [
    {
      id: 'descriptive',
      title: 'DESCRIPTIVE',
      subtitle: 'What happened?',
      icon: Eye,
      description: 'Analyze observed precipitation, temperature deviations, and historical percentiles across the timeline.',
      exampleQuestion: '“How did rainfall compare to the 30-year normal?”',
      accentColor: 'from-sky-500/20 to-blue-600/30',
      activeBorder: 'border-sky-400',
      activeText: 'text-sky-300',
    },
    {
      id: 'diagnostic',
      title: 'DIAGNOSTIC',
      subtitle: 'Why did it happen?',
      icon: Search,
      description: 'Trace underlying causal atmospheric signals: moisture flux, pressure troughing, and convective instability.',
      exampleQuestion: '“What atmospheric factors triggered the sudden downpour?”',
      accentColor: 'from-cyan-500/20 to-blue-600/30',
      activeBorder: 'border-cyan-400',
      activeText: 'text-cyan-300',
    },
    {
      id: 'predictive',
      title: 'PREDICTIVE',
      subtitle: 'What happens next?',
      icon: TrendingUp,
      description: 'Synthesize numerical weather prediction ensembles, probability envelopes, and 7-day forecast horizons.',
      exampleQuestion: '“Which districts may receive heavy rainfall in the next 48h?”',
      accentColor: 'from-indigo-500/20 to-blue-600/30',
      activeBorder: 'border-indigo-400',
      activeText: 'text-indigo-300',
    },
    {
      id: 'prescriptive',
      title: 'PRESCRIPTIVE',
      subtitle: 'What should be prioritized?',
      icon: ShieldAlert,
      description: 'Derive AI-guided decision priorities, vulnerable infrastructure hotspots, and recommended monitoring actions.',
      exampleQuestion: '“Which low-lying zones require pre-positioned pumps?”',
      accentColor: 'from-amber-500/20 to-rose-600/30',
      activeBorder: 'border-amber-400',
      activeText: 'text-amber-300',
    },
  ];

  return (
    <div className="w-full mb-8 select-none">
      {/* Workflow Chain Ribbon + All Views Switch */}
      <div className="mb-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="font-sans font-bold text-slate-300 uppercase tracking-wider text-[10px] mr-1">
            INTELLIGENCE PIPELINE:
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onSelectMode('descriptive')}
              className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                activeMode === 'descriptive' ? 'bg-sky-600 text-white shadow-xs' : 'bg-blue-950 text-[#d4dcff] hover:bg-blue-900/60'
              }`}
            >
              OBSERVE
            </button>
            <ArrowRight className="w-3 h-3 text-slate-500" />
            <button
              type="button"
              onClick={() => onSelectMode('diagnostic')}
              className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                activeMode === 'diagnostic' ? 'bg-cyan-600 text-white shadow-xs' : 'bg-blue-950 text-[#d4dcff] hover:bg-blue-900/60'
              }`}
            >
              EXPLAIN
            </button>
            <ArrowRight className="w-3 h-3 text-slate-500" />
            <button
              type="button"
              onClick={() => onSelectMode('predictive')}
              className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                activeMode === 'predictive' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-blue-950 text-[#d4dcff] hover:bg-blue-900/60'
              }`}
            >
              PREDICT
            </button>
            <ArrowRight className="w-3 h-3 text-slate-500" />
            <button
              type="button"
              onClick={() => onSelectMode('predictive')}
              className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                activeMode === 'predictive' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-blue-950 text-[#d4dcff] hover:bg-blue-900/60'
              }`}
            >
              SIMULATE
            </button>
            <ArrowRight className="w-3 h-3 text-slate-500" />
            <button
              type="button"
              onClick={() => onSelectMode('prescriptive')}
              className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                activeMode === 'prescriptive' ? 'bg-amber-600 text-white shadow-xs' : 'bg-blue-950 text-[#d4dcff] hover:bg-blue-900/60'
              }`}
            >
              ASSESS
            </button>
            <ArrowRight className="w-3 h-3 text-slate-500" />
            <button
              type="button"
              onClick={() => onSelectMode('prescriptive')}
              className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                activeMode === 'prescriptive' ? 'bg-amber-600 text-white shadow-xs' : 'bg-blue-950 text-amber-300 hover:bg-blue-900/60'
              }`}
            >
              RECOMMEND
            </button>
          </div>
        </div>

        {/* All Modes Toggle Button */}
        <button
          type="button"
          onClick={() => onSelectMode('all')}
          className={`self-start sm:self-auto px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
            activeMode === 'all'
              ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30 font-bold'
              : 'bg-slate-900/80 text-slate-400 hover:text-white border-slate-800 hover:bg-slate-800'
          }`}
        >
          View All Analytical Stages
        </button>
      </div>

      {/* 4 Mode Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {modes.map((m) => {
          const Icon = m.icon;
          const isActive = activeMode === m.id;

          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMode(m.id)}
              className={`group relative text-left p-4 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between border shadow-lg ${
                isActive
                  ? `bg-gradient-to-b ${m.accentColor} bg-[#0b1633] ${m.activeBorder} ring-2 ring-blue-400/30 shadow-blue-900/50 -translate-y-1 scale-[1.01]`
                  : 'bg-[#081226]/80 hover:bg-[#0c1b3d]/90 border-blue-900/40 hover:border-blue-700/60 text-slate-300 hover:-translate-y-0.5'
              }`}
            >
              {/* Active Glow Pill */}
              {isActive ? (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/30 border border-blue-400/50 text-[9px] font-mono font-black text-white uppercase shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>ACTIVE VIEW</span>
                </div>
              ) : (
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono font-bold text-slate-400">
                  Switch View &rarr;
                </div>
              )}

              <div>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                        : 'bg-white/5 group-hover:bg-white/10 text-slate-400 group-hover:text-white border border-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-slate-400 block">
                      {m.title}
                    </span>
                    <h3 className={`text-sm font-black tracking-tight ${isActive ? 'text-white' : 'text-slate-200'}`}>
                      {m.subtitle}
                    </h3>
                  </div>
                </div>

                <p className="text-xs text-slate-300 font-medium leading-relaxed mb-3 line-clamp-2">
                  {m.description}
                </p>
              </div>

              <div className="pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] font-medium text-slate-400">
                <span className="italic truncate mr-2">{m.exampleQuestion}</span>
                <span className={`text-[10px] font-mono font-bold shrink-0 ${isActive ? m.activeText : 'text-slate-500 group-hover:text-slate-300'}`}>
                  {isActive ? '● Displayed' : 'Inspect'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
