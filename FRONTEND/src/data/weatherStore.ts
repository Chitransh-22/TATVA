import type {
  IncrementalWeatherPoint,
  WebSocketBatchMessage,
} from '../types';

export interface WeatherRecord {
  id: string;
  latitude: number;
  longitude: number;
  precipitation: number;
  liquid: number;
  ice: number;
  liquid_percent: number;
  timestamp: string;
}

export type StoreChangeListener = (event: {
  scope: { state: string | null; district: string | null };
  changedIds: string[];
  removedIds: string[];
  totalPoints: number;
}) => void;

export type SummaryChangeListener = (summary: {
  avg_precipitation: number;
  max_precipitation: number;
  min_precipitation: number;
  total_points: number;
  rain_category: string;
}) => void;

/**
 * High-performance, Map-based local weather store.
 *
 * Prevents unnecessary React re-renders and full Leaflet layer demolitions.
 * Stores records keyed by stable coordinate ID (`${lat.toFixed(2)}_${lon.toFixed(2)}`).
 * Out-of-order updates are rejected via ISO timestamp comparisons.
 */
class WeatherStore {
  private records: Map<string, WeatherRecord> = new Map();
  private currentScope: { state: string | null; district: string | null } = {
    state: null,
    district: null,
  };
  private lastSnapshotTime: string | null = null;
  private changeListeners: Set<StoreChangeListener> = new Set();
  private summaryListeners: Set<SummaryChangeListener> = new Set();

  /**
   * Generates a stable key for a coordinate point.
   */
  public makeId(lat: number, lon: number): string {
    return `${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;
  }

  /**
   * Initialize or replace current data store from an HTTP snapshot.
   */
  public loadSnapshot(
    scope: { state: string | null; district: string | null },
    points: Array<{
      latitude: number;
      longitude: number;
      precipitation: number;
      liquid?: number;
      ice?: number;
      liquid_percent?: number;
    }>,
    timestamp?: string
  ): void {
    this.currentScope = { ...scope };
    this.lastSnapshotTime = timestamp || new Date().toISOString();
    this.records.clear();

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const id = this.makeId(pt.latitude, pt.longitude);
      this.records.set(id, {
        id,
        latitude: pt.latitude,
        longitude: pt.longitude,
        precipitation: pt.precipitation,
        liquid: pt.liquid ?? pt.precipitation,
        ice: pt.ice ?? 0.0,
        liquid_percent: pt.liquid_percent ?? 100.0,
        timestamp: this.lastSnapshotTime,
      });
    }

    this.notifyChange(Array.from(this.records.keys()), []);
  }

  /**
   * Apply an incremental WebSocket batch:
   * - Checks timestamps to reject stale / out-of-order updates.
   * - Adds new points.
   * - Updates existing points in place.
   * - Removes expired / dried-up points.
   */
  public applyBatch(batch: WebSocketBatchMessage): {
    added: number;
    updated: number;
    ignored: number;
    removed: number;
  } {
    let added = 0;
    let updated = 0;
    let ignored = 0;
    let removed = 0;

    const changedIds: string[] = [];
    const removedIds: string[] = [];

    // 1. Process updates
    if (batch.updates && batch.updates.length > 0) {
      for (let i = 0; i < batch.updates.length; i++) {
        const u: IncrementalWeatherPoint = batch.updates[i];
        const id = u.id || this.makeId(u.lat, u.lon);
        const incomingTime = u.timestamp || batch.timestamp;

        const existing = this.records.get(id);
        if (existing) {
          // Stale / Out-of-order check
          if (existing.timestamp && incomingTime < existing.timestamp) {
            ignored++;
            continue;
          }

          // In-place update
          existing.precipitation = u.value ?? u.precipitation ?? existing.precipitation;
          existing.liquid = u.liquid ?? existing.precipitation;
          existing.ice = u.ice ?? existing.ice;
          existing.liquid_percent = u.liquid_percent ?? existing.liquid_percent;
          existing.timestamp = incomingTime;

          updated++;
          changedIds.push(id);
        } else {
          // New record addition
          const pVal = u.value ?? u.precipitation ?? 0;
          this.records.set(id, {
            id,
            latitude: u.lat,
            longitude: u.lon,
            precipitation: pVal,
            liquid: u.liquid ?? pVal,
            ice: u.ice ?? 0,
            liquid_percent: u.liquid_percent ?? 100,
            timestamp: incomingTime,
          });

          added++;
          changedIds.push(id);
        }
      }
    }

    // 2. Process removals (stale / dried up points)
    if (batch.removals && batch.removals.length > 0) {
      for (let i = 0; i < batch.removals.length; i++) {
        const rId = batch.removals[i];
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
  public removeIds(ids: string[]): void {
    const actuallyRemoved: string[] = [];
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
   * Clear all records when switching to a different state or district.
   */
  public clearScope(newScope: { state: string | null; district: string | null }): void {
    this.currentScope = { ...newScope };
    const oldIds = Array.from(this.records.keys());
    this.records.clear();
    this.notifyChange([], oldIds);
  }

  /**
   * Get all active records as an array for rendering (e.g. CanvasWeatherLayer).
   */
  public getRecords(): WeatherRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Get direct Map reference for zero-copy read access.
   */
  public getRecordsMap(): Map<string, WeatherRecord> {
    return this.records;
  }

  /**
   * Total count of active points in store.
   */
  public get count(): number {
    return this.records.size;
  }

  /**
   * Subscribe to point-level changes (canvas redraw / marker updates).
   */
  public subscribe(listener: StoreChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Subscribe to live summary metric updates (Average Rainfall, Peak Intensity tiles).
   */
  public subscribeSummary(listener: SummaryChangeListener): () => void {
    this.summaryListeners.add(listener);
    return () => {
      this.summaryListeners.delete(listener);
    };
  }

  private notifyChange(changedIds: string[], removedIds: string[]): void {
    const evt = {
      scope: this.currentScope,
      changedIds,
      removedIds,
      totalPoints: this.records.size,
    };
    this.changeListeners.forEach((fn) => fn(evt));
  }

  private notifySummary(summary: {
    avg_precipitation: number;
    max_precipitation: number;
    min_precipitation: number;
    total_points: number;
    rain_category: string;
  }): void {
    this.summaryListeners.forEach((fn) => fn(summary));
  }
}

// Global singleton instance for the app session
export const weatherStore = new WeatherStore();
