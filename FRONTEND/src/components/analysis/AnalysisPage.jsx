import { useState, useEffect, useCallback, useTransition } from 'react';
import { Eye, Search, TrendingUp, ShieldAlert, Layers } from 'lucide-react';
import { AnalysisHeader } from './AnalysisHeader';
import { AnalysisQuery } from './AnalysisQuery';
import { AnalysisModeSelector } from './AnalysisModeSelector';
import { WeatherKPIs } from './WeatherKPIs';
import { HistoricalForecastChart } from './HistoricalForecastChart';
import { ForecastProbabilityChart } from './ForecastProbabilityChart';
import { AnomalyChart } from './AnomalyChart';
import { MultiVariableWeatherGraph } from './MultiVariableWeatherGraph';
import { WeatherCorrelation } from './WeatherCorrelation';
import { WeatherDistribution } from './WeatherDistribution';
import { ForecastPerformance } from './ForecastPerformance';
import { DiagnosticPanel } from './DiagnosticPanel';
import { PredictivePanel } from './PredictivePanel';
import { PrescriptivePanel } from './PrescriptivePanel';
import { ScenarioSimulator } from './ScenarioSimulator';
import { EventCorrelation } from './EventCorrelation';
import { WeatherAnomalyMonitor } from './WeatherAnomalyMonitor';
import { AnalysisMap } from './AnalysisMap';
import { TimeMachine } from './TimeMachine';
import { DataSources } from './DataSources';
import { AIExplanationPanel } from './AIExplanationPanel';
import { ExportShareModal } from './ExportShareModal';

const MODES_CONFIG = {
  descriptive: {
    id: 'descriptive',
    stageNumber: '01',
    title: 'Descriptive Analysis',
    badge: 'Observed & Baseline',
    question: 'What happened?',
    summary: 'Empirical telemetry, observed precipitation & temperature departures, and historical percentiles vs 30-year climatological normal.',
    borderClass: 'border-sky-500/40',
    bgClass: 'bg-sky-500/10',
    textClass: 'text-sky-300',
    accentGrad: 'from-sky-500/20 via-blue-900/20 to-transparent',
    icon: Eye,
  },
  diagnostic: {
    id: 'diagnostic',
    stageNumber: '02',
    title: 'Diagnostic Analysis',
    badge: 'Causal Attribution',
    question: 'Why did it happen?',
    summary: 'Multi-variable atmospheric coupling, synoptic causal attribution chains, and 7×7 Pearson correlation dynamics explaining atmospheric drivers.',
    borderClass: 'border-cyan-500/40',
    bgClass: 'bg-cyan-500/10',
    textClass: 'text-cyan-300',
    accentGrad: 'from-cyan-500/20 via-blue-900/20 to-transparent',
    icon: Search,
  },
  predictive: {
    id: 'predictive',
    stageNumber: '03',
    title: 'Predictive Analysis',
    badge: 'NWP Ensembles',
    question: 'What happens next?',
    summary: 'Numerical Weather Prediction (NWP) multi-model ensemble spread, hazard exceedance probabilities, 72h-168h lead horizons, and error degradation.',
    borderClass: 'border-indigo-500/40',
    bgClass: 'bg-indigo-500/10',
    textClass: 'text-indigo-300',
    accentGrad: 'from-indigo-500/20 via-blue-900/20 to-transparent',
    icon: TrendingUp,
  },
  prescriptive: {
    id: 'prescriptive',
    stageNumber: '04',
    title: 'Prescriptive Analysis',
    badge: 'Action Matrix',
    question: 'What should be prioritized?',
    summary: 'Tiered vulnerability hotspots, recommended mitigation actions, critical infrastructure exposure, and interactive what-if perturbation stress tests.',
    borderClass: 'border-amber-500/40',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-300',
    accentGrad: 'from-amber-500/20 via-rose-900/20 to-transparent',
    icon: ShieldAlert,
  },
  all: {
    id: 'all',
    stageNumber: 'ALL',
    title: 'All Analytical Modes',
    badge: 'Unified Pipeline',
    question: 'Complete End-to-End Pipeline',
    summary: 'Comprehensive view of all 4 analytical stages: Descriptive (Observed), Diagnostic (Causal), Predictive (Ensembles), and Prescriptive (Actions).',
    borderClass: 'border-blue-500/40',
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-300',
    accentGrad: 'from-blue-500/20 via-indigo-900/20 to-transparent',
    icon: Layers,
  },
};


import {
  LOCATIONS,
  getLiveKPIs,
  getLiveKPIsSync,
  getHistoricalAndForecastSeries,
  getHistoricalAndForecastSeriesSync,
  getHazardProbabilities,
  getHazardProbabilitiesSync,
  getAnomalyTimeSeries,
  getAnomalyTimeSeriesSync,
  runIntelligenceQuery,
} from '../../services/analysisService';

export function AnalysisPage({
  // Props forwarded from parent for map & live data integration
  overviewData,
  stateData,
  districtData,
  isLoading: isParentLoading,
  loadingMsg: parentLoadingMsg,
  opacity,
  onOpacityChange,
  activeProductId,
  onSelectProduct,
  productData,
  productStatusMap,
  metadata,
  wsStatus,
  wsTelemetry: _wsTelemetry,
  onSelectState,
  onSelectDistrict,
  onFitIndia,
  onBackToState,
  selectedTime,
  onTimeChange,
}) {
  // 1. Navigation & Scope State
  const [selectedLocation, setSelectedLocation] = useState(LOCATIONS[2]); // Default: Ahmedabad, Gujarat
  const [timeRange, setTimeRange] = useState('7d');
  const [dataSource, setDataSource] = useState('multi');
  const [activeMode, setActiveMode] = useState('descriptive');
  const [horizonHours, setHorizonHours] = useState(72);
  const [anomalyMetric, setAnomalyMetric] = useState('rainfall');

  // 2. Data State (Synchronously initialized for instantaneous render with zero flash/null reference)
  const [kpiData, setKpiData] = useState(() => getLiveKPIsSync(LOCATIONS[2].id));
  const [timeSeriesData, setTimeSeriesData] = useState(() => getHistoricalAndForecastSeriesSync(LOCATIONS[2].id, 72));
  const [probabilityData, setProbabilityData] = useState(() => getHazardProbabilitiesSync(LOCATIONS[2].id));
  const [anomalyData, setAnomalyData] = useState(() => getAnomalyTimeSeriesSync(LOCATIONS[2].id, 'rainfall'));
  const [queryResult, setQueryResult] = useState(null);

  // 3. UI Control State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedTimeSlice, setSelectedTimeSlice] = useState('NOW (Live Telemetry)');
  const [, startTransition] = useTransition();

  // Load active data for selected location
  const loadLocationData = useCallback(async (loc, horizon = horizonHours, anomMet = anomalyMetric) => {
    setIsAnalyzing(true);
    try {
      const [kpis, series, probs, anoms] = await Promise.all([
        getLiveKPIs(loc.id),
        getHistoricalAndForecastSeries(loc.id, horizon),
        getHazardProbabilities(loc.id),
        getAnomalyTimeSeries(loc.id, anomMet),
      ]);

      startTransition(() => {
        setKpiData(kpis);
        setTimeSeriesData(series);
        setProbabilityData(probs);
        setAnomalyData(anoms);
      });
    } catch (err) {
      console.error('Error loading weather intelligence data:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [horizonHours, anomalyMetric]);

  // Initial load & when selectedLocation changes
  useEffect(() => {
    loadLocationData(selectedLocation, horizonHours, anomalyMetric);
  }, [selectedLocation, horizonHours, anomalyMetric, loadLocationData]);

  // Handlers
  const handleSelectLocation = (loc) => {
    setSelectedLocation(loc);
    if (loc.district && loc.state && onSelectDistrict) {
      onSelectDistrict(loc.district);
    } else if (loc.state && onSelectState) {
      onSelectState(loc.state);
    } else if (!loc.state && onFitIndia) {
      onFitIndia();
    }
  };

  const handleSelectHorizon = (h) => {
    setHorizonHours(h);
  };

  const handleSelectAnomalyMetric = (m) => {
    setAnomalyMetric(m);
  };

  const handleRunQuery = async (queryText) => {
    const result = await runIntelligenceQuery(queryText, selectedLocation.id);
    setQueryResult(result);
  };

  const handleClearResult = () => {
    setQueryResult(null);
  };

  const handleReset = () => {
    const ind = LOCATIONS[0]; // India
    setSelectedLocation(ind);
    setTimeRange('7d');
    setDataSource('multi');
    setActiveMode('descriptive');
    setHorizonHours(72);
    setAnomalyMetric('rainfall');
    setQueryResult(null);
  };

  const handleRunAnalysis = () => {
    loadLocationData(selectedLocation, horizonHours, anomalyMetric);
  };

  const handleTimeStepChange = (pos, label) => {
    setSelectedTimeSlice(label);
  };

  const handleSelectMode = (mode) => {
    setActiveMode(mode);
    const ribbon = document.getElementById('active-mode-workspace');
    if (ribbon) {
      ribbon.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const currModeConfig = MODES_CONFIG[activeMode] || MODES_CONFIG.descriptive;
  const ActiveIcon = currModeConfig.icon;

  // Reusable Map Component with mode-specific default layer
  const renderAnalysisMap = (modeOverride) => (
    <AnalysisMap
      selectedLocation={selectedLocation}
      onSelectLocation={handleSelectLocation}
      mapLevel={selectedLocation.district ? 'district' : selectedLocation.state ? 'state' : 'india'}
      overviewData={overviewData}
      stateData={stateData}
      districtData={districtData}
      isLoading={isParentLoading}
      loadingMsg={parentLoadingMsg}
      opacity={opacity}
      onOpacityChange={onOpacityChange}
      activeProductId={activeProductId}
      onSelectProduct={onSelectProduct}
      productData={productData}
      productStatusMap={productStatusMap}
      onBackToState={onBackToState}
      selectedTime={selectedTime}
      onTimeChange={onTimeChange}
      activeMode={modeOverride || activeMode}
    />
  );

  // Reusable TimeMachine Scrubber
  const renderTimeMachine = () => (
    <TimeMachine
      onTimeStepChange={handleTimeStepChange}
      selectedTimeLabel={selectedTimeSlice}
    />
  );

  return (
    <div className="w-full flex flex-col antialiased text-slate-100 select-none">
      {/* 1. Analysis Header with Location, Time, Ingestion Selectors */}
      <AnalysisHeader
        selectedLocation={selectedLocation}
        onSelectLocation={handleSelectLocation}
        timeRange={timeRange}
        onSelectTimeRange={setTimeRange}
        dataSource={dataSource}
        onSelectDataSource={setDataSource}
        activeMode={activeMode}
        onSelectMode={handleSelectMode}
        onRunAnalysis={handleRunAnalysis}
        onReset={handleReset}
        onOpenExport={() => setIsExportModalOpen(true)}
        isAnalyzing={isAnalyzing}
      />

      {/* 2. Intelligence Query Bar (NLP Atmospheric Search) */}
      <AnalysisQuery
        onRunQuery={handleRunQuery}
        queryResult={queryResult}
        onClearResult={handleClearResult}
        selectedLocation={selectedLocation}
      />

      {/* 3. Analysis Mode Selector (4 Connected Stages: Descriptive, Diagnostic, Predictive, Prescriptive) */}
      <AnalysisModeSelector
        activeMode={activeMode}
        onSelectMode={handleSelectMode}
      />

      {/* Active Mode Workspace Navigation Ribbon */}
      <div id="active-mode-workspace" className="scroll-mt-4 mb-6">
        <div className={`p-4 sm:p-5 rounded-2xl border ${currModeConfig.borderClass} bg-gradient-to-r ${currModeConfig.accentGrad} bg-[#081226]/95 shadow-xl backdrop-blur-md flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all duration-300`}>
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${currModeConfig.borderClass} ${currModeConfig.bgClass} shadow-inner`}>
              <ActiveIcon className={`w-6 h-6 ${currModeConfig.textClass}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase bg-blue-950 text-slate-300 border border-blue-800/60">
                  STAGE {currModeConfig.stageNumber}
                </span>
                <span className={`text-xs font-mono font-bold uppercase tracking-wider ${currModeConfig.textClass}`}>
                  {currModeConfig.badge}
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-xs text-slate-400 font-medium">
                  Active for <span className="text-white font-semibold">{selectedLocation.name}</span>
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2 mt-0.5">
                <span>{currModeConfig.title}</span>
                <span className="text-sm font-normal text-slate-400 italic hidden sm:inline">— “{currModeConfig.question}”</span>
              </h2>
              <p className="text-xs text-slate-300/80 mt-1 max-w-3xl leading-relaxed">
                {currModeConfig.summary}
              </p>
            </div>
          </div>

          {/* Quick-Switch Pill Bar */}
          <div className="flex items-center gap-1 self-start lg:self-center shrink-0 bg-[#050b18]/90 p-1.5 rounded-xl border border-blue-900/50 shadow-inner overflow-x-auto max-w-full">
            {['descriptive', 'diagnostic', 'predictive', 'prescriptive', 'all'].map((mKey) => {
              const mObj = MODES_CONFIG[mKey];
              const isCurrent = activeMode === mKey;
              const TabIcon = mObj.icon;
              return (
                <button
                  key={mKey}
                  type="button"
                  onClick={() => handleSelectMode(mKey)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    isCurrent
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5" />
                  <span className="capitalize">{mKey === 'all' ? 'All Views' : mKey}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* DYNAMIC MODE VIEWS */}

      {/* MODE 1: DESCRIPTIVE ANALYSIS ("What happened?") */}
      {activeMode === 'descriptive' && (
        <div className="w-full space-y-6 animate-fadeIn">
          {/* 1. Key Observed Telemetry KPIs */}
          <WeatherKPIs
            kpiData={kpiData}
            isDemo={kpiData?.isDemo}
          />

          {/* 2. Geospatial Observation Map */}
          {renderAnalysisMap('descriptive')}

          {/* 3. Historical Scrubber */}
          {renderTimeMachine()}

          {/* 4. Observed vs Historical Normal */}
          <HistoricalForecastChart
            data={timeSeriesData}
            horizonHours={horizonHours}
            onSelectHorizon={handleSelectHorizon}
            locationName={selectedLocation.name}
          />

          {/* 5. Synchronized Multi-Parameter Atmospheric Trace */}
          <MultiVariableWeatherGraph
            seriesData={timeSeriesData?.series || []}
            locationName={selectedLocation.name}
          />

          {/* 6. Statistical Distribution & Percentile Analysis */}
          <WeatherDistribution
            locationId={selectedLocation.id}
            locationName={selectedLocation.name}
          />

          {/* 7. Climatological Departure Trace */}
          <AnomalyChart
            anomalyData={anomalyData}
            onSelectMetric={handleSelectAnomalyMetric}
            locationName={selectedLocation.name}
          />

          {/* 8. Active Anomaly Alerts Monitor */}
          <WeatherAnomalyMonitor
            locationName={selectedLocation.name}
          />

          {/* 9. Telemetry Sources & Provenance */}
          <DataSources metadata={metadata} wsStatus={wsStatus} />
        </div>
      )}

      {/* MODE 2: DIAGNOSTIC ANALYSIS ("Why did it happen?") */}
      {activeMode === 'diagnostic' && (
        <div className="w-full space-y-6 animate-fadeIn">
          {/* 1. Synoptic Causal Attribution Engine */}
          <DiagnosticPanel
            locationId={selectedLocation.id}
            locationName={selectedLocation.name}
          />

          {/* 2. 7x7 Pearson Correlation Matrix & Scatter Analysis */}
          <WeatherCorrelation />

          {/* 3. Cross-Event Statistical Coupling */}
          <EventCorrelation />

          {/* 4. Geospatial Synoptic & Anomaly Map */}
          {renderAnalysisMap('diagnostic')}

          {/* 5. Anomaly Departure Severity Graph */}
          <AnomalyChart
            anomalyData={anomalyData}
            onSelectMetric={handleSelectAnomalyMetric}
            locationName={selectedLocation.name}
          />

          {/* 6. Active Atmospheric Anomaly Triggers */}
          <WeatherAnomalyMonitor
            locationName={selectedLocation.name}
          />

          {/* 7. Atmospheric Physics & Causal Methodology */}
          <AIExplanationPanel />

          {/* 8. Reanalysis Data Provenance */}
          <DataSources metadata={metadata} wsStatus={wsStatus} />
        </div>
      )}

      {/* MODE 3: PREDICTIVE ANALYSIS ("What happens next?") */}
      {activeMode === 'predictive' && (
        <div className="w-full space-y-6 animate-fadeIn">
          {/* 1. NWP Multi-Model Ensemble Spread & Horizons */}
          <PredictivePanel
            locationId={selectedLocation.id}
            locationName={selectedLocation.name}
          />

          {/* 2. Probabilistic Hazard Exceedance Curves */}
          <ForecastProbabilityChart
            probData={probabilityData}
            locationName={selectedLocation.name}
          />

          {/* 3. Forward Forecast Outlook with Uncertainty Envelope */}
          <HistoricalForecastChart
            data={timeSeriesData}
            horizonHours={horizonHours}
            onSelectHorizon={handleSelectHorizon}
            locationName={selectedLocation.name}
          />

          {/* 4. Geospatial NWP Precipitation Forecast Map */}
          {renderAnalysisMap('predictive')}

          {/* 5. Future Forecast Scrubber */}
          {renderTimeMachine()}

          {/* 6. Numerical Model Lead-Time Error Growth (MAE/RMSE) */}
          <ForecastPerformance />

          {/* 7. Forecast Perturbation Simulator */}
          <ScenarioSimulator
            locationId={selectedLocation.id}
            locationName={selectedLocation.name}
          />

          {/* 8. NWP Cycles & Forecast Verification Sources */}
          <DataSources metadata={metadata} wsStatus={wsStatus} />
        </div>
      )}

      {/* MODE 4: PRESCRIPTIVE ANALYSIS ("What should be prioritized?") */}
      {activeMode === 'prescriptive' && (
        <div className="w-full space-y-6 animate-fadeIn">
          {/* 1. Operational Guidance & Vulnerability Priorities */}
          <PrescriptivePanel
            locationId={selectedLocation.id}
            locationName={selectedLocation.name}
          />

          {/* 2. Interactive What-If Stress Testing Simulator */}
          <ScenarioSimulator
            locationId={selectedLocation.id}
            locationName={selectedLocation.name}
          />

          {/* 3. Critical Hazard Probability Bounds */}
          <ForecastProbabilityChart
            probData={probabilityData}
            locationName={selectedLocation.name}
          />

          {/* 4. Geospatial Scenario Exposure & Infrastructure Overlay */}
          {renderAnalysisMap('prescriptive')}

          {/* 5. Critical Departure Alerts Monitor */}
          <WeatherAnomalyMonitor
            locationName={selectedLocation.name}
          />

          {/* 6. Decision Support Algorithms & Explanation */}
          <AIExplanationPanel />

          {/* 7. Operational Advisory Feeds & Data Sources */}
          <DataSources metadata={metadata} wsStatus={wsStatus} />
        </div>
      )}

      {/* MODE 5: ALL MODES (Unified Complete Pipeline) */}
      {activeMode === 'all' && (
        <div className="w-full space-y-10 animate-fadeIn">
          {/* STAGE 01: DESCRIPTIVE */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pt-2 pb-3 border-b border-sky-800/40">
              <div className="w-8 h-8 rounded-lg bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-xs font-mono font-black text-sky-300">
                01
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">STAGE 01: DESCRIPTIVE ANALYSIS</h3>
                <p className="text-xs text-slate-400">Observed weather telemetry, baseline comparisons, and climatological normal percentiles</p>
              </div>
            </div>

            <WeatherKPIs kpiData={kpiData} isDemo={kpiData?.isDemo} />

            <HistoricalForecastChart
              data={timeSeriesData}
              horizonHours={horizonHours}
              onSelectHorizon={handleSelectHorizon}
              locationName={selectedLocation.name}
            />

            <MultiVariableWeatherGraph
              seriesData={timeSeriesData?.series || []}
              locationName={selectedLocation.name}
            />

            <WeatherDistribution
              locationId={selectedLocation.id}
              locationName={selectedLocation.name}
            />

            <AnomalyChart
              anomalyData={anomalyData}
              onSelectMetric={handleSelectAnomalyMetric}
              locationName={selectedLocation.name}
            />
          </div>

          {/* STAGE 02: DIAGNOSTIC */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pt-4 pb-3 border-b border-cyan-800/40">
              <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-xs font-mono font-black text-cyan-300">
                02
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">STAGE 02: DIAGNOSTIC ANALYSIS</h3>
                <p className="text-xs text-slate-400">Causal attribution chains, synoptic dynamics, and 7x7 multi-variable correlation dynamics</p>
              </div>
            </div>

            <DiagnosticPanel
              locationId={selectedLocation.id}
              locationName={selectedLocation.name}
            />

            <WeatherCorrelation />

            <EventCorrelation />
          </div>

          {/* STAGE 03: PREDICTIVE */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pt-4 pb-3 border-b border-indigo-800/40">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-xs font-mono font-black text-indigo-300">
                03
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">STAGE 03: PREDICTIVE ANALYSIS</h3>
                <p className="text-xs text-slate-400">Numerical Weather Prediction ensembles, probabilistic exceedance envelopes, and model verification</p>
              </div>
            </div>

            <PredictivePanel
              locationId={selectedLocation.id}
              locationName={selectedLocation.name}
            />

            <ForecastProbabilityChart
              probData={probabilityData}
              locationName={selectedLocation.name}
            />

            <ForecastPerformance />
          </div>

          {/* STAGE 04: PRESCRIPTIVE */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pt-4 pb-3 border-b border-amber-800/40">
              <div className="w-8 h-8 rounded-lg bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-xs font-mono font-black text-amber-300">
                04
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">STAGE 04: PRESCRIPTIVE ANALYSIS</h3>
                <p className="text-xs text-slate-400">AI-guided decision support, prioritized action matrices, and what-if perturbation simulation</p>
              </div>
            </div>

            <PrescriptivePanel
              locationId={selectedLocation.id}
              locationName={selectedLocation.name}
            />

            <ScenarioSimulator
              locationId={selectedLocation.id}
              locationName={selectedLocation.name}
            />
          </div>

          {/* STAGE 05: GEOSPATIAL & TELEMETRY PROVENANCE */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pt-4 pb-3 border-b border-blue-800/40">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-xs font-mono font-black text-blue-300">
                05
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">STAGE 05: GEOSPATIAL & TELEMETRY PROVENANCE</h3>
                <p className="text-xs text-slate-400">Integrated national map, temporal scrubbing, anomaly monitoring, and data source validation</p>
              </div>
            </div>

            {renderTimeMachine()}

            {renderAnalysisMap('all')}

            <WeatherAnomalyMonitor
              locationName={selectedLocation.name}
            />

            <AIExplanationPanel />

            <DataSources metadata={metadata} wsStatus={wsStatus} />
          </div>
        </div>
      )}

      {/* 16. Export & Share Modal */}
      <ExportShareModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        analysisData={timeSeriesData}
        locationName={selectedLocation.name}
      />
    </div>
  );
}
