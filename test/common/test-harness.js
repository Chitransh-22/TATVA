/**
 * Shared Test Harness for Standalone MOSDAC Weather/Environment/Ocean Test Maps.
 * Handles Leaflet setup, Survey of India boundary clipping, fluid & categorical raster rendering,
 * offscreen alpha-masking, live WebSocket connection with sync counter, and interactive inspectors.
 */

class MosdacTestMap {
  constructor(config) {
    this.productId = config.productId;
    this.productName = config.productName || config.productId;
    this.category = config.category || 'weather';
    this.unit = config.unit || '';
    this.colorScale = config.colorScale || [];
    this.renderType = config.renderType || (this.productId.includes('FOG') ? 'categorical_mask' : 'fluid_raster');
    this.defaultMinThreshold = config.defaultMinThreshold !== undefined ? config.defaultMinThreshold : -999.0;
    this.boundaryPath = config.boundaryPath || '../common/india_visual_boundary.geojson';
    this.localDataVar = config.localDataVar || null;
    this.mapElementId = config.mapElementId || 'map';
    this.center = config.center || [22.8, 82.5];
    this.zoom = config.zoom || 5;
    this.scrollWheelZoom = (config.scrollWheelZoom !== undefined) ? config.scrollWheelZoom : true;

    this.allPoints = [];
    this.boundaryGeoJson = null;
    this.defaultBoundaryGeoJson = null;
    this.boundaryLayer = null;
    // Ocean products (e.g. SST) are not clipped to land boundary; land/weather/environment are strictly clipped
    this.clipToBoundary = (config.clipToBoundary !== undefined) ? config.clipToBoundary : (this.category !== 'ocean');
    this.layerOpacity = 0.85;
    this.minThreshold = this.defaultMinThreshold;
    this.syncedPointsCount = 0;
    this.map = null;
    this.canvasLayer = null;
    this.ws = null;
    this.heartbeatTimer = null;
    this.dataSource = null;
    this.enableDebugMetrics = true;
    this._renderSeq = 0;

    // Attach instance to window for test accessibility
    window.testMap = this;

    this.initMap();
    this.initCanvasLayer();
    this.loadBoundary();
    this.initWebSocket();
    this.loadInitialData();
  }

  initMap() {
    if (typeof L === 'undefined') {
      console.error('[MOSDAC TEST HARNESS] Leaflet (L) is not defined. Ensure Leaflet CSS/JS is loaded.');
      const mapEl = document.getElementById('map') || document.getElementById('testCenterMap');
      if (mapEl) {
        mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#f87171;padding:24px;text-align:center;"><h3>⚠️ Leaflet library not loaded</h3></div>';
      }
      return;
    }

    this.map = L.map(this.mapElementId || 'map', {
      center: this.center,
      zoom: this.zoom,
      minZoom: 4,
      maxZoom: 12,
      zoomControl: true,
      preferCanvas: true,
      scrollWheelZoom: this.scrollWheelZoom
    });

    // Create a dedicated pane for the official boundary outline above the overlay pane
    if (!this.map.getPane('boundaryPane')) {
      const bPane = this.map.createPane('boundaryPane');
      bPane.style.zIndex = '450';
      bPane.style.pointerEvents = 'none';
    }

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO &copy; OpenStreetMap | &copy; ISRO MOSDAC INSAT-3DS',
      maxZoom: 19
    }).addTo(this.map);

    // Setup interactive inspector on click
    this.map.on('click', (e) => this.handleMapClick(e));
  }

  loadBoundary() {
    // 1. Prefer visual boundary bundle (de facto CARTO/OSM aligned)
    if (window.INDIA_VISUAL_BOUNDARY) {
      this.boundaryGeoJson = window.INDIA_VISUAL_BOUNDARY;
      this.defaultBoundaryGeoJson = window.INDIA_VISUAL_BOUNDARY;
      this.renderBoundary(window.INDIA_VISUAL_BOUNDARY);
      if (this.canvasLayer) this.canvasLayer._draw();
      return;
    }

    // Try relative paths for visual boundary file
    const paths = [
      this.boundaryPath,
      '../common/india_visual_boundary.geojson',
      '../../common/india_visual_boundary.geojson',
      '../india_visual_boundary.geojson',
      'india_visual_boundary.geojson',
      '/test/common/india_visual_boundary.geojson',
      '../india_boundary.geojson'
    ];
    const tryNext = (idx) => {
      if (idx >= paths.length) {
        if (window.INDIA_BOUNDARY) {
          this.boundaryGeoJson = window.INDIA_BOUNDARY;
          this.defaultBoundaryGeoJson = window.INDIA_BOUNDARY;
          this.renderBoundary(window.INDIA_BOUNDARY);
        }
        if (this.canvasLayer) this.canvasLayer._draw();
        return;
      }
      fetch(paths[idx])
        .then(res => {
          if (!res.ok) throw new Error('not ok');
          return res.json();
        })
        .then(data => {
          this.boundaryGeoJson = data;
          this.defaultBoundaryGeoJson = data;
          this.renderBoundary(data);
          if (this.canvasLayer) this.canvasLayer._draw();
        })
        .catch(() => tryNext(idx + 1));
    };
    tryNext(0);
  }

  renderBoundary(geoData) {
    if (this.boundaryLayer) {
      this.map.removeLayer(this.boundaryLayer);
      this.boundaryLayer = null;
    }
    this.boundaryLayer = L.geoJSON(geoData, {
      pane: 'boundaryPane',
      style: {
        color: '#1e3a8a',
        weight: 2,
        opacity: 0.85,
        fillColor: '#0284c7',
        fillOpacity: 0.02
      }
    }).addTo(this.map);
  }

  /**
   * Updates or switches the active clipping boundary (compatible with INDIA -> STATE -> DISTRICT hierarchy).
   * @param {Object} geoData - GeoJSON Feature or FeatureCollection for the target boundary.
   */
  setBoundary(geoData) {
    if (!geoData) return;
    this.boundaryGeoJson = geoData;
    this.renderBoundary(geoData);
    if (this.canvasLayer) {
      this.canvasLayer._reset();
    }
  }

  /**
   * Restores the default Survey of India boundary.
   */
  resetBoundary() {
    if (this.defaultBoundaryGeoJson) {
      this.setBoundary(this.defaultBoundaryGeoJson);
    }
  }

  /**
   * Authoritative polygon raster mask generator.
   * Renders each individual Polygon in the MultiPolygon onto a mask canvas with '#ffffff',
   * properly hollowing out any interior rings (holes) using the 'evenodd' rule per polygon.
   * Disjoint components (mainland and 600+ islands) never cancel out each other.
   * Result: pixels inside the official boundary have alpha = 255; pixels outside have alpha = 0.
   */
  renderBoundaryMask(maskCanvas, map, geoData) {
    const ctx = maskCanvas.getContext('2d');
    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    ctx.fillStyle = '#ffffff';

    if (!geoData) return false;

    let polygonCount = 0;

    const fillPolygon = (polyCoords) => {
      if (!Array.isArray(polyCoords) || polyCoords.length === 0) return;
      ctx.beginPath();
      for (let r = 0; r < polyCoords.length; r++) {
        const ring = polyCoords[r];
        if (!Array.isArray(ring) || ring.length < 3) continue;
        // GeoJSON coordinate order: [lon, lat] -> Leaflet latLngToContainerPoint expects [lat, lon]
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

  /**
   * Backward-compatible path tracer for direct canvas contexts.
   */
  traceBoundaryPath(ctx, map, geoData) {
    if (!geoData) return false;

    ctx.beginPath();
    let ringCount = 0;

    const addPolygonRings = (polyCoords) => {
      if (!Array.isArray(polyCoords)) return;
      for (let r = 0; r < polyCoords.length; r++) {
        const ring = polyCoords[r];
        if (!Array.isArray(ring) || ring.length < 3) continue;
        const first = map.latLngToContainerPoint([ring[0][1], ring[0][0]]);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < ring.length; i++) {
          const pt = map.latLngToContainerPoint([ring[i][1], ring[i][0]]);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ringCount++;
      }
    };

    const processGeom = (geom) => {
      if (!geom || !geom.type) return;
      if (geom.type === 'Polygon') {
        addPolygonRings(geom.coordinates);
      } else if (geom.type === 'MultiPolygon') {
        if (Array.isArray(geom.coordinates)) {
          for (let p = 0; p < geom.coordinates.length; p++) {
            addPolygonRings(geom.coordinates[p]);
          }
        }
      } else if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
        for (const g of geom.geometries) {
          processGeom(g);
        }
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

    return ringCount > 0;
  }

  getColor(val) {
    for (const step of this.colorScale) {
      if (val >= step.min) return step.color;
    }
    return this.colorScale[this.colorScale.length - 1]?.color || '#38bdf8';
  }

  getCategoryDesc(val) {
    for (const step of this.colorScale) {
      if (val >= step.min) return step.label;
    }
    return '';
  }

  initCanvasLayer() {
    const self = this;
    const CanvasOverlay = L.Layer.extend({
      onAdd: function(map) {
        this._map = map;
        this._canvas = L.DomUtil.create('canvas', 'leaflet-layer');
        this._canvas.style.position = 'absolute';
        this._canvas.style.pointerEvents = 'none';
        this._canvas.style.transformOrigin = '50% 50%';
        map.getPanes().overlayPane.appendChild(this._canvas);

        this._offscreenCanvas = document.createElement('canvas');
        this._maskCanvas = document.createElement('canvas');

        map.on('moveend', this._reset, this);
        map.on('zoomend', this._reset, this);
        map.on('resize', this._reset, this);
        map.on('viewreset', this._reset, this);
        this._reset();
      },

      onRemove: function(map) {
        if (this._canvas && this._canvas.parentNode) {
          this._canvas.parentNode.removeChild(this._canvas);
        }
        map.off('moveend', this._reset, this);
        map.off('zoomend', this._reset, this);
        map.off('resize', this._reset, this);
        map.off('viewreset', this._reset, this);
      },

      _reset: function() {
        if (!this._map || !this._canvas) return;
        const bounds = this._map.getBounds();
        const topLeft = this._map.latLngToLayerPoint(bounds.getNorthWest());
        const size = this._map.getSize();

        this._canvas.width = size.x;
        this._canvas.height = size.y;
        this._canvas.style.width = size.x + 'px';
        this._canvas.style.height = size.y + 'px';

        if (this._offscreenCanvas) {
          this._offscreenCanvas.width = size.x;
          this._offscreenCanvas.height = size.y;
        }
        if (this._maskCanvas) {
          this._maskCanvas.width = size.x;
          this._maskCanvas.height = size.y;
        }

        L.DomUtil.setPosition(this._canvas, topLeft);
        this._draw();
      },

      _draw: function() {
        if (!self.allPoints || self.allPoints.length === 0) return;
        if (!this._canvas) return;

        // If clipping is requested, check if boundary GeoJSON is available
        const shouldClip = self.clipToBoundary && Boolean(self.boundaryGeoJson);

        const size = this._map.getSize();
        if (size.x <= 0 || size.y <= 0) return;

        const currentSeq = ++self._renderSeq;

        // Ensure offscreen buffers match visible canvas
        if (!this._offscreenCanvas) this._offscreenCanvas = document.createElement('canvas');
        if (!this._maskCanvas) this._maskCanvas = document.createElement('canvas');
        if (this._offscreenCanvas.width !== size.x || this._offscreenCanvas.height !== size.y) {
          this._offscreenCanvas.width = size.x;
          this._offscreenCanvas.height = size.y;
        }
        if (this._maskCanvas.width !== size.x || this._maskCanvas.height !== size.y) {
          this._maskCanvas.width = size.x;
          this._maskCanvas.height = size.y;
        }

        const offCtx = this._offscreenCanvas.getContext('2d');
        offCtx.clearRect(0, 0, size.x, size.y);

        const zoom = this._map.getZoom();
        const bounds = this._map.getBounds();

        // Product spatial resolution handling
        let stepDeg = 0.04; // INSAT-3DS Imager standard (~4km)
        if (self.productId.includes('AOD')) stepDeg = 0.05;
        if (self.productId.startsWith('3SSND')) stepDeg = 0.10;

        const ptCenter = this._map.latLngToContainerPoint([22.0, 80.0]);
        const ptStep = this._map.latLngToContainerPoint([22.0 + stepDeg, 80.0 + stepDeg]);
        const cellW = Math.max(2, Math.abs(ptStep.x - ptCenter.x) * 1.15);
        const cellH = Math.max(2, Math.abs(ptCenter.y - ptStep.y) * 1.15);
        const radius = Math.max(2.5, Math.min(24, Math.pow(2, zoom - 5) * 3.4));

        let validCellsCount = 0;
        const isCategoricalMask = (self.renderType === 'categorical_mask' || self.productId.includes('FOG'));
        const isDiscretePoint = (self.renderType === 'points');

        // 1. Generate full-resolution raster texture / cells on offscreen buffer
        for (let i = 0; i < self.allPoints.length; i++) {
          const pt = self.allPoints[i];
          const lat = pt[0];
          const lon = pt[1];
          const val = pt[2];

          if (val < self.minThreshold) continue;

          // Lat/lon bounding box culling with 0.1 deg buffer
          if (lat < bounds.getSouth() - 0.1 || lat > bounds.getNorth() + 0.1 ||
              lon < bounds.getWest() - 0.1 || lon > bounds.getEast() + 0.1) {
            continue;
          }

          validCellsCount++;
          // Coordinate mapping: lon -> X, lat -> Y via Leaflet container point
          const p = this._map.latLngToContainerPoint([lat, lon]);
          offCtx.fillStyle = self.getColor(val);

          if (isCategoricalMask) {
            // Crisp categorical cell block
            offCtx.fillRect(p.x - cellW / 2, p.y - cellH / 2, cellW, cellH);
          } else if (isDiscretePoint) {
            // Discrete event point
            offCtx.beginPath();
            offCtx.arc(p.x, p.y, Math.max(3, radius), 0, Math.PI * 2);
            offCtx.fill();
          } else {
            // Fluid continuous raster: overlapping smooth discs forming seamless gradient
            offCtx.beginPath();
            offCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            offCtx.fill();
          }
        }

        // 2. Apply authoritative India polygon alpha mask:
        // Multiplies the raster layer by the polygon mask using 'destination-in'.
        // Pixels inside India retain exact color/value; all pixels outside (Pakistan,
        // Nepal, Bhutan, Bangladesh, China/Tibet, seas) are permanently set to alpha 0.
        let maskApplied = false;
        let polygonProjectedCount = 0;
        if (self.clipToBoundary && self.boundaryGeoJson) {
          polygonProjectedCount = self.renderBoundaryMask(this._maskCanvas, this._map, self.boundaryGeoJson);

          offCtx.save();
          offCtx.globalAlpha = 1.0;
          offCtx.globalCompositeOperation = 'destination-in';
          offCtx.drawImage(this._maskCanvas, 0, 0);
          offCtx.restore();
          maskApplied = true;
        }

        // Abort if a newer render pass started
        if (self._renderSeq !== currentSeq) return;

        // 3. Blit strictly masked raster to the visible map canvas in a single atomic draw
        const visCtx = this._canvas.getContext('2d');
        visCtx.clearRect(0, 0, size.x, size.y);
        visCtx.globalAlpha = self.layerOpacity;
        visCtx.drawImage(this._offscreenCanvas, 0, 0);

        // Section 14: Structured Debug Metrics
        if (self.enableDebugMetrics) {
          console.log(`[MOSDAC_DEBUG] product=${self.productId} | data_points=${self.allPoints.length} | canvas_size=${size.x}x${size.y} | india_polygon_loaded=${Boolean(self.boundaryGeoJson)} | india_polygon_projected=${polygonProjectedCount > 0} | mask_applied=${maskApplied} | rendered_inside_mask=${validCellsCount}`);
        }
      }
    });

    this.canvasLayer = new CanvasOverlay();
    this.canvasLayer.addTo(this.map);
  }

  setProduct(config) {
    this.productId = config.productId;
    this.productName = config.productName || config.productId;
    this.category = config.category || 'weather';
    this.unit = config.unit || '';
    this.colorScale = config.colorScale || [];
    this.renderType = config.renderType || (this.productId.includes('FOG') ? 'categorical_mask' : 'fluid_raster');
    this.defaultMinThreshold = config.defaultMinThreshold !== undefined ? config.defaultMinThreshold : -999.0;
    this.minThreshold = this.defaultMinThreshold;
    this.clipToBoundary = (config.clipToBoundary !== undefined) ? config.clipToBoundary : (this.category !== 'ocean');
    this.allPoints = [];
    this.syncedPointsCount = 0;
    this.dataSource = null;

    if (this.canvasLayer) {
      this.canvasLayer._reset();
    }
    this.updateStatusText(`Switched to ${this.productName}. Fetching data...`);
    this.loadInitialData();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        product: this.productId,
        category: this.category
      }));
    }
  }

  async loadInitialData() {
    // 1. Try Live Backend API with multiple host/port fallback candidates
    const minParam = (this.defaultMinThreshold > -900) ? `&min_val=${this.defaultMinThreshold}` : '';
    const candidates = [];
    if (window.location && window.location.origin && window.location.origin.startsWith('http')) {
      candidates.push(`/api/weather/mosdac/products/${this.productId}/points?limit=150000${minParam}`);
    }
    const host = (window.location && window.location.hostname) ? window.location.hostname : '127.0.0.1';
    candidates.push(`http://${host}:8000/api/weather/mosdac/products/${this.productId}/points?limit=150000${minParam}`);
    candidates.push(`http://127.0.0.1:8000/api/weather/mosdac/products/${this.productId}/points?limit=150000${minParam}`);
    candidates.push(`http://localhost:8000/api/weather/mosdac/products/${this.productId}/points?limit=150000${minParam}`);

    for (const url of candidates) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          const data = await res.json();
          if (data.points && data.points.length > 0) {
            console.log(`[DATA] Loaded ${data.points.length} points from LIVE BACKEND API (${url}) for ${this.productId}`);
            this.handleDataLoaded(data, 'LIVE BACKEND API');
            return;
          }
        }
      } catch (e) {
        // Try next candidate
      }
    }

    // 2. Check global pre-bundled dataset (instant for file:/// and offline modes)
    if (window.MOSDAC_BUNDLE && window.MOSDAC_BUNDLE[this.productId]) {
      console.log(`[DATA] Using bundled global dataset for ${this.productId}`);
      this.handleDataLoaded(window.MOSDAC_BUNDLE[this.productId], 'BUNDLED LOCAL DATASET');
      return;
    }

    // 3. Check legacy or standalone data variables (e.g. window.MOSDAC_DATA)
    if (this.localDataVar && window[this.localDataVar]) {
      console.log(`[DATA] Using bundled local dataset (${this.localDataVar}) for ${this.productId}`);
      this.handleDataLoaded(window[this.localDataVar], 'BUNDLED LOCAL DATASET');
      return;
    }
    if (this.productId === '3SIMG_L2B_HEM' && window.MOSDAC_DATA) {
      console.log(`[DATA] Using window.MOSDAC_DATA fallback for HEM`);
      this.handleDataLoaded(window.MOSDAC_DATA, 'BUNDLED LOCAL DATASET');
      return;
    }

    // 4. Try local snapshot JSON files
    const snapshotPaths = [
      `${this.productId}_latest.json`,
      `../${this.productId}_latest.json`,
      `../rainfall/${this.productId}_latest.json`,
      `../rainfall-imr/${this.productId}_latest.json`,
      `../cloud/${this.productId}_latest.json`,
      `../humidity/${this.productId}_latest.json`,
      `../olr/${this.productId}_latest.json`,
      `../fog/${this.productId}_latest.json`,
      `../sst/${this.productId}_latest.json`,
      `../snow/${this.productId}_latest.json`,
      `../aerosol/${this.productId}_latest.json`
    ];

    for (const sPath of snapshotPaths) {
      try {
        const snapshotRes = await fetch(sPath);
        if (snapshotRes.ok) {
          const data = await snapshotRes.json();
          if (data.points && data.points.length > 0) {
            console.log(`[DATA] Using local snapshot (${sPath}) for ${this.productId}`);
            this.handleDataLoaded(data, 'LOCAL SNAPSHOT');
            return;
          }
        }
      } catch (e) {
        // Continue searching
      }
    }

    console.warn(`[DATA] No data available for ${this.productId}`);
    this.updateStatusText(`Awaiting live satellite feed for ${this.productId}...`);
    this.updateDataBadge('NO_DATA');
  }

  handleDataLoaded(data, sourceLabel) {
    this.dataSource = sourceLabel;
    this.allPoints = data.points || [];
    const summary = data.summary || {};

    const totalEl = document.getElementById('statTotalPoints');
    if (totalEl) totalEl.innerText = (summary.total_points || this.allPoints.length).toLocaleString();

    const minEl = document.getElementById('statMinValue');
    if (minEl && summary.min_value !== undefined) minEl.innerText = `${summary.min_value} ${this.unit}`;

    const maxEl = document.getElementById('statMaxValue');
    if (maxEl && summary.max_value !== undefined) maxEl.innerText = `${summary.max_value} ${this.unit}`;

    const meanEl = document.getElementById('statMeanValue');
    if (meanEl && summary.mean_value !== undefined) meanEl.innerText = `${summary.mean_value} ${this.unit}`;

    const srcEl = document.getElementById('statDataSource');
    if (srcEl) srcEl.innerText = sourceLabel;

    const metaEl = document.getElementById('granuleMeta');
    if (metaEl && summary.granule_id) {
      metaEl.innerHTML = `Granule: <b>${summary.granule_id}</b> &bull; Obs: <b>${summary.observation_time_ist || summary.observation_time_utc}</b>`;
    }

    this.updateStatusText(`Loaded ${this.allPoints.length.toLocaleString()} points from ${sourceLabel}`);
    this.updateDataBadge(sourceLabel);
    if (this.canvasLayer) this.canvasLayer._reset();
  }

  updateDataBadge(sourceLabel) {
    const badge = document.getElementById('liveBadge');
    if (!badge) return;
    if (sourceLabel === 'LIVE BACKEND API') {
      badge.className = 'live-badge';
      badge.innerHTML = '<span class="pulse-dot"></span> LIVE SATELLITE FEED';
    } else if (sourceLabel === 'LOCAL SNAPSHOT' || sourceLabel === 'BUNDLED LOCAL DATASET') {
      badge.className = 'live-badge';
      badge.style.borderColor = '#eab308';
      badge.style.color = '#fde047';
      badge.innerHTML = '<span class="pulse-dot" style="background:#eab308; box-shadow:0 0 8px #eab308;"></span> SNAPSHOT — LOCAL JSON';
    } else if (sourceLabel === 'NO_DATA') {
      badge.className = 'live-badge disconnected';
      badge.style.borderColor = '#475569';
      badge.style.color = '#94a3b8';
      badge.innerHTML = '<span class="pulse-dot" style="background:#64748b; box-shadow:none;"></span> NO DATA AVAILABLE';
    }
  }

  initWebSocket() {
    const wsUrl = 'ws://127.0.0.1:8000/api/weather/ws';
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[WS] Connected to live weather stream for ${this.productId}`);
        this.updateBadge(true);
        const syncCounterEl = document.getElementById('liveSyncCounter');
        if (syncCounterEl) {
          syncCounterEl.innerText = `⚡ Live WebSocket: Connected (0 pts incrementally synced)`;
        }
        // Subscribe to this specific product & category
        this.ws.send(JSON.stringify({
          action: 'subscribe',
          product: this.productId,
          category: this.category,
          source: 'MOSDAC'
        }));

        // Heartbeat ping
        this.heartbeatTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'ping' }));
          }
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'weather_update') {
            this.handleLiveUpdate(msg);
          }
        } catch (e) {
          console.warn('[WS] Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.updateBadge(false);
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        // Reconnect after 3 seconds
        setTimeout(() => this.initWebSocket(), 3000);
      };

      this.ws.onerror = (err) => {
        console.warn('[WS] Error:', err);
        this.updateBadge(false);
      };
    } catch (e) {
      console.warn('[WS] Connection failed:', e);
      this.updateBadge(false);
    }
  }

  handleLiveUpdate(msg) {
    const updates = msg.updates || [];
    if (updates.length === 0) return;

    // Filter updates for this product
    if (msg.product && msg.product !== this.productId) {
      return;
    }

    this.syncedPointsCount += updates.length;
    const syncCounterEl = document.getElementById('liveSyncCounter');
    if (syncCounterEl) {
      syncCounterEl.innerText = `⚡ Live WebSocket: Connected (${this.syncedPointsCount.toLocaleString()} pts incrementally synced)`;
    }

    // Merge incoming live points into current dataset
    for (const u of updates) {
      const val = u.value !== undefined ? u.value : u.precipitation;
      if (val !== null && val !== undefined) {
        this.allPoints.push([u.lat, u.lon, val]);
      }
    }

    if (msg.summary) {
      const metaEl = document.getElementById('granuleMeta');
      if (metaEl && msg.summary.granule_id) {
        metaEl.innerHTML = `Granule: <b>${msg.summary.granule_id}</b> &bull; Obs: <b>${msg.timestamp_ist || msg.observation_time}</b>`;
      }
    }

    this.updateStatusText(`Incremental live update received (+${updates.length} pts at ${msg.timestamp_ist || 'now'})`);
    if (this.canvasLayer) this.canvasLayer._draw();
  }

  updateBadge(isConnected) {
    const badge = document.getElementById('liveBadge');
    const syncCounterEl = document.getElementById('liveSyncCounter');
    if (badge) {
      if (isConnected) {
        badge.className = 'live-badge';
        badge.innerHTML = '<span class="pulse-dot"></span> LIVE SATELLITE FEED';
      } else {
        badge.className = 'live-badge disconnected';
        badge.innerHTML = '<span class="pulse-dot"></span> RECONNECTING WS...';
      }
    }
    if (syncCounterEl && !isConnected) {
      syncCounterEl.innerText = '⚡ Live WebSocket: Disconnected';
    }
  }

  updateStatusText(text) {
    const el = document.getElementById('statusBarText');
    if (el) el.innerText = text;
  }

  handleMapClick(e) {
    if (!this.allPoints || this.allPoints.length === 0) return;
    const clickLat = e.latlng.lat;
    const clickLon = e.latlng.lng;

    let closest = null;
    let minDistance = 0.15; // ~15km radius

    for (let i = 0; i < this.allPoints.length; i++) {
      const pt = this.allPoints[i];
      const dist = Math.hypot(pt[0] - clickLat, pt[1] - clickLon);
      if (dist < minDistance) {
        minDistance = dist;
        closest = pt;
      }
    }

    if (closest) {
      const lat = closest[0];
      const lon = closest[1];
      const val = closest[2];
      const desc = this.getCategoryDesc(val);

      const content = `
        <div style="font-size:12.5px; line-height:1.5;">
          <b style="color:#0284c7; font-size:13.5px;">🛰️ ${this.productName}</b><br>
          <b>Coordinates:</b> ${lat.toFixed(3)}° N, ${lon.toFixed(3)}° E<br>
          <b>Observed Value:</b> <b style="font-size:14px; color:#0f172a;">${val.toFixed(2)} ${this.unit}</b><br>
          ${desc ? `<span style="display:inline-block; margin-top:4px; padding:2px 7px; border-radius:4px; font-size:10.5px; font-weight:700; background:#e0f2fe; color:#0369a1;">${desc}</span><br>` : ''}
          <span style="font-size:10px; color:#64748b; margin-top:4px; display:inline-block;">
            Survey of India Georeferenced
          </span>
        </div>
      `;

      L.popup()
        .setLatLng([lat, lon])
        .setContent(content)
        .openOn(this.map);
    }
  }

  applyFilter(val) {
    this.minThreshold = parseFloat(val);
    if (this.canvasLayer) this.canvasLayer._draw();
  }

  updateThreshold(val) {
    this.applyFilter(val);
  }

  updateOpacity(val) {
    this.layerOpacity = val / 100.0;
    if (this.canvasLayer) this.canvasLayer._draw();
  }

  refresh() {
    this.updateStatusText('Refreshing observation data from backend...');
    this.loadInitialData();
  }

  /**
   * Diagnostic verification helper: Samples pixels at border-adjacent locations
   * outside India (Pakistan, Nepal, Bhutan, Bangladesh, oceanic waters) and inside India.
   * Proves that outsidePixelsRendered is strictly 0 when clipping is active.
   */
  verifyClipping() {
    if (!this.canvasLayer || !this.canvasLayer._canvas) {
      return { status: 'error', message: 'Canvas not initialized' };
    }
    const canvas = this.canvasLayer._canvas;
    const ctx = canvas.getContext('2d');

    // Test coordinates strictly outside official India boundary
    const outsideTestCoords = [
      { name: 'Kasur/Raiwind, Pakistan', lat: 31.15, lon: 74.45 },
      { name: 'Lahore, Pakistan', lat: 31.52, lon: 74.35 },
      { name: 'Karachi, Pakistan', lat: 24.86, lon: 67.00 },
      { name: 'Kathmandu, Nepal', lat: 27.71, lon: 85.32 },
      { name: 'Thimphu, Bhutan', lat: 27.47, lon: 89.63 },
      { name: 'Dhaka, Bangladesh', lat: 23.81, lon: 90.41 },
      { name: 'Arabian Sea (West of Gujarat)', lat: 21.00, lon: 66.00 },
      { name: 'Bay of Bengal (East of Odisha)', lat: 18.00, lon: 88.00 }
    ];

    // Test coordinates inside India
    const insideTestCoords = [
      { name: 'Nagpur, India', lat: 21.145, lon: 79.088 },
      { name: 'Bhopal, India', lat: 23.259, lon: 77.412 },
      { name: 'Hyderabad, India', lat: 17.385, lon: 78.486 },
      { name: 'Delhi, India', lat: 28.613, lon: 77.209 }
    ];

    let outsidePixelsRendered = 0;
    const outsideResults = [];
    for (const loc of outsideTestCoords) {
      const p = this.map.latLngToContainerPoint([loc.lat, loc.lon]);
      if (p.x >= 0 && p.x < canvas.width && p.y >= 0 && p.y < canvas.height) {
        const pixel = ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
        const isRendered = pixel[3] > 0;
        if (isRendered) outsidePixelsRendered++;
        outsideResults.push({ ...loc, x: Math.round(p.x), y: Math.round(p.y), rgba: Array.from(pixel), rendered: isRendered });
      }
    }

    let insidePixelsRendered = 0;
    const insideResults = [];
    for (const loc of insideTestCoords) {
      const p = this.map.latLngToContainerPoint([loc.lat, loc.lon]);
      if (p.x >= 0 && p.x < canvas.width && p.y >= 0 && p.y < canvas.height) {
        const pixel = ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
        const isRendered = pixel[3] > 0;
        if (isRendered) insidePixelsRendered++;
        insideResults.push({ ...loc, x: Math.round(p.x), y: Math.round(p.y), rgba: Array.from(pixel), rendered: isRendered });
      }
    }

    return {
      productId: this.productId,
      category: this.category,
      clipToBoundary: this.clipToBoundary,
      boundaryLoaded: !!this.boundaryGeoJson,
      totalPoints: this.allPoints.length,
      outsidePixelsRendered,
      outsideResults,
      insidePixelsRendered,
      insideResults,
      isStrictlyClipped: outsidePixelsRendered === 0
    };
  }

  /**
   * Complete teardown of canvas layers, event listeners, and timers.
   */
  destroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
    if (this.canvasLayer && this.map) {
      this.map.removeLayer(this.canvasLayer);
    }
    if (this.boundaryLayer && this.map) {
      this.map.removeLayer(this.boundaryLayer);
    }
  }
}

window.MosdacTestMap = MosdacTestMap;
