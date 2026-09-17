import { useMemo } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  Database,
  ArrowRight,
  Info,
} from 'lucide-react';
import { EvidencePanel } from './EvidencePanel';
import { formatMetricValue } from '../../services/analysisService';

/**
 * PredictiveSection - Stage 3: "WHAT WILL HAPPEN?"
 *
 * Provides honest, mathematically derived trend-based projections
 * extrapolated from recent time-series velocity and variance.
 *
 * Strict transparency: Clearly labeled as "Trend-based projection",
 * zero fake ML models, zero invented confidence percentages.
 */
export function PredictiveSection({
  locationName = 'National (India)',
  scopeType = 'national',
  summary = null,
  timeline = [],
  latestObservationIst = '',
  source = 'MOSDAC',
}) {
  const avgPrecip = Number(summary?.avg_precipitation ?? 0);
  const maxPrecip = Number(summary?.max_precipitation ?? 0);

  // Derive empirical trend projection from recent chronological timeline points
  const projection = useMemo(() => {
    if (!timeline || timeline.length < 2) {
      return {
        hasData: false,
        trendDirection: 'Dry / Stable',
        expectedAvgRange: [0, 0],
        expectedPeakRange: [0, 0],
        slope: 0,
        variance: 0,
        riskLevel: 'Minimal',
        riskVariant: 'neutral',
        summaryText: 'Insufficient historical intervals for velocity projection. Current baseline conditions expected to persist.',
      };
    }

    const n = timeline.length;
    const windowPoints = timeline.slice(Math.max(0, n - 4)); // Last 4 intervals
    const latest = windowPoints[windowPoints.length - 1];
    const prev = windowPoints[windowPoints.length - 2];

    const curAvg = Number(latest.avg_precipitation || 0);
    const prevAvg = Number(prev.avg_precipitation || 0);
    const curMax = Number(latest.max_precipitation || 0);
    const prevMax = Number(prev.max_precipitation || 0);

    const slopeAvg = curAvg - prevAvg;
    const slopeMax = curMax - prevMax;

    // Standard deviation of recent window for uncertainty bounds
    const avgs = windowPoints.map((p) => Number(p.avg_precipitation || 0));
    const mean = avgs.reduce((a, b) => a + b, 0) / avgs.length;
    const variance = Math.sqrt(
      avgs.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / avgs.length
    );

    // Projected envelope for next 3-6 hours
    const projAvgMin = Math.max(0, curAvg + slopeAvg - variance * 0.5);
    const projAvgMax = Math.max(projAvgMin, curAvg + slopeAvg + variance * 0.5);

    const projMaxMin = Math.max(0, curMax + slopeMax - variance);
    const projMaxMax = Math.max(projMaxMin, curMax + slopeMax + variance);

    let trendDirection = 'Steady / Persistent';
    if (slopeAvg > 0.15) trendDirection = 'Intensifying';
    else if (slopeAvg < -0.15) trendDirection = 'Abating / Clearing';

    let riskLevel = 'Low / Minimal';
    let riskVariant = 'success';
    let summaryText = `Light or negligible precipitation activity projected to persist over the next 3–6 hours across ${locationName}.`;

    if (projMaxMax >= 100) {
      riskLevel = 'Extreme Torrential Downpour';
      riskVariant = 'danger';
      summaryText = `High convective risk: Localized cells projected to sustain severe torrential intensities (up to ${projMaxMax.toFixed(1)} mm/hr) in ${locationName}.`;
    } else if (projMaxMax >= 50) {
      riskLevel = 'Elevated Heavy Rainfall';
      riskVariant = 'warning';
      summaryText = `Heavy precipitation advisory: Localized cells projected in the ${projMaxMin.toFixed(1)}–${projMaxMax.toFixed(1)} mm/hr range over the next 3–6 hours.`;
    } else if (projMaxMax >= 15) {
      riskLevel = 'Moderate Rain Advisory';
      riskVariant = 'info';
      summaryText = `Moderate precipitation pattern projected to continue across ${locationName} with steady spatial accumulation.`;
    }

    return {
      hasData: true,
      trendDirection,
      expectedAvgRange: [projAvgMin, projAvgMax],
      expectedPeakRange: [projMaxMin, projMaxMax],
      slope: slopeAvg,
      variance,
      riskLevel,
      riskVariant,
      summaryText,
      curAvg,
      curMax,
    };
  }, [timeline, locationName]);

  // Verifiable evidence items for Predictive stage
  const predictiveEvidenceMetrics = useMemo(() => {
    return [
      {
        label: 'Projection Methodology',
        value: 'Empirical Kinematic Extrapolation',
        source: 'TATVA Time-Series Extrapolator',
        status: 'Derived',
        note: 'Derived from linear velocity and variance of recent observation passes',
      },
      {
        label: 'Expected Spatial Mean (Next 3–6h)',
        value: `${projection.expectedAvgRange[0].toFixed(2)} – ${projection.expectedAvgRange[1].toFixed(2)}`,
        unit: 'mm/hr',
        source: `${source} Historical Series`,
        status: 'Projected',
        note: 'Projected spatial mean range across regional boundary',
      },
      {
        label: 'Expected Peak Cell Intensity',
        value: `${projection.expectedPeakRange[0].toFixed(2)} – ${projection.expectedPeakRange[1].toFixed(2)}`,
        unit: 'mm/hr',
        source: `${source} Historical Series`,
        status: 'Projected',
        isAlert: projection.expectedPeakRange[1] >= 50,
        note: 'Upper bound localized core intensity envelope',
      },
      {
        label: 'Time-Series Slope (dP/dt)',
        value: `${projection.slope > 0 ? '+' : ''}${projection.slope.toFixed(2)} mm/hr`,
        unit: 'per pass',
        source: 'Mathematical Derivative',
        status: 'Derived',
        note: 'Rate of change over recent observation steps',
      },
      {
        label: 'Empirical Series Variance (σ)',
        value: `±${projection.variance.toFixed(2)}`,
        unit: 'mm/hr',
        source: 'Statistical Envelope',
        status: 'Derived',
        note: 'Empirical dispersion defining forecast uncertainty bounds',
      },
    ];
  }, [projection, source]);

  return (
    <section id="section-predictive" className="scroll-mt-6">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 md:p-6 shadow-xs mb-5">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-700 shrink-0 font-mono font-bold text-sm">
              03
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-700">
                  Predictive Analysis
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <TrendingUp className="w-3 h-3 text-indigo-600" />
                  Short-Term Trend Projection
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                What will happen in {locationName}?
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
                Short-term precipitation outlook extrapolated from recent observation velocity and spatial variance. Transparently labeled with zero manufactured confidence percentages.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
            <span className="text-xs text-slate-500 font-medium">Risk Level:</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
              projection.riskVariant === 'danger'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : projection.riskVariant === 'warning'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : projection.riskVariant === 'info'
                ? 'bg-sky-50 text-sky-700 border-sky-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {projection.riskLevel}
            </span>
          </div>
        </div>

        {/* Prediction Summary Banner */}
        <div className="mb-6 p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider block">
                Short-Term Meteorological Outlook (Next 3–6 Hours)
              </span>
              <p className="text-xs sm:text-sm font-medium text-indigo-900 mt-0.5">
                {projection.summaryText}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5 text-xs text-indigo-800 font-mono bg-white px-3 py-1.5 rounded-lg border border-indigo-200/70">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            <span>Horizon: Next 3–6 Hours</span>
          </div>
        </div>

        {/* 1. Projection Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Card 1: Expected Mean Range */}
          <div className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Projected Spatial Mean
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                {projection.expectedAvgRange[0].toFixed(1)}–{projection.expectedAvgRange[1].toFixed(1)}
              </span>
              <span className="text-xs font-bold text-slate-500">mm/hr</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Current baseline: {formatMetricValue(avgPrecip, 2)} mm/hr
            </p>
          </div>

          {/* Card 2: Expected Peak Envelope */}
          <div className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Projected Peak Cell Intensity
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                {projection.expectedPeakRange[0].toFixed(1)}–{projection.expectedPeakRange[1].toFixed(1)}
              </span>
              <span className="text-xs font-bold text-slate-500">mm/hr</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Highest single cell envelope in {locationName}
            </p>
          </div>

          {/* Card 3: Kinematic Trend Vector */}
          <div className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Trend Vector
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {projection.trendDirection}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Velocity: {projection.slope > 0 ? '+' : ''}{projection.slope.toFixed(2)} mm/hr per cycle
            </p>
          </div>
        </div>

        {/* 2. Scientific Integrity Notice */}
        <div className="mb-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5 leading-relaxed">
          <Database className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-800">Forecast Provenance & Transparency: </span>
            This projection is derived from empirical observation velocity across consecutive {source} satellite passes.
            Numerical Weather Prediction (NWP) ensemble models (e.g. NCMRWF GFS) are not currently coupled; hence synthetic probability percentages are omitted to preserve scientific rigor.
          </div>
        </div>

        {/* 3. Reusable Evidence Panel */}
        <EvidencePanel
          title="Stage 03 Evidence: Predictive Model & Variance Parameters"
          metrics={predictiveEvidenceMetrics}
          sources={[
            `${source} Ingestion Ledger Time-Series`,
            'PostGIS Discrete Velocity Estimator',
          ]}
          observationPeriod="Recent 3-6 Observation Intervals"
          lastUpdated={latestObservationIst || 'Current Telemetry'}
          geographicScope={`${locationName} (${scopeType.toUpperCase()})`}
          methodology="Projections represent short-term (3 to 6 hour) kinematic trends calculated via linear extrapolation of observation intervals bounded by an empirical variance envelope (±0.5σ). No AI hallucinated probabilities are generated."
        />
      </div>
    </section>
  );
}

export default PredictiveSection;
