// ============================================================================
// FORECASTS (SNOW1gv1 - Point Forecasts)
// ============================================================================

// Endpoint: GET /api/category/snow1g/version/1/geotype/point/lon/{lon}/lat/{lat}/data.json
export interface SmhiForecastResponse {
  approvedTime: string;
  referenceTime: string;
  geometry: {
    type: string;
    coordinates: number[][];
  };
  timeSeries: SmhiForecastTimeSeries[];
}

export interface SmhiForecastTimeSeries {
  time: string;
  intervalParametersStartTime?: string;
  data: SmhiForecastData;
}

export interface SmhiForecastData {
  air_temperature?: number;
  wind_speed?: number;
  wind_speed_of_gust?: number;
  wind_from_direction?: number;
  relative_humidity?: number;
  cloud_area_fraction?: number;
  precipitation_amount_mean?: number;
  probability_of_precipitation?: number;
  visibility_in_air?: number;
  air_pressure_at_mean_sea_level?: number;
  thunderstorm_probability?: number;
  symbol_code?: string;
  precipitation_frozen_part?: number;
  probability_of_frozen_precipitation?: number;
  cloud_base_altitude?: number;
  cloud_top_altitude?: number;
  low_type_cloud_area_fraction?: number;
  medium_type_cloud_area_fraction?: number;
  high_type_cloud_area_fraction?: number;
  predominant_precipitation_type_at_surface?: number;
}

export interface ForecastPoint {
  validTime: string;
  temperature?: number;
  windSpeed?: number;
  windGust?: number;
  windDirection?: number;
  humidity?: number;
  cloudCover?: number;
  precipitationMean?: number;
  precipitationProbability?: number;
  visibility?: number;
  pressure?: number;
  thunderProbability?: number;
  symbolCode?: string;
}

export interface ForecastResponse {
  approvedTime: string;
  referenceTime: string;
  latitude: number;
  longitude: number;
  timeSeries: ForecastPoint[];
}

// ============================================================================
// OBSERVATIONS (Meteorological & Hydrological)
// ============================================================================

export interface SmhiStationListResponse {
  key: string;
  updated: number;
  title: string;
  summary: string;
  link: SmhiLink[];
  station: SmhiStation[];
}

export interface SmhiStation {
  name: string;
  id: number;
  height: number;
  latitude: number;
  longitude: number;
  active: boolean;
  from: number;
  to: number;
  key?: string;
  owner?: string;
  ownerCategory?: string;
  measuringStations?: string;
}

export interface SmhiLink {
  type: string;
  href: string;
  rel?: string;
}

export interface SmhiObservationResponse {
  value: SmhiObservationValue[];
  updated: number;
  parameter: {
    key: string;
    name: string;
    summary: string;
    unit: string;
  };
  station: SmhiStation;
  period: {
    key: string;
    from: number;
    to: number;
    summary: string;
    sampling: string;
  };
  position: SmhiPosition[];
  link: SmhiLink[];
}

export interface SmhiObservationValue {
  date: number;
  value: string;
  quality: string;
}

export interface SmhiPosition {
  from: number;
  to: number;
  height: number;
  latitude: number;
  longitude: number;
}

export interface Observation {
  timestamp: string;
  value: number;
  quality: string;
}

export interface ObservationResponse {
  station: {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    height: number;
    active: boolean;
  };
  parameter: {
    name: string;
    unit: string;
  };
  period: {
    from: string;
    to: string;
    sampling: string;
  };
  observations: Observation[];
}

// ============================================================================
// HYDROLOGY OBSERVATIONS
// ============================================================================

export interface SmhiHydroStationListResponse {
  key: string;
  updated: number;
  title: string;
  summary: string;
  link: SmhiLink[];
  station: SmhiHydroStation[];
}

export interface SmhiHydroStation {
  name: string;
  id: number;
  latitude: number;
  longitude: number;
  active: boolean;
  from: number;
  to: number;
  key?: string;
  waterCourse?: string;
  riverBasin?: string;
  stationType?: string;
}

// ============================================================================
// WARNINGS (Impact-Based Warnings - IBW)
// ============================================================================

// Endpoint: GET /ibww/api/version/1/warning.json
export type SmhiWarningsResponse = SmhiWarningEvent[];

export interface SmhiWarningEvent {
  id: string;
  normalProbability: boolean;
  event: {
    sv: string;
    en: string;
    code?: string;
  };
  descriptions: SmhiWarningDescription[];
  warningAreas: SmhiWarningArea[];
}

export interface SmhiWarningArea {
  id: string;
  approximateStart: string;
  approximateEnd: string;
  published: string;
  areaName: {
    sv: string;
    en: string;
  };
  warningLevel: {
    sv: string;
    en: string;
    code: string;
  };
  eventDescription?: {
    sv: string;
    en: string;
  };
  affectedAreas: string[];
  descriptions: SmhiWarningDescription[];
  area?: {
    type: string;
    coordinates: number[][][];
  };
}

export interface SmhiWarningDescription {
  title: {
    sv: string;
    en: string;
  };
  text: {
    sv: string;
    en: string;
  };
}

export interface Warning {
  id: string;
  event: string;
  warningLevel: string;
  areaName: string;
  approximateStart: string;
  approximateEnd: string;
  published: string;
  description?: string;
  affectedAreas: string[];
}

export interface WarningsResponse {
  count: number;
  warnings: Warning[];
}

// ============================================================================
// WARNING DISTRICTS
// ============================================================================

export interface SmhiDistrictResponse {
  id: string;
  name: string;
  sortorder: number;
  parentid?: string;
}

export interface District {
  id: string;
  name: string;
  parentId?: string;
}

// ============================================================================
// RADAR
// ============================================================================

export interface SmhiRadarProductsResponse {
  key: string;
  updated: number;
  title: string;
  summary: string;
  link: SmhiLink[];
  product?: SmhiRadarProduct[];
  area?: SmhiRadarArea[];
}

export interface SmhiRadarProduct {
  key: string;
  updated: number;
  title: string;
  summary: string;
  link: SmhiLink[];
}

export interface SmhiRadarArea {
  key: string;
  updated: number;
  title: string;
  summary: string;
  link: SmhiLink[];
}

export interface SmhiRadarAreaResponse {
  key: string;
  updated: number;
  title: string;
  summary: string;
  link: SmhiLink[];
  firstFiles?: SmhiRadarFile[];
  lastFiles?: SmhiRadarFile[];
  years?: SmhiRadarYear[];
}

export interface SmhiRadarYear {
  key: string;
  updated: number;
  link: SmhiLink[];
}

export interface SmhiRadarFile {
  key: string;
  updated: number;
  valid: number;
  formats: SmhiRadarFileFormat[];
  link: SmhiLink[];
}

export interface SmhiRadarFileFormat {
  key: string;
  updated: number;
  link: string;
}

export interface RadarImage {
  product: string;
  area: string;
  format: string;
  validTime: string;
  updatedTime: string;
  imageUrl: string;
  boundingBox?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    crs: string;
  };
}

// ============================================================================
// LIGHTNING
// ============================================================================

// CSV columns: version, year, month, day, hours, minutes, seconds, nanoseconds, lat, lon, peakCurrent, ..., cloudIndicator (index 21)
export interface LightningStrike {
  timestamp: string;
  latitude: number;
  longitude: number;
  peakCurrent: number;
  cloudIndicator: number;
}

export interface LightningResponse {
  date: string;
  count: number;
  filterApplied?: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  };
  strikes: LightningStrike[];
}

// ============================================================================
// PARAMETER METADATA
// ============================================================================

export interface SmhiParameterResponse {
  key: string;
  updated: number;
  title: string;
  summary: string;
  valueType?: string;
  link: SmhiLink[];
  stationSet?: SmhiLink[];
}

export interface ForecastParameter {
  name: string;
  description: string;
  unit: string;
}

export interface ObservationParameter {
  id: number;
  name: string;
  description: string;
  unit: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const SMHI_API_BASES = {
  forecast: 'https://opendata-download-metfcst.smhi.se',
  metobs: 'https://opendata-download-metobs.smhi.se',
  hydroobs: 'https://opendata-download-hydroobs.smhi.se',
  warnings: 'https://opendata-download-warnings.smhi.se',
  radar: 'https://opendata-download-radar.smhi.se',
  lightning: 'https://opendata-download-lightning.smhi.se',
} as const;

// SNOW1g v1 API property names -> our output names
export const FORECAST_PARAMS: Record<string, { name: string; unit: string }> = {
  air_temperature: { name: 'temperature', unit: '°C' },
  wind_speed: { name: 'windSpeed', unit: 'm/s' },
  wind_speed_of_gust: { name: 'windGust', unit: 'm/s' },
  wind_from_direction: { name: 'windDirection', unit: '°' },
  relative_humidity: { name: 'humidity', unit: '%' },
  cloud_area_fraction: { name: 'cloudCover', unit: '%' },
  precipitation_amount_mean: { name: 'precipitationMean', unit: 'mm/h' },
  probability_of_precipitation: { name: 'precipitationProbability', unit: '%' },
  visibility_in_air: { name: 'visibility', unit: 'km' },
  air_pressure_at_mean_sea_level: { name: 'pressure', unit: 'hPa' },
  thunderstorm_probability: { name: 'thunderProbability', unit: '%' },
  symbol_code: { name: 'symbolCode', unit: '' },
};

export const MET_OBS_PARAMS: Record<number, { name: string; description: string; unit: string }> = {
  1: { name: 'temperature', description: 'Lufttemperatur momentanvärde', unit: '°C' },
  3: { name: 'wind_direction', description: 'Vindriktning momentanvärde', unit: '°' },
  4: { name: 'wind_speed', description: 'Vindhastighet momentanvärde', unit: 'm/s' },
  5: { name: 'precipitation', description: 'Nederbördsmängd', unit: 'mm' },
  6: { name: 'humidity', description: 'Relativ luftfuktighet momentanvärde', unit: '%' },
  9: { name: 'pressure', description: 'Lufttryck reducerat havsytans nivå', unit: 'hPa' },
  21: { name: 'wind_gust', description: 'Byvind', unit: 'm/s' },
};

export const HYDRO_OBS_PARAMS: Record<number, { name: string; description: string; unit: string }> = {
  1: { name: 'water_flow', description: 'Vattenföring (Dygn)', unit: 'm³/s' },
  3: { name: 'water_level', description: 'Vattenstånd', unit: 'cm' },
};
