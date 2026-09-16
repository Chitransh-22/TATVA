import { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { HeroSection } from './components/HeroSection';
import { FiltersBar } from './components/FiltersBar';
import { IndiaMapSection } from './components/IndiaMapSection';
import { HowItWorksSection } from './components/HowItWorksSection';
import { Footer } from './components/Footer';
import { IncidentModal } from './components/IncidentModal';
import { AuthModal } from './components/AuthModal';
import { AnalysisPage } from './components/analysis/AnalysisPage';
import { NATIONAL_METRICS } from './data/weatherData';
import { weatherStore } from './data/weatherStore';
import { useWeatherWebSocket } from './hooks/useWeatherWebSocket';
import { getProductDefinition, DEFAULT_PRODUCT_ID } from './data/mosdacProducts';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

export function App() {
  // Single Source of Truth for Map Navigation State
  const [navState, setNavState] = useState({
    mapLevel: 'india', // 'india' | 'state' | 'district'
    selectedState: null,
    selectedDistrict: null,
  });
  const { mapLevel, selectedState, selectedDistrict } = navState;
  const [selectedTime, setSelectedTime] = useState(null);

  // Global request generation counter to prevent stale async API responses from overwriting map
  const navRequestIdRef = useRef(0);

  // Helper to abort all in-flight requests on rapid navigation clicks
  const abortAllInFlight = useCallback(() => {
    if (overviewAbortRef.current) {
      overviewAbortRef.current.abort();
      overviewAbortRef.current = null;
    }
    if (stateAbortRef.current) {
      stateAbortRef.current.abort();
      stateAbortRef.current = null;
    }
    if (districtAbortRef.current) {
      districtAbortRef.current.abort();
      districtAbortRef.current = null;
    }
  }, []);

  // Active Weather Data Source (Default: MOSDAC, synchronized from metadata)
  const [activeSource, setActiveSource] = useState('MOSDAC');

  // Active MOSDAC Product Selection (Default: HEM Precipitation Rate)
  const [activeProductId, setActiveProductId] = useState('3SIMG_L2B_HEM');
  const [productData, setProductData] = useState(null);
  const [productStatusMap, setProductStatusMap] = useState({});

  // Client-side In-memory Product Data Cache and Request Counter (Race Condition Protection)
  const productCacheRef = useRef(new Map());
  const productRequestIdRef = useRef(0);
  const productAbortRef = useRef(null);

  // Single Persistent WebSocket Hook (Incremental updates, auto-reconnect, heartbeat)
  const reconnectHandlerRef = useRef(null);
  const liveUpdateHandlerRef = useRef(null);
  const handleLiveWeatherUpdate = useCallback((batch) => {
    if (liveUpdateHandlerRef.current) {
      liveUpdateHandlerRef.current(batch);
    }
  }, []);

  const activeProductCategory = getProductDefinition(activeProductId)?.category || 'weather';

  const { status: wsStatus, telemetry: wsTelemetry } = useWeatherWebSocket(
    selectedState,
    selectedDistrict,
    useCallback(() => {
      if (reconnectHandlerRef.current) {
        reconnectHandlerRef.current();
      }
    }, []),
    activeSource,
    handleLiveWeatherUpdate,
    activeProductId,
    activeProductCategory
  );

  // Live Summary from WebSocket for Metric Tiles
  const [liveSummary, setLiveSummary] = useState(null);

  useEffect(() => {
    return weatherStore.subscribeSummary((summary) => {
      setLiveSummary(summary);
    });
  }, []);

  // Friend's UI State
  const [activeTab, setActiveTab] = useState('analysis');
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Data State
  const [metadata, setMetadata] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [stateData, setStateData] = useState(null);
  const [districtData, setDistrictData] = useState(null);
  const [, setHistoricalTimeline] = useState([]);

  // UI Control State
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Loading live India weather overview...');
  const [error, setError] = useState(null);
  const [opacity, setOpacity] = useState(0.85);

  // Client-side In-memory Caches (Eliminates redundant network roundtrips on repeated navigation)
  const overviewCacheRef = useRef(new Map());
  const stateCacheRef = useRef(new Map());
  const districtCacheRef = useRef(new Map());

  // AbortControllers to cancel in-flight stale requests on rapid clicks
  const overviewAbortRef = useRef(null);
  const stateAbortRef = useRef(null);
  const districtAbortRef = useRef(null);

  // Ref to track latest selection for SSE live updates
  const selectionRef = useRef({ mapLevel, selectedState, selectedDistrict, selectedTime });
  useEffect(() => {
    selectionRef.current = { mapLevel, selectedState, selectedDistrict, selectedTime };
  }, [mapLevel, selectedState, selectedDistrict, selectedTime]);

  // =========================================================================
  // API Fetch Functions
  // =========================================================================

  const fetchMetadata = useCallback(async () => {
    try {
      const res = await fetch('/api/weather/metadata');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMetadata(data);
      if (data?.source) {
        setActiveSource(data.source);
      }
      return data;
    } catch (err) {
      console.warn('Metadata fetch warning:', err.message);
      return null;
    }
  }, []);

  const fetchHistorical = useCallback(async (stName, distName) => {
    try {
      let url = '/api/weather/historical-series?limit=12';
      if (distName) url += `&district_name=${encodeURIComponent(distName)}`;
      else if (stName) url += `&state_name=${encodeURIComponent(stName)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistoricalTimeline(data.timeline || []);
    } catch (err) {
      console.warn('Historical series fetch warning:', err.message);
    }
  }, []);

  const fetchOverview = useCallback(async (time) => {
    const requestId = ++navRequestIdRef.current;
    abortAllInFlight();

    console.log(`[REQUEST #${requestId}] mapLevel=india, time=${time || 'latest'}`);

    const cacheKey = time || 'latest';
    if (overviewCacheRef.current.has(cacheKey)) {
      const cached = overviewCacheRef.current.get(cacheKey);
      if (requestId !== navRequestIdRef.current) {
        console.log(`[REQUEST #${requestId} IGNORED] Stale overview cache response ignored.`);
        return;
      }
      const snapshotPoints = cached.grid_points && cached.grid_points.length > 0
        ? cached.grid_points.map(([lat, lon, precip]) => ({
            id: weatherStore.makeId(lat, lon),
            latitude: lat,
            longitude: lon,
            precipitation: precip,
            timestamp: cached.observation_time,
          }))
        : (cached.observations && cached.observations.length > 0
            ? cached.observations
            : []);
      weatherStore.loadSnapshot(
        { state: null, district: null },
        snapshotPoints,
        cached.window_end || cached.observation_time
      );
      setOverviewData(cached);
      setIsLoading(false);
      fetchHistorical(null, null);
      return;
    }

    const controller = new AbortController();
    overviewAbortRef.current = controller;

    setIsLoading(true);
    setLoadingMsg('Loading live India precipitation overview...');
    setError(null);
    try {
      let url = '/api/weather/india/overview?grid_step=0.5';
      if (time) url += `&observation_time=${encodeURIComponent(time)}`;

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Guard: Stale request protection
      if (requestId !== navRequestIdRef.current) {
        console.log(`[REQUEST #${requestId} IGNORED] Stale overview response ignored. Current request is #${navRequestIdRef.current}`);
        return;
      }

      if (!data.national_summary || typeof data.national_summary !== 'object') {
        data.national_summary = {
          avg_precipitation: 0.0,
          max_precipitation: 0.0,
          min_precipitation: 0.0,
          total_points: 0,
          rain_category: 'Clear / Dry',
        };
      }
      overviewCacheRef.current.set(cacheKey, data);

      const snapshotPoints = data.grid_points && data.grid_points.length > 0
        ? data.grid_points.map(([lat, lon, precip]) => ({
            id: weatherStore.makeId(lat, lon),
            latitude: lat,
            longitude: lon,
            precipitation: precip,
            timestamp: data.observation_time,
          }))
        : (data.observations && data.observations.length > 0
            ? data.observations
            : []);

      weatherStore.loadSnapshot(
        { state: null, district: null },
        snapshotPoints,
        data.window_end || data.observation_time
      );
      setOverviewData(data);
      fetchHistorical(null, null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (requestId !== navRequestIdRef.current) return;
      console.error('Failed to load India overview:', err);
      setError('Unable to load India weather overview. Please ensure the backend is running.');
    } finally {
      if (requestId === navRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [abortAllInFlight, fetchHistorical]);

  const fetchState = useCallback(async (stateName, time) => {
    if (!stateName) return;
    const requestId = ++navRequestIdRef.current;
    abortAllInFlight();

    console.log(`[REQUEST #${requestId}] mapLevel=state, state=${stateName}, time=${time || 'latest'}`);

    const cacheKey = `${stateName.toLowerCase()}_${time || 'latest'}`;
    if (stateCacheRef.current.has(cacheKey)) {
      const cached = stateCacheRef.current.get(cacheKey);
      if (requestId !== navRequestIdRef.current) {
        console.log(`[REQUEST #${requestId} IGNORED] Stale state cache hit ignored (${stateName}).`);
        return;
      }
      weatherStore.loadSnapshot(
        { state: stateName, district: null },
        cached.observations || [],
        cached.observation_time
      );
      setStateData(cached);
      setIsLoading(false);
      fetchHistorical(stateName, null);
      return;
    }

    const controller = new AbortController();
    stateAbortRef.current = controller;

    setIsLoading(true);
    setLoadingMsg(`Querying observations for ${stateName}...`);
    setError(null);
    try {
      let url = `/api/weather/state/${encodeURIComponent(stateName)}`;
      if (time) url += `?observation_time=${encodeURIComponent(time)}`;

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Guard: Stale request protection
      if (requestId !== navRequestIdRef.current) {
        console.log(`[REQUEST #${requestId} IGNORED] Stale state response ignored (${stateName}). Current request is #${navRequestIdRef.current}`);
        return;
      }

      stateCacheRef.current.set(cacheKey, data);
      weatherStore.loadSnapshot(
        { state: stateName, district: null },
        data.observations || [],
        data.observation_time
      );
      setStateData(data);
      fetchHistorical(stateName, null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (requestId !== navRequestIdRef.current) return;
      console.error(`Failed to load state ${stateName}:`, err);
      setError(`Unable to load observations for ${stateName}.`);
    } finally {
      if (requestId === navRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [abortAllInFlight, fetchHistorical]);

  const fetchDistrict = useCallback(async (stateName, districtName, time) => {
    if (!stateName || !districtName) return;
    const requestId = ++navRequestIdRef.current;
    abortAllInFlight();

    console.log(`[REQUEST #${requestId}] mapLevel=district, state=${stateName}, district=${districtName}, time=${time || 'latest'}`);

    const cacheKey = `${stateName.toLowerCase()}_${districtName.toLowerCase()}_${time || 'latest'}`;
    if (districtCacheRef.current.has(cacheKey)) {
      const cached = districtCacheRef.current.get(cacheKey);
      if (requestId !== navRequestIdRef.current) {
        console.log(`[REQUEST #${requestId} IGNORED] Stale district cache hit ignored (${districtName}).`);
        return;
      }
      weatherStore.loadSnapshot(
        { state: stateName, district: districtName },
        cached.observations || [],
        cached.observation_time
      );
      setDistrictData(cached);
      setIsLoading(false);
      fetchHistorical(stateName, districtName);
      return;
    }

    const controller = new AbortController();
    districtAbortRef.current = controller;

    setIsLoading(true);
    setLoadingMsg(`Querying district observations for ${districtName}, ${stateName}...`);
    setError(null);
    try {
      let url = `/api/weather/district/${encodeURIComponent(stateName)}/${encodeURIComponent(districtName)}`;
      if (time) url += `?observation_time=${encodeURIComponent(time)}`;

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Guard: Stale request protection
      if (requestId !== navRequestIdRef.current) {
        console.log(`[REQUEST #${requestId} IGNORED] Stale district response ignored (${districtName}). Current request is #${navRequestIdRef.current}`);
        return;
      }

      districtCacheRef.current.set(cacheKey, data);
      weatherStore.loadSnapshot(
        { state: stateName, district: districtName },
        data.observations || [],
        data.observation_time
      );
      setDistrictData(data);
      fetchHistorical(stateName, districtName);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (requestId !== navRequestIdRef.current) return;
      console.error(`Failed to load district ${districtName}:`, err);
      setError(`Unable to load observations for ${districtName}.`);
    } finally {
      if (requestId === navRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [abortAllInFlight, fetchHistorical]);

  // Wire WebSocket Reconnect Resync Callback (Requirement 12)
  useEffect(() => {
    reconnectHandlerRef.current = () => {
      console.log('🔄 [WS Resync] Reconnected to server. Resynchronizing 7-day snapshot from PostgreSQL...');
      const cur = selectionRef.current;
      if (cur.selectedDistrict && cur.selectedState) {
        fetchDistrict(cur.selectedState, cur.selectedDistrict, cur.selectedTime);
      } else if (cur.selectedState) {
        fetchState(cur.selectedState, cur.selectedTime);
      } else {
        fetchOverview(cur.selectedTime);
      }
    };
  }, [fetchDistrict, fetchOverview, fetchState]);

  // =========================================================================
  // MOSDAC Product Catalog & Observations Fetchers
  // =========================================================================

  const fetchProductCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/weather/mosdac/products');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && Array.isArray(json.products)) {
        const statusMap = {};
        json.products.forEach((p) => {
          let st = 'UNAVAILABLE';
          if (p.has_live_data) {
            st = 'LIVE DATA';
          } else if (p.operational_status === 'available') {
            st = 'SNAPSHOT';
          }
          statusMap[p.product_id] = {
            status: st,
            latest: p.latest_observation_time,
            operationalStatus: p.operational_status,
            unavailabilityReason: p.unavailability_reason,
            name: p.name,
            category: p.category,
          };
        });
        setProductStatusMap(statusMap);
        return statusMap;
      }
    } catch (err) {
      console.warn('Product catalog fetch warning:', err.message);
    }
    return null;
  }, []);

  const fetchProductData = useCallback(async (productId, time = null, isLiveUpdate = false) => {
    if (!productId) return null;

    // Fast-path: Check memory cache first (skip loading spinner if cached and not a forced live update)
    if (!isLiveUpdate && !time && productCacheRef.current.has(productId)) {
      const cached = productCacheRef.current.get(productId);
      setProductData(cached);
      return cached;
    }

    const requestId = ++productRequestIdRef.current;
    if (productAbortRef.current) {
      productAbortRef.current.abort();
      productAbortRef.current = null;
    }

    const controller = new AbortController();
    productAbortRef.current = controller;

    // Only show loading if we don't already have some data displayed for this product
    if (!productCacheRef.current.has(productId)) {
      setIsLoading(true);
      const def = getProductDefinition(productId);
      setLoadingMsg(`Querying ${def.productName} (${def.satellite})...`);
    }

    try {
      let data = null;
      let url = `/api/weather/mosdac/products/${encodeURIComponent(productId)}/points?limit=150000`;
      if (time) url += `&observation_time=${encodeURIComponent(time)}`;

      try {
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) {
          const json = await res.json();
          if (json && json.status === 'SUCCESS' && Array.isArray(json.points) && json.points.length > 0) {
            data = json;
          }
        }
      } catch (e) {
        if (e.name === 'AbortError') return null;
        console.warn(`[MOSDAC API] Points API fetch for ${productId} failed, checking bundle:`, e.message);
      }

      // Fallback: If remote API yielded no points or had an error, try offline mosdac_bundle.json
      if (!data) {
        try {
          const bundleRes = await fetch('/data/mosdac_bundle.json', { signal: controller.signal });
          if (bundleRes.ok) {
            const bundle = await bundleRes.json();
            if (bundle && bundle[productId]) {
              data = {
                status: 'SUCCESS',
                source: 'bundle_fallback',
                product_id: productId,
                summary: bundle[productId].summary,
                unit: bundle[productId].unit,
                points: bundle[productId].points,
                total_points: bundle[productId].points.length,
              };
            }
          }
        } catch (bundleErr) {
          if (bundleErr.name === 'AbortError') return null;
          console.warn(`Bundle fallback failed for ${productId}:`, bundleErr);
        }
      }

      // Check for stale response
      if (requestId !== productRequestIdRef.current) {
        console.log(`[REQUEST #${requestId} IGNORED] Stale product response for ${productId}`);
        return null;
      }

      if (data) {
        productCacheRef.current.set(productId, data);
        setProductData(data);
      } else {
        console.warn(`No observation data available for ${productId}`);
      }

      return data;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      console.error(`Failed to load data for product ${productId}:`, err);
    } finally {
      if (requestId === productRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const handleSelectProduct = useCallback((productId) => {
    if (!productId || productId === activeProductId) return;
    setActiveProductId(productId);
    fetchProductData(productId, selectedTime);
  }, [activeProductId, fetchProductData, selectedTime]);

  // Wire Live WebSocket Update Handler (MOSDAC + In-place update)
  useEffect(() => {
    liveUpdateHandlerRef.current = (batch) => {
      const timestamp = batch.timestamp || batch.observation_time;
      const batchProductId = batch.product_id || batch.product || '3SIMG_L2B_HEM';
      console.log(`[MOSDAC WS LIVE UPDATE] product=${batchProductId} time=${timestamp}`);

      // Update product status in productStatusMap to LIVE DATA
      setProductStatusMap((prev) => ({
        ...prev,
        [batchProductId]: {
          ...(prev[batchProductId] || {}),
          status: 'LIVE DATA',
          latest: timestamp,
        },
      }));

      // Invalidate the cache for this product
      productCacheRef.current.delete(batchProductId);

      // If this update matches the currently active product, update the map layer IN-PLACE
      if (batchProductId === activeProductId) {
        if (batch.points && batch.points.length > 0) {
          const updatedProductData = {
            status: 'SUCCESS',
            source: 'websocket_live',
            product_id: batchProductId,
            summary: {
              ...(productData?.summary || {}),
              observation_time_utc: timestamp,
              observation_time_ist: batch.observation_time_ist || `${timestamp} (Live)`,
              total_points: batch.points.length,
              min_value: batch.min_value,
              max_value: batch.max_value,
              mean_value: batch.mean_value,
            },
            points: batch.points,
            total_points: batch.points.length,
          };
          productCacheRef.current.set(batchProductId, updatedProductData);
          setProductData(updatedProductData);
        } else {
          // Fetch fresh points for active product
          fetchProductData(batchProductId, timestamp, true);
        }

        // Also if it's rainfall, refresh the overview/state/district data for rainfall tiles
        if (batchProductId === '3SIMG_L2B_HEM' || batchProductId === '3SIMG_L2G_IMR') {
          overviewCacheRef.current.clear();
          stateCacheRef.current.clear();
          districtCacheRef.current.clear();

          const cur = selectionRef.current;
          if (cur.selectedDistrict && cur.selectedState) {
            fetchDistrict(cur.selectedState, cur.selectedDistrict, timestamp);
          } else if (cur.selectedState) {
            fetchState(cur.selectedState, timestamp);
          } else {
            fetchOverview(timestamp);
          }
        }
      }
      fetchMetadata();
    };
  }, [activeProductId, fetchDistrict, fetchMetadata, fetchOverview, fetchProductData, fetchState, productData]);

  // =========================================================================
  // Initial Load (Parallel non-blocking fetch)
  // =========================================================================

  useEffect(() => {
    // Parallel initial load: metadata, product catalog, initial overview, and active product data
    fetchMetadata();
    fetchProductCatalog();
    fetchOverview();
    fetchProductData('3SIMG_L2B_HEM');
  }, [fetchMetadata, fetchProductCatalog, fetchOverview, fetchProductData]);

  // =========================================================================
  // Background Metadata Freshness Poll (Telemetry status)
  // =========================================================================

  useEffect(() => {
    // 30s background metadata check for new granule timestamps
    const pollInterval = setInterval(() => {
      fetchMetadata();
    }, 30000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [fetchMetadata]);

  // =========================================================================
  // Scroll Listener for Active Tab Highlight
  // =========================================================================

  useEffect(() => {
    const handleScroll = () => {
      const howItWorksEl = document.getElementById('how-it-works-section');
      const analysisEl = document.getElementById('analysis-section');
      const heroEl = document.getElementById('hero-section');

      const scrollPosition = window.scrollY + 200;

      if (howItWorksEl && scrollPosition >= howItWorksEl.offsetTop) {
        setActiveTab('how-it-works');
      } else if (analysisEl && scrollPosition >= analysisEl.offsetTop) {
        setActiveTab('analysis');
      } else if (heroEl) {
        setActiveTab('analysis');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // =========================================================================
  // Drill-down & Interaction Handlers
  // =========================================================================

  const handleSelectIndia = useCallback(() => {
    setNavState({
      mapLevel: 'india',
      selectedState: null,
      selectedDistrict: null,
    });
    setStateData(null);
    setDistrictData(null);
    setLiveSummary(null);
    weatherStore.clearScope({ state: null, district: null });
    fetchOverview(selectedTime);
  }, [fetchOverview, selectedTime]);

  const handleSelectState = useCallback((stateName) => {
    if (!stateName) {
      handleSelectIndia();
      return;
    }
    setNavState({
      mapLevel: 'state',
      selectedState: stateName,
      selectedDistrict: null,
    });
    setDistrictData(null);
    setLiveSummary(null);
    weatherStore.clearScope({ state: stateName, district: null });
    fetchState(stateName, selectedTime);
  }, [fetchState, handleSelectIndia, selectedTime]);

  const handleSelectDistrict = useCallback((districtName) => {
    const curState = selectionRef.current.selectedState;
    if (!curState || !districtName) return;
    setNavState({
      mapLevel: 'district',
      selectedState: curState,
      selectedDistrict: districtName,
    });
    setLiveSummary(null);
    weatherStore.clearScope({ state: curState, district: districtName });
    fetchDistrict(curState, districtName, selectedTime);
  }, [fetchDistrict, selectedTime]);

  const handleBackToState = useCallback(() => {
    const curState = selectionRef.current.selectedState;
    if (!curState) return;
    setNavState({
      mapLevel: 'state',
      selectedState: curState,
      selectedDistrict: null,
    });
    setDistrictData(null);
    setLiveSummary(null);
    weatherStore.clearScope({ state: curState, district: null });
    fetchState(curState, selectedTime);
  }, [fetchState, selectedTime]);

  const handleTimeChange = useCallback((time) => {
    setSelectedTime(time);
    setLiveSummary(null);
    const { mapLevel: curLevel, selectedState: curSt, selectedDistrict: curDt } = selectionRef.current;
    if (curLevel === 'district' && curDt && curSt) {
      weatherStore.clearScope({ state: curSt, district: curDt });
      fetchDistrict(curSt, curDt, time);
    } else if (curLevel === 'state' && curSt) {
      weatherStore.clearScope({ state: curSt, district: null });
      fetchState(curSt, time);
    } else {
      weatherStore.clearScope({ state: null, district: null });
      fetchOverview(time);
    }
  }, [fetchDistrict, fetchOverview, fetchState]);

  const handleExploreClick = () => {
    const analysisEl = document.getElementById('analysis-section');
    if (analysisEl) {
      analysisEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex min-h-screen bg-[#eef4fc] text-slate-900 font-['Plus_Jakarta_Sans',sans-serif] antialiased">
      {/* Sticky Left Sidebar (Desktop) / Mobile Navigation Header */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenIncidentReport={() => setIsIncidentModalOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col pt-[58px] lg:pt-0">
        {/* 1. Hero Section */}
        <HeroSection onExploreClick={handleExploreClick} />

        {/* 2. Analysis Workspace: TATVA Production Weather Intelligence Platform */}
        <div
          id="analysis-section"
          className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 py-8 md:py-12"
        >
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-between shadow-xs">
              <span>⚠️ {error}</span>
              <button
                onClick={() => fetchOverview(selectedTime)}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Full Production-Quality Weather Intelligence & Analytics Workspace */}
          <ErrorBoundary name="AnalysisPage" title="Weather Intelligence & Analytics Workspace" onReset={() => fetchOverview(selectedTime)}>
            <AnalysisPage
              overviewData={overviewData}
              stateData={stateData}
              districtData={districtData}
              isLoading={isLoading}
              loadingMsg={loadingMsg}
              opacity={opacity}
              onOpacityChange={setOpacity}
              activeProductId={activeProductId}
              onSelectProduct={handleSelectProduct}
              productData={productData}
              productStatusMap={productStatusMap}
              metadata={metadata}
              wsStatus={wsStatus}
              wsTelemetry={wsTelemetry}
              onSelectState={handleSelectState}
              onSelectDistrict={handleSelectDistrict}
              onFitIndia={handleSelectIndia}
              onBackToState={handleBackToState}
              selectedTime={selectedTime}
              onTimeChange={handleTimeChange}
            />
          </ErrorBoundary>
        </div>

        {/* 3. How It Works Section */}
        <div
          id="how-it-works-section"
          className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 pb-10"
        >
          <ErrorBoundary name="HowItWorksSection" title="Platform Information">
            <HowItWorksSection />
          </ErrorBoundary>
        </div>

        {/* 3. Footer Section */}
        <Footer
          onSelectNav={setActiveTab}
          onOpenIncidentReport={() => setIsIncidentModalOpen(true)}
        />
      </main>

      {/* Modals for Interactive Features */}
      <IncidentModal
        isOpen={isIncidentModalOpen}
        onClose={() => setIsIncidentModalOpen(false)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
}

export default App;
