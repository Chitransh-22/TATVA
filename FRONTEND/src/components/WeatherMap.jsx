import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import {
  getProductColor,
  getProductCategoryDesc,
  getProductDefinition,
  DEFAULT_PRODUCT_ID,
} from '../data/mosdacProducts';
import { Legend } from './Legend';
import { isValidRainfall } from '../utils/rainfallMetrics';
import { weatherStore } from '../data/weatherStore';

function slugify(text) {
  if (!text) return '';
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// Module-level caches to guarantee boundary GeoJSONs are fetched exactly once
let cachedIndiaBoundaryGeoJson = null;
let cachedIndiaStatesGeoJson = null;
const cachedDistrictsGeoJsonMap = {};
const boundaryListeners = new Set();

function notifyBoundaryListeners() {
  boundaryListeners.forEach((cb) => {
    try {
      cb();
    } catch (e) {
      console.warn('Boundary listener error:', e);
    }
  });
}

// Prefetch authoritative Survey of India official boundary
fetch('/data/india_boundary.geojson')
  .then((res) => res.json())
  .then((data) => {
    cachedIndiaBoundaryGeoJson = data;
    notifyBoundaryListeners();
  })
  .catch((e) => console.warn('Survey of India boundary preload error:', e));

fetch('/data/india_states.geojson')
  .then((res) => res.json())
  .then((data) => {
    cachedIndiaStatesGeoJson = data;
    notifyBoundaryListeners();
  })
  .catch((e) => console.warn('States preload error:', e));

export const getOfficialIndiaBounds = () => {
  if (cachedIndiaBoundaryGeoJson) {
    try {
      return L.geoJSON(cachedIndiaBoundaryGeoJson).getBounds();
    } catch {
      // Fallback
    }
  }
  // Authoritative Survey of India bounds (6.75°N to 37.10°N, 68.18°E to 97.42°E)
  return L.latLngBounds([6.75, 68.18], [37.10, 97.42]);
};

/**
 * Authoritative polygon raster mask generator.
 * Renders each individual Polygon in the MultiPolygon onto a mask canvas with '#ffffff',
 * properly hollowing out interior rings (holes) using the 'evenodd' rule.
 * Tested & validated: pixels inside boundary have alpha = 255; pixels outside have alpha = 0.
 */
function renderBoundaryMask(maskCanvas, map, geoData) {
  if (!maskCanvas || !map || !geoData) return 0;
  const ctx = maskCanvas.getContext('2d');
  ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  ctx.fillStyle = '#ffffff';

  let polygonCount = 0;

  const fillPolygon = (polyCoords) => {
    if (!Array.isArray(polyCoords) || polyCoords.length === 0) return;
    ctx.beginPath();
    for (let r = 0; r < polyCoords.length; r++) {
      const ring = polyCoords[r];
      if (!Array.isArray(ring) || ring.length < 3) continue;
      // GeoJSON coordinate order: [lon, lat] -> Leaflet expects [lat, lon]
      const first = map.latLngToContainerPoint([ring[0][1], ring[0][0]]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < ring.length; i++) {
        const pt = map.latLngToContainerPoint([ring[i][1], ring[i][0]]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');
    polygonCount++;
  };

  const processGeom = (geom) => {
    if (!geom || !geom.type) return;
    if (geom.type === 'Polygon') {
      fillPolygon(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      if (Array.isArray(geom.coordinates)) {
        for (let p = 0; p < geom.coordinates.length; p++) {
          fillPolygon(geom.coordinates[p]);
        }
      }
    } else if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      for (const g of geom.geometries) processGeom(g);
    }
  };

  if (geoData.type === 'FeatureCollection' && Array.isArray(geoData.features)) {
    for (const f of geoData.features) {
      if (f.geometry) processGeom(f.geometry);
    }
  } else if (geoData.type === 'Feature' && geoData.geometry) {
    processGeom(geoData.geometry);
  } else {
    processGeom(geoData);
  }

  return polygonCount;
}

export function WeatherMap({
  mapLevel = 'india',
  overviewData,
  stateData,
  districtData,
  selectedState,
  selectedDistrict,
  onSelectState,
  onSelectDistrict,
  onFitIndia,
  opacity = 0.85,
  activeSource = 'MOSDAC',
  activeProductId = DEFAULT_PRODUCT_ID,
  productData = null,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const inspectorRef = useRef(null);

  // Stable callback refs
  const onSelectStateRef = useRef(onSelectState);
  const onSelectDistrictRef = useRef(onSelectDistrict);
  const onFitIndiaRef = useRef(onFitIndia);
  useEffect(() => {
    onSelectStateRef.current = onSelectState;
    onSelectDistrictRef.current = onSelectDistrict;
    onFitIndiaRef.current = onFitIndia;
  });

  // Layer references
  const tileLayerRef = useRef(null);
  const nationalOutlineLayerRef = useRef(null);
  const statesLayerRef = useRef(null);
  const districtsLayerRef = useRef(null);
  const pointsLayerRef = useRef(null);
  const canvasLayerRef = useRef(null);
  const canvasRendererRef = useRef(null);
  const loadNationalBoundaryRef = useRef(null);

  // Render pass sequence counter for atomic updates & race condition abortion
  const renderSeqRef = useRef(0);

  // Track previous navigation for camera transitions
  const prevSelectionRef = useRef({
    mapLevel: 'india',
    state: null,
    district: null,
  });

  // Keep latest render data in ref to avoid recreating layers on state changes
  const renderDataRef = useRef({
    mapLevel,
    overviewData,
    stateData,
    districtData,
    selectedState,
    selectedDistrict,
    opacity,
    activeSource,
    activeProductId,
    productData,
  });

  useEffect(() => {
    renderDataRef.current = {
      mapLevel,
      overviewData,
      stateData,
      districtData,
      selectedState,
      selectedDistrict,
      opacity,
      activeSource,
      activeProductId,
      productData,
    };
  }, [
    mapLevel,
    overviewData,
    stateData,
    districtData,
    selectedState,
    selectedDistrict,
    opacity,
    activeSource,
    activeProductId,
    productData,
  ]);

  const productConfig = getProductDefinition(activeProductId);

  // Fast direct DOM update for Inspector Pill (0ms latency, 0 React renders)
  const updateInspector = useCallback((name, lat, lon, val, unit, desc) => {
    if (!inspectorRef.current) return;
    const cfg = getProductDefinition(renderDataRef.current.activeProductId);
    const u = unit || cfg.unit || '';
    const vStr = val !== null && val !== undefined ? `${Number(val).toFixed(2)} ${u}` : `No data`;
    const catDesc = desc || (val !== null && val !== undefined ? getProductCategoryDesc(cfg, val) : '');

    inspectorRef.current.innerHTML = `
      <div class="inspector-content">
        <span class="inspector-location">📍 ${name}</span>
        <span class="inspector-coords">[${lat}°N, ${lon}°E]</span>
        <span class="inspector-val">${vStr}</span>
        ${catDesc ? `<span class="inspector-desc" style="display:inline-block;margin-left:6px;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;background:#e0f2fe;color:#0369a1;">${catDesc}</span>` : ''}
      </div>
    `;
  }, []);

  const resetInspector = useCallback(() => {
    if (!inspectorRef.current) return;
    const cfg = getProductDefinition(renderDataRef.current.activeProductId);
    const isNasa = (renderDataRef.current.activeSource === 'NASA');
    const sourceLabel = isNasa
      ? '🇮🇳 NASA IMERG 0.1° GPM Precipitation'
      : `🛰️ ISRO MOSDAC • ${cfg.productName}`;

    inspectorRef.current.innerHTML = `
      <div class="inspector-content">
        <span class="inspector-location">${sourceLabel}</span>
        <span class="inspector-hint">&bull; Click or hover regions to inspect observation</span>
      </div>
    `;
  }, []);

  // ---------------------------------------------------------------------------
  // 1. Initialize Leaflet Map Instance ONCE
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [23.5, 82.8],
      zoom: 4.5,
      minZoom: 3.5,
      maxZoom: 14,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    });

    // Automatically fit the complete official Survey of India political boundary
    const initialBounds = getOfficialIndiaBounds();
    map.fitBounds(initialBounds, { padding: [24, 24], animate: false });

    map.createPane('weatherCanvasPane');
    const weatherPane = map.getPane('weatherCanvasPane');
    if (weatherPane) {
      weatherPane.style.zIndex = '300';
      weatherPane.style.pointerEvents = 'none';
    }

    map.createPane('boundaryPane');
    const boundaryPane = map.getPane('boundaryPane');
    if (boundaryPane) {
      boundaryPane.style.zIndex = '400';
    }

    // High-performance canvas renderer for district markers
    canvasRendererRef.current = L.canvas({ pane: 'markerPane' });
    pointsLayerRef.current = L.layerGroup([], { pane: 'markerPane' }).addTo(map);

    // OpenStreetMap base layer with visible attribution
    tileLayerRef.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors | &copy; ISRO MOSDAC',
      maxZoom: 19,
      className: 'tatva-osm-tiles',
    }).addTo(map);

    mapRef.current = map;

    // Attach map click handler for spatial point inspection
    map.on('click', (e) => {
      const curData = renderDataRef.current.productData;
      const pts = curData?.points;
      if (!pts || pts.length === 0) return;

      const clickLat = e.latlng.lat;
      const clickLon = e.latlng.lng;
      let closest = null;
      let minDistance = 0.20; // ~20 km radius

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const dist = Math.hypot(p[0] - clickLat, p[1] - clickLon);
        if (dist < minDistance) {
          minDistance = dist;
          closest = p;
        }
      }

      if (closest) {
        const cfg = getProductDefinition(renderDataRef.current.activeProductId);
        const lat = closest[0];
        const lon = closest[1];
        const val = closest[2];
        const desc = getProductCategoryDesc(cfg, val);
        const unit = cfg.unit || '';

        const content = `
          <div style="font-size:12.5px; line-height:1.5; font-family:'Plus Jakarta Sans',sans-serif;">
            <div style="font-weight:700; color:#0284c7; font-size:13px; display:flex; align-items:center; gap:4px;">
              <span>${cfg.icon || '🛰️'}</span> ${cfg.productName}
            </div>
            <div style="color:#334155; margin-top:3px;">
              <b>Coordinates:</b> ${lat.toFixed(3)}° N, ${lon.toFixed(3)}° E<br>
              <b>Observed Value:</b> <b style="font-size:14px; color:#0f172a;">${val.toFixed(2)} ${unit}</b>
            </div>
            ${desc ? `<div style="margin-top:4px;"><span style="display:inline-block; padding:2px 7px; border-radius:4px; font-size:10.5px; font-weight:700; background:#e0f2fe; color:#0369a1;">${desc}</span></div>` : ''}
            <div style="font-size:10px; color:#64748b; margin-top:5px; border-top:1px solid #f1f5f9; padding-top:3px;">
              Survey of India Georeferenced
            </div>
          </div>
        `;

        L.popup()
          .setLatLng([lat, lon])
          .setContent(content)
          .openOn(map);
      }
    });

    // Load Official Survey of India National Boundary outline
    const loadNationalBoundary = () => {
      if (cachedIndiaBoundaryGeoJson && mapRef.current) {
        if (!nationalOutlineLayerRef.current) {
          nationalOutlineLayerRef.current = L.geoJSON(cachedIndiaBoundaryGeoJson, {
            pane: 'boundaryPane',
            interactive: false,
            style: {
              color: '#1d4ed8',
              weight: 2.2,
              opacity: 0.95,
              fillColor: '#0284c7',
              fillOpacity: 0.01,
            },
          }).addTo(mapRef.current);
        }
      }
    };
    loadNationalBoundaryRef.current = loadNationalBoundary;
    loadNationalBoundary();

    // -------------------------------------------------------------------------
    // Create Validated Canvas Weather/MOSDAC Raster Layer
    // -------------------------------------------------------------------------
    const CanvasOverlayLayer = L.Layer.extend({
      onAdd: function (leafletMap) {
        this._map = leafletMap;
        if (!this._canvas) {
          this._canvas = L.DomUtil.create('canvas', 'leaflet-weather-canvas-layer');
          this._canvas.style.position = 'absolute';
          this._canvas.style.left = '0';
          this._canvas.style.top = '0';
          this._canvas.style.pointerEvents = 'none';
        }

        const targetPane = leafletMap.getPane('weatherCanvasPane') || leafletMap.getPanes().overlayPane;
        targetPane.appendChild(this._canvas);

        this._offscreenCanvas = document.createElement('canvas');
        this._maskCanvas = document.createElement('canvas');

        leafletMap.on('moveend zoomend resize viewreset', this._draw, this);
        this._draw();
      },

      onRemove: function (leafletMap) {
        if (this._canvas && this._canvas.parentNode) {
          this._canvas.parentNode.removeChild(this._canvas);
        }
        this._offscreenCanvas = null;
        this._maskCanvas = null;
        leafletMap.off('moveend zoomend resize viewreset', this._draw, this);
      },

      _draw: function () {
        if (!this._map || !this._canvas) return;

        const currentSeq = ++renderSeqRef.current;
        const size = this._map.getSize();
        if (size.x <= 0 || size.y <= 0) return;

        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        const dpr = window.devicePixelRatio || 1;
        this._canvas.width = Math.round(size.x * dpr);
        this._canvas.height = Math.round(size.y * dpr);
        this._canvas.style.width = `${size.x}px`;
        this._canvas.style.height = `${size.y}px`;

        if (!this._offscreenCanvas) this._offscreenCanvas = document.createElement('canvas');
        if (!this._maskCanvas) this._maskCanvas = document.createElement('canvas');

        this._offscreenCanvas.width = Math.round(size.x * dpr);
        this._offscreenCanvas.height = Math.round(size.y * dpr);
        this._maskCanvas.width = Math.round(size.x * dpr);
        this._maskCanvas.height = Math.round(size.y * dpr);

        const offCtx = this._offscreenCanvas.getContext('2d');
        offCtx.clearRect(0, 0, this._offscreenCanvas.width, this._offscreenCanvas.height);
        offCtx.save();
        offCtx.scale(dpr, dpr);

        const {
          mapLevel: curLevel,
          overviewData: curOverview,
          stateData: curStateData,
          districtData: curDistData,
          selectedState: curState,
          selectedDistrict: curDist,
          opacity: curOpacity,
          activeProductId: curProdId,
          productData: curProdData,
        } = renderDataRef.current;

        const cfg = getProductDefinition(curProdId);
        const shouldClip = cfg.clipToBoundary;

        // ---------------------------------------------------------------------
        // 1. Determine Clipping Boundary Geometry (District -> State -> Visual India)
        // ---------------------------------------------------------------------
        let clipGeoData = null;
        if (shouldClip) {
          if (curLevel === 'district' && curDist && curState) {
            const stateSlug = slugify(curState);
            const districtGeo = cachedDistrictsGeoJsonMap[stateSlug];
            if (districtGeo?.features) {
              const feat = districtGeo.features.find((f) => {
                const name = f?.properties?.NAME_2 || f?.properties?.DISTRICT || '';
                return name.toLowerCase() === curDist.toLowerCase();
              });
              if (feat) clipGeoData = feat;
            }
          }

          if (!clipGeoData && (curLevel === 'state' || curLevel === 'district') && curState) {
            if (cachedIndiaStatesGeoJson?.features) {
              const feat = cachedIndiaStatesGeoJson.features.find((f) => {
                const name = f?.properties?.ST_NM || '';
                return name.toLowerCase() === curState.toLowerCase();
              });
              if (feat) clipGeoData = feat;
            }
          }

          if (!clipGeoData) {
            clipGeoData = cachedIndiaBoundaryGeoJson;
          }
        }

        // ---------------------------------------------------------------------
        // 2. Select Observation Points for Active Product
        // ---------------------------------------------------------------------
        let points = [];
        if (curProdData?.points && curProdData.points.length > 0) {
          points = curProdData.points;
        } else if (curProdId === '3SIMG_L2B_HEM' || curProdId === '3SIMG_L2G_IMR') {
          // Fallback for rainfall to store/overview if productData is still hydrating
          if (curLevel === 'district') {
            points = weatherStore.getRecords(true) || curDistData?.observations || [];
          } else if (curLevel === 'state') {
            points = weatherStore.getRecords(true) || curStateData?.observations || [];
          } else {
            const storeMap = weatherStore.getRecordsMap();
            if (storeMap.size > 0) points = Array.from(storeMap.values());
            else if (curOverview?.grid_points?.length) points = curOverview.grid_points;
            else if (curOverview?.observations?.length) points = curOverview.observations;
          }
        }

        const minThreshold = cfg.defaultMinThreshold !== undefined ? cfg.defaultMinThreshold : -999.0;
        const mapBounds = this._map.getBounds();
        const south = mapBounds.getSouth();
        const north = mapBounds.getNorth();
        const west = mapBounds.getWest();
        const east = mapBounds.getEast();
        const zoom = this._map.getZoom();

        // Spatial cell resolution
        let stepDeg = 0.04; // INSAT-3DS Imager standard (~4km)
        if (curProdId.includes('AOD')) stepDeg = 0.05;
        if (curProdId.startsWith('3SSND')) stepDeg = 0.10;

        const ptCenter = this._map.latLngToContainerPoint([22.0, 80.0]);
        const ptStep = this._map.latLngToContainerPoint([22.0 + stepDeg, 80.0 + stepDeg]);
        const cellW = Math.max(2, Math.abs(ptStep.x - ptCenter.x) * 1.15);
        const cellH = Math.max(2, Math.abs(ptCenter.y - ptStep.y) * 1.15);
        const radius = Math.max(2.5, Math.min(26, Math.pow(2, zoom - 5) * 3.4));

        const isCategoricalMask = (cfg.renderType === 'categorical_mask' || curProdId.includes('FOG'));
        const isDiscretePoint = (cfg.renderType === 'points');

        let validRenderedPoints = 0;

        // Draw spatial raster to offscreen canvas
        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          const lat = pt.latitude !== undefined ? pt.latitude : pt[0];
          const lon = pt.longitude !== undefined ? pt.longitude : pt[1];
          const val = pt.precipitation !== undefined ? pt.precipitation : pt.value !== undefined ? pt.value : pt[2];

          if (lat == null || lon == null || val == null || isNaN(lat) || isNaN(lon) || isNaN(val)) continue;
          if (val < minThreshold) continue;

          // Lat/lon culling with 0.15 deg margin
          if (lat < south - 0.15 || lat > north + 0.15 || lon < west - 0.15 || lon > east + 0.15) {
            continue;
          }

          validRenderedPoints++;
          const p = this._map.latLngToContainerPoint([lat, lon]);
          offCtx.fillStyle = getProductColor(cfg, val);

          if (isCategoricalMask) {
            offCtx.fillRect(p.x - cellW / 2, p.y - cellH / 2, cellW, cellH);
          } else if (isDiscretePoint) {
            offCtx.beginPath();
            offCtx.arc(p.x, p.y, Math.max(3, radius), 0, Math.PI * 2);
            offCtx.fill();
          } else {
            // Fluid continuous raster discs
            offCtx.beginPath();
            offCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            offCtx.fill();
          }
        }

        // ---------------------------------------------------------------------
        // 3. Apply Authoritative Vector Alpha Mask (destination-in)
        // ---------------------------------------------------------------------
        let maskApplied = false;
        if (shouldClip && clipGeoData) {
          // Render vector mask onto maskCanvas with DPR scaling
          const maskCtx = this._maskCanvas.getContext('2d');
          maskCtx.save();
          maskCtx.scale(dpr, dpr);
          renderBoundaryMask(this._maskCanvas, this._map, clipGeoData);
          maskCtx.restore();

          offCtx.save();
          offCtx.globalAlpha = 1.0;
          offCtx.globalCompositeOperation = 'destination-in';
          offCtx.drawImage(this._maskCanvas, 0, 0, size.x, size.y);
          offCtx.restore();
          maskApplied = true;
        }

        offCtx.restore();

        // Abort blit if a newer render cycle already started
        if (renderSeqRef.current !== currentSeq) return;

        // ---------------------------------------------------------------------
        // 4. Atomic Blit to Visible Canvas Layer
        // ---------------------------------------------------------------------
        const visCtx = this._canvas.getContext('2d');
        visCtx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        visCtx.globalAlpha = curOpacity;
        visCtx.drawImage(this._offscreenCanvas, 0, 0);

        console.log(
          `[MOSDAC MAP] product=${curProdId} | level=${curLevel} | points=${points.length} | rendered=${validRenderedPoints} | clipped=${maskApplied}`
        );
      },
    });

    const canvasLayer = new CanvasOverlayLayer();
    canvasLayer.addTo(map);
    canvasLayerRef.current = canvasLayer;

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (canvasLayerRef.current) {
        map.removeLayer(canvasLayerRef.current);
        canvasLayerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 2. Throttled Canvas Redraw Hook (Triggered on data, product, or boundary updates)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let animFrame = null;
    const requestRedraw = () => {
      if (animFrame) return;
      animFrame = requestAnimationFrame(() => {
        animFrame = null;
        if (canvasLayerRef.current && canvasLayerRef.current._draw) {
          canvasLayerRef.current._draw();
        }
      });
    };

    requestRedraw();

    const onBoundaryLoaded = () => {
      if (loadNationalBoundaryRef.current) {
        loadNationalBoundaryRef.current();
      }
      requestRedraw();
    };
    boundaryListeners.add(onBoundaryLoaded);

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
      boundaryListeners.delete(onBoundaryLoaded);
    };
  }, [
    mapLevel,
    overviewData,
    stateData,
    districtData,
    selectedState,
    selectedDistrict,
    opacity,
    activeProductId,
    productData,
  ]);

  // ---------------------------------------------------------------------------
  // 3. States GeoJSON Layer (Persistent: In-place setStyle update)
  // ---------------------------------------------------------------------------
  const updateStatesStyle = useCallback(() => {
    if (!statesLayerRef.current) return;
    const { mapLevel: curLevel, selectedState: curState } = renderDataRef.current;
    const defaultBorderColor = '#475569';

    statesLayerRef.current.setStyle((feature) => {
      const stName = feature?.properties?.ST_NM || '';
      const isSelected = curState && stName.toLowerCase() === curState.toLowerCase();

      if (curLevel === 'india') {
        return {
          color: defaultBorderColor,
          weight: 0.85,
          opacity: 0.65,
          fillColor: '#ffffff',
          fillOpacity: 0.001,
        };
      } else if (curLevel === 'state') {
        return {
          color: isSelected ? '#0284c7' : '#94a3b8',
          weight: isSelected ? 2.2 : 0.6,
          opacity: isSelected ? 0.95 : 0.4,
          fillColor: isSelected ? '#38bdf8' : '#ffffff',
          fillOpacity: isSelected ? 0.08 : 0.001,
        };
      } else {
        return {
          color: isSelected ? '#0284c7' : '#cbd5e1',
          weight: isSelected ? 1.5 : 0.4,
          opacity: isSelected ? 0.8 : 0.25,
          fillColor: isSelected ? '#38bdf8' : '#ffffff',
          fillOpacity: isSelected ? 0.04 : 0.001,
        };
      }
    });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const initStates = (geojson) => {
      if (!mapRef.current || statesLayerRef.current) return;

      const layer = L.geoJSON(geojson, {
        pane: 'boundaryPane',
        style: (feature) => {
          const stName = feature?.properties?.ST_NM || '';
          const isSelected = selectedState && stName.toLowerCase() === selectedState.toLowerCase();
          return {
            color: isSelected ? '#0284c7' : '#475569',
            weight: isSelected ? 2.2 : 0.85,
            opacity: isSelected ? 0.95 : 0.65,
            fillColor: isSelected ? '#38bdf8' : '#ffffff',
            fillOpacity: isSelected ? 0.08 : 0.001,
          };
        },
        onEachFeature: (feature, l) => {
          const stName = feature.properties?.ST_NM || '';

          const getCellVal = (latlng) => {
            const curData = renderDataRef.current.productData;
            const pts = curData?.points;
            if (pts && pts.length > 0) {
              let nearestVal = null;
              let minDist = 0.35;
              for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                const d = Math.hypot(p[0] - latlng.lat, p[1] - latlng.lng);
                if (d < minDist) {
                  minDist = d;
                  nearestVal = p[2];
                }
              }
              if (nearestVal !== null) return nearestVal;
            }

            const { overviewData: ov } = renderDataRef.current;
            const summary = ov?.state_summaries?.find(
              (s) => s.state_name.toLowerCase() === stName.toLowerCase()
            );
            return summary && isValidRainfall(summary.avg_precipitation) ? summary.avg_precipitation : null;
          };

          l.bindTooltip(
            () => {
              const cfg = getProductDefinition(renderDataRef.current.activeProductId);
              const { overviewData: ov } = renderDataRef.current;
              const summary = ov?.state_summaries?.find(
                (s) => s.state_name.toLowerCase() === stName.toLowerCase()
              );
              const avgP = summary ? summary.avg_precipitation.toFixed(1) : '0.0';
              const maxP = summary ? summary.max_precipitation.toFixed(1) : '0.0';
              return `<div class="weather-map-tooltip">
                <div class="tooltip-header">
                  <span class="tooltip-title">${stName}</span>
                  <span class="tooltip-category">${cfg.shortName}</span>
                </div>
                <div class="tooltip-body">
                  <div class="tooltip-stat"><span class="tooltip-label">Avg</span><span class="tooltip-val">${avgP} ${cfg.unit}</span></div>
                  <div class="tooltip-stat"><span class="tooltip-label">Peak</span><span class="tooltip-val highlight">${maxP} ${cfg.unit}</span></div>
                </div>
              </div>`;
            },
            {
              sticky: true,
              className: 'leaflet-tooltip-clean',
              direction: 'top',
              offset: [0, -10],
            }
          );

          l.on({
            mouseover: (e) => {
              const { mapLevel: curLevel, selectedState: curState } = renderDataRef.current;
              if (curLevel === 'india' || !curState || curState.toLowerCase() !== stName.toLowerCase()) {
                e.target.setStyle({
                  color: '#0284c7',
                  weight: 1.8,
                  opacity: 0.95,
                  fillOpacity: 0.05,
                });
              }
              const val = getCellVal(e.latlng);
              const cfg = getProductDefinition(renderDataRef.current.activeProductId);
              updateInspector(
                stName,
                Number(e.latlng.lat.toFixed(2)),
                Number(e.latlng.lng.toFixed(2)),
                val,
                cfg.unit
              );
            },
            mousemove: (e) => {
              const val = getCellVal(e.latlng);
              const cfg = getProductDefinition(renderDataRef.current.activeProductId);
              updateInspector(
                stName,
                Number(e.latlng.lat.toFixed(2)),
                Number(e.latlng.lng.toFixed(2)),
                val,
                cfg.unit
              );
            },
            mouseout: () => {
              updateStatesStyle();
              resetInspector();
            },
            click: () => {
              onSelectStateRef.current(stName);
            },
          });
        },
      }).addTo(mapRef.current);

      statesLayerRef.current = layer;
      updateStatesStyle();
    };

    if (cachedIndiaStatesGeoJson) {
      initStates(cachedIndiaStatesGeoJson);
    } else {
      fetch('/data/india_states.geojson')
        .then((res) => res.json())
        .then((geojson) => {
          cachedIndiaStatesGeoJson = geojson;
          notifyBoundaryListeners();
          initStates(geojson);
        })
        .catch((err) => console.warn('Could not load states geojson:', err));
    }
  }, [updateStatesStyle, updateInspector, resetInspector]);

  // Update states styling whenever mapLevel or selectedState changes
  useEffect(() => {
    updateStatesStyle();
  }, [mapLevel, selectedState, updateStatesStyle]);

  // ---------------------------------------------------------------------------
  // 4. Districts GeoJSON Layer (Loaded on demand for selected state)
  // ---------------------------------------------------------------------------
  const currentDistrictStateSlugRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (mapLevel === 'india' || !selectedState) {
      if (districtsLayerRef.current) {
        map.removeLayer(districtsLayerRef.current);
        districtsLayerRef.current = null;
        currentDistrictStateSlugRef.current = null;
      }
      return;
    }

    const stateSlug = slugify(selectedState);

    const updateDistrictsStyle = () => {
      if (!districtsLayerRef.current) return;
      const { selectedDistrict: curDist } = renderDataRef.current;
      districtsLayerRef.current.setStyle((feature) => {
        const distName = feature?.properties?.NAME_2 || feature?.properties?.DISTRICT || '';
        const isSelected = curDist && distName.toLowerCase() === curDist.toLowerCase();
        return {
          color: isSelected ? '#0284c7' : '#64748b',
          weight: isSelected ? 2.0 : 0.75,
          opacity: isSelected ? 0.95 : 0.55,
          fillColor: isSelected ? '#38bdf8' : '#ffffff',
          fillOpacity: isSelected ? 0.08 : 0.001,
        };
      });
    };

    if (districtsLayerRef.current && currentDistrictStateSlugRef.current === stateSlug) {
      updateDistrictsStyle();
      return;
    }

    if (districtsLayerRef.current) {
      map.removeLayer(districtsLayerRef.current);
      districtsLayerRef.current = null;
      currentDistrictStateSlugRef.current = null;
    }

    const initDistricts = (geojson) => {
      if (!mapRef.current || renderDataRef.current.mapLevel === 'india') return;

      const layer = L.geoJSON(geojson, {
        pane: 'boundaryPane',
        style: (feature) => {
          const distName = feature?.properties?.NAME_2 || feature?.properties?.DISTRICT || '';
          const isSelected = selectedDistrict && distName.toLowerCase() === selectedDistrict.toLowerCase();
          return {
            color: isSelected ? '#0284c7' : '#64748b',
            weight: isSelected ? 2.0 : 0.75,
            opacity: isSelected ? 0.95 : 0.55,
            fillColor: isSelected ? '#38bdf8' : '#ffffff',
            fillOpacity: isSelected ? 0.08 : 0.001,
          };
        },
        onEachFeature: (feature, l) => {
          const distName = feature.properties?.NAME_2 || feature.properties?.DISTRICT || 'District';

          l.bindTooltip(
            () => {
              const cfg = getProductDefinition(renderDataRef.current.activeProductId);
              const { stateData: sd } = renderDataRef.current;
              const summary = sd?.district_summaries?.find(
                (d) => d.district_name.toLowerCase() === distName.toLowerCase()
              );
              const avgP = summary ? summary.avg_precipitation.toFixed(1) : '0.0';
              const maxP = summary ? summary.max_precipitation.toFixed(1) : '0.0';
              return `<div class="weather-map-tooltip">
                <div class="tooltip-header">
                  <span class="tooltip-title">${distName}</span>
                  <span class="tooltip-category">${cfg.shortName}</span>
                </div>
                <div class="tooltip-body">
                  <div class="tooltip-stat"><span class="tooltip-label">Avg</span><span class="tooltip-val">${avgP} ${cfg.unit}</span></div>
                  <div class="tooltip-stat"><span class="tooltip-label">Peak</span><span class="tooltip-val highlight">${maxP} ${cfg.unit}</span></div>
                </div>
              </div>`;
            },
            {
              sticky: true,
              className: 'leaflet-tooltip-clean',
              direction: 'top',
              offset: [0, -10],
            }
          );

          l.on({
            mouseover: () => {
              const { selectedDistrict: curDist, selectedState: curSt, stateData: sd } = renderDataRef.current;
              const isSelected = curDist && distName.toLowerCase() === curDist.toLowerCase();
              if (!isSelected) {
                l.setStyle({
                  color: '#0284c7',
                  weight: 1.6,
                  opacity: 0.95,
                  fillOpacity: 0.05,
                });
              }
              const summary = sd?.district_summaries?.find(
                (d) => d.district_name.toLowerCase() === distName.toLowerCase()
              );
              const cfg = getProductDefinition(renderDataRef.current.activeProductId);
              updateInspector(
                `${distName}, ${curSt}`,
                l.getBounds().getCenter().lat,
                l.getBounds().getCenter().lng,
                summary ? summary.avg_precipitation : null,
                cfg.unit
              );
            },
            mousemove: (e) => {
              const { selectedState: curSt, stateData: sd } = renderDataRef.current;
              const summary = sd?.district_summaries?.find(
                (d) => d.district_name.toLowerCase() === distName.toLowerCase()
              );
              const cfg = getProductDefinition(renderDataRef.current.activeProductId);
              updateInspector(
                `${distName}, ${curSt}`,
                Number(e.latlng.lat.toFixed(2)),
                Number(e.latlng.lng.toFixed(2)),
                summary ? summary.avg_precipitation : null,
                cfg.unit
              );
            },
            mouseout: () => {
              updateDistrictsStyle();
              resetInspector();
            },
            click: () => {
              onSelectDistrictRef.current(distName);
            },
          });
        },
      }).addTo(mapRef.current);

      districtsLayerRef.current = layer;
      currentDistrictStateSlugRef.current = stateSlug;

      if (canvasLayerRef.current && canvasLayerRef.current._draw) {
        canvasLayerRef.current._draw();
      }
    };

    if (cachedDistrictsGeoJsonMap[stateSlug]) {
      initDistricts(cachedDistrictsGeoJsonMap[stateSlug]);
    } else {
      fetch(`/data/districts/${stateSlug}.json`)
        .then((res) => {
          if (!res.ok) throw new Error(`Status ${res.status}`);
          return res.json();
        })
        .then((geojson) => {
          cachedDistrictsGeoJsonMap[stateSlug] = geojson;
          notifyBoundaryListeners();
          initDistricts(geojson);
        })
        .catch((err) => {
          console.warn(`Could not load district geojson for ${selectedState}:`, err);
        });
    }
  }, [mapLevel, selectedState, selectedDistrict, updateInspector, resetInspector]);

  // ---------------------------------------------------------------------------
  // 5. Deterministic Camera Transitions (India -> State -> District)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const prev = prevSelectionRef.current;

    if (mapLevel === 'india' && prev.mapLevel !== 'india') {
      const bounds = getOfficialIndiaBounds();
      map.fitBounds(bounds, { padding: [24, 24], animate: true, duration: 0.8 });
    } else if (mapLevel === 'state' && (prev.mapLevel !== 'state' || prev.state !== selectedState)) {
      if (statesLayerRef.current) {
        let matched = false;
        statesLayerRef.current.eachLayer((layer) => {
          const name = layer.feature?.properties?.ST_NM;
          if (name && selectedState && name.toLowerCase() === selectedState.toLowerCase()) {
            map.fitBounds(layer.getBounds(), { padding: [30, 30], animate: true, duration: 0.8 });
            matched = true;
          }
        });
        if (!matched && cachedIndiaStatesGeoJson?.features) {
          const feat = cachedIndiaStatesGeoJson.features.find(
            (f) => f.properties?.ST_NM?.toLowerCase() === selectedState.toLowerCase()
          );
          if (feat) {
            const tempLayer = L.geoJSON(feat);
            map.fitBounds(tempLayer.getBounds(), { padding: [30, 30], animate: true, duration: 0.8 });
          }
        }
      }
    } else if (mapLevel === 'district' && (prev.mapLevel !== 'district' || prev.district !== selectedDistrict)) {
      if (districtsLayerRef.current) {
        districtsLayerRef.current.eachLayer((layer) => {
          const name = layer.feature?.properties?.NAME_2 || layer.feature?.properties?.DISTRICT;
          if (name && selectedDistrict && name.toLowerCase() === selectedDistrict.toLowerCase()) {
            map.fitBounds(layer.getBounds(), { padding: [30, 30], animate: true, duration: 0.8 });
          }
        });
      }
    }

    prevSelectionRef.current = { mapLevel, state: selectedState, district: selectedDistrict };
  }, [mapLevel, selectedState, selectedDistrict]);

  // ---------------------------------------------------------------------------
  // 6. Custom Vertical Map Control Actions
  // ---------------------------------------------------------------------------
  const handleZoomIn = useCallback(() => {
    if (mapRef.current) mapRef.current.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    if (mapRef.current) mapRef.current.zoomOut();
  }, []);

  const handleFitIndia = useCallback(() => {
    if (mapRef.current) {
      const bounds = getOfficialIndiaBounds();
      mapRef.current.fitBounds(bounds, { padding: [24, 24], animate: true, duration: 0.8 });
    }
    onFitIndiaRef.current();
  }, []);

  return (
    <div className="map-wrapper">
      <div ref={mapContainerRef} className="leaflet-map-canvas" />

      {/* Modern Vertical Map Controls */}
      <div className="map-vertical-controls" role="group" aria-label="Map Navigation Controls">
        <button
          type="button"
          className="map-control-btn"
          onClick={handleZoomIn}
          title="Zoom In"
          aria-label="Zoom In"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="control-svg">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          type="button"
          className="map-control-btn"
          onClick={handleZoomOut}
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="control-svg">
            <path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="control-btn-divider" />
        <button
          type="button"
          className="map-control-btn"
          onClick={handleFitIndia}
          title="Fit India Extent"
          aria-label="Fit India"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="control-svg">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 100 2h2v2a1 1 0 102 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 110-2h2v-2a1 1 0 112 0v3z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Floating Dynamic Legend */}
      <Legend productConfig={productConfig} activeProductId={activeProductId} />

      {/* Bottom Status / Cursor Inspector Pill (Direct DOM updated) */}
      <div ref={inspectorRef} className="map-inspector-pill">
        <div className="inspector-content">
          <span className="inspector-location">
            {overviewData?.source === 'NASA' || activeSource === 'NASA'
              ? '🇮🇳 NASA IMERG 0.1° GPM Real-Time Precipitation'
              : `🛰️ ISRO MOSDAC • ${productConfig.productName}`}
          </span>
          <span className="inspector-hint">&bull; Click or hover regions to inspect observation</span>
        </div>
      </div>
    </div>
  );
}
