import { useState, useEffect } from 'react';
import { WeatherMap } from '../WeatherMap';
import { Breadcrumbs } from '../Breadcrumbs';
import { LoadingOverlay } from '../LoadingOverlay';
import { Sliders, MapPin } from 'lucide-react';
import { LOCATIONS } from '../../services/analysisService';

export function AnalysisMap({
  selectedLocation,
  onSelectLocation,
  mapLevel = 'india',
  overviewData,
  stateData,
  districtData,
  isLoading,
  loadingMsg,
  opacity = 0.85,
  onOpacityChange,
  activeProductId = '3SIMG_L2B_HEM',
  onSelectProduct,
  productData,
  productStatusMap = {},
  activeMode = 'descriptive',
}) {
  const [activeLayer, setActiveLayer] = useState('rainfall');
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    if (activeMode === 'diagnostic') {
      setActiveLayer('anomalies');
    } else if (activeMode === 'predictive') {
      setActiveLayer('forecast');
    } else if (activeMode === 'prescriptive') {
      setActiveLayer('scenario');
    } else if (activeMode === 'descriptive') {
      setActiveLayer('rainfall');
    }
  }, [activeMode]);

  const layers = [
    { id: 'rainfall', label: 'Rainfall (HEM)', productId: '3SIMG_L2B_HEM', desc: 'Hydro-Estimator Precipitation Rate (mm/h)' },
    { id: 'temp', label: 'Temperature (TIR)', productId: '3SIMG_L1B_STD', desc: 'Thermal Infrared Surface Brightness (°C)' },
    { id: 'humidity', label: 'Humidity (UTH)', productId: '3SIMG_L2B_UTH', desc: 'Upper Tropospheric Relative Humidity (%)' },
    { id: 'anomalies', label: 'Anomalies', productId: '3SIMG_L2G_IMR', desc: 'Precipitation departure from climatological baseline' },
    { id: 'hazards', label: 'Hazards & Storms', productId: '3SIMG_L2B_HEM', desc: 'Convective storm cells exceeding heavy thresholds' },
    { id: 'forecast', label: 'NWP Forecast', productId: '3SIMG_L2B_HEM', desc: 'Ensemble Quantitative Precipitation Forecast' },
    { id: 'scenario', label: 'Scenario Exposure', productId: '3SIMG_L2B_HEM', desc: 'Hydrological inundation exposure under perturbation' },
  ];

  const handleLayerClick = (layer) => {
    setActiveLayer(layer.id);
    if (onSelectProduct && layer.productId) {
      onSelectProduct(layer.productId);
    }
  };

  const handleStateClick = (stateName) => {
    const loc = LOCATIONS.find(
      (l) => l.state?.toLowerCase() === stateName.toLowerCase() && !l.district
    ) || {
      id: stateName.toLowerCase().replace(/\s+/g, ''),
      name: stateName,
      state: stateName,
      district: null,
      lat: 22.0,
      lon: 78.0,
      zoom: 7,
      baselinePrecip: 4.5,
    };
    onSelectLocation(loc);
  };

  const handleDistrictClick = (districtName) => {
    const loc = LOCATIONS.find(
      (l) => l.district?.toLowerCase() === districtName.toLowerCase()
    ) || {
      id: districtName.toLowerCase().replace(/\s+/g, ''),
      name: `${districtName}, ${selectedLocation.state || 'India'}`,
      state: selectedLocation.state,
      district: districtName,
      lat: 23.0,
      lon: 72.5,
      zoom: 10,
      baselinePrecip: 3.5,
    };
    onSelectLocation(loc);
  };

  const handleFitIndia = () => {
    const ind = LOCATIONS.find((l) => l.id === 'india');
    if (ind) onSelectLocation(ind);
  };

  const handleBackToState = () => {
    if (selectedLocation.state) {
      handleStateClick(selectedLocation.state);
    } else {
      handleFitIndia();
    }
  };

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none relative">
      {/* Header with Title and Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Integrated Atmospheric Intelligence Map (TATVA Real Map)
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              Interactive Geospatial Synchronizer
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Click any state or district polygon on the map to synchronize all analytical charts, anomaly graphs, and forecast models.
          </p>
        </div>

        {/* Map Top Actions */}
        <div className="flex items-center gap-2">
          <Breadcrumbs
            selectedState={selectedLocation.state}
            selectedDistrict={selectedLocation.district}
            onSelectIndia={handleFitIndia}
            onSelectState={handleStateClick}
          />

          <button
            type="button"
            onClick={() => setShowControls(!showControls)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              showControls
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Opacity</span>
          </button>
        </div>
      </div>

      {/* Opacity Drawer */}
      {showControls && (
        <div className="mb-3 p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between gap-4 animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold text-slate-300">Layer Opacity:</span>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => onOpacityChange?.(parseFloat(e.target.value))}
              className="w-28 accent-blue-500 cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-white">
              {Math.round(opacity * 100)}%
            </span>
          </div>

          <div className="text-[11px] text-slate-400 font-mono">
            Active Scope: <strong>{selectedLocation.name}</strong>
          </div>
        </div>
      )}

      {/* Layer Tabs Bar */}
      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
          Atmospheric Layers:
        </span>
        {layers.map((lyr) => (
          <button
            key={lyr.id}
            type="button"
            onClick={() => handleLayerClick(lyr)}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
              activeLayer === lyr.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
          >
            {lyr.label}
          </button>
        ))}
      </div>

      {/* Real TATVA Leaflet Map Container */}
      <div className="relative w-full h-[500px] sm:h-[540px] rounded-xl overflow-hidden border border-slate-800 bg-[#cbd5e1] shadow-inner">
        <LoadingOverlay isLoading={isLoading} message={loadingMsg} />

        <WeatherMap
          mapLevel={mapLevel}
          overviewData={overviewData}
          stateData={stateData}
          districtData={districtData}
          selectedState={selectedLocation.state}
          selectedDistrict={selectedLocation.district}
          onSelectState={handleStateClick}
          onSelectDistrict={handleDistrictClick}
          onFitIndia={handleFitIndia}
          onBackToState={handleBackToState}
          opacity={opacity}
          activeProductId={activeProductId}
          productData={productData}
        />
      </div>

      {/* Map Footer Info */}
      <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 font-medium">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-[#d4dcff]" />
          <span>Synchronized Region: <strong className="text-white">{selectedLocation.name}</strong></span>
          <span className="text-slate-500">&bull;</span>
          <span>Lat: {selectedLocation.lat}°N, Lon: {selectedLocation.lon}°E</span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
          <span>Layer: {layers.find((l) => l.id === activeLayer)?.desc || 'Authoritative Geospatial Boundary'}</span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-900/60 text-cyan-300">
            {productStatusMap[activeProductId]?.status || 'OPERATIONAL'}
          </span>
        </div>
      </div>
    </div>
  );
}
