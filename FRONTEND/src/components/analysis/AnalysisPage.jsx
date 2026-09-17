import { useState, useMemo } from 'react';
import {
  AlertTriangle,
} from 'lucide-react';
import { LocationSelector } from './LocationSelector';
import { PipelineStepper, PipelineConnector } from './PipelineStepper';
import { DescriptiveSection } from './DescriptiveSection';
import { DiagnosticSection } from './DiagnosticSection';
import { PredictiveSection } from './PredictiveSection';
import { PrescriptiveSection } from './PrescriptiveSection';
import { WeatherSummary } from './WeatherSummary';
import { AnalysisTable } from './AnalysisTable';
import { LoadingState } from './AnalysisStateViews';

/**
 * AnalysisPage - Independent Meteorological Big Data Analytics Workspace
 *
 * Implements the 4-stage analytical reasoning pipeline:
 * DESCRIPTIVE (01: What happened?)
 *       ↓
 * DIAGNOSTIC  (02: Why did it happen?)
 *       ↓
 * PREDICTIVE  (03: What will happen?)
 *       ↓
 * PRESCRIPTIVE (04: What should we do?)
 *
 * Driven by a Single Source of Truth across National (India), State, and District scopes.
 * Strictly zero mock data, zero random generators, zero AI hallucinations.
 */
export function AnalysisPage({
  // Authoritative Shared State from Parent
  selectedState = null,
  selectedDistrict = null,
  onSelectState,
  onSelectDistrict,
  onFitIndia,
  selectedTime = null,
  onTimeChange,
  overviewData = null,
  stateData = null,
  districtData = null,
  historicalTimeline = [],
  isLoading = false,
  isHistoricalLoading = false,
  error = null,
  metadata = null,
  onRetry,
}) {
  const [activeMetric, setActiveMetric] = useState('rainfall');
  const [activePipelineStep, setActivePipelineStep] = useState('descriptive');

  // Compute Active Location Display Name
  const locationDisplayName = useMemo(() => {
    if (selectedDistrict && selectedState) {
      return `${selectedDistrict}, ${selectedState}`;
    }
    if (selectedState) {
      return `${selectedState}`;
    }
    return 'National (India)';
  }, [selectedState, selectedDistrict]);

  // Compute Scope Type: 'national' | 'state' | 'district'
  const scopeType = useMemo(() => {
    if (selectedDistrict) return 'district';
    if (selectedState) return 'state';
    return 'national';
  }, [selectedState, selectedDistrict]);

  // Compute Active Summary object strictly from the current level of hierarchy
  const activeSummary = useMemo(() => {
    if (scopeType === 'district' && districtData?.district_summary) {
      return districtData.district_summary;
    }
    if (scopeType === 'state' && stateData?.state_summary) {
      return stateData.state_summary;
    }
    if (overviewData?.national_summary) {
      return overviewData.national_summary;
    }
    return null;
  }, [scopeType, districtData, stateData, overviewData]);

  // Extract valid districts for currently selected state
  const availableDistricts = useMemo(() => {
    if (!selectedState || !stateData?.district_summaries) return [];
    return stateData.district_summaries
      .map((d) => d?.district_name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [selectedState, stateData]);

  // Compute latest observation timestamp for banner and provenance
  const latestObservationIst = useMemo(() => {
    if (activeSummary?.observation_ist) return activeSummary.observation_ist;
    if (stateData?.observation_ist) return stateData.observation_ist;
    if (districtData?.observation_ist) return districtData.observation_ist;
    if (overviewData?.observation_ist) return overviewData.observation_ist;
    if (metadata?.latest_observation_ist) return metadata.latest_observation_ist;
    return '';
  }, [activeSummary, stateData, districtData, overviewData, metadata]);

  // Active data source label (MOSDAC / NASA)
  const activeSource = useMemo(() => {
    if (districtData?.source) return districtData.source;
    if (stateData?.source) return stateData.source;
    if (overviewData?.source) return overviewData.source;
    return metadata?.source || 'MOSDAC';
  }, [districtData, stateData, overviewData, metadata]);

  const hasAnyData = overviewData != null || stateData != null || districtData != null || (historicalTimeline && historicalTimeline.length > 0);

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 py-8">
      {/* 1. Page Header: Title, Description & Authority Branding */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold uppercase tracking-widest text-blue-600">
            TATVA Meteorological Intelligence
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs font-semibold text-slate-500">
            Analytical Reasoning Pipeline
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
          Weather Analytics & Decision Support
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
          Four-stage meteorological reasoning: Descriptive observations, Diagnostic factor evaluation, Predictive trend outlook, and Prescriptive operational directives across India, States, and Districts.
        </p>
      </div>

      {/* Error Notice Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* 2. Unified Location & Observation Controls (Single Source of Truth) */}
      <LocationSelector
        selectedState={selectedState}
        selectedDistrict={selectedDistrict}
        onSelectState={onSelectState}
        onSelectDistrict={onSelectDistrict}
        onFitIndia={onFitIndia}
        availableDistricts={availableDistricts}
        selectedTime={selectedTime}
        onTimeChange={onTimeChange}
        availableTimestamps={metadata?.available_timestamps || []}
        isUpdating={isLoading || isHistoricalLoading}
        latestObservationIst={latestObservationIst}
      />

      {/* 3. Visual 4-Stage Reasoning Architecture Stepper */}
      <PipelineStepper
        activeSection={activePipelineStep}
        onSelectSection={setActivePipelineStep}
      />

      {/* Main Analysis Body */}
      {isLoading && !hasAnyData ? (
        <LoadingState message={`Querying authoritative meteorological observations for ${locationDisplayName}...`} />
      ) : (
        <div className="space-y-2">
          {/* =========================================================
              STAGE 01: DESCRIPTIVE (WHAT HAPPENED?)
              ========================================================= */}
          <DescriptiveSection
            locationName={locationDisplayName}
            scopeType={scopeType}
            summary={activeSummary}
            timeline={historicalTimeline}
            isLoading={isHistoricalLoading}
            activeMetric={activeMetric}
            onChangeMetric={setActiveMetric}
            latestObservationIst={latestObservationIst}
            source={activeSource}
          />

          <PipelineConnector
            label="Feeds observed evidence into"
            targetStage="Stage 02 (Diagnostic Analysis)"
          />

          {/* =========================================================
              STAGE 02: DIAGNOSTIC (WHY DID IT HAPPEN?)
              ========================================================= */}
          <DiagnosticSection
            locationName={locationDisplayName}
            scopeType={scopeType}
            summary={activeSummary}
            timeline={historicalTimeline}
            anomalies={districtData?.anomalies || []}
            latestObservationIst={latestObservationIst}
            source={activeSource}
          />

          <PipelineConnector
            label="Feeds physical factors into"
            targetStage="Stage 03 (Predictive Outlook)"
          />

          {/* =========================================================
              STAGE 03: PREDICTIVE (WHAT WILL HAPPEN?)
              ========================================================= */}
          <PredictiveSection
            locationName={locationDisplayName}
            scopeType={scopeType}
            summary={activeSummary}
            timeline={historicalTimeline}
            latestObservationIst={latestObservationIst}
            source={activeSource}
          />

          <PipelineConnector
            label="Feeds projected risk & thresholds into"
            targetStage="Stage 04 (Prescriptive Directives)"
          />

          {/* =========================================================
              STAGE 04: PRESCRIPTIVE (WHAT SHOULD WE DO?)
              ========================================================= */}
          <PrescriptiveSection
            locationName={locationDisplayName}
            scopeType={scopeType}
            summary={activeSummary}
            timeline={historicalTimeline}
            latestObservationIst={latestObservationIst}
            source={activeSource}
          />

          {/* =========================================================
              REGIONAL COMPARISON & GRANULAR OBSERVATION RECORDS
              ========================================================= */}
          <div className="pt-8 border-t border-slate-200/90 mt-10">
            <div className="mb-6">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 block">
                Spatial Hierarchy & Records
              </span>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Comparative Regional Telemetry & Observation Data
              </h2>
            </div>

            {/* Regional Ranking & Breakdown Table */}
            <WeatherSummary
              scopeType={scopeType}
              locationName={locationDisplayName}
              summary={activeSummary}
              stateSummaries={overviewData?.state_summaries || []}
              districtSummaries={stateData?.district_summaries || []}
              onSelectState={onSelectState}
              onSelectDistrict={onSelectDistrict}
            />

            {/* Granular Observation Data Table & CSV Export */}
            <AnalysisTable
              timeline={historicalTimeline}
              locationName={locationDisplayName}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalysisPage;
