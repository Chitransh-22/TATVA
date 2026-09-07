import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type {
  IndiaOverviewResponse,
  StateDetailResponse,
  DistrictDetailResponse,
  StateSummary,
  DistrictSummary,
} from '../types';
import { getPrecipitationColor, Legend } from './Legend';

export type BasemapType = 'carto' | 'esri' | 'osm';

interface WeatherMapProps {
  overviewData: IndiaOverviewResponse | null;
  stateData: StateDetailResponse | null;
  districtData: DistrictDetailResponse | null;
  selectedState: string | null;
  selectedDistrict: string | null;
  onSelectState: (stateName: string) => void;
  onSelectDistrict: (districtName: string) => void;
  opacity: number;
  basemap: BasemapType;
}

function slugify(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/**
 * Traces a GeoJSON geometry (FeatureCollection, Feature, MultiPolygon, Polygon)
 * into an HTML5 Canvas 2D Path using Leaflet's latLngToContainerPoint.
 */
function addGeometryToCanvasPath(ctx: CanvasRenderingContext2D, map: L.Map, geom: any): void {
  if (!geom) return;

  const traceRing = (ring: [number, number][]) => {
    if (!ring || ring.length === 0) return;
    for (let p = 0; p < ring.length; p++) {
      const [lon, lat] = ring[p];
      const pt = map.latLngToContainerPoint([lat, lon]);
      if (p === 0) {
        ctx.moveTo(pt.x, pt.y);
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
  }
}

export const WeatherMap: React.FC<WeatherMapProps> = ({
  overviewData,
  stateData,
  districtData,
  selectedState,
  selectedDistrict,
  onSelectState,
  onSelectDistrict,
  opacity,
  basemap,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Cached Boundary Geometries
  const nationalBoundaryGeoJsonRef = useRef<any>(null);
  const statesGeoJsonRef = useRef<any>(null);
  const districtsGeoJsonMapRef = useRef<Record<string, any>>({});

  // Layer references
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const nationalOutlineLayerRef = useRef<L.GeoJSON | null>(null);
  const statesLayerRef = useRef<L.GeoJSON | null>(null);
  const districtsLayerRef = useRef<L.GeoJSON | null>(null);
  const pointsLayerRef = useRef<L.LayerGroup | null>(null);
  const canvasLayerRef = useRef<any>(null);

  // Track previous selection to animate camera on navigation transitions
  const prevSelectionRef = useRef<{ state: string | null; district: string | null }>({
    state: null,
    district: null,
  });

  // Hover state for status bar
  const [hoverInfo, setHoverInfo] = useState<{
    lat: number;
    lon: number;
    precip: number | null;
    locationName?: string;
  } | null>(null);

  // 1. Initialize Map & Custom Panes
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [22.8, 82.0],
      zoom: 5,
      minZoom: 4,
      maxZoom: 13,
      zoomControl: true,
    });

    // Custom Layer Panes for strict vertical rendering hierarchy:
    // 1. tilePane (zIndex 200) -> Base map
    // 2. weatherCanvasPane (zIndex 300) -> Clipped precipitation raster
    // 3. boundaryPane (zIndex 400) -> State & District boundaries
    // 4. highlightPane (zIndex 450) -> Selection & hover outlines
    // 5. markerPane (zIndex 600) -> Observation point circle markers
    // 6. tooltipPane (zIndex 650) -> Floating tooltips
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

    map.createPane('highlightPane');
    const highlightPane = map.getPane('highlightPane');
    if (highlightPane) {
      highlightPane.style.zIndex = '450';
    }

    pointsLayerRef.current = L.layerGroup([], { pane: 'markerPane' }).addTo(map);
    mapRef.current = map;

    // Load and cache National Boundary (Survey of India official)
    fetch('/data/india_boundary.geojson')
      .then((res) => res.json())
      .then((geojson) => {
        nationalBoundaryGeoJsonRef.current = geojson;

        if (mapRef.current) {
          nationalOutlineLayerRef.current = L.geoJSON(geojson, {
            pane: 'boundaryPane',
            style: {
              color: '#334155',
              weight: 1.1,
              opacity: 0.8,
              fillColor: 'transparent',
              fillOpacity: 0,
            },
          }).addTo(mapRef.current);

          // Force canvas layer redraw once boundary is loaded
          if (canvasLayerRef.current && canvasLayerRef.current._draw) {
            canvasLayerRef.current._draw();
          }
        }
      })
      .catch((err) => console.warn('Could not load national boundary:', err));

    // Load and cache States GeoJSON
    fetch('/data/india_states.geojson')
      .then((res) => res.json())
      .then((geojson) => {
        statesGeoJsonRef.current = geojson;
        if (canvasLayerRef.current && canvasLayerRef.current._draw) {
          canvasLayerRef.current._draw();
        }
      })
      .catch((err) => console.warn('Could not load states geojson:', err));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Basemap Switcher (Subtle Carto Light by default, without heavy foreign country labels)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (basemap === 'carto') {
      tileLayerRef.current = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
        {
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO | NASA IMERG',
          subdomains: 'abcd',
          maxZoom: 19,
        }
      ).addTo(map);
    } else if (basemap === 'esri') {
      tileLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; Esri, DeLorme, NAVTEQ | NASA IMERG',
          maxZoom: 16,
        }
      ).addTo(map);
    } else {
      tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | NASA IMERG',
        maxZoom: 19,
      }).addTo(map);
    }
  }, [basemap]);

  // 3. Hardware-Accelerated Canvas Precipitation Layer with Strict Boundary Clipping
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (canvasLayerRef.current) {
      map.removeLayer(canvasLayerRef.current);
      canvasLayerRef.current = null;
    }

    const CanvasGridLayer = (L.Layer as any).extend({
      onAdd: function (leafletMap: L.Map) {
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

      onRemove: function (leafletMap: L.Map) {
        if (this._canvas && this._canvas.parentNode) {
          this._canvas.parentNode.removeChild(this._canvas);
        }
        leafletMap.off('moveend zoomend resize viewreset', this._draw, this);
      },

      _draw: function () {
        if (!this._map || !this._canvas) return;
        const ctx: CanvasRenderingContext2D | null = this._canvas.getContext('2d');
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
        ctx.globalAlpha = opacity;

        // -------------------------------------------------------------
        // RESOLVE CLIPPING MASK GEOMETRY
        // -------------------------------------------------------------
        let clipGeometry: any = null;

        if (selectedDistrict && selectedState) {
          const stateSlug = slugify(selectedState);
          const districtGeoJson = districtsGeoJsonMapRef.current[stateSlug];
          if (districtGeoJson?.features) {
            const feat = districtGeoJson.features.find((f: any) => {
              const name = f?.properties?.NAME_2 || f?.properties?.DISTRICT || '';
              return name.toLowerCase() === selectedDistrict.toLowerCase();
            });
            if (feat?.geometry) clipGeometry = feat.geometry;
          }
        }

        if (!clipGeometry && selectedState) {
          const statesGeoJson = statesGeoJsonRef.current;
          if (statesGeoJson?.features) {
            const feat = statesGeoJson.features.find((f: any) => {
              const name = f?.properties?.ST_NM || '';
              return name.toLowerCase() === selectedState.toLowerCase();
            });
            if (feat?.geometry) clipGeometry = feat.geometry;
          }
        }

        if (!clipGeometry) {
          clipGeometry = nationalBoundaryGeoJsonRef.current;
        }

        // Apply geometric boundary clipping path
        if (clipGeometry) {
          ctx.beginPath();
          addGeometryToCanvasPath(ctx, this._map, clipGeometry);
          ctx.clip('evenodd');
        }

        // -------------------------------------------------------------
        // RENDER WEATHER PRECIPITATION PIXELS
        // -------------------------------------------------------------
        const mapBounds = this._map.getBounds();

        if (selectedDistrict && districtData?.observations?.length) {
          // District View: Draw granular 0.1° observations clipped to district boundary
          const obs = districtData.observations;
          const step = 0.1;
          for (let i = 0; i < obs.length; i++) {
            const pt = obs[i];
            const p = pt.precipitation;
            if (p < 0.1) continue;

            const lat = pt.latitude;
            const lon = pt.longitude;
            if (
              lat < mapBounds.getSouth() - step ||
              lat > mapBounds.getNorth() + step ||
              lon < mapBounds.getWest() - step ||
              lon > mapBounds.getEast() + step
            ) {
              continue;
            }

            const nw = this._map.latLngToContainerPoint([lat + step / 2, lon - step / 2]);
            const se = this._map.latLngToContainerPoint([lat - step / 2, lon + step / 2]);
            const w = Math.ceil(se.x - nw.x);
            const h = Math.ceil(se.y - nw.y);

            ctx.fillStyle = getPrecipitationColor(p);
            ctx.fillRect(Math.floor(nw.x), Math.floor(nw.y), w, h);
          }
        } else if (selectedState && stateData?.observations?.length) {
          // State View: Draw granular 0.1° observations clipped to state boundary
          const obs = stateData.observations;
          const step = 0.1;
          for (let i = 0; i < obs.length; i++) {
            const pt = obs[i];
            const p = pt.precipitation;
            if (p < 0.1) continue;

            const lat = pt.latitude;
            const lon = pt.longitude;
            if (
              lat < mapBounds.getSouth() - step ||
              lat > mapBounds.getNorth() + step ||
              lon < mapBounds.getWest() - step ||
              lon > mapBounds.getEast() + step
            ) {
              continue;
            }

            const nw = this._map.latLngToContainerPoint([lat + step / 2, lon - step / 2]);
            const se = this._map.latLngToContainerPoint([lat - step / 2, lon + step / 2]);
            const w = Math.ceil(se.x - nw.x);
            const h = Math.ceil(se.y - nw.y);

            ctx.fillStyle = getPrecipitationColor(p);
            ctx.fillRect(Math.floor(nw.x), Math.floor(nw.y), w, h);
          }
        } else if (overviewData?.grid_points?.length) {
          // National Overview (or fallback while state loads):
          // Draw national grid points strictly clipped to official Survey of India boundary
          const gridPoints = overviewData.grid_points;
          const step = overviewData.grid_step || 0.2;

          for (let i = 0; i < gridPoints.length; i++) {
            const [lat, lon, precip] = gridPoints[i];
            if (precip < 0.1) continue;

            if (
              lat < mapBounds.getSouth() - step ||
              lat > mapBounds.getNorth() + step ||
              lon < mapBounds.getWest() - step ||
              lon > mapBounds.getEast() + step
            ) {
              continue;
            }

            const nw = this._map.latLngToContainerPoint([lat + step / 2, lon - step / 2]);
            const se = this._map.latLngToContainerPoint([lat - step / 2, lon + step / 2]);
            const w = Math.ceil(se.x - nw.x);
            const h = Math.ceil(se.y - nw.y);

            ctx.fillStyle = getPrecipitationColor(precip);
            ctx.fillRect(Math.floor(nw.x), Math.floor(nw.y), w, h);
          }
        }

        ctx.restore();
      },
    });

    const newCanvasLayer = new CanvasGridLayer();
    newCanvasLayer.addTo(map);
    canvasLayerRef.current = newCanvasLayer;

    return () => {
      if (canvasLayerRef.current && map) {
        map.removeLayer(canvasLayerRef.current);
        canvasLayerRef.current = null;
      }
    };
  }, [overviewData, stateData, districtData, selectedState, selectedDistrict, opacity]);

  // 4. States GeoJSON Layer (Thin, subtle boundaries, lightweight compact tooltips)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (statesLayerRef.current) {
      map.removeLayer(statesLayerRef.current);
      statesLayerRef.current = null;
    }

    const stateSummaryMap = new Map<string, StateSummary>();
    if (overviewData?.state_summaries) {
      for (const s of overviewData.state_summaries) {
        stateSummaryMap.set(s.state_name.toLowerCase(), s);
      }
    }

    fetch('/data/india_states.geojson')
      .then((res) => res.json())
      .then((geojson) => {
        statesGeoJsonRef.current = geojson;
        if (!mapRef.current) return;

        const layer = L.geoJSON(geojson, {
          pane: 'boundaryPane',
          style: (feature) => {
            const stName = feature?.properties?.ST_NM || '';
            const isSelected = selectedState && stName.toLowerCase() === selectedState.toLowerCase();

            return {
              color: isSelected ? '#0284c7' : '#475569',
              weight: isSelected ? 2.0 : 0.85,
              opacity: isSelected ? 0.95 : 0.65,
              fillColor: isSelected ? '#38bdf8' : 'transparent',
              fillOpacity: isSelected ? 0.05 : 0,
            };
          },
          onEachFeature: (feature, l) => {
            const stName = feature.properties?.ST_NM || '';
            const summary = stateSummaryMap.get(stName.toLowerCase());

            const avgP = summary ? summary.avg_precipitation.toFixed(1) : '0.0';
            const maxP = summary ? summary.max_precipitation.toFixed(1) : '0.0';
            const minP = summary ? summary.min_precipitation.toFixed(1) : '0.0';
            const rainCat = summary ? summary.rain_category : 'No Rain';

            // Lightweight, compact floating card tooltip
            l.bindTooltip(
              `<div class="compact-weather-tooltip">
                <div class="tooltip-header">
                  <span class="tooltip-title">${stName}</span>
                  <span class="tooltip-category">${rainCat}</span>
                </div>
                <div class="tooltip-body">
                  <div class="tooltip-stat"><span class="tooltip-label">Avg</span><span class="tooltip-value">${avgP} mm</span></div>
                  <div class="tooltip-stat"><span class="tooltip-label">Max</span><span class="tooltip-value highlight">${maxP} mm</span></div>
                  <div class="tooltip-stat"><span class="tooltip-label">Min</span><span class="tooltip-value">${minP} mm</span></div>
                </div>
              </div>`,
              {
                sticky: true,
                className: 'weather-map-tooltip',
                direction: 'top',
                offset: [0, -10],
              }
            );

            l.on({
              mouseover: (e) => {
                const targetLayer = e.target;
                if (!selectedState || selectedState.toLowerCase() !== stName.toLowerCase()) {
                  targetLayer.setStyle({
                    color: '#0284c7',
                    weight: 1.6,
                    opacity: 0.9,
                    fillOpacity: 0, // Clean subtle outline, NO jarring fill
                  });
                }
                setHoverInfo({
                  lat: Number(e.latlng.lat.toFixed(2)),
                  lon: Number(e.latlng.lng.toFixed(2)),
                  precip: summary ? summary.avg_precipitation : null,
                  locationName: stName,
                });
              },
              mouseout: (e) => {
                const isSelected = selectedState && stName.toLowerCase() === selectedState.toLowerCase();
                e.target.setStyle({
                  color: isSelected ? '#0284c7' : '#475569',
                  weight: isSelected ? 2.0 : 0.85,
                  opacity: isSelected ? 0.95 : 0.65,
                  fillColor: isSelected ? '#38bdf8' : 'transparent',
                  fillOpacity: isSelected ? 0.05 : 0,
                });
              },
              click: () => {
                onSelectState(stName);
                if (mapRef.current) {
                  mapRef.current.fitBounds((l as any).getBounds(), {
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
      })
      .catch((err) => console.warn('Could not load states geojson:', err));
  }, [overviewData, selectedState, onSelectState]);

  // 5. Districts GeoJSON Layer (Loaded dynamically when state is selected)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (districtsLayerRef.current) {
      map.removeLayer(districtsLayerRef.current);
      districtsLayerRef.current = null;
    }

    if (!selectedState) return;

    const stateSlug = slugify(selectedState);
    const districtSummaryMap = new Map<string, DistrictSummary>();
    if (stateData?.district_summaries) {
      for (const d of stateData.district_summaries) {
        districtSummaryMap.set(d.district_name.toLowerCase(), d);
      }
    }

    fetch(`/data/districts/${stateSlug}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.json();
      })
      .then((geojson) => {
        districtsGeoJsonMapRef.current[stateSlug] = geojson;
        if (!mapRef.current || !selectedState) return;

        const layer = L.geoJSON(geojson, {
          pane: 'boundaryPane',
          style: (feature) => {
            const distName = feature?.properties?.NAME_2 || feature?.properties?.DISTRICT || '';
            const isSelected = selectedDistrict && distName.toLowerCase() === selectedDistrict.toLowerCase();

            return {
              color: isSelected ? '#0284c7' : '#64748b',
              weight: isSelected ? 1.8 : 0.75,
              opacity: isSelected ? 0.95 : 0.55,
              fillColor: isSelected ? '#38bdf8' : 'transparent',
              fillOpacity: isSelected ? 0.06 : 0,
            };
          },
          onEachFeature: (feature, l) => {
            const distName = feature.properties?.NAME_2 || feature.properties?.DISTRICT || 'District';
            const summary = districtSummaryMap.get(distName.toLowerCase());

            const avgP = summary ? summary.avg_precipitation.toFixed(1) : '0.0';
            const maxP = summary ? summary.max_precipitation.toFixed(1) : '0.0';
            const minP = summary ? summary.min_precipitation.toFixed(1) : '0.0';
            const rainCat = summary ? summary.rain_category : 'No Rain';

            // Lightweight, compact floating card tooltip
            l.bindTooltip(
              `<div class="compact-weather-tooltip">
                <div class="tooltip-header">
                  <span class="tooltip-title">${distName}</span>
                  <span class="tooltip-category">${rainCat}</span>
                </div>
                <div class="tooltip-body">
                  <div class="tooltip-stat"><span class="tooltip-label">Avg</span><span class="tooltip-value">${avgP} mm</span></div>
                  <div class="tooltip-stat"><span class="tooltip-label">Max</span><span class="tooltip-value highlight">${maxP} mm</span></div>
                  <div class="tooltip-stat"><span class="tooltip-label">Min</span><span class="tooltip-value">${minP} mm</span></div>
                </div>
              </div>`,
              {
                sticky: true,
                className: 'weather-map-tooltip',
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
                    weight: 1.5,
                    opacity: 0.9,
                    fillOpacity: 0,
                  });
                }
                setHoverInfo({
                  lat: Number(e.latlng.lat.toFixed(2)),
                  lon: Number(e.latlng.lng.toFixed(2)),
                  precip: summary ? summary.avg_precipitation : null,
                  locationName: `${distName}, ${selectedState}`,
                });
              },
              mouseout: (e) => {
                const isSelected = selectedDistrict && distName.toLowerCase() === selectedDistrict.toLowerCase();
                e.target.setStyle({
                  color: isSelected ? '#0284c7' : '#64748b',
                  weight: isSelected ? 1.8 : 0.75,
                  opacity: isSelected ? 0.95 : 0.55,
                  fillColor: isSelected ? '#38bdf8' : 'transparent',
                  fillOpacity: isSelected ? 0.06 : 0,
                });
              },
              click: () => {
                onSelectDistrict(distName);
                if (mapRef.current) {
                  mapRef.current.fitBounds((l as any).getBounds(), {
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

        // Force canvas redraw to apply district clipping path if district was selected
        if (canvasLayerRef.current && canvasLayerRef.current._draw) {
          canvasLayerRef.current._draw();
        }
      })
      .catch((err) => {
        console.warn(`Could not load district geojson for ${selectedState}:`, err);
      });
  }, [selectedState, selectedDistrict, stateData, onSelectDistrict]);

  // 6. District Observation Points Layer (Observation point circle markers when district is selected)
  useEffect(() => {
    const pointsGroup = pointsLayerRef.current;
    if (!pointsGroup) return;

    pointsGroup.clearLayers();

    if (!selectedDistrict || !districtData || !districtData.observations) return;

    for (const pt of districtData.observations) {
      const color = getPrecipitationColor(pt.precipitation);
      const radius = Math.min(8, Math.max(3, Math.sqrt(pt.precipitation + 1) * 1.8));

      const marker = L.circleMarker([pt.latitude, pt.longitude], {
        pane: 'markerPane',
        radius: radius,
        fillColor: color,
        color: '#0f172a',
        weight: 0.75,
        opacity: 0.85,
        fillOpacity: 0.9,
      });

      marker.bindTooltip(
        `<div class="compact-weather-tooltip">
          <div class="tooltip-header">
            <span class="tooltip-title">${pt.latitude.toFixed(2)}° N, ${pt.longitude.toFixed(2)}° E</span>
          </div>
          <div class="tooltip-body">
            <div class="tooltip-stat"><span class="tooltip-label">Rain</span><span class="tooltip-value highlight">${pt.precipitation.toFixed(1)} mm</span></div>
            <div class="tooltip-stat"><span class="tooltip-label">Liquid</span><span class="tooltip-value">${pt.liquid.toFixed(1)} mm</span></div>
            <div class="tooltip-stat"><span class="tooltip-label">Ice</span><span class="tooltip-value">${pt.ice.toFixed(1)} mm</span></div>
          </div>
        </div>`,
        {
          sticky: true,
          className: 'weather-map-tooltip',
          direction: 'top',
          offset: [0, -8],
        }
      );

      marker.bindPopup(`
        <div style="font-family:sans-serif;font-size:12px;line-height:1.5;">
          <strong>Observation Point</strong><br/>
          <span>${pt.latitude.toFixed(2)}° N, ${pt.longitude.toFixed(2)}° E</span><hr style="margin:4px 0;border:0;border-top:1px solid #cbd5e1;"/>
          <span style="color:#0284c7;font-weight:700;">Rainfall: ${pt.precipitation.toFixed(1)} mm</span><br/>
          <span>Liquid: ${pt.liquid.toFixed(1)} mm | Ice: ${pt.ice.toFixed(1)} mm</span><br/>
          <span>Liquid %: ${pt.liquid_percent.toFixed(0)}%</span>
        </div>
      `);

      marker.on('mouseover', () => {
        setHoverInfo({
          lat: pt.latitude,
          lon: pt.longitude,
          precip: pt.precipitation,
          locationName: `${selectedDistrict} Point`,
        });
      });

      pointsGroup.addLayer(marker);
    }
  }, [selectedDistrict, districtData]);

  // 7. Navigation Camera Transitions (Smooth drilldown & return via Breadcrumbs or Fit India)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const prev = prevSelectionRef.current;

    // Resetting to India Overview (from state)
    if (prev.state && !selectedState) {
      map.setView([22.8, 82.0], 5, { animate: true, duration: 0.8 });
    }
    // Returning from District to State
    else if (prev.district && !selectedDistrict && selectedState && statesLayerRef.current) {
      statesLayerRef.current.eachLayer((layer: any) => {
        const name = layer.feature?.properties?.ST_NM;
        if (name && name.toLowerCase() === selectedState.toLowerCase()) {
          map.fitBounds(layer.getBounds(), { padding: [30, 30], animate: true, duration: 0.8 });
        }
      });
    }

    prevSelectionRef.current = { state: selectedState, district: selectedDistrict };
  }, [selectedState, selectedDistrict]);

  return (
    <div className="map-wrapper">
      <div ref={mapContainerRef} className="leaflet-map-canvas" />

      {/* Legend */}
      <Legend />

      {/* Compact Status / Inspector Bar */}
      <div className="map-status-bar">
        {hoverInfo ? (
          <span>
            📍 <strong>{hoverInfo.locationName || 'India'}</strong> [{hoverInfo.lat}° N, {hoverInfo.lon}° E] &bull;{' '}
            <span style={{ color: '#0284c7', fontWeight: 700 }}>
              {hoverInfo.precip !== null ? `${hoverInfo.precip.toFixed(1)} mm` : '0.0 mm'}
            </span>
          </span>
        ) : (
          <span>
            🇮🇳 <strong>NASA IMERG Weather Analytics</strong> &bull; Hover over states or districts to inspect
          </span>
        )}
      </div>
    </div>
  );
};
