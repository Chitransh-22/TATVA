import { useState, type ComponentType } from 'react';
import {
  Satellite,
  Radio,
  RadioTower,
  Cpu,
  ArrowRight,
  ChevronRight,
  Zap,
  Waves,
  Wind,
  CloudRain,
  Sliders,
  Map,
  Layers,
  Maximize2,
  Compass,
  AlertTriangle,
  Send,
  Building2,
  HeartHandshake,
  TrendingUp,
  BookOpen,
  Target,
  Droplets,
  Users,
  Leaf,
  Shield,
  Award,
  Activity,
  Database,
  ShieldCheck,
} from 'lucide-react';
import { HOW_IT_WORKS_STEPS } from '../data/weatherData';

// Map icon string names to Lucide icons
const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  Satellite,
  Radio,
  TowerControl: RadioTower,
  Cpu,
  Activity,
  Database,
  ShieldCheck,
  Zap,
  Waves,
  Wind,
  CloudRain,
  Sliders,
  Map,
  Layers,
  Maximize2,
  Compass,
  AlertTriangle,
  Send,
  Building: Building2,
  HeartHandshake,
  TrendingUp,
  BookOpen,
  Target,
  Droplets,
  Users,
  Leaf,
  Shield,
  Award,
};

export function HowItWorksSection() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const step = HOW_IT_WORKS_STEPS[currentStepIndex];

  const handleNext = () => {
    setCurrentStepIndex((prev) => (prev + 1) % HOW_IT_WORKS_STEPS.length);
  };

  return (
    <section id="how-it-works-section" className="w-full pt-14 pb-8 select-none">
      {/* Section Header */}
      <div className="mb-8">
        <span className="text-xs font-bold uppercase tracking-widest text-blue-600">
          OUR PROCESS
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
          How It Works
        </h2>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          TATVA transforms vast weather data into actionable intelligence — in just a few simple steps.
        </p>
      </div>

      {/* Main Interactive Step Card */}
      <div className="relative bg-white/95 rounded-2xl border border-slate-200/90 shadow-sm p-5 sm:p-7 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-center">
          {/* Left: High-Tech Illustration Container */}
          <div className="md:col-span-5 bg-gradient-to-br from-blue-50 to-indigo-50/60 rounded-2xl p-4 flex items-center justify-center overflow-hidden border border-blue-100/80 shadow-inner group">
            <div className="relative w-full aspect-4/3 rounded-xl overflow-hidden shadow-sm">
              <img
                src={step.image}
                alt={step.title}
                className="w-full h-full object-cover object-center transform group-hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-blue-600/10 mix-blend-overlay pointer-events-none" />
            </div>
          </div>

          {/* Right: Step Description & Feature Badges */}
          <div className="md:col-span-7 flex flex-col justify-between h-full pr-0 md:pr-8">
            <div>
              {/* Step indicator tag */}
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                <span>
                  Step {step.stepNumber} of {step.totalSteps}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mb-3">
                {step.title}
              </h3>

              {/* Description */}
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal mb-6">
                {step.description}
              </p>
            </div>

            {/* 4 Feature Tags with Icons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {step.tags.map((tag, idx) => {
                const Icon = ICON_MAP[tag.icon] || Satellite;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 sm:p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50/80 border border-slate-200/80 hover:border-blue-200 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-[11px] sm:text-xs font-semibold text-slate-700 truncate">
                      {tag.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Floating Arrow Button on Card */}
        <button
          id="how-it-works-next-card-btn"
          onClick={handleNext}
          className="absolute -right-3 sm:-right-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/40 flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
          aria-label="Next Step"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Stepper Pagination & Next Button Below */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Step Circles (1..7) with connecting dotted lines */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto max-w-full py-1">
          {HOW_IT_WORKS_STEPS.map((s, idx) => {
            const isActive = idx === currentStepIndex;
            return (
              <div key={s.stepNumber} className="flex items-center">
                <button
                  id={`step-pill-${s.stepNumber}`}
                  onClick={() => setCurrentStepIndex(idx)}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full font-bold text-xs sm:text-sm flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40 scale-105'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-xs'
                  }`}
                >
                  {s.stepNumber}
                </button>
                {idx < HOW_IT_WORKS_STEPS.length - 1 && (
                  <span className="mx-1 sm:mx-2 text-slate-400 font-black tracking-widest text-xs">
                    •
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          id="how-it-works-next-btn"
          onClick={handleNext}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-md shadow-blue-600/30 transition-all hover:-translate-y-0.5"
        >
          <span>Next</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}
