export interface WeatherMetadata {
  status: string;
  is_live: boolean;
  latest_observation_time: string | null;
  latest_observation_ist: string;
  latest_granule_id: string;
  granule_point_count: number;
  total_observations_recorded: number;
  pipeline_status: string;
  available_timestamps: Array<{
    observation_time: string;
    observation_ist: string;
    granule_id: string;
    point_count: number;
  }>;
}

export interface NationalSummary {
  avg_precipitation: number;
  max_precipitation: number;
  min_precipitation: number;
  total_points: number;
  rain_category: string;
  granule_id: string;
}

export interface StateSummary {
  state_name: string;
  avg_precipitation: number;
  max_precipitation: number;
  min_precipitation: number;
  total_points: number;
  rain_category: string;
  bbox: [number, number, number, number]; // [min_lat, min_lon, max_lat, max_lon]
  center: [number, number]; // [lat, lon]
}

export interface DistrictSummary {
  district_name: string;
  avg_precipitation: number;
  max_precipitation: number;
  min_precipitation: number;
  total_points: number;
  rain_category: string;
  bbox: [number, number, number, number];
  center: [number, number];
}

export interface ObservationPoint {
  latitude: number;
  longitude: number;
  precipitation: number;
  liquid: number;
  ice: number;
  liquid_percent: number;
}

export interface IndiaOverviewResponse {
  status: string;
  observation_time: string;
  observation_ist: string;
  granule_id: string;
  national_summary: NationalSummary;
  state_summaries: StateSummary[];
  grid_points: Array<[number, number, number]>; // [lat, lon, precip]
  grid_step: number;
}

export interface StateDetailResponse {
  status: string;
  state_name: string;
  observation_time: string;
  observation_ist: string;
  bbox: [number, number, number, number];
  center: [number, number];
  state_summary: {
    avg_precipitation: number;
    max_precipitation: number;
    min_precipitation: number;
    total_points: number;
    rain_category: string;
  };
  district_summaries: DistrictSummary[];
  observations: ObservationPoint[];
}

export interface DistrictDetailResponse {
  status: string;
  state_name: string;
  district_name: string;
  observation_time: string;
  observation_ist: string;
  bbox: [number, number, number, number];
  center: [number, number];
  district_summary: {
    avg_precipitation: number;
    max_precipitation: number;
    min_precipitation: number;
    total_points: number;
    rain_category: string;
  };
  observations: ObservationPoint[];
  anomalies: Array<{
    time: string;
    latitude: number;
    longitude: number;
    precipitation: number;
    type: string;
    description: string;
  }>;
}

export interface HistoricalTimelinePoint {
  observation_time: string;
  observation_ist: string;
  avg_precipitation: number;
  max_precipitation: number;
  min_precipitation: number;
  total_points: number;
}

export interface HistoricalSeriesResponse {
  status: string;
  region: string;
  count: number;
  timeline: HistoricalTimelinePoint[];
}

export interface StateWeatherData {
  id: string;
  name: string;
  code: string;
  rainfall: number; // mm/hr
  category: 'Normal' | 'Moderate' | 'Heavy' | 'Very Heavy' | 'Torrential Downpour';
  color: string;
  alertLevel: 'green' | 'yellow' | 'orange' | 'red';
  humidity: number;
  windSpeed: number; // km/h
  temperature: number; // °C
  stationCount: number;
  svgPath: string;
  center: [number, number]; // [x, y] on SVG viewBox
}

export interface NationalMetrics {
  averageRainfall: number;
  peakIntensity: number;
  peakState: string;
  totalObservations: number;
  dominantCategory: string;
  timestamp: string;
}

export interface ProcessStep {
  stepNumber: number;
  totalSteps: number;
  title: string;
  description: string;
  image: string;
  tags: { label: string; icon: string }[];
}

export type BasemapOption = 'carto' | 'dark' | 'osm';

// =============================================================================
// WebSocket Incremental Real-Time Architecture Types
// =============================================================================

export interface WebSocketSubscriptionAction {
  action: 'subscribe' | 'ping' | 'unsubscribe';
  state?: string | null;
  district?: string | null;
  parameter?: string;
  bounds?: { north: number; south: number; east: number; west: number };
  zoom?: number;
}

export interface IncrementalWeatherPoint {
  id: string; // Coordinate hash e.g. "23.05_72.55"
  lat: number;
  lon: number;
  value: number; // Precipitation mm/hr
  precipitation?: number;
  liquid?: number;
  ice?: number;
  liquid_percent?: number;
  timestamp: string;
}

export interface WebSocketBatchMessage {
  type: 'weather_batch' | 'weather_update';
  version?: number;
  timestamp: string;
  timestamp_ist?: string;
  granule_id?: string;
  state?: string | null;
  district?: string | null;
  updates_count?: number;
  updates: IncrementalWeatherPoint[];
  removals?: string[]; // Point IDs to remove/expire
  summary?: {
    avg_precipitation: number;
    max_precipitation: number;
    min_precipitation: number;
    total_points: number;
    rain_category: string;
  };
}

export interface WebSocketRemoveMessage {
  type: 'weather_remove';
  timestamp: string;
  ids: string[];
  state?: string | null;
  district?: string | null;
}

export interface WebSocketSubscribedMessage {
  type: 'subscribed';
  subscription: {
    state: string | null;
    district: string | null;
    parameter: string;
  };
  timestamp: string;
}

export interface WebSocketConnectedMessage {
  type: 'connected';
  client_id: string;
  timestamp: string;
  message: string;
}

export interface WebSocketPongMessage {
  type: 'pong';
  timestamp: string;
}

export type WebSocketMessage =
  | WebSocketBatchMessage
  | WebSocketRemoveMessage
  | WebSocketSubscribedMessage
  | WebSocketConnectedMessage
  | WebSocketPongMessage;
