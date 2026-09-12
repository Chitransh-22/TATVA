import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import { getPrecipitationColor, getPrecipitationRgb, Legend } from './Legend';
import { isValidRainfall } from '../utils/rainfallMetrics';
import { weatherStore } from '../data/weatherStore';

function slugify(text) {
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

// Immediately initiate background prefetch of official India boundary
fetch('/data/india_boundary.geojson')
  .then((res) => res.json())
  .then((data) => {
    cachedIndiaBoundaryGeoJson = data;
    notifyBoundaryListeners();
  })
  .catch((e) => console.warn('Boundary preload error:', e));

fetch('/data/india_states.geojson')
  .then((res) => res.json())
  .then((data) => {
    cachedIndiaStatesGeoJson = data;
    notifyBoundaryListeners();
  })
  .catch((e) => console.warn('States preload error:', e));

/**
 * Traces a GeoJSON geometry into an HTML5 Canvas 2D Path using Leaflet's latLngToContainerPoint.
 */
function addGeometryToCanvasPath(ctx, map, geom) {
  if (!geom) return;

  const traceRing = (ring) => {
    if (!ring || ring.length === 0) return;
    let first = true;
    for (let p = 0; p < ring.length; p++) {
      const coord = ring[p];
      if (!coord || coord.length < 2) continue;
      const lon = coord[0];
      const lat = coord[1];
      if (lon == null || lat == null || isNaN(lon) || isNaN(lat)) continue;
      const pt = map.latLngToContainerPoint([lat, lon]);
      if (first) {
        ctx.moveTo(pt.x, pt.y);
        first = false;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.closePath();
  };

  const geomType = geom.type;

  if (geomType === 'FeatureCollection' && Array.isArray(geom.features)) {
    for (let i = 0; i < geom.features.length; i++) {
      const f = geom.features[i];
      if (f && f.geometry) addGeometryToCanvasPath(ctx, map, f.geometry);
    }
  } else if (geomType === 'Feature' && geom.geometry) {
    addGeometryToCanvasPath(ctx, map, geom.geometry);
  } else if (geomType === 'Polygon' && Array.isArray(geom.coordinates)) {
    for (let r = 0; r < geom.coordinates.length; r++) {
      traceRing(geom.coordinates[r]);
    }
  } else if (geomType === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
    for (let i = 0; i < geom.coordinates.length; i++) {
      const poly = geom.coordinates[i];
      for (let r = 0; r < poly.length; r++) {
        traceRing(poly[r]);
      }
    }
  } else if (geomType === 'GeometryCollection' && Array.isArray(geom.geometries)) {
    for (let i = 0; i < geom.geometries.length; i++) {
      addGeometryToCanvasPath(ctx, map, geom.geometries[i]);
    }
  }
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
  opacity,
  activeSource = 'MOSDAC',
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // Direct DOM ref for Inspector Bar (Avoids React re-renders on mouse move!)
  const inspectorRef = useRef(null);

  // Stable callback refs so Leaflet listeners never become stale
  const onSelectStateRef = useRef(onSelectState);
  const onSelectDistrictRef = useRef(onSelectDistrict);
  const onFitIndiaRef = useRef(onFitIndia);
  useEffect(() => {
    onSelectStateRef.current = onSelectState;
    onSelectDistrictRef.current = onSelectDistrict;
    onFitIndiaRef.current = onFitIndia;
  });

  // Layer references (All persistent with explicit lifecycles)
  const tileLayerRef = useRef(null);
  const nationalOutlineLayerRef = useRef(null);
  const statesLayerRef = useRef(null);
  const districtsLayerRef = useRef(null);
  const pointsLayerRef = useRef(null);
  const canvasLayerRef = useRef(null);
  const canvasRendererRef = useRef(null);

  // Track previous navigation for smooth single-source camera transitions
  const prevSelectionRef = useRef({
    mapLevel: 'india',
    state: null,
    district: null,
  });

  // Keep latest data in ref for canvas renderer without rebuilding layers
  const renderDataRef = useRef({
    mapLevel,
    overviewData,
    stateData,
    districtData,
    selectedState,
    selectedDistrict,
    opacity,
    activeSource,
  });
  renderDataRef.current = {
    mapLevel,
    overviewData,
    stateData,
    districtData,
    selectedState,
    selectedDistrict,
    opacity,
    activeSource,
  };

  // Helper to update inspector DOM directly (0ms, 0 React renders)
  const updateInspector = useCallback((name, lat, lon, precip) => {
    if (!inspectorRef.current) return;
    const pStr = precip !== null ? `${precip.toFixed(1)} mm/hr` : '0.0 mm/hr';
    inspectorRef.current.innerHTML = `
      <div class="inspector-content">
        <span class="inspector-location">📍 ${name}</span>
        <span class="inspector-coords">[${lat}°N, ${lon}°E]</span>
        <span class="inspector-val">${pStr}</span>
      </div>
    `;
  }, []);

  const resetInspector = useCallback(() => {
    if (!inspectorRef.current) return;
    const isNasa = (renderDataRef.current?.overviewData?.source === 'NASA') ||
                   (renderDataRef.current?.stateData?.source === 'NASA') ||
                   (renderDataRef.current?.activeSource === 'NASA');
    const sourceLabel = isNasa
      ? '🇮🇳 NASA IMERG 0.1° GPM Real-Time Precipitation'
      : '🇮🇳 ISRO MOSDAC INSAT-3DS Real-Time Precipitation';
    inspectorRef.current.innerHTML = `
      <div class="inspector-content">
        <span class="inspector-location">${sourceLabel}</span>
        <span class="inspector-hint">&bull; Hover regions to inspect metrics</span>
      </div>
    `;
  }, []);

  // ---------------------------------------------------------------------------
  // 1. Initialize Map Instance (Only Once during entire component lifecycle)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [22.8, 82.0],
      zoom: 5,
      minZoom: 4,
      maxZoom: 14,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    });

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

    // High-performance canvas renderer for district markers (Layer B)
    canvasRendererRef.current = L.canvas({ pane: 'markerPane' });
    pointsLayerRef.current = L.layerGroup([], { pane: 'markerPane' }).addTo(map);

    // Exclusively OpenStreetMap base layer with visible attribution & harmonized styling
    tileLayerRef.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: 'tatva-osm-tiles',
    }).addTo(map);

    mapRef.current = map;

    // Load National Boundary once and add outline
    const loadNationalBoundary = async () => {
      if (!cachedIndiaBoundaryGeoJson) {
        try {
          const res = await fetch('/data/india_boundary.geojson');
          cachedIndiaBoundaryGeoJson = await res.json();
          notifyBoundaryListeners();
        } catch (e) {
          console.warn('Could not load national boundary:', e);
        }
      }
      if (cachedIndiaBoundaryGeoJson && mapRef.current) {
        if (!nationalOutlineLayerRef.current) {
          nationalOutlineLayerRef.current = L.geoJSON(cachedIndiaBoundaryGeoJson, {
            pane: 'boundaryPane',
            interactive: false,
            style: {
              color: '#334155',
              weight: 1.3,
              opacity: 0.9,
              fillColor: 'transparent',
              fillOpacity: 0,
            },
          }).addTo(mapRef.current);
        }

        // Redraw canvas with the loaded boundary clipping path
        if (canvasLayerRef.current && canvasLayerRef.current._draw) {
          canvasLayerRef.current._draw();
        }
      }
    };
    loadNationalBoundary();

    // Map mousemove listener: Reset inspector when moving outside interactive features
    map.on('mousemove', () => {
      // Hover inside India is handled by state and district layers.
    });

    // -------------------------------------------------------------------------
    // Create Hardware Canvas Weather Layer ONCE (Never destroyed on navigation)
    // -------------------------------------------------------------------------
    const CanvasWeatherLayer = L.Layer.extend({
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

        leafletMap.on('moveend zoomend resize viewreset', this._draw, this);
        this._draw();
      },

      onRemove: function (leafletMap) {
        if (this._canvas && this._canvas.parentNode) {
          this._canvas.parentNode.removeChild(this._canvas);
        }
        if (this._offscreenCanvas) {
          this._offscreenCanvas = null;
        }
        leafletMap.off('moveend zoomend resize viewreset', this._draw, this);
      },

      _draw: function () {
        if (!this._map || !this._canvas) return;
        const ctx = this._canvas.getContext('2d');
        if (!ctx) return;

        const size = this._map.getSize();
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        const dpr = window.devicePixelRatio || 1;
        this._canvas.width = Math.round(size.x * dpr);
        this._canvas.height = Math.round(size.y * dpr);
        this._canvas.style.width = `${size.x}px`;
        this._canvas.style.height = `${size.y}px`;

        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        ctx.save();
        ctx.scale(dpr, dpr);

        const {
          mapLevel: curLevel,
          overviewData: curOverview,
          stateData: curStateData,
          districtData: curDistData,
          selectedState: curState,
          selectedDistrict: curDist,
          opacity: curOpacity,
        } = renderDataRef.current;

        ctx.globalAlpha = curOpacity;

        // -------------------------------------------------------------
        // GEOGRAPHIC BOUNDARY CLIPPING: DISTRICT -> STATE -> INDIA
        // -------------------------------------------------------------
        let clipGeometry = null;
        let clipName = 'Unknown';

        if (curLevel === 'district' && curDist && curState) {
          const stateSlug = slugify(curState);
          const districtGeoJson = cachedDistrictsGeoJsonMap[stateSlug];
          if (districtGeoJson?.features) {
            const feat = districtGeoJson.features.find((f) => {
              const name = f?.properties?.NAME_2 || f?.properties?.DISTRICT || '';
              return name.toLowerCase() === curDist.toLowerCase();
            });
            if (feat?.geometry) {
              clipGeometry = feat.geometry;
              clipName = `${curDist} (${curState})`;
            }
          }
        }

        // Fallback to state boundary if district boundary is not yet available
        if (!clipGeometry && (curLevel === 'state' || curLevel === 'district') && curState) {
          if (cachedIndiaStatesGeoJson?.features) {
            const feat = cachedIndiaStatesGeoJson.features.find((f) => {
              const name = f?.properties?.ST_NM || '';
              return name.toLowerCase() === curState.toLowerCase();
            });
            if (feat?.geometry) {
              clipGeometry = feat.geometry;
              clipName = curState;
            }
          }
        }

        // Fallback to national India boundary
        if (!clipGeometry) {
          clipGeometry = cachedIndiaBoundaryGeoJson;
          clipName = 'India National Boundary';
        }

        // Defer drawing if boundary geometry is not yet in memory.
        // This strictly prevents the unclipped rectangular raster flash.
        if (!clipGeometry) {
          ctx.restore();
          return;
        }

        // Trace and apply strict vector clipping path
        ctx.beginPath();
        addGeometryToCanvasPath(ctx, this._map, clipGeometry);
        ctx.clip('evenodd');

        // Diagnostics logging per Requirement
        const boundaryCount = (nationalOutlineLayerRef.current ? 1 : 0) + (statesLayerRef.current ? 1 : 0) + (districtsLayerRef.current ? 1 : 0);
        const markersCount = districtMarkersMapRef.current.size;
        console.log(`🗺️ [MAP NAVIGATION] level=${curLevel}, state=${curState || 'none'}, district=${curDist || 'none'}`);
        console.log(`✂️ [ACTIVE CLIP] level=${curLevel}, geometry=${clipName}`);
        console.log(`📊 [MAP LAYERS] rainfall=1, boundary=${boundaryCount}, markers=${markersCount}`);

        // -------------------------------------------------------------
        // SELECT ACTIVE OBSERVATIONS / GRID POINTS
        // -------------------------------------------------------------
        let points = [];
        let step = 0.5;

        if (curLevel === 'district') {
          step = 0.1;
          const storePts = weatherStore.getRecords(true);
          if (storePts && storePts.length > 0) {
            points = storePts;
          } else if (curDistData?.observations?.length) {
            points = curDistData.observations;
          }
        } else if (curLevel === 'state') {
          step = 0.1;
          const storePts = weatherStore.getRecords(true);
          if (storePts && storePts.length > 0) {
            points = storePts;
          } else if (curStateData?.observations?.length) {
            points = curStateData.observations;
          }
        } else {
          // National Overview: Prioritize store, fall back to grid_points or observations
          step = curOverview?.grid_step || 0.5;
          const storeMap = weatherStore.getRecordsMap();
          if (storeMap.size > 0) {
            points = Array.from(storeMap.values());
          }

          const nonZeroCount = points.filter((pt) => {
            const p = pt.precipitation !== undefined ? pt.precipitation : pt[2];
            return (p || 0) >= 0.1;
          }).length;

          if (nonZeroCount === 0 && curOverview?.grid_points?.length) {
            points = curOverview.grid_points;
          } else if (points.length === 0 && curOverview?.observations?.length) {
            points = curOverview.observations;
          }
        }

        // -------------------------------------------------------------
        // RENDER FLUID / CONTINUOUS PRECIPITATION FIELD
        // -------------------------------------------------------------
        const mapBounds = this._map.getBounds();
        const south = mapBounds.getSouth();
        const north = mapBounds.getNorth();
        const west = mapBounds.getWest();
        const east = mapBounds.getEast();

        // Calculate screen scale: distance between grid points in CSS pixels
        const pRef0 = this._map.latLngToContainerPoint([20.0, 80.0]);
        const pRef1 = this._map.latLngToContainerPoint([20.0 + step, 80.0]);
        const stepScreenPx = Math.max(Math.abs(pRef1.y - pRef0.y), 4);

        // Kernel radius for smooth blending between adjacent cells
        const kernelRadius = Math.max(stepScreenPx * 1.35, 10);

        // Collect and filter valid rain points within viewport margin
        const activeRainPoints = [];
        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          const lat = pt.latitude !== undefined ? pt.latitude : pt[0];
          const lon = pt.longitude !== undefined ? pt.longitude : pt[1];
          const p = pt.precipitation !== undefined ? pt.precipitation : pt[2];

          if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) continue;
          if (!isValidRainfall(p) || p < 0.1) continue;

          // Viewport culling with generous margin for kernel overlap
          if (lat < south - step * 2 || lat > north + step * 2 || lon < west - step * 2 || lon > east + step * 2) {
            continue;
          }

          const screenPt = this._map.latLngToContainerPoint([lat, lon]);
          activeRainPoints.push({
            x: screenPt.x,
            y: screenPt.y,
            p,
          });
        }

        if (activeRainPoints.length > 0) {
          // Sort points by intensity ascending so heavy rain cores sit cleanly on top of light rain halos
          activeRainPoints.sort((a, b) => a.p - b.p);

          // Prepare reusable offscreen canvas for rendering the smooth field
          if (!this._offscreenCanvas) {
            this._offscreenCanvas = document.createElement('canvas');
          }
          const offscreen = this._offscreenCanvas;
          offscreen.width = Math.round(size.x * dpr);
          offscreen.height = Math.round(size.y * dpr);
          const offCtx = offscreen.getContext('2d');
          offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
          offCtx.save();
          offCtx.scale(dpr, dpr);

          // Draw overlapping soft radial kernels
          for (let i = 0; i < activeRainPoints.length; i++) {
            const { x, y, p } = activeRainPoints[i];
            const rgb = getPrecipitationRgb(p);
            if (!rgb) continue;
            const [r, g, b] = rgb;

            const grad = offCtx.createRadialGradient(x, y, 0, x, y, kernelRadius);
            grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.95)`);
            grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.85)`);
            grad.addColorStop(0.70, `rgba(${r}, ${g}, ${b}, 0.45)`);
            grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0)`);

            offCtx.fillStyle = grad;
            offCtx.beginPath();
            offCtx.arc(x, y, kernelRadius, 0, Math.PI * 2);
            offCtx.fill();
          }
          offCtx.restore();

          // Transfer from offscreen canvas to main canvas with fluid Gaussian blur
          // Strictly clipped to the vector boundary by ctx.clip('evenodd')
          const blurPx = Math.max(Math.round(stepScreenPx * 0.4), 4);
          if ('filter' in ctx) {
            ctx.filter = `blur(${blurPx}px)`;
          }
          ctx.drawImage(offscreen, 0, 0, size.x, size.y);
          if ('filter' in ctx) {
            ctx.filter = 'none';
          }
        }

        const activeObsTime = curOverview?.observation_time || curStateData?.observation_time || curDistData?.observation_time || 'latest';
        console.log(`[MAP]\nUpdated:\n${activeObsTime}`);

        ctx.restore();
      },
    });

    const canvasLayer = new CanvasWeatherLayer();
    canvasLayer.addTo(map);
    canvasLayerRef.current = canvasLayer;

    // Observe container resize to seamlessly invalidate Leaflet dimensions
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

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
  // 2. Throttled Canvas Redraw Hook (Data updates, WebSocket batches, boundary load)
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

    // Subscribe to incremental weatherStore updates (re-renders only raster canvas at 60fps)
    const unsubscribeStore = weatherStore.subscribe(() => {
      requestRedraw();
    });

    const onBoundaryLoaded = () => {
      requestRedraw();
    };
    boundaryListeners.add(onBoundaryLoaded);

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
      unsubscribeStore();
      boundaryListeners.delete(onBoundaryLoaded);
    };
  }, [mapLevel, overviewData, stateData, districtData, selectedState, selectedDistrict, opacity]);

  // ---------------------------------------------------------------------------
  // 3. States GeoJSON Layer (Persistent: Created ONCE, In-place setStyle update)
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
          fillOpacity: 0.001, // transparent fill to capture mouse interactions
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
        // District level: keep state boundary visible but subtle
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

          const getCellRain = (latlng) => {
            const { overviewData: ov } = renderDataRef.current;
            const step = ov?.grid_step || 0.5;
            const storeMap = weatherStore.getRecordsMap();
            if (storeMap && storeMap.size > 0) {
              let nearestP = null;
              let minDist = step * 0.75;
              for (const pt of storeMap.values()) {
                const dLat = Math.abs(pt.latitude - latlng.lat);
                const dLon = Math.abs(pt.longitude - latlng.lng);
                if (dLat <= minDist && dLon <= minDist) {
                  const dist = Math.hypot(dLat, dLon);
                  if (dist < minDist) {
                    minDist = dist;
                    nearestP = pt.precipitation;
                  }
                }
              }
              if (nearestP !== null && isValidRainfall(nearestP)) return nearestP;
            }
            const grid = ov?.grid_points;
            if (grid?.length) {
              const cell = grid.find(
                ([cLat, cLon]) => Math.abs(cLat - latlng.lat) <= step / 2 && Math.abs(cLon - latlng.lng) <= step / 2
              );
              if (cell && isValidRainfall(cell[2]) && cell[2] >= 0.1) return cell[2];
            }
            const summary = ov?.state_summaries?.find(
              (s) => s.state_name.toLowerCase() === stName.toLowerCase()
            );
            return summary && isValidRainfall(summary.avg_precipitation) ? summary.avg_precipitation : null;
          };

          l.bindTooltip(
            () => {
              const { overviewData: ov } = renderDataRef.current;
              const summary = ov?.state_summaries?.find(
                (s) => s.state_name.toLowerCase() === stName.toLowerCase()
              );
              const avgP = summary ? summary.avg_precipitation.toFixed(1) : '0.0';
              const maxP = summary ? summary.max_precipitation.toFixed(1) : '0.0';
              const rainCat = summary ? summary.rain_category : 'Clear / Dry';
              return `<div class="weather-map-tooltip">
                <div class="tooltip-header">
                  <span class="tooltip-title">${stName}</span>
                  <span class="tooltip-category">${rainCat}</span>
                </div>
                <div class="tooltip-body">
                  <div class="tooltip-stat"><span class="tooltip-label">Avg</span><span class="tooltip-val">${avgP} mm/hr</span></div>
                  <div class="tooltip-stat"><span class="tooltip-label">Peak</span><span class="tooltip-val highlight">${maxP} mm/hr</span></div>
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
              const rain = getCellRain(e.latlng);
              updateInspector(
                stName,
                Number(e.latlng.lat.toFixed(2)),
                Number(e.latlng.lng.toFixed(2)),
                rain
              );
            },
            mousemove: (e) => {
              const rain = getCellRain(e.latlng);
              updateInspector(
                stName,
                Number(e.latlng.lat.toFixed(2)),
                Number(e.latlng.lng.toFixed(2)),
                rain
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

  // Update states styling in place whenever mapLevel or selectedState changes
  useEffect(() => {
    updateStatesStyle();
  }, [mapLevel, selectedState, updateStatesStyle]);

  // ---------------------------------------------------------------------------
  // 4. Districts GeoJSON Layer (Loaded on demand for selected state, removed at India level)
  // ---------------------------------------------------------------------------
  const currentDistrictStateSlugRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // If at India level, remove districts layer completely
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

    // If districts layer already exists for this state, just update styling in place!
    if (districtsLayerRef.current && currentDistrictStateSlugRef.current === stateSlug) {
      updateDistrictsStyle();
      return;
    }

    // Otherwise, remove old district layer before mounting the new state's districts
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
              const { stateData: sd } = renderDataRef.current;
              const summary = sd?.district_summaries?.find(
                (d) => d.district_name.toLowerCase() === distName.toLowerCase()
              );
              const avgP = summary ? summary.avg_precipitation.toFixed(1) : '0.0';
              const maxP = summary ? summary.max_precipitation.toFixed(1) : '0.0';
              const rainCat = summary ? summary.rain_category : 'Clear / Dry';
              return `<div class="weather-map-tooltip">
                <div class="tooltip-header">
                  <span class="tooltip-title">${distName}</span>
                  <span class="tooltip-category">${rainCat}</span>
                </div>
                <div class="tooltip-body">
                  <div class="tooltip-stat"><span class="tooltip-label">Avg</span><span class="tooltip-val">${avgP} mm/hr</span></div>
                  <div class="tooltip-stat"><span class="tooltip-label">Peak</span><span class="tooltip-val highlight">${maxP} mm/hr</span></div>
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
              updateInspector(
                `${distName}, ${curSt}`,
                l.getBounds().getCenter().lat,
                l.getBounds().getCenter().lng,
                summary ? summary.avg_precipitation : null
              );
            },
            mousemove: (e) => {
              const { selectedState: curSt, stateData: sd } = renderDataRef.current;
              const summary = sd?.district_summaries?.find(
                (d) => d.district_name.toLowerCase() === distName.toLowerCase()
              );
              updateInspector(
                `${distName}, ${curSt}`,
                Number(e.latlng.lat.toFixed(2)),
                Number(e.latlng.lng.toFixed(2)),
                summary ? summary.avg_precipitation : null
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
  // 5. District Observation Markers (Layer B: Active ONLY at District Level)
  // ---------------------------------------------------------------------------
  const districtMarkersMapRef = useRef(new Map());

  useEffect(() => {
    const pointsGroup = pointsLayerRef.current;
    const canvasRenderer = canvasRendererRef.current;
    if (!pointsGroup || !canvasRenderer) return;

    // STRICT LIFECYCLE: If not at district level, remove ALL markers immediately
    if (mapLevel !== 'district' || !selectedDistrict) {
      pointsGroup.clearLayers();
      districtMarkersMapRef.current.clear();
      return;
    }

    const upsertMarker = (pt, id) => {
      if (!isValidRainfall(pt.precipitation)) return;

      // Spatial check: Only render markers belonging to selectedDistrict
      if (pt.district && pt.district.toLowerCase() !== selectedDistrict.toLowerCase()) {
        return;
      }

      const color = getPrecipitationColor(pt.precipitation);
      const radius = Math.min(6, Math.max(3, Math.sqrt(pt.precipitation + 1) * 1.4));
      const tooltipContent = `<div class="weather-map-tooltip">
        <div class="tooltip-header">
          <span class="tooltip-title">${pt.latitude.toFixed(2)}° N, ${pt.longitude.toFixed(2)}° E</span>
        </div>
        <div class="tooltip-body">
          <div class="tooltip-stat"><span class="tooltip-label">Rain</span><span class="tooltip-val highlight">${pt.precipitation.toFixed(1)} mm/hr</span></div>
          <div class="tooltip-stat"><span class="tooltip-label">Liquid</span><span class="tooltip-val">${(pt.liquid ?? pt.precipitation).toFixed(1)} mm</span></div>
          <div class="tooltip-stat"><span class="tooltip-label">Ice</span><span class="tooltip-val">${(pt.ice ?? 0).toFixed(1)} mm</span></div>
        </div>
      </div>`;

      if (districtMarkersMapRef.current.has(id)) {
        const marker = districtMarkersMapRef.current.get(id);
        marker.setStyle({ fillColor: color, radius: radius });
        marker.setTooltipContent(tooltipContent);
      } else {
        const marker = L.circleMarker([pt.latitude, pt.longitude], {
          renderer: canvasRenderer,
          pane: 'markerPane',
          radius: radius,
          fillColor: color,
          color: '#0f172a',
          weight: 0.8,
          opacity: 0.85,
          fillOpacity: 0.92,
        });

        marker.bindTooltip(tooltipContent, {
          sticky: true,
          className: 'leaflet-tooltip-clean',
          direction: 'top',
          offset: [0, -6],
        });

        marker.on('mouseover', () => {
          updateInspector(
            `${selectedDistrict} Station`,
            pt.latitude,
            pt.longitude,
            pt.precipitation
          );
        });

        pointsGroup.addLayer(marker);
        districtMarkersMapRef.current.set(id, marker);
      }
    };

    // Clean previous district markers before populating new ones
    pointsGroup.clearLayers();
    districtMarkersMapRef.current.clear();

    const scopedRecords = weatherStore.getRecords(true);
    if (scopedRecords.length > 0) {
      for (const pt of scopedRecords) {
        const id = weatherStore.makeId(pt.latitude, pt.longitude);
        upsertMarker(pt, id);
      }
    } else if (districtData?.observations?.length) {
      for (const pt of districtData.observations) {
        const id = weatherStore.makeId(pt.latitude, pt.longitude);
        upsertMarker(pt, id);
      }
    }

    // Subscribe to incremental changes from WebSocket
    const unsubscribe = weatherStore.subscribe((evt) => {
      const { mapLevel: curLevel, selectedDistrict: curDist } = renderDataRef.current;
      if (curLevel !== 'district' || !curDist) return;

      for (const remId of evt.removedIds) {
        const marker = districtMarkersMapRef.current.get(remId);
        if (marker) {
          pointsGroup.removeLayer(marker);
          districtMarkersMapRef.current.delete(remId);
        }
      }

      const currentMap = weatherStore.getRecordsMap();
      for (const changedId of evt.changedIds) {
        const pt = currentMap.get(changedId);
        if (pt) {
          upsertMarker(pt, changedId);
        }
      }
    });

    return () => {
      unsubscribe();
      // CRITICAL: Always clean up district markers on level change / unmount
      pointsGroup.clearLayers();
      districtMarkersMapRef.current.clear();
    };
  }, [mapLevel, selectedDistrict, districtData, updateInspector]);

  // ---------------------------------------------------------------------------
  // 6. Deterministic Single Camera Transitions (India -> State -> District)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const prev = prevSelectionRef.current;

    if (mapLevel === 'india' && prev.mapLevel !== 'india') {
      map.setView([22.8, 82.0], 5, { animate: true, duration: 0.8 });
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
  // 7. Custom Vertical Map Control Actions
  // ---------------------------------------------------------------------------
  const handleZoomIn = useCallback(() => {
    if (mapRef.current) mapRef.current.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    if (mapRef.current) mapRef.current.zoomOut();
  }, []);

  const handleFitIndia = useCallback(() => {
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

      {/* Floating Legend */}
      <Legend />

      {/* Bottom Status / Cursor Inspector Pill (Direct DOM updated) */}
      <div ref={inspectorRef} className="map-inspector-pill">
        <div className="inspector-content">
          <span className="inspector-location">
            {overviewData?.source === 'NASA' || activeSource === 'NASA'
              ? '🇮🇳 NASA IMERG 0.1° GPM Real-Time Precipitation'
              : '🇮🇳 ISRO MOSDAC INSAT-3DS Real-Time Precipitation'}
          </span>
          <span className="inspector-hint">&bull; Hover regions to inspect metrics</span>
        </div>
      </div>
    </div>
  );
}
