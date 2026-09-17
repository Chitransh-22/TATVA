import { ArrowDown, CheckCircle2, TrendingUp, HelpCircle, AlertCircle, Compass } from 'lucide-react';

/**
 * PipelineStepper - Visual 4-Stage Reasoning Architecture Stepper
 *
 * Visually communicates the sequential analytical pipeline:
 * DESCRIPTIVE (01) -> DIAGNOSTIC (02) -> PREDICTIVE (03) -> PRESCRIPTIVE (04)
 */
export function PipelineStepper({ activeSection = 'descriptive', onSelectSection }) {
  const steps = [
    {
      id: 'descriptive',
      number: '01',
      name: 'DESCRIPTIVE',
      question: 'What happened?',
      description: 'Observed patterns, intensity & spatial metrics',
      icon: CheckCircle2,
      badge: 'Observed Telemetry',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      id: 'diagnostic',
      number: '02',
      name: 'DIAGNOSTIC',
      question: 'Why did it happen?',
      description: 'Precipitation velocity, convective density & anomalies',
      icon: HelpCircle,
      badge: 'Empirical Evidence',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      id: 'predictive',
      number: '03',
      name: 'PREDICTIVE',
      question: 'What will happen?',
      description: 'Trend-based short-term projection & variance window',
      icon: TrendingUp,
      badge: 'Trend Extrapolation',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    {
      id: 'prescriptive',
      number: '04',
      name: 'PRESCRIPTIVE',
      question: 'What should we do?',
      description: 'Deterministic hazard thresholds & operational actions',
      icon: Compass,
      badge: 'Operational Protocol',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    },
  ];

  const handleStepClick = (stepId) => {
    if (onSelectSection) {
      onSelectSection(stepId);
    }
    const element = document.getElementById(`section-${stepId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="mb-8 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-100">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 block">
            Analytical Reasoning Architecture
          </span>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
            Four-Stage Meteorological Intelligence Pipeline
          </h2>
        </div>
        <span className="text-xs text-slate-500 font-medium hidden md:inline-block">
          Click any stage to navigate directly
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isActive = activeSection === step.id;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => handleStepClick(step.id)}
              className={`text-left p-3.5 rounded-xl border transition-all duration-150 cursor-pointer relative flex flex-col justify-between ${
                isActive
                  ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-300 shadow-xs'
                  : 'bg-slate-50/50 hover:bg-slate-100/70 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-slate-400 font-mono">
                      {step.number}
                    </span>
                    <span className="text-xs font-extrabold tracking-wider text-slate-900">
                      {step.name}
                    </span>
                  </div>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                </div>

                <div className="text-xs font-bold text-slate-800 mb-1">
                  {step.question}
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                  {step.description}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${step.badgeColor}`}>
                  {step.badge}
                </span>

                {idx < steps.length - 1 && (
                  <span className="text-slate-300 text-xs font-bold hidden lg:inline-block">
                    →
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * PipelineConnector - Clean subtle visual downward arrow connector between stages
 */
export function PipelineConnector({ label = 'Feeds into', targetStage = '' }) {
  return (
    <div className="my-6 flex flex-col items-center justify-center select-none">
      <div className="h-4 w-px bg-slate-300"></div>
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200/90 text-[10px] font-bold text-slate-600 tracking-wider uppercase shadow-2xs">
        <ArrowDown className="w-3 h-3 text-blue-600 animate-bounce" />
        <span>{label} {targetStage}</span>
      </div>
      <div className="h-4 w-px bg-slate-300"></div>
    </div>
  );
}

export default PipelineStepper;
