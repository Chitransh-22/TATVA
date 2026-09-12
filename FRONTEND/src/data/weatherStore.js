function toEpochMs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  const ms = new Date(ts).getTime();
  return isNaN(ms) ? 0 : ms;
}

/**
 * High-performance, Map-based local weather store.
 *
 * Prevents unnecessary React re-renders and full Leaflet layer demolitions.
 * Stores records keyed by stable coordinate ID (`${lat.toFixed(2)}_${lon.toFixed(2)}`).
 * Out-of-order updates are rejected via ISO timestamp comparisons.
 *
 * Implements:
 * - 7-day rolling active window on frontend.
 * - Race condition resolution: newer WebSocket events are never overwritten by older REST snapshots.
 * - State/district filter changes do NOT destroy the underlying 7-day dataset.
 */
class WeatherStore {
  records = new Map();
  currentScope = {
    state: null,
    district: null,
  };
  lastSnapshotTime = null;
  changeListeners = new Set();
  summaryListeners = new Set();
  pruneInterval = null;

  constructor() {
    // Periodic check to prune records older than 7 days (7 * 24 * 3600 * 1000 ms)
    if (typeof window !== 'undefined') {
      this.pruneInterval = setInterval(() => {
        this.pruneExpiredRecords();
      }, 30000);
    }
  }

  /**
   * Generates a stable key for a coordinate point.
   */
  makeId(lat, lon) {
    return `${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;
  }

  /**
   * Initialize or update local data store from an HTTP snapshot.
   *
   * RACE CONDITION SAFE:
   * Does NOT overwrite existing records that received newer WebSocket updates
   * while the REST snapshot request was in flight.
   */
  loadSnapshot(scope, points, timestamp) {
    this.currentScope = { ...scope };
    const snapshotTime = timestamp || new Date().toISOString();
    this.lastSnapshotTime = snapshotTime;

    const changedIds = [];

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const id = pt.id || this.makeId(pt.latitude, pt.longitude);
      const incomingTime = pt.timestamp || pt.observation_time || snapshotTime;

      const existing = this.records.get(id);
      // If WebSocket already delivered a newer event for this point, do NOT overwrite with older snapshot!
      if (existing && existing.timestamp) {
        const existingMs = toEpochMs(existing.timestamp);
        const incomingMs = toEpochMs(incomingTime);
        if (existingMs > 0 && incomingMs > 0 && existingMs > incomingMs) {
          continue;
        }
      }

      this.records.set(id, {
        id,
        latitude: pt.latitude,
        longitude: pt.longitude,
        precipitation: pt.precipitation,
        liquid: pt.liquid ?? pt.precipitation,
        ice: pt.ice ?? 0.0,
        liquid_percent: pt.liquid_percent ?? 100.0,
        state: pt.state ?? existing?.state ?? null,
        district: pt.district ?? existing?.district ?? null,
        timestamp: incomingTime,
      });

      changedIds.push(id);
    }

    // Prune any records that crossed the 7-day boundary
    this.pruneExpiredRecords();

    this.notifyChange(changedIds, []);
  }

  /**
   * Apply an incremental WebSocket batch:
   * - Checks timestamps to reject stale / out-of-order updates.
   * - Adds new points.
   * - Updates existing points in place.
   * - Removes expired / dried-up points.
   */
  applyBatch(batch) {
    let added = 0;
    let updated = 0;
    let ignored = 0;
    let removed = 0;

    const changedIds = [];
    const removedIds = [];

    // 1. Normalize updates list (supports both batch format and single event format)
    let updateItems = batch.updates || [];
    if (!updateItems.length) {
      if (batch.data && typeof batch.data === 'object') {
        const d = { ...batch.data };
        if (batch.id && !d.id) d.id = batch.id;
        if (batch.timestamp && !d.timestamp) d.timestamp = batch.timestamp;
        updateItems = [d];
      } else if (batch.lat !== undefined || batch.latitude !== undefined) {
        updateItems = [batch];
      }
    }

    if (updateItems.length > 0 && batch.action !== 'remove') {
      for (let i = 0; i < updateItems.length; i++) {
        const u = updateItems[i];
        const uLat = u.lat !== undefined ? u.lat : u.latitude;
        const uLon = u.lon !== undefined ? u.lon : u.longitude;
        const id = u.id || this.makeId(uLat, uLon);
        const incomingTime = u.timestamp || batch.timestamp;

        const existing = this.records.get(id);
        if (existing) {
          // Stale / Out-of-order check (strict epoch millisecond comparison)
          if (existing.timestamp) {
            const existingMs = toEpochMs(existing.timestamp);
            const incomingMs = toEpochMs(incomingTime);
            if (existingMs > 0 && incomingMs > 0 && incomingMs < existingMs) {
              ignored++;
              continue;
            }
          }

          // In-place update
          existing.precipitation = u.value ?? u.precipitation ?? existing.precipitation;
          existing.liquid = u.liquid ?? existing.precipitation;
          existing.ice = u.ice ?? existing.ice;
          existing.liquid_percent = u.liquid_percent ?? existing.liquid_percent;
          if (u.state) existing.state = u.state;
          if (u.district) existing.district = u.district;
          existing.timestamp = incomingTime;

          updated++;
          changedIds.push(id);
        } else {
          // New record addition
          const pVal = u.value ?? u.precipitation ?? 0;
          this.records.set(id, {
            id,
            latitude: uLat,
            longitude: uLon,
            precipitation: pVal,
            liquid: u.liquid ?? pVal,
            ice: u.ice ?? 0,
            liquid_percent: u.liquid_percent ?? 100,
            state: u.state ?? null,
            district: u.district ?? null,
            timestamp: incomingTime,
          });

          added++;
          changedIds.push(id);
        }
      }
    }

    // 2. Process removals (explicit list or single removal event)
    const removalItems = [...(batch.removals || [])];
    if (batch.action === 'remove') {
      if (batch.id) removalItems.push(batch.id);
      if (Array.isArray(batch.ids)) removalItems.push(...batch.ids);
    }
    if (removalItems.length > 0) {
      for (let i = 0; i < removalItems.length; i++) {
        const rId = removalItems[i];
        if (this.records.has(rId)) {
          this.records.delete(rId);
          removed++;
          removedIds.push(rId);
        }
      }
    }

    // 3. Notify listeners if any records changed or were removed
    if (changedIds.length > 0 || removedIds.length > 0) {
      this.notifyChange(changedIds, removedIds);
    }

    // 4. Update summary metrics if provided in batch
    if (batch.summary) {
      this.notifySummary(batch.summary);
    }

    return { added, updated, ignored, removed };
  }

  /**
   * Explicit removal of specific point IDs.
   */
  removeIds(ids) {
    const actuallyRemoved = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (this.records.delete(id)) {
        actuallyRemoved.push(id);
      }
    }
    if (actuallyRemoved.length > 0) {
      this.notifyChange([], actuallyRemoved);
    }
  }

  /**
   * Rolling 7-day client-side pruning.
   * Removes any records whose observation timestamp is older than 7 days (7 * 24 * 3600 * 1000 ms).
   */
  pruneExpiredRecords(maxAgeMs = 7 * 24 * 3600 * 1000) {
    const now = Date.now();
    const removedIds = [];

    for (const [id, rec] of this.records.entries()) {
      if (rec.timestamp) {
        const recTime = new Date(rec.timestamp).getTime();
        if (!isNaN(recTime) && (now - recTime) > maxAgeMs) {
          this.records.delete(id);
          removedIds.push(id);
        }
      }
    }

    if (removedIds.length > 0) {
      console.log(`🧹 [WeatherStore] Pruned ${removedIds.length} observations older than 7-day rolling window.`);
      this.notifyChange([], removedIds);
    }

    return removedIds;
  }

  /**
   * Update scope filter without deleting records from the underlying 7-day dataset.
   * State and district filtering only determines presentation, not data destruction.
   */
  setScope(newScope) {
    this.currentScope = { ...newScope };
    this.notifyChange([], []);
  }

  /**
   * Reset active filter scope (replaces legacy clearScope).
   * Preserves underlying 7-day points in the map cache.
   */
  clearScope(newScope) {
    this.currentScope = { ...newScope };
    this.notifyChange([], []);
  }

  /**
   * Hard reset store (e.g. for complete manual app refresh).
   */
  resetStore() {
    const oldIds = Array.from(this.records.keys());
    this.records.clear();
    this.notifyChange([], oldIds);
  }

  /**
   * Get all active records matching the current scope or all records.
   */
  getRecords(filterByScope = false) {
    const all = Array.from(this.records.values());
    if (!filterByScope) return all;

    const { state, district } = this.currentScope;
    if (district) {
      return all.filter((r) => r.district && r.district.toLowerCase() === district.toLowerCase());
    }
    if (state) {
      return all.filter((r) => r.state && r.state.toLowerCase() === state.toLowerCase());
    }
    return all;
  }

  /**
   * Get direct Map reference for zero-copy read access.
   */
  getRecordsMap() {
    return this.records;
  }

  /**
   * Total count of active points in store.
   */
  get count() {
    return this.records.size;
  }

  /**
   * Subscribe to point-level changes (canvas redraw / marker updates).
   */
  subscribe(listener) {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Subscribe to live summary metric updates (Average Rainfall, Peak Intensity tiles).
   */
  subscribeSummary(listener) {
    this.summaryListeners.add(listener);
    return () => {
      this.summaryListeners.delete(listener);
    };
  }

  notifyChange(changedIds, removedIds) {
    const evt = {
      scope: this.currentScope,
      changedIds,
      removedIds,
      totalPoints: this.records.size,
    };
    this.changeListeners.forEach((fn) => fn(evt));
  }

  notifySummary(summary) {
    this.summaryListeners.forEach((fn) => fn(summary));
  }
}

// Global singleton instance for the app session
export const weatherStore = new WeatherStore();
