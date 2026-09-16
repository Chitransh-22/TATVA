import { useState } from 'react';
import {
  Sparkles,
  Search,
  ArrowRight,
  Database,
  CheckCircle2,
  X,
} from 'lucide-react';

export function AnalysisQuery({
  onRunQuery,
  queryResult,
  onClearResult,
}) {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState(0);

  const samplePrompts = [
    'Why was rainfall unusually high in Ahmedabad yesterday?',
    'Compare Gujarat rainfall with the historical average.',
    'Which districts may receive heavy rainfall in the next 48 hours?',
    'Find unusual temperature anomalies this month.',
    'What could happen if rainfall increases by 30%?',
    'Which areas should be monitored first?',
  ];

  const steps = [
    'Collecting multi-sensor data...',
    'Validating gridded datasets & baselines...',
    'Running atmospheric diagnostics & models...',
    'Generating weather intelligence insights...',
    'Rendering analytical visualizations...',
  ];

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || isProcessing) return;

    setIsProcessing(true);
    setProgressStep(0);

    // Fast, responsive progress sequence (UI feedback without artificial lag)
    for (let i = 0; i < steps.length; i++) {
      setProgressStep(i);
      await new Promise((r) => setTimeout(r, 220));
    }

    await onRunQuery(inputText.trim());
    setIsProcessing(false);
  };

  const handleSelectChip = (promptText) => {
    setInputText(promptText);
  };

  return (
    <div className="w-full mb-6 select-none">
      {/* Search Input Container */}
      <div className="relative bg-[#09152e]/90 backdrop-blur-xl border border-blue-900/50 hover:border-blue-700/60 rounded-2xl p-4 sm:p-5 shadow-xl transition-all">
        {/* Top Query Header with AI Indicator */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#d4dcff]">
              Atmospheric NLP Engine
            </span>
            <span className="hidden sm:inline-block text-[11px] text-slate-400">
              &bull; Natural Language Weather Intelligence
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-950/80 border border-blue-800/40 text-[10px] font-semibold text-blue-300">
            <Sparkles className="w-3 h-3 text-[#d4dcff]" />
            <span>AI Multi-Source Synthesizer</span>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask TATVA to analyze a weather event (e.g., 'Compare Gujarat rainfall with historical average')..."
              disabled={isProcessing}
              className="w-full pl-10 pr-4 py-3 bg-[#0d1c3a] border border-blue-800/60 rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#d4dcff]/50 shadow-inner font-medium"
            />
          </div>

          <button
            type="submit"
            disabled={!inputText.trim() || isProcessing}
            className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold tracking-wide transition-all cursor-pointer shadow-md shrink-0 active:scale-95 ${
              !inputText.trim() || isProcessing
                ? 'bg-blue-950 text-slate-500 border border-blue-900/40 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
            }`}
          >
            <span>Analyze</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Example Chips */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2">
          <span className="text-[11px] text-slate-400 font-semibold mr-1">
            Examples:
          </span>
          {samplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectChip(prompt)}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-[#d4dcff]/15 text-slate-300 hover:text-white border border-white/10 hover:border-[#d4dcff]/30 transition-all cursor-pointer truncate max-w-[320px] text-left"
            >
              &ldquo;{prompt}&rdquo;
            </button>
          ))}
        </div>

        {/* Dynamic Progress Sequence Indicator when processing */}
        {isProcessing && (
          <div className="mt-4 p-3 rounded-xl bg-blue-950/60 border border-blue-800/40 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs font-bold text-[#d4dcff] mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-[#d4dcff]/30 border-t-[#d4dcff] rounded-full animate-spin" />
                <span>{steps[progressStep]}</span>
              </div>
              <span className="font-mono text-[11px] text-slate-400">
                Step {progressStep + 1} of {steps.length}
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-[#d4dcff] h-1.5 rounded-full transition-all duration-200"
                style={{ width: `${((progressStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Structured Analysis Result Card */}
      {queryResult && (
        <div className="mt-4 p-5 sm:p-6 bg-[#071126] border-2 border-[#d4dcff]/40 rounded-2xl shadow-2xl relative animate-in fade-in slide-in-from-top-3 duration-300">
          {/* Dismiss button */}
          <button
            type="button"
            onClick={onClearResult}
            className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Dismiss Analysis Result"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header row */}
          <div className="flex flex-wrap items-center gap-2.5 mb-3 pr-8">
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase bg-blue-600 text-white">
              QUERY RESULT
            </span>
            <span className="text-xs text-slate-400 font-semibold">
              Location: <strong className="text-slate-200">{queryResult.location.name}</strong> &bull; {queryResult.timestamp}
            </span>
          </div>

          {/* Original Question */}
          <div className="text-sm font-semibold text-slate-300 mb-2 italic">
            &ldquo;{queryResult.question}&rdquo;
          </div>

          {/* Key Finding Box */}
          <div className="p-3.5 rounded-xl bg-blue-950/80 border border-blue-700/50 mb-4">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#d4dcff] mb-1">
              KEY WEATHER FINDING
            </div>
            <p className="text-sm sm:text-base font-bold text-white leading-snug">
              {queryResult.keyFinding}
            </p>
          </div>

          {/* Supporting Metrics Badges */}
          {queryResult.supportingMetrics?.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                SUPPORTING ATMOSPHERIC METRICS
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {queryResult.supportingMetrics.map((m, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col"
                  >
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      {m.label}
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-white font-mono mt-0.5">
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scientific Explanation */}
          <div className="mb-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              METEOROLOGICAL SYNTHESIS & EXPLANATION
            </div>
            <p className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed bg-white/5 p-3.5 rounded-xl border border-white/10">
              {queryResult.explanation}
            </p>
          </div>

          {/* Footer Meta: Confidence, Relevant Graphs, Data Sources */}
          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confidence: {queryResult.confidence}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <Database className="w-3.5 h-3.5 text-[#d4dcff]" />
                <span>Sources: {queryResult.dataSources?.join(', ')}</span>
              </div>
            </div>

            {queryResult.relevantGraphs?.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-blue-300 font-medium">
                <span>Recommended Views:</span>
                {queryResult.relevantGraphs.map((g, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-blue-900/60 border border-blue-700/50 text-[#d4dcff]"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
