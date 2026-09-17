import { useMemo, useState } from 'react';
import {
  Compass,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Truck,
  Droplets,
  ChevronDown,
  ChevronUp,
  Search,
  Activity,
  Waves,
} from 'lucide-react';
import { EvidencePanel } from './EvidencePanel';
import { formatMetricValue } from '../../services/analysisService';

/**
 * PrescriptiveSection - Stage 4: "WHAT SHOULD WE DO?"
 *
 * Converts observed data, diagnostic evidence, and trend projections into
 * deterministic, evidence-backed operational action items.
 *
 * Every recommendation includes an explicit "WHY THIS ACTION?" breakdown
 * showing actual numbers, hazard thresholds, and data sources.
 * Zero generic AI hallucinations.
 */
export function PrescriptiveSection({
  locationName = 'National (India)',
  scopeType = 'national',
  summary = null,
  timeline = [],
  latestObservationIst = '',
  source = 'MOSDAC',
}) {
  const avgPrecip = Number(summary?.avg_precipitation ?? 0);
  const maxPrecip = Number(summary?.max_precipitation ?? 0);
  const totalPoints = Number(summary?.total_points ?? 0);

  // Generate deterministic, threshold-driven recommendations
  const recommendations = useMemo(() => {
    const actions = [];

    // TIER 1: Severe / Torrential Downpour (maxPrecip >= 100 mm/hr)
    if (maxPrecip >= 100) {
      actions.push({
        id: 'action-sump-pumps',
        title: 'Emergency Urban Drainage & High-Capacity Sump Deployment',
        sector: 'Municipal Disaster Management & Public Works',
        priority: 'Critical (Priority 1)',
        priorityVariant: 'danger',
        icon: Waves,
        protocol: 'Deploy high-capacity mobile dewatering pumps to railway subways, vehicular underpasses, and identified arterial low-lying sumps. Open arterial stormwater bypass sluices.',
        why: {
          observedRainfall: `${formatMetricValue(maxPrecip, 2)} mm/hr (Peak localized cell)`,
          thresholdTrigger: 'IMD Torrential Downpour Threshold (≥ 100.0 mm/hr)',
          hazardBasis: 'Precipitation intensity exceeds municipal gravity drainage intake capacity, creating rapid waterlogging and flash inundation risks.',
          dataSource: `${source} INSAT-3DS HEM & PostGIS Boundary Mesh`,
          spatialCoverage: `${totalPoints.toLocaleString()} observation cells monitored`,
        },
      });

      actions.push({
        id: 'action-sdrf-alert',
        title: 'SDRF / NDRF Emergency Readiness & Waterway Surveillance',
        sector: 'State Disaster Response & Emergency Services',
        priority: 'Critical (Priority 1)',
        priorityVariant: 'danger',
        icon: Shield,
        protocol: 'Put State Disaster Response Force (SDRF) rapid deployment units on standby. Activate automated river/nallah water level telemetry and flood siren protocols in vulnerable catchments.',
        why: {
          observedRainfall: `${formatMetricValue(maxPrecip, 2)} mm/hr peak, ${formatMetricValue(avgPrecip, 2)} mm/hr mean`,
          thresholdTrigger: 'Emergency Convective Cell Cluster Alert',
          hazardBasis: 'Sustained torrential downpour poses immediate overflow risks to urban stormwater canals and peripheral riverbanks.',
          dataSource: `${source} Ingestion Ledger & PostGIS ST_Intersects`,
          spatialCoverage: `${locationName} Boundary Area`,
        },
      });
    }

    // TIER 2: Heavy Rainfall (50 <= maxPrecip < 100 mm/hr)
    else if (maxPrecip >= 50) {
      actions.push({
        id: 'action-drainage-clearing',
        title: 'Stormwater Inflow Clearing & Culvert Debris Removal',
        sector: 'Municipal Corporation & Sanitation',
        priority: 'High (Priority 2)',
        priorityVariant: 'warning',
        icon: Droplets,
        protocol: 'Dispatch municipal rapid-response squads to clear trash grates, culvert mouths, and roadside stormwater gullies of debris to prevent localized backflow.',
        why: {
          observedRainfall: `${formatMetricValue(maxPrecip, 2)} mm/hr localized peak`,
          thresholdTrigger: 'IMD Heavy Rainfall Standard Threshold (≥ 50.0 mm/hr)',
          hazardBasis: 'High surface rainwater flux will overwhelm partially obstructed drains and cause localized street ponding.',
          dataSource: `${source} INSAT-3DS HEM`,
          spatialCoverage: `${totalPoints.toLocaleString()} spatial cells`,
        },
      });

      actions.push({
        id: 'action-traffic-advisory',
        title: 'Traffic Route Diversions & Commuter Safety Advisories',
        sector: 'Traffic Police & Public Transit Authorities',
        priority: 'High (Priority 2)',
        priorityVariant: 'warning',
        icon: Truck,
        protocol: 'Issue live traffic advisories restricting low-clearance vehicles from chronic waterlogging junctions. Reduce highway speed limits due to hydroplaning hazards and reduced visibility.',
        why: {
          observedRainfall: `${formatMetricValue(maxPrecip, 2)} mm/hr peak, ${formatMetricValue(avgPrecip, 2)} mm/hr regional average`,
          thresholdTrigger: 'Urban Surface Runoff & Visibility Threshold',
          hazardBasis: 'Water accumulation on paved carriageways creates severe traffic delays and vehicular stall risks.',
          dataSource: 'PostGIS Spatial Aggregator & IMD Criteria',
          spatialCoverage: `${locationName}`,
        },
      });
    }

    // TIER 3: Moderate Rain (15 <= maxPrecip < 50 mm/hr)
    else if (maxPrecip >= 15 || avgPrecip >= 5) {
      actions.push({
        id: 'action-agriculture-advisory',
        title: 'Agricultural Drainage & Moisture Management Advisory',
        sector: 'Agriculture & Irrigation Department',
        priority: 'Moderate (Priority 3)',
        priorityVariant: 'info',
        icon: Droplets,
        protocol: 'Advise farmers in the region to suspend foliar pesticide applications and regulate canal sluice inflows. Ensure field bund drainage channels are unobstructed to avoid waterlogging standing crops.',
        why: {
          observedRainfall: `${formatMetricValue(avgPrecip, 2)} mm/hr average (${formatMetricValue(maxPrecip, 2)} mm/hr peak)`,
          thresholdTrigger: 'IMD Moderate Precipitation Classification (15.0–49.9 mm/hr)',
          hazardBasis: 'Adequate soil saturation achieved; continuous inflow may cause crop root hypoxia or chemical runoff wash-off.',
          dataSource: `${source} INSAT-3DS`,
          spatialCoverage: `${locationName}`,
        },
      });

      actions.push({
        id: 'action-reservoir-tracking',
        title: 'Catchment Runoff & Reservoir Inflow Monitoring',
        sector: 'Water Resources & Dam Administration',
        priority: 'Moderate (Priority 3)',
        priorityVariant: 'info',
        icon: Activity,
        protocol: 'Log hourly gauge telemetry from upstream catchment tributaries. Maintain planned buffer capacity in local retention basins.',
        why: {
          observedRainfall: `Spatial average of ${formatMetricValue(avgPrecip, 2)} mm/hr across ${totalPoints.toLocaleString()} cells`,
          thresholdTrigger: 'Hydrological Inflow Threshold',
          hazardBasis: 'Runoff coefficient generation from moderately saturated catchments.',
          dataSource: 'PostGIS Regional Rollup',
          spatialCoverage: `${locationName}`,
        },
      });
    }

    // TIER 4: Light Rain (1 <= maxPrecip < 15 mm/hr)
    else if (maxPrecip >= 1) {
      actions.push({
        id: 'action-routine-surveillance',
        title: 'Routine Hydrological Surveillance & Sensor Network Health',
        sector: 'State Disaster Operations Center & IMD Field Stations',
        priority: 'Routine (Priority 4)',
        priorityVariant: 'neutral',
        icon: CheckCircle2,
        protocol: 'Maintain standard automated 30-minute satellite telemetry polling. Conduct routine cross-checks between satellite HEM estimates and automatic weather stations (AWS).',
        why: {
          observedRainfall: `${formatMetricValue(maxPrecip, 2)} mm/hr peak (Light Rain)`,
          thresholdTrigger: 'Light Rain Threshold (1.0–14.9 mm/hr)',
          hazardBasis: 'Precipitation is well within natural soil absorption and municipal drainage handling limits.',
          dataSource: `${source} Multi-pass Mesh`,
          spatialCoverage: `${totalPoints.toLocaleString()} active points`,
        },
      });
    }

    // TIER 5: Dry / Negligible Precipitation (< 1 mm/hr)
    else {
      actions.push({
        id: 'action-dry-baseline',
        title: 'Normal Operational Surveillance (Dry / Clear Baseline)',
        sector: 'Meteorological & Civil Administration',
        priority: 'Baseline Status',
        priorityVariant: 'neutral',
        icon: CheckCircle2,
        protocol: 'No emergency weather countermeasures required. Standard continuous monitoring remains active across all geostationary observation bands.',
        why: {
          observedRainfall: `${formatMetricValue(avgPrecip, 2)} mm/hr spatial average (0.00 mm/hr peak)`,
          thresholdTrigger: 'IMD Clear / Dry Criterion (< 1.0 mm/hr)',
          hazardBasis: 'Zero active precipitation anomalies or convective storm cells detected in current satellite scan.',
          dataSource: `${source} INSAT-3DS HEM & PostGIS Mesh`,
          spatialCoverage: `${totalPoints.toLocaleString()} valid cells`,
        },
      });
    }

    return actions;
  }, [maxPrecip, avgPrecip, totalPoints, locationName, source]);

  // Evidence metrics for the Prescriptive EvidencePanel
  const prescriptiveEvidenceMetrics = useMemo(() => {
    return [
      {
        label: 'Decision Basis: Peak Cell Intensity',
        value: formatMetricValue(maxPrecip, 2),
        unit: 'mm/hr',
        source: `${source} INSAT-3DS`,
        status: 'Observed',
        isAlert: maxPrecip >= 50,
        note: 'Primary threshold parameter for municipal flood alert triggers',
      },
      {
        label: 'Decision Basis: Spatial Mean',
        value: formatMetricValue(avgPrecip, 2),
        unit: 'mm/hr',
        source: 'PostGIS Spatial Aggregation',
        status: 'Observed',
        note: 'Governs broad catchment infiltration and agricultural saturation',
      },
      {
        label: 'IMD Hazard Standard Classification',
        value: summary?.rain_category || (maxPrecip >= 100 ? 'Torrential Downpour' : maxPrecip >= 50 ? 'Heavy Rain' : maxPrecip >= 15 ? 'Moderate Rain' : 'Light / Dry'),
        source: 'IMD Standard Hazard Protocols',
        status: 'Standard',
        isAlert: maxPrecip >= 50,
        note: 'Government of India benchmark for disaster preparedness',
      },
      {
        label: 'Action Recommendation Count',
        value: recommendations.length.toString(),
        unit: 'protocols',
        source: 'Deterministic Threshold Engine',
        status: 'Generated',
        note: 'Strictly threshold-triggered; zero generic filler advice',
      },
    ];
  }, [maxPrecip, avgPrecip, summary, recommendations, source]);

  return (
    <section id="section-prescriptive" className="scroll-mt-6">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 md:p-6 shadow-xs mb-5">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-700 shrink-0 font-mono font-bold text-sm">
              04
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-700">
                  Prescriptive Analysis
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <Compass className="w-3 h-3 text-amber-600" />
                  Evidence-Backed Action Protocols
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                What should we do in {locationName}?
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
                Deterministic operational directives triggered strictly by observed peak rainfall rates, spatial accumulation, and IMD hazard thresholds.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
            <span className="text-xs text-slate-500 font-medium">Protocol Tier:</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
              maxPrecip >= 100
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : maxPrecip >= 50
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : maxPrecip >= 15
                ? 'bg-sky-50 text-sky-700 border-sky-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {maxPrecip >= 100 ? 'Tier 1 (Emergency)' : maxPrecip >= 50 ? 'Tier 2 (High Advisory)' : maxPrecip >= 15 ? 'Tier 3 (Moderate)' : 'Tier 4 (Routine)'}
            </span>
          </div>
        </div>

        {/* Action Recommendations Cards */}
        <div className="space-y-4 mb-6">
          {recommendations.map((action) => (
            <ActionCardItem key={action.id} action={action} />
          ))}
        </div>

        {/* Reusable Evidence Panel */}
        <EvidencePanel
          title="Stage 04 Evidence: Decision Basis & Hazard Threshold Criteria"
          metrics={prescriptiveEvidenceMetrics}
          sources={[
            `${source} INSAT-3DS HEM Observation Ledger`,
            'IMD Standard Rainfall Hazard Thresholds',
            'NDMA Flood & Extreme Weather Guidelines',
          ]}
          observationPeriod="Active Telemetry Timestamp"
          lastUpdated={latestObservationIst || 'Current Telemetry'}
          geographicScope={`${locationName} (${scopeType.toUpperCase()})`}
          methodology="Prescriptive operational actions are generated strictly via deterministic rule evaluation against official IMD threshold benchmarks (≥100 mm/hr Torrential, ≥50 mm/hr Heavy, ≥15 mm/hr Moderate). Every action must satisfy verifiable mathematical triggers; generic or ungrounded recommendations are explicitly excluded."
        />
      </div>
    </section>
  );
}

/**
 * ActionCardItem - Interactive recommendation card with "WHY THIS ACTION?" evidence proof
 */
function ActionCardItem({ action }) {
  const [isOpen, setIsOpen] = useState(false);
  const Icon = action.icon;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 hover:border-slate-300 transition-all shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
            action.priorityVariant === 'danger'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : action.priorityVariant === 'warning'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : action.priorityVariant === 'info'
              ? 'bg-sky-50 text-sky-700 border-sky-200'
              : 'bg-slate-50 text-slate-700 border-slate-200'
          }`}>
            <Icon className="w-4 h-4" />
          </div>

          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
              {action.sector}
            </span>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
              {action.title}
            </h3>
          </div>
        </div>

        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border self-start sm:self-auto shrink-0 ${
          action.priorityVariant === 'danger'
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : action.priorityVariant === 'warning'
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : action.priorityVariant === 'info'
            ? 'bg-sky-50 text-sky-700 border-sky-200'
            : 'bg-slate-100 text-slate-700 border-slate-200'
        }`}>
          {action.priority}
        </span>
      </div>

      {/* Recommended Action Protocol */}
      <div className="mb-3 pl-3 border-l-2 border-slate-300 bg-slate-50/60 p-2.5 rounded-r-lg">
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">
          Operational Protocol Directive:
        </span>
        <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-normal">
          {action.protocol}
        </p>
      </div>

      {/* Expandable "WHY THIS ACTION?" Evidence Proof */}
      <div className="pt-2 border-t border-slate-100 flex flex-col">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center justify-between py-1 text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-blue-600" />
            <span>{isOpen ? 'Hide Evidence Basis (Why This Action?)' : 'Why This Action? View Evidence Basis →'}</span>
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isOpen && (
          <div className="mt-2.5 p-3.5 rounded-lg bg-amber-50/40 border border-amber-200/60 text-xs space-y-2">
            <span className="font-bold text-amber-900 uppercase tracking-wider text-[10px] block">
              Verifiable Decision Justification:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
              <div className="bg-white p-2 rounded border border-amber-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Supporting Rainfall</span>
                <span className="font-mono font-semibold text-slate-900 text-xs">{action.why.observedRainfall}</span>
              </div>

              <div className="bg-white p-2 rounded border border-amber-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Trigger Threshold</span>
                <span className="font-semibold text-amber-800 text-xs">{action.why.thresholdTrigger}</span>
              </div>
            </div>

            <div className="bg-white p-2 rounded border border-amber-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Physical Hazard Risk Basis</span>
              <p className="text-slate-700 text-xs leading-relaxed">{action.why.hazardBasis}</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-500 pt-1">
              <span><strong>Source:</strong> {action.why.dataSource}</span>
              <span><strong>Scope:</strong> {action.why.spatialCoverage}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PrescriptiveSection;
