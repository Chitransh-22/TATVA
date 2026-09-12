/**
 * Shared Test Harness for Standalone MOSDAC Weather/Environment/Ocean Test Maps.
 * Handles Leaflet setup, Survey of India boundary clipping, fluid canvas rendering,
 * live WebSocket connection with sync counter, and interactive inspectors.
 */

class MosdacTestMap {
  constructor(config) {
    this.productId = config.productId;
    this.productName = config.productName || config.productId;
    this.category = config.category || 'weather';
    this.unit = config.unit || '';
    this.colorScale = config.colorScale || [];
    this.renderType = config.renderType || 'fluid_raster';
    this.defaultMinThreshold = config.defaultMinThreshold !== undefined ? config.defaultMinThreshold : -999.0;
    this.boundaryPath = config.boundaryPath || '../india_boundary.geojson';
    this.localDataVar = config.localDataVar || null;

    this.allPoints = [];
    this.layerOpacity = 0.85;
    this.minThreshold = this.defaultMinThreshold;
    this.syncedPointsCount = 0;
    this.map = null;
    this.canvasLayer = null;
    this.ws = null;
    this.heartbeatTimer = null;

    this.initMap();
    this.loadBoundary();
    this.initCanvasLayer();
    this.initWebSocket();
    this.loadInitialData();
  }

  initMap() {
    this.map = L.map('map', {
      center: [22.8, 82.5],
      zoom: 5,
      minZoom: 4,
      maxZoom: 12,
      zoomControl: true,
      preferCanvas: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO &copy; OpenStreetMap | &copy; ISRO MOSDAC INSAT-3DS',
      maxZoom: 19
    }).addTo(this.map);

    // Setup interactive inspector on click
    this.map.on('click', (e) => this.handleMapClick(e));
  }

  loadBoundary() {
    if (window.INDIA_BOUNDARY) {
      this.renderBoundary(window.INDIA_BOUNDARY);
      return;
    }

    // Try relative paths for boundary file
    const paths = [this.boundaryPath, '../india_boundary.geojson', '../../india_boundary.geojson', 'india_boundary.geojson'];
    const tryNext = (idx) => {
      if (idx >= paths.length) return;
      fetch(paths[idx])
        .then(res => {
          if (!res.ok) throw new Error('not ok');
          return res.json();
        })
        .then(data => this.renderBoundary(data))
        .catch(() => tryNext(idx + 1));
    };
    tryNext(0);
  }

  renderBoundary(geoData) {
    L.geoJSON(geoData, {
      style: {
        color: '#1e3a8a',
        weight: 2,
        opacity: 0.85,
        fillColor: '#0284c7',
        fillOpacity: 0.02
      }
    }).addTo(this.map);
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
        this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated');
        map.getPanes().overlayPane.appendChild(this._canvas);
        map.on('moveend', this._reset, this);
        map.on('zoomend', this._reset, this);
        this._reset();
      },
      onRemove: function(map) {
        map.getPanes().overlayPane.removeChild(this._canvas);
        map.off('moveend', this._reset, this);
        map.off('zoomend', this._reset, this);
      },
      _reset: function() {
        const bounds = this._map.getBounds();
        const topLeft = this._map.latLngToLayerPoint(bounds.getNorthWest());
        const size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        L.DomUtil.setPosition(this._canvas, topLeft);
        this._draw();
      },
      _draw: function() {
        if (!self.allPoints || self.allPoints.length === 0) return;
        const ctx = this._canvas.getContext('2d');
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        ctx.globalAlpha = self.layerOpacity;

        const zoom = this._map.getZoom();
        const radius = Math.max(2, Math.min(22, Math.pow(2, zoom - 5) * 3.2));
        const bounds = this._map.getBounds();

        for (let i = 0; i < self.allPoints.length; i++) {
          const pt = self.allPoints[i];
          const lat = pt[0];
          const lon = pt[1];
          const val = pt[2];

          if (val < self.minThreshold) continue;

          const latLng = L.latLng(lat, lon);
          if (!bounds.contains(latLng)) continue;

          const p = this._map.latLngToContainerPoint(latLng);
          ctx.fillStyle = self.getColor(val);
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    this.canvasLayer = new CanvasOverlay();
    this.canvasLayer.addTo(this.map);
  }

  async loadInitialData() {
    // 1. Try Live Backend API
    const liveApiUrl = `http://127.0.0.1:8000/api/weather/mosdac/products/${this.productId}/points?limit=60000`;
    try {
      const res = await fetch(liveApiUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        if (data.points && data.points.length > 0) {
          this.handleDataLoaded(data, 'LIVE BACKEND API');
          return;
        }
      }
    } catch (e) {
      // Backend offline
    }

    // 2. Check bundled window data object if provided
    if (this.localDataVar && window[this.localDataVar]) {
      this.handleDataLoaded(window[this.localDataVar], 'BUNDLED LOCAL DATASET');
      return;
    }

    // 3. Try local snapshot json file
    try {
      const snapshotRes = await fetch(`${this.productId}_latest.json`);
      if (snapshotRes.ok) {
        const data = await snapshotRes.json();
        this.handleDataLoaded(data, 'LOCAL SNAPSHOT');
        return;
      }
    } catch (e) {
      // No local snapshot
    }

    this.updateStatusText(`Awaiting live WebSocket feed for ${this.productId}...`);
  }

  handleDataLoaded(data, sourceLabel) {
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

    const metaEl = document.getElementById('granuleMeta');
    if (metaEl && summary.granule_id) {
      metaEl.innerHTML = `Granule: <b>${summary.granule_id}</b> &bull; Obs: <b>${summary.observation_time_ist || summary.observation_time_utc}</b>`;
    }

    this.updateStatusText(`Loaded ${this.allPoints.length.toLocaleString()} points from ${sourceLabel}`);
    if (this.canvasLayer) this.canvasLayer._reset();
  }

  initWebSocket() {
    const wsUrl = 'ws://127.0.0.1:8000/api/weather/ws';
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[WS] Connected to live weather stream for ${this.productId}`);
        this.updateBadge(true);
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
    if (msg.product && msg.product !== this.productId && this.productId !== '3SIMG_L2B_HEM') {
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

  updateOpacity(val) {
    this.layerOpacity = val / 100.0;
    if (this.canvasLayer) this.canvasLayer._draw();
  }

  refresh() {
    this.updateStatusText('Refreshing observation data from backend...');
    this.loadInitialData();
  }
}

window.MosdacTestMap = MosdacTestMap;
