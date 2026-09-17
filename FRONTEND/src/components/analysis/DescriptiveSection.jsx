import { useMemo } from 'react';
import {
  CloudRain,
  Activity,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
} from 'lucide-react';
import { MetricCard } from './MetricCard';
import { WeatherTrendChart } from './WeatherTrendChart';
import { EvidencePanel } from './EvidencePanel';
import { classifyRainfall, formatMetricValue } from '../../services/analysisService';

/**
 * DescriptiveSection - Stage 1: "WHAT HAPPENED?"
 *
 * Summarizes actual observed weather conditions, current/min/max/average rainfall,
 * active observation cells, and delta change vs the previous observation period.
 * Strict zero-mock data adherence.
 */
export function DescriptiveSection({
  locationName = 'National (India)',
  scopeType = 'national', // 'national' | 'state' | 'district'
  summary = null,
  timeline = [],
  isLoading = false,
  activeMetric = 'rainfall',
  onChangeMetric,
  latestObservationIst = '',
  source = 'MOSDAC',
}) {
  const avgPrecip = Number(summary?.avg_precipitation ?? 0);
  const maxPrecip = Number(summary?.max_precipitation ?? 0);
  const minPrecip = Number(summary?.min_precipitation ?? 0);
  const totalPoints = summary?.total_points != null ? Number(summary.total_points) : 0;
  const rainCategory = summary?.rain_category || classifyRainfall(maxPrecip || avgPrecip);

  // Calculate change vs previous period from actual historical timeline
  const deltaMetrics = useMemo(() => {
    if (!timeline || timeline.length < 2) {
      return { hasDelta: false, deltaVal: 0, deltaPct: 0, trend: 'neutral' };
    }
    const latest = timeline[timeline.length - 1];
    const prev = timeline[timeline.length - 2];
    const latestAvg = Number(latest.avg_precipitation || 0);
    const prevAvg = Number(prev.avg_precipitation || 0);
    const deltaVal = latestAvg - prevAvg;
    const deltaPct = prevAvg > 0 ? (deltaVal / prevAvg) * 100 : (latestAvg > 0 ? 100 : 0);

    let trend = 'neutral';
    if (deltaVal > 0.05) trend = 'up';
    else if (deltaVal < -0.05) trend = 'down';

    return {
      hasDelta: true,
      deltaVal,
      deltaPct,
      trend,
      prevAvg,
      prevTime: prev.observation_ist || prev.observation_time,
    };
  }, [timeline]);

  // Rain badge styling based on standard IMD criteria
  const rainBadgeVariant = useMemo(() => {
    if (maxPrecip >= 100) return 'danger';
    if (maxPrecip >= 50) return 'warning';
    if (maxPrecip >= 15) return 'info';
    return 'success';
  }, [maxPrecip]);

  // Prepare verifiable evidence items
  const evidenceMetrics = useMemo(() => {
    return [
      {
        label: 'Spatial Mean Rainfall (Average)',
        value: formatMetricValue(avgPrecip, 2),
        unit: 'mm/hr',
        source: `${source} INSAT-3DS`,
        status: 'Observed',
        isAlert: avgPrecip >= 15,
        note: 'Calculated across all intersecting PostGIS grid polygons',
      },
      {
        label: 'Peak Point Rainfall (Maximum)',
        value: formatMetricValue(maxPrecip, 2),
        unit: 'mm/hr',
        source: `${source} INSAT-3DS`,
        status: 'Observed',
        isAlert: maxPrecip >= 50,
        note: 'Highest single grid cell reading in the region',
      },
      {
        label: 'Minimum Observed Precipitation',
        value: formatMetricValue(minPrecip, 2),
        unit: 'mm/hr',
        source: `${source} INSAT-3DS`,
        status: 'Observed',
        note: 'Baseline spatial cell precipitation value',
      },
      {
        label: 'Active Spatial Sensor Points',
        value: totalPoints.toLocaleString(),
        unit: 'cells',
        source: 'PostGIS Spatial Engine',
        status: 'Verified',
        note: 'Valid boundary intersection cells with non-null readings',
      },
      {
        label: 'Previous Period Spatial Mean',
        value: deltaMetrics.hasDelta ? formatMetricValue(deltaMetrics.prevAvg, 2) : 'Baseline',
        unit: deltaMetrics.hasDelta ? 'mm/hr' : '',
        source: `${source} Ingestion Ledger`,
        status: 'Recorded',
        note: deltaMetrics.prevTime ? `Prior cycle: ${deltaMetrics.prevTime}` : 'First recorded interval',
      },
      {
        label: 'Temporal Rate of Change (Delta)',
        value: deltaMetrics.hasDelta
          ? `${deltaMetrics.deltaVal > 0 ? '+' : ''}${deltaMetrics.deltaVal.toFixed(2)} mm/hr (${deltaMetrics.deltaPct.toFixed(1)}%)`
          : '0.00 mm/hr (0%)',
        unit: '',
        source: 'Mathematical Derivative',
        status: 'Derived',
        isAlert: deltaMetrics.deltaPct > 25,
        note: 'Interval-to-interval delta between consecutive observations',
      },
    ];
  }, [avgPrecip, maxPrecip, minPrecip, totalPoints, deltaMetrics, source]);

  return (
    <section id="section-descriptive" className="scroll-mt-6">
      {/* Section Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 md:p-6 shadow-xs mb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-700 shrink-0 font-mono font-bold text-sm">
              01
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-700">
                  Descriptive Analysis
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Verified Observations
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                What happened in {locationName}?
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
                Empirical summary of recorded precipitation, peak cell intensity, spatial sensor density, and rate of change compared to prior observation cycles.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
            <span className="text-xs text-slate-500 font-medium">IMD State:</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
              rainBadgeVariant === 'danger'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : rainBadgeVariant === 'warning'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : rainBadgeVariant === 'info'
                ? 'bg-sky-50 text-sky-700 border-sky-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {rainCategory}
            </span>
          </div>
        </div>

        {/* 1. Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Card 1: Average Precipitation */}
          <MetricCard
            title="Spatial Mean Rainfall"
            value={formatMetricValue(avgPrecip, 2)}
            unit="mm/hr"
            subtitle="Integrated spatial mean across all observation cells"
            badgeText={rainCategory}
            badgeVariant={rainBadgeVariant}
            icon={CloudRain}
          />

          {/* Card 2: Peak Intensity */}
          <MetricCard
            title="Peak Rain Intensity"
            value={formatMetricValue(maxPrecip, 2)}
            unit="mm/hr"
            subtitle="Highest localized observation cell reading"
            badgeText={maxPrecip >= 50 ? 'Heavy Core' : maxPrecip >= 15 ? 'Moderate' : 'Normal'}
            badgeVariant={maxPrecip >= 50 ? 'danger' : maxPrecip >= 15 ? 'warning' : 'neutral'}
            icon={Activity}
          />

          {/* Card 3: Delta vs Previous Period */}
          <div className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Change vs Previous Cycle
                </span>
                {deltaMetrics.trend === 'up' ? (
                  <TrendingUp className="w-4 h-4 text-rose-600" />
                ) : deltaMetrics.trend === 'down' ? (
                  <TrendingDown className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Minus className="w-4 h-4 text-slate-400" />
                )}
              </div>

              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                  {deltaMetrics.hasDelta
                    ? `${deltaMetrics.deltaVal > 0 ? '+' : ''}${deltaMetrics.deltaVal.toFixed(2)}`
                    : '0.00'}
                </span>
                <span className="text-xs font-bold text-slate-500">mm/hr</span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                {deltaMetrics.hasDelta ? `${deltaMetrics.deltaPct.toFixed(1)}% vs prior` : 'Baseline period'}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                deltaMetrics.trend === 'up'
                  ? 'bg-rose-50 text-rose-700'
                  : deltaMetrics.trend === 'down'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {deltaMetrics.trend === 'up' ? 'Intensifying' : deltaMetrics.trend === 'down' ? 'Abating' : 'Stable'}
              </span>
            </div>
          </div>

          {/* Card 4: Sensor Coverage Mesh */}
          <MetricCard
            title="Spatial Grid Points"
            value={totalPoints > 0 ? totalPoints.toLocaleString() : '—'}
            unit="pts"
            subtitle="Valid PostGIS polygon intersection cells"
            badgeText="4km Mesh"
            badgeVariant="info"
            icon={Layers}
          />
        </div>

        {/* 2. Descriptive Time-Series Trend Visualization */}
        <WeatherTrendChart
          timeline={timeline}
          isLoading={isLoading}
          activeMetric={activeMetric}
          onChangeMetric={onChangeMetric}
          locationName={locationName}
        />

        {/* 3. Reusable Evidence Panel */}
        <EvidencePanel
          title="Stage 01 Evidence: Observed Telemetry & Provenance"
          metrics={evidenceMetrics}
          sources={[
            source === 'MOSDAC' ? 'ISRO MOSDAC INSAT-3DS HEM' : 'NASA IMERG Early Run',
            'PostGIS Spatial Mesh Engine',
            'IMD Rainfall Standard Classification',
          ]}
          observationPeriod="Active 7-Day Rolling Observation Window"
          lastUpdated={latestObservationIst || 'Current Telemetry'}
          geographicScope={`${locationName} (${scopeType.toUpperCase()})`}
          methodology="Observed precipitation values are ingested at 4km spatial resolution from geostationary meteorological satellites, polygon-clipped via PostGIS ST_Intersects, and rolled up using area-weighted spatial aggregation. No synthetic or generated points are included."
        />
      </div>
    </section>
  );
}

export default DescriptiveSection;
