import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import { getPrecipitationColor, Legend } from './Legend';
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
  overviewData,
  stateData,
  districtData,
  selectedState,
  selectedDistrict,
  onSelectState,
  onSelectDistrict,
  onFitIndia,
  opacity,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // Direct DOM ref for Inspector Bar (Avoids React re-renders on mouse move!)
  const inspectorRef = useRef(null);

  // Layer references
  const tileLayerRef = useRef(null);
  const nationalOutlineLayerRef = useRef(null);
  const statesLayerRef = useRef(null);
  const districtsLayerRef = useRef(null);
  const pointsLayerRef = useRef(null);
  const canvasLayerRef = useRef(null);
  const canvasRendererRef = useRef(null);

  // Track previous selection for camera transitions
  const prevSelectionRef = useRef({
    state: null,
    district: null,
  });

  // Keep latest data in ref for canvas renderer without rebuilding layers
  const renderDataRef = useRef({
    overviewData,
    stateData,
    districtData,
    selectedState,
    selectedDistrict,
    opacity,
  });
  renderDataRef.current = {
    overviewData,
    stateData,
    districtData,
    selectedState,
    selectedDistrict,
    opacity,
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
    inspectorRef.current.innerHTML = `
      <div class="inspector-content">
        <span class="inspector-location">🇮🇳 NASA IMERG 0.1° GPM Real-Time Precipitation</span>
        <span class="inspector-hint">&bull; Hover regions to inspect metrics</span>
      </div>
    `;
  }, []);

  // ---------------------------------------------------------------------------
  // 1. Initialize Map Instance (Only Once)
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

    // High-performance canvas renderer for district markers
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

    // Map mousemove listener: Reset inspector when moving outside interactive features (ocean / foreign terrain)
    map.on('mousemove', () => {
      // Hovering inside India is handled by state and district layers.
      // If cursor is on empty map space (ocean/outside India), keep inspector clean.
    });

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
      map.remove();
      mapRef.current = null;
    };
  }, [updateInspector, resetInspector]);

  // ---------------------------------------------------------------------------
  // 3. Hardware Canvas Weather Layer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (canvasLayerRef.current) {
      map.removeLayer(canvasLayerRef.current);
      canvasLayerRef.current = null;
    }

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

        console.log('🗺️ [MAP LAYER] CanvasWeatherLayer created and added to map pane: weatherCanvasPane (layer created: true, layer added to map: true)');

        leafletMap.on('moveend zoomend resize viewreset', this._draw, this);
        this._draw();
      },

      onRemove: function (leafletMap) {
        if (this._canvas && this._canvas.parentNode) {
          this._canvas.parentNode.removeChild(this._canvas);
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

        if (curDist && curState) {
          const stateSlug = slugify(curState);
          const districtGeoJson = cachedDistrictsGeoJsonMap[stateSlug];
          if (districtGeoJson?.features) {
            const feat = districtGeoJson.features.find((f) => {
              const name = f?.properties?.NAME_2 || f?.properties?.DISTRICT || '';
              return name.toLowerCase() === curDist.toLowerCase();
            });
            if (feat?.geometry) clipGeometry = feat.geometry;
          }
        }

        // Fallback to state boundary if district boundary is not yet available
        if (!clipGeometry && curState) {
          if (cachedIndiaStatesGeoJson?.features) {
            const feat = cachedIndiaStatesGeoJson.features.find((f) => {
              const name = f?.properties?.ST_NM || '';
              return name.toLowerCase() === curState.toLowerCase();
            });
            if (feat?.geometry) clipGeometry = feat.geometry;
          }
        }

        // Fallback to national India boundary (National view or fallback)
        if (!clipGeometry) {
          clipGeometry = cachedIndiaBoundaryGeoJson;
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

        // -------------------------------------------------------------
        // SELECT ACTIVE OBSERVATIONS / GRID POINTS
        // -------------------------------------------------------------
        let points = [];
        let step = 0.5;

        if (curDist) {
          step = 0.1;
          const storePts = weatherStore.getRecords(true);
          if (storePts && storePts.length > 0) {
            points = storePts;
          } else if (curDistData?.observations?.length) {
            points = curDistData.observations;
          }
        } else if (curState) {
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

          // If store has only dry/zero points, fall back directly to overview grid_points
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
        // RENDER WEATHER PRECIPITATION CELLS (Viewport Culled)
        // -------------------------------------------------------------
        const mapBounds = this._map.getBounds();
        const south = mapBounds.getSouth();
        const north = mapBounds.getNorth();
        const west = mapBounds.getWest();
        const east = mapBounds.getEast();

        let renderedCount = 0;
        let validCoordCount = 0;
        let validRainCount = 0;
        let minRain = Infinity;
        let maxRain = -Infinity;

        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          const lat = pt.latitude !== undefined ? pt.latitude : pt[0];
          const lon = pt.longitude !== undefined ? pt.longitude : pt[1];
          const p = pt.precipitation !== undefined ? pt.precipitation : pt[2];

          if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) continue;
          validCoordCount++;

          if (p == null || isNaN(p) || p < 0.1) continue;
          validRainCount++;
          if (p < minRain) minRain = p;
          if (p > maxRain) maxRain = p;

          // Viewport culling to visible area + margin
          if (lat < south - step || lat > north + step || lon < west - step || lon > east + step) {
            continue;
          }

          const nw = this._map.latLngToContainerPoint([lat + step / 2, lon - step / 2]);
          const se = this._map.latLngToContainerPoint([lat - step / 2, lon + step / 2]);
          const x = Math.min(nw.x, se.x);
          const y = Math.min(nw.y, se.y);
          const w = Math.max(Math.ceil(Math.abs(se.x - nw.x)), 2);
          const h = Math.max(Math.ceil(Math.abs(se.y - nw.y)), 2);

          ctx.fillStyle = getPrecipitationColor(p);
          ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
          renderedCount++;
        }

        ctx.restore();

        console.log(`🎨 [MAP LAYER] Rendered ${renderedCount} cells (layer on map: true, total points: ${points.length}, validCoords: ${validCoordCount}, validRain: ${validRainCount}, minRain: ${minRain === Infinity ? 0 : minRain.toFixed(1)}, maxRain: ${maxRain === -Infinity ? 0 : maxRain.toFixed(1)})`);
      },
    });

    const newCanvasLayer = new CanvasWeatherLayer();
    newCanvasLayer.addTo(map);
    canvasLayerRef.current = newCanvasLayer;

    return () => {
      if (canvasLayerRef.current && map) {
        map.removeLayer(canvasLayerRef.current);
        canvasLayerRef.current = null;
      }
    };
  }, [overviewData, stateData, districtData, selectedState, selectedDistrict, opacity]);

  // Trigger throttled canvas redraw whenever data changes, boundaries load, or WebSocket increments arrive
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
    const unsubscribe = weatherStore.subscribe(() => {
      requestRedraw();
    });

    const onBoundaryLoaded = () => {
      requestRedraw();
    };
    boundaryListeners.add(onBoundaryLoaded);

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
      unsubscribe();
      boundaryListeners.delete(onBoundaryLoaded);
    };
  }, [overviewData, stateData, districtData, selectedState, selectedDistrict, opacity]);

  // ---------------------------------------------------------------------------
  // 4. States GeoJSON Layer (Subtle borders, clean hover, zero clipping leaks)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (statesLayerRef.current) {
      map.removeLayer(statesLayerRef.current);
      statesLayerRef.current = null;
    }

    const stateSummaryMap = new Map();
    if (overviewData?.state_summaries) {
      for (const s of overviewData.state_summaries) {
        stateSummaryMap.set(s.state_name.toLowerCase(), s);
      }
    }

    const initStates = (geojson) => {
      if (!mapRef.current) return;

      const defaultBorderColor = '#475569';

      const layer = L.geoJSON(geojson, {
        pane: 'boundaryPane',
        style: (feature) => {
          const stName = feature?.properties?.ST_NM || '';
          const isSelected = selectedState && stName.toLowerCase() === selectedState.toLowerCase();

          return {
            color: isSelected ? '#0284c7' : defaultBorderColor,
            weight: isSelected ? 2.2 : 0.85,
            opacity: isSelected ? 0.95 : 0.65,
            fillColor: isSelected ? '#38bdf8' : '#ffffff',
            fillOpacity: isSelected ? 0.08 : 0.001,
          };
        },
        onEachFeature: (feature, l) => {
          const stName = feature.properties?.ST_NM || '';
          const summary = stateSummaryMap.get(stName.toLowerCase());
          const avgP = summary ? summary.avg_precipitation.toFixed(1) : '0.0';
          const maxP = summary ? summary.max_precipitation.toFixed(1) : '0.0';
          const rainCat = summary ? summary.rain_category : 'Clear / Dry';

          l.bindTooltip(
            `<div class="weather-map-tooltip">
              <div class="tooltip-header">
                <span class="tooltip-title">${stName}</span>
                <span class="tooltip-category">${rainCat}</span>
              </div>
              <div class="tooltip-body">
                <div class="tooltip-stat"><span class="tooltip-label">Avg</span><span class="tooltip-val">${avgP} mm/hr</span></div>
                <div class="tooltip-stat"><span class="tooltip-label">Peak</span><span class="tooltip-val highlight">${maxP} mm/hr</span></div>
              </div>
            </div>`,
            {
              sticky: true,
              className: 'leaflet-tooltip-clean',
              direction: 'top',
              offset: [0, -10],
            }
          );

          const getCellRain = (latlng) => {
            const { overviewData: ov } = renderDataRef.current;
            const grid = ov?.grid_points;
            if (grid?.length) {
              const step = ov?.grid_step || 0.5;
              const cell = grid.find(
                ([cLat, cLon]) => Math.abs(cLat - latlng.lat) <= step / 2 && Math.abs(cLon - latlng.lng) <= step / 2
              );
              if (cell && cell[2] >= 0.1) return cell[2];
            }
            return summary ? summary.avg_precipitation : null;
          };

          l.on({
            mouseover: (e) => {
              const targetLayer = e.target;
              if (!selectedState || selectedState.toLowerCase() !== stName.toLowerCase()) {
                targetLayer.setStyle({
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
            mouseout: (e) => {
              const isSelected = selectedState && stName.toLowerCase() === selectedState.toLowerCase();
              e.target.setStyle({
                color: isSelected ? '#0284c7' : defaultBorderColor,
                weight: isSelected ? 2.2 : 0.85,
                opacity: isSelected ? 0.95 : 0.65,
                fillColor: isSelected ? '#38bdf8' : '#ffffff',
                fillOpacity: isSelected ? 0.08 : 0.001,
              });
              resetInspector();
            },
            click: () => {
              onSelectState(stName);
              if (mapRef.current) {
                mapRef.current.fitBounds(l.getBounds(), {
                  padding: [30, 30],
                  animate: true,
                  duration: 0.8,
                });
              }
            },
          });
        },
      }).addTo(mapRef.current);

      statesLayerRef.current = layer;
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
  }, [overviewData, selectedState, onSelectState, updateInspector, resetInspector]);

  // ---------------------------------------------------------------------------
  // 5. Districts GeoJSON Layer (Loaded On Demand When State Selected)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (districtsLayerRef.current) {
      map.removeLayer(districtsLayerRef.current);
      districtsLayerRef.current = null;
    }

    if (!selectedState) return;

    const stateSlug = slugify(selectedState);
    const districtSummaryMap = new Map();
    if (stateData?.district_summaries) {
      for (const d of stateData.district_summaries) {
        districtSummaryMap.set(d.district_name.toLowerCase(), d);
      }
    }

    const initDistricts = (geojson) => {
      if (!mapRef.current || !selectedState) return;

      const defaultBorderColor = '#64748b';

      const layer = L.geoJSON(geojson, {
        pane: 'boundaryPane',
        style: (feature) => {
          const distName = feature?.properties?.NAME_2 || feature?.properties?.DISTRICT || '';
          const isSelected = selectedDistrict && distName.toLowerCase() === selectedDistrict.toLowerCase();

          return {
            color: isSelected ? '#0284c7' : defaultBorderColor,
            weight: isSelected ? 2.0 : 0.75,
            opacity: isSelected ? 0.95 : 0.55,
            fillColor: isSelected ? '#38bdf8' : '#ffffff',
            fillOpacity: isSelected ? 0.08 : 0.001,
          };
        },
        onEachFeature: (feature, l) => {
          const distName = feature.properties?.NAME_2 || feature.properties?.DISTRICT || 'District';
          const summary = districtSummaryMap.get(distName.toLowerCase());
          const avgP = summary ? summary.avg_precipitation.toFixed(1) : '0.0';
          const maxP = summary ? summary.max_precipitation.toFixed(1) : '0.0';
          const rainCat = summary ? summary.rain_category : 'Clear / Dry';

          l.bindTooltip(
            `<div class="weather-map-tooltip">
              <div class="tooltip-header">
                <span class="tooltip-title">${distName}</span>
                <span class="tooltip-category">${rainCat}</span>
              </div>
              <div class="tooltip-body">
                <div class="tooltip-stat"><span class="tooltip-label">Avg</span><span class="tooltip-val">${avgP} mm/hr</span></div>
                <div class="tooltip-stat"><span class="tooltip-label">Peak</span><span class="tooltip-val highlight">${maxP} mm/hr</span></div>
              </div>
            </div>`,
            {
              sticky: true,
              className: 'leaflet-tooltip-clean',
              direction: 'top',
              offset: [0, -10],
            }
          );

          l.on({
            mouseover: (e) => {
              const isSelected = selectedDistrict && distName.toLowerCase() === selectedDistrict.toLowerCase();
              if (!isSelected) {
                e.target.setStyle({
                  color: '#0284c7',
                  weight: 1.6,
                  opacity: 0.95,
                  fillOpacity: 0.05,
                });
              }
              updateInspector(
                `${distName}, ${selectedState}`,
                Number(e.latlng.lat.toFixed(2)),
                Number(e.latlng.lng.toFixed(2)),
                summary ? summary.avg_precipitation : null
              );
            },
            mousemove: (e) => {
              updateInspector(
                `${distName}, ${selectedState}`,
                Number(e.latlng.lat.toFixed(2)),
                Number(e.latlng.lng.toFixed(2)),
                summary ? summary.avg_precipitation : null
              );
            },
            mouseout: (e) => {
              const isSelected = selectedDistrict && distName.toLowerCase() === selectedDistrict.toLowerCase();
              e.target.setStyle({
                color: isSelected ? '#0284c7' : defaultBorderColor,
                weight: isSelected ? 2.0 : 0.75,
                opacity: isSelected ? 0.95 : 0.55,
                fillColor: isSelected ? '#38bdf8' : '#ffffff',
                fillOpacity: isSelected ? 0.08 : 0.001,
              });
              resetInspector();
            },
            click: () => {
              onSelectDistrict(distName);
              if (mapRef.current) {
                mapRef.current.fitBounds(l.getBounds(), {
                  padding: [30, 30],
                  animate: true,
                  duration: 0.8,
                });
              }
            },
          });
        },
      }).addTo(mapRef.current);

      districtsLayerRef.current = layer;

      // Force canvas redraw so district clipping path is applied
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
  }, [selectedState, selectedDistrict, stateData, onSelectDistrict, updateInspector, resetInspector]);

  // ---------------------------------------------------------------------------
  // 6. District Observation Markers (In-Place Incremental Canvas Markers)
  // ---------------------------------------------------------------------------
  const districtMarkersMapRef = useRef(new Map());

  useEffect(() => {
    const pointsGroup = pointsLayerRef.current;
    const canvasRenderer = canvasRendererRef.current;
    if (!pointsGroup || !canvasRenderer) return;

    // Helper to render or update a single marker in place
    const upsertMarker = (pt, id) => {
      const color = getPrecipitationColor(pt.precipitation);
      const radius = Math.min(6, Math.max(3, Math.sqrt(pt.precipitation + 1) * 1.4));
      const tooltipContent = `<div class="weather-map-tooltip">
        <div class="tooltip-header">
          <span class="tooltip-title">${pt.latitude.toFixed(2)}° N, ${pt.longitude.toFixed(2)}° E</span>
        </div>
        <div class="tooltip-body">
          <div class="tooltip-stat"><span class="tooltip-label">Rain</span><span class="tooltip-val highlight">${pt.precipitation.toFixed(1)} mm/hr</span></div>
          <div class="tooltip-stat"><span class="tooltip-label">Liquid</span><span class="tooltip-val">${pt.liquid.toFixed(1)} mm</span></div>
          <div class="tooltip-stat"><span class="tooltip-label">Ice</span><span class="tooltip-val">${pt.ice.toFixed(1)} mm</span></div>
        </div>
      </div>`;

      if (districtMarkersMapRef.current.has(id)) {
        // IN-PLACE UPDATE (0 DOM nodes, 0 Leaflet layer additions)
        const marker = districtMarkersMapRef.current.get(id);
        marker.setStyle({ fillColor: color, radius: radius });
        marker.setTooltipContent(tooltipContent);
      } else {
        // Add single marker
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
            `${selectedDistrict} Point`,
            pt.latitude,
            pt.longitude,
            pt.precipitation
          );
        });

        pointsGroup.addLayer(marker);
        districtMarkersMapRef.current.set(id, marker);
      }
    };

    // If no district selected, clear markers
    if (!selectedDistrict) {
      pointsGroup.clearLayers();
      districtMarkersMapRef.current.clear();
      return;
    }

    // Populate initial markers from store or districtData prop if not already loaded
    const storeMap = weatherStore.getRecordsMap();
    if (storeMap.size > 0 && districtMarkersMapRef.current.size === 0) {
      storeMap.forEach((rec, id) => {
        upsertMarker(rec, id);
      });
    } else if (districtData?.observations?.length && districtMarkersMapRef.current.size === 0) {
      for (const pt of districtData.observations) {
        const id = weatherStore.makeId(pt.latitude, pt.longitude);
        upsertMarker(pt, id);
      }
    }

    // Subscribe to incremental changes from WebSocket
    const unsubscribe = weatherStore.subscribe((evt) => {
      if (!selectedDistrict) return;

      // 1. Remove expired / dried up markers
      for (const remId of evt.removedIds) {
        const marker = districtMarkersMapRef.current.get(remId);
        if (marker) {
          pointsGroup.removeLayer(marker);
          districtMarkersMapRef.current.delete(remId);
        }
      }

      // 2. Update changed markers in place
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
    };
  }, [selectedDistrict, districtData, updateInspector]);

  // ---------------------------------------------------------------------------
  // 7. Navigation Camera Transitions
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const prev = prevSelectionRef.current;

    if (prev.state && !selectedState) {
      map.setView([22.8, 82.0], 5, { animate: true, duration: 0.8 });
    } else if (prev.district && !selectedDistrict && selectedState && statesLayerRef.current) {
      statesLayerRef.current.eachLayer((layer) => {
        const name = layer.feature?.properties?.ST_NM;
        if (name && name.toLowerCase() === selectedState.toLowerCase()) {
          map.fitBounds(layer.getBounds(), { padding: [30, 30], animate: true, duration: 0.8 });
        }
      });
    }

    prevSelectionRef.current = { state: selectedState, district: selectedDistrict };
  }, [selectedState, selectedDistrict]);

  // ---------------------------------------------------------------------------
  // 8. Custom Vertical Map Control Actions
  // ---------------------------------------------------------------------------
  const handleZoomIn = useCallback(() => {
    if (mapRef.current) mapRef.current.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    if (mapRef.current) mapRef.current.zoomOut();
  }, []);

  const handleFitIndia = useCallback(() => {
    onFitIndia();
    if (mapRef.current) {
      mapRef.current.setView([22.8, 82.0], 5, { animate: true, duration: 0.8 });
    }
  }, [onFitIndia]);

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
          <span className="inspector-location">🇮🇳 NASA IMERG 0.1° GPM Real-Time Precipitation</span>
          <span className="inspector-hint">&bull; Hover regions to inspect metrics</span>
        </div>
      </div>
    </div>
  );
}
