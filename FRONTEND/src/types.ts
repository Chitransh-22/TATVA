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
