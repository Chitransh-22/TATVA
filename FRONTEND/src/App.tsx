import { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Breadcrumbs } from './components/Breadcrumbs';
import { WeatherMap } from './components/WeatherMap';
import { AnalyticsSidebar } from './components/AnalyticsSidebar';
import { LoadingOverlay } from './components/LoadingOverlay';
import type {
  WeatherMetadata,
  IndiaOverviewResponse,
  StateDetailResponse,
  DistrictDetailResponse,
  HistoricalTimelinePoint,
} from './types';
import './App.css';

export function App() {
  // Navigation & Selection State
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Data State
  const [metadata, setMetadata] = useState<WeatherMetadata | null>(null);
  const [overviewData, setOverviewData] = useState<IndiaOverviewResponse | null>(null);
  const [stateData, setStateData] = useState<StateDetailResponse | null>(null);
  const [districtData, setDistrictData] = useState<DistrictDetailResponse | null>(null);
  const [historicalTimeline, setHistoricalTimeline] = useState<HistoricalTimelinePoint[]>([]);

  // UI Control State
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingMsg, setLoadingMsg] = useState<string>('Connecting to live NASA IMERG pipeline...');
  const [error, setError] = useState<string | null>(null);
  const [opacity, setOpacity] = useState<number>(0.85);
  const [basemap, setBasemap] = useState<'carto' | 'esri' | 'osm'>('carto');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Ref to track latest selection for SSE live updates
  const selectionRef = useRef({ selectedState, selectedDistrict, selectedTime });
  selectionRef.current = { selectedState, selectedDistrict, selectedTime };

  // =========================================================================
  // API Fetch Functions
  // =========================================================================

  const fetchMetadata = useCallback(async () => {
    try {
      const res = await fetch('/api/weather/metadata');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WeatherMetadata = await res.json();
      setMetadata(data);
      return data;
    } catch (err: any) {
      console.warn('Metadata fetch warning:', err.message);
      return null;
    }
  }, []);

  const fetchHistorical = useCallback(async (stName?: string | null, distName?: string | null) => {
    try {
      let url = '/api/weather/historical-series?limit=12';
      if (distName) url += `&district_name=${encodeURIComponent(distName)}`;
      else if (stName) url += `&state_name=${encodeURIComponent(stName)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistoricalTimeline(data.timeline || []);
    } catch (err: any) {
      console.warn('Historical series fetch warning:', err.message);
    }
  }, []);

  const fetchOverview = useCallback(async (time?: string | null) => {
    setIsLoading(true);
    setLoadingMsg('Loading live India precipitation overview...');
    setError(null);
    try {
      let url = '/api/weather/india/overview?grid_step=0.2';
      if (time) url += `&observation_time=${encodeURIComponent(time)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: IndiaOverviewResponse = await res.json();
      setOverviewData(data);
      fetchHistorical(null, null);
    } catch (err: any) {
      console.error('Failed to load India overview:', err);
      setError('Unable to load India weather overview. Please ensure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchHistorical]);

  const fetchState = useCallback(async (stateName: string, time?: string | null) => {
    setIsLoading(true);
    setLoadingMsg(`Querying PostGIS observations for ${stateName}...`);
    setError(null);
    try {
      let url = `/api/weather/state/${encodeURIComponent(stateName)}`;
      if (time) url += `?observation_time=${encodeURIComponent(time)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: StateDetailResponse = await res.json();
      setStateData(data);
      fetchHistorical(stateName, null);
    } catch (err: any) {
      console.error(`Failed to load state ${stateName}:`, err);
      setError(`Unable to load observations for ${stateName}.`);
    } finally {
      setIsLoading(false);
    }
  }, [fetchHistorical]);

  const fetchDistrict = useCallback(async (stateName: string, districtName: string, time?: string | null) => {
    setIsLoading(true);
    setLoadingMsg(`Querying district observations for ${districtName}, ${stateName}...`);
    setError(null);
    try {
      let url = `/api/weather/district/${encodeURIComponent(stateName)}/${encodeURIComponent(districtName)}`;
      if (time) url += `?observation_time=${encodeURIComponent(time)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DistrictDetailResponse = await res.json();
      setDistrictData(data);
      fetchHistorical(stateName, districtName);
    } catch (err: any) {
      console.error(`Failed to load district ${districtName}:`, err);
      setError(`Unable to load observations for ${districtName}.`);
    } finally {
      setIsLoading(false);
    }
  }, [fetchHistorical]);

  // =========================================================================
  // Initial Load
  // =========================================================================

  useEffect(() => {
    fetchMetadata().then((meta) => {
      const initialTime = meta?.latest_observation_time || null;
      if (initialTime) setSelectedTime(initialTime);
      fetchOverview(initialTime);
    });
  }, [fetchMetadata, fetchOverview]);

  // =========================================================================
  // Live Updates via Server-Sent Events (SSE) & Fallback Polling
  // =========================================================================

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      eventSource = new EventSource('/api/weather/live-stream');

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'new_granule') {
            console.log('⚡ [Live SSE] Received new granule event:', payload.data);
            fetchMetadata();

            // Seamlessly refresh current view with latest data without reload
            const { selectedState: curState, selectedDistrict: curDist } = selectionRef.current;
            if (curDist && curState) {
              fetchDistrict(curState, curDist, payload.data.observation_time);
            } else if (curState) {
              fetchState(curState, payload.data.observation_time);
            } else {
              fetchOverview(payload.data.observation_time);
            }
          }
        } catch (e) {
          // Keepalive ping or plain message
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        // Attempt reconnect in 10s
        reconnectTimeout = setTimeout(connectSSE, 10000);
      };
    };

    connectSSE();

    // Background 30s metadata freshness poll
    const pollInterval = setInterval(() => {
      fetchMetadata();
    }, 30000);

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
    };
  }, [fetchMetadata, fetchOverview, fetchState, fetchDistrict]);

  // =========================================================================
  // User Actions / Drill-down Handlers
  // =========================================================================

  const handleSelectState = (stateName: string) => {
    setSelectedState(stateName);
    setSelectedDistrict(null);
    setDistrictData(null);
    fetchState(stateName, selectedTime);
  };

  const handleSelectDistrict = (districtName: string) => {
    if (!selectedState) return;
    setSelectedDistrict(districtName);
    fetchDistrict(selectedState, districtName, selectedTime);
  };

  const handleSelectIndia = () => {
    setSelectedState(null);
    setSelectedDistrict(null);
    setStateData(null);
    setDistrictData(null);
    fetchOverview(selectedTime);
  };

  const handleBackToState = () => {
    if (!selectedState) return;
    setSelectedDistrict(null);
    setDistrictData(null);
    fetchState(selectedState, selectedTime);
  };

  const handleTimeChange = (time: string) => {
    setSelectedTime(time);
    if (selectedDistrict && selectedState) {
      fetchDistrict(selectedState, selectedDistrict, time);
    } else if (selectedState) {
      fetchState(selectedState, time);
    } else {
      fetchOverview(time);
    }
  };

  return (
    <div className="app-root">
      <Navbar
        metadata={metadata}
        selectedTime={selectedTime}
        onTimeChange={handleTimeChange}
        onFitIndia={handleSelectIndia}
        onReset={handleSelectIndia}
        opacity={opacity}
        onOpacityChange={setOpacity}
        basemap={basemap}
        onBasemapChange={setBasemap}
      />

      <Breadcrumbs
        selectedState={selectedState}
        selectedDistrict={selectedDistrict}
        onSelectIndia={handleSelectIndia}
        onSelectState={handleSelectState}
      />

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button type="button" className="btn-retry" onClick={() => fetchOverview(selectedTime)}>
            Retry
          </button>
        </div>
      )}

      <main className="main-layout">
        <div className="map-panel">
          <LoadingOverlay isLoading={isLoading} message={loadingMsg} />
          <WeatherMap
            overviewData={overviewData}
            stateData={stateData}
            districtData={districtData}
            selectedState={selectedState}
            selectedDistrict={selectedDistrict}
            onSelectState={handleSelectState}
            onSelectDistrict={handleSelectDistrict}
            opacity={opacity}
            basemap={basemap}
          />
        </div>

        <AnalyticsSidebar
          selectedState={selectedState}
          selectedDistrict={selectedDistrict}
          nationalSummary={overviewData?.national_summary || null}
          stateSummaries={overviewData?.state_summaries || []}
          stateSummary={stateData?.state_summary || null}
          districtSummaries={stateData?.district_summaries || []}
          districtSummary={districtData?.district_summary || null}
          anomalies={districtData?.anomalies}
          historicalTimeline={historicalTimeline}
          onSelectState={handleSelectState}
          onSelectDistrict={handleSelectDistrict}
          onBackToState={handleBackToState}
          onBackToIndia={handleSelectIndia}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />
      </main>
    </div>
  );
}

export default App;
