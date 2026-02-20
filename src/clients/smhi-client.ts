import { createHttpClient } from '@/lib/http-client';
import { NotFoundError, UpstreamApiError } from '@/lib/errors';
import {
  SMHI_API_BASES,
  FORECAST_PARAMS,
  MET_OBS_PARAMS,
  HYDRO_OBS_PARAMS,
  type SmhiForecastResponse,
  type SmhiStationListResponse,
  type SmhiObservationResponse,
  type SmhiHydroStationListResponse,
  type SmhiWarningsResponse,
  type SmhiRadarProductsResponse,
  type SmhiRadarAreaResponse,
  type SmhiDistrictResponse,
  type ForecastResponse,
  type ForecastPoint,
  type ObservationResponse,
  type Observation,
  type WarningsResponse,
  type Warning,
  type RadarImage,
  type LightningStrike,
  type LightningResponse,
  type District,
  type ForecastParameter,
  type ObservationParameter,
} from '@/types/smhi-api';

const forecastClient = createHttpClient({ baseUrl: SMHI_API_BASES.forecast, timeout: 30000 });
const metobsClient = createHttpClient({ baseUrl: SMHI_API_BASES.metobs, timeout: 30000 });
const hydroobsClient = createHttpClient({ baseUrl: SMHI_API_BASES.hydroobs, timeout: 30000 });
const warningsClient = createHttpClient({ baseUrl: SMHI_API_BASES.warnings, timeout: 30000 });
const radarClient = createHttpClient({ baseUrl: SMHI_API_BASES.radar, timeout: 30000 });
const lightningClient = createHttpClient({ baseUrl: SMHI_API_BASES.lightning, timeout: 30000 });

function transformForecastTimeSeries(timeSeries: SmhiForecastResponse['timeSeries']): ForecastPoint[] {
  return timeSeries.map((ts) => {
    const point: Record<string, string | number | undefined> = { validTime: ts.time };

    if (ts.data) {
      for (const [apiName, value] of Object.entries(ts.data)) {
        const mapping = FORECAST_PARAMS[apiName];
        if (mapping && value !== undefined) {
          point[mapping.name] = value;
        }
      }
    }

    return point as unknown as ForecastPoint;
  });
}

function transformObservations(values: SmhiObservationResponse['value']): Observation[] {
  return values.map((v) => ({
    timestamp: new Date(v.date).toISOString(),
    value: parseFloat(v.value),
    quality: v.quality,
  }));
}

// corrected-archive CSV formats:
// - Meteorological hourly: "Datum;Tid (UTC);Value;Quality"
// - Precipitation daily: "Från Datum Tid;Till Datum Tid;Representativt dygn;Value;Quality"
// - Hydrological: "Datum (svensk sommartid);Value;Quality"
function parseCorrectedArchiveCsv(csv: string): {
  observations: Observation[];
  station: { name: string; id: number };
  parameter: { name: string; unit: string };
  period: { from: string; to: string };
} {
  const lines = csv.split('\n');
  const observations: Observation[] = [];

  // Parse header info
  let stationName = '';
  let stationId = 0;
  let parameterName = '';
  let unit = '';
  let periodFrom = '';
  let periodTo = '';
  let dataFormat: 'hourly' | 'daily-precip' | 'hydro' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Station info line: "Uppsala Aut;97510;SMHIs stationsnät;2.0" or "MÄLAREN;20040;SMHIs stationsnät;..."
    // Must check that line starts with station name (not a date) to avoid matching data row comments
    if (
      (trimmed.includes('SMHIs stationsnät') || trimmed.includes('Övriga stationer')) &&
      !trimmed.startsWith('Datum') &&
      !trimmed.startsWith('Från') &&
      !/^\d{4}-\d{2}-\d{2}/.test(trimmed)
    ) {
      const parts = trimmed.split(';');
      if (parts.length >= 2) {
        stationName = parts[0];
        // StationsId or Stationsnummer in column 2
        stationId = parseInt(parts[1]) || 0;
      }
      continue;
    }

    // Parameter line - various formats:
    // "Lufttemperatur;momentanvärde, 1 gång/tim;celsius"
    // "Nederbördsmängd;summa 1 dygn, 1 gång/dygn, kl 06;millimeter"
    // "Vindhastighet;medelvärde 10 min, 1 gång/tim;meter per sekund"
    // "Vattenföring (Dygn);m³/s" (only 2 fields for hydro)
    // Check starts with "Parameternamn" header OR is a data line with unit in position 2/3
    if (trimmed.startsWith('Parameternamn;')) {
      continue;
    }
    const parts = trimmed.split(';');
    // Parameter line has 2-3 fields, doesn't start with date/time patterns, and isn't a header
    if (
      parts.length >= 2 &&
      parts.length <= 4 &&
      !trimmed.startsWith('Tidsperiod') &&
      !trimmed.startsWith('Datum') &&
      !trimmed.startsWith('Från') &&
      !trimmed.startsWith('Stationsnamn') &&
      !/^\d{4}-\d{2}-\d{2}/.test(trimmed)
    ) {
      const unitField = parts[parts.length - 1]?.toLowerCase() || '';
      const unitPatterns = [
        'celsius',
        'm/s',
        'procent',
        'hpa',
        'grader',
        'millimeter',
        'm³/s',
        'meter per sekund',
        'sekund',
        'cm',
      ];
      if (unitPatterns.some((u) => unitField.includes(u))) {
        parameterName = parts[0];
        unit = parts[parts.length >= 3 ? 2 : 1] || '';
        continue;
      }
    }

    // Period info from comment lines: "Tidsperiod (fr.o.m.) = 1985-06-01 00:00:00 (UTC)"
    const periodMatch = trimmed.match(/Tidsperiod \(fr\.o\.m\.\) = (\d{4}-\d{2}-\d{2})/);
    if (periodMatch && !periodFrom) {
      periodFrom = periodMatch[1] + ' 00:00:00';
    }
    const periodToMatch = trimmed.match(/Tidsperiod \(t\.o\.m\.\) = (\d{4}-\d{2}-\d{2})/);
    if (periodToMatch) {
      periodTo = periodToMatch[1] + ' 23:59:59';
    }

    if (trimmed.startsWith('Datum;Tid (UTC)')) {
      dataFormat = 'hourly';
      continue;
    }
    if (trimmed.startsWith('Från Datum Tid')) {
      dataFormat = 'daily-precip';
      continue;
    }
    if (trimmed.startsWith('Datum (svensk sommartid)')) {
      dataFormat = 'hydro';
      continue;
    }

    if (dataFormat && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const parts = trimmed.split(';');

      if (dataFormat === 'hourly' && parts.length >= 4) {
        // Format: "1985-06-01;00:00:00;6.5;G;;"
        const date = parts[0];
        const time = parts[1];
        const value = parseFloat(parts[2]);
        const quality = parts[3];

        if (!isNaN(value)) {
          observations.push({
            timestamp: new Date(`${date}T${time}Z`).toISOString(),
            value,
            quality,
          });
        }
      } else if (dataFormat === 'daily-precip' && parts.length >= 5) {
        // Format: "1945-01-01 07:00:01;1945-01-02 07:00:00;1945-01-01;2.4;G;;"
        // Use "Representativt dygn" (column 3) as the date
        const date = parts[2];
        const value = parseFloat(parts[3]);
        const quality = parts[4];

        if (!isNaN(value) && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
          observations.push({
            timestamp: new Date(`${date}T12:00:00Z`).toISOString(), // Use noon for daily values
            value,
            quality,
          });
        }
      } else if (dataFormat === 'hydro' && parts.length >= 3) {
        // Format: "1901-01-01;248;G;;;"
        const date = parts[0];
        const value = parseFloat(parts[1]);
        const quality = parts[2];

        if (!isNaN(value)) {
          observations.push({
            timestamp: new Date(`${date}T12:00:00Z`).toISOString(), // Use noon for daily values
            value,
            quality,
          });
        }
      }
    }
  }

  return {
    observations,
    station: { name: stationName, id: stationId },
    parameter: { name: parameterName, unit },
    period: { from: periodFrom, to: periodTo },
  };
}

function transformWarnings(events: SmhiWarningsResponse): Warning[] {
  const warnings: Warning[] = [];

  for (const event of events) {
    for (const area of event.warningAreas) {
      const descriptionPart = area.descriptions.find((d) => d.title.en === 'INCIDENT' || d.title.sv === 'INCIDENT');

      warnings.push({
        id: area.id,
        event: event.event.en || event.event.sv,
        warningLevel: area.warningLevel.en || area.warningLevel.sv,
        areaName: area.areaName.en || area.areaName.sv,
        approximateStart: area.approximateStart,
        approximateEnd: area.approximateEnd,
        published: area.published,
        description: descriptionPart?.text.en || descriptionPart?.text.sv,
        affectedAreas: area.affectedAreas,
      });
    }
  }

  return warnings;
}

function parseLightningCsv(csv: string): LightningStrike[] {
  const lines = csv.trim().split('\n');
  const strikes: LightningStrike[] = [];

  for (const line of lines) {
    if (!line.trim() || line.startsWith('version')) continue;

    const parts = line.split(';');
    if (parts.length < 22) continue;

    const [_version, year, month, day, hour, min, sec, _nanoseconds, lat, lon, peakCurrent] = parts;

    strikes.push({
      timestamp: new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(min),
        parseInt(sec),
      ).toISOString(),
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      peakCurrent: parseFloat(peakCurrent),
      cloudIndicator: parseInt(parts[21]),
    });
  }

  return strikes;
}

// Haversine formula
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestStation<T extends { latitude: number; longitude: number }>(
  stations: T[],
  lat: number,
  lon: number,
): T | null {
  if (stations.length === 0) return null;

  let nearest = stations[0];
  let minDist = haversineDistance(lat, lon, nearest.latitude, nearest.longitude);

  for (const station of stations.slice(1)) {
    const dist = haversineDistance(lat, lon, station.latitude, station.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = station;
    }
  }

  return nearest;
}

export const smhiClient = {
  // ============================================================================
  // FORECASTS
  // ============================================================================

  // Uses SNOW1gv1 API (current, not deprecated PMP3gv2)
  async getForecast(latitude: number, longitude: number, parameters?: string[]): Promise<ForecastResponse> {
    const response = await forecastClient.request<SmhiForecastResponse>(
      `/api/category/snow1g/version/1/geotype/point/lon/${longitude.toFixed(6)}/lat/${latitude.toFixed(6)}/data.json`,
    );

    let timeSeries = transformForecastTimeSeries(response.timeSeries);

    if (parameters && parameters.length > 0) {
      const paramSet = new Set(parameters);
      timeSeries = timeSeries.map((point) => {
        const filtered: Record<string, string | number | undefined> = { validTime: point.validTime };
        for (const [key, value] of Object.entries(point)) {
          if (key === 'validTime' || paramSet.has(key)) {
            filtered[key] = value;
          }
        }
        return filtered as unknown as ForecastPoint;
      });
    }

    return {
      approvedTime: response.approvedTime,
      referenceTime: response.referenceTime,
      latitude,
      longitude,
      timeSeries,
    };
  },

  async getForecastParameters(): Promise<ForecastParameter[]> {
    return Object.entries(FORECAST_PARAMS).map(([key, info]) => ({
      name: info.name,
      description: `Parameter code: ${key}`,
      unit: info.unit,
    }));
  },

  // ============================================================================
  // OBSERVATIONS (Unified API for both meteorological and hydrological)
  // ============================================================================

  async getObservation(
    dataType: 'meteorological' | 'hydrological',
    stationId: number,
    parameter: string,
    period: string,
  ): Promise<ObservationResponse | null> {
    const paramMap = dataType === 'meteorological' ? MET_OBS_PARAMS : HYDRO_OBS_PARAMS;
    const client = dataType === 'meteorological' ? metobsClient : hydroobsClient;

    const paramEntry = Object.entries(paramMap).find(([, info]) => info.name === parameter);
    if (!paramEntry) return null;

    const paramId = paramEntry[0];

    try {
      if (period === 'corrected-archive') {
        const csv = await client.request<string>(
          `/api/version/1.0/parameter/${paramId}/station/${stationId}/period/${period}/data.csv`,
          { responseType: 'text' },
        );

        const parsed = parseCorrectedArchiveCsv(csv);

        return {
          station: {
            id: parsed.station.id || stationId,
            name: parsed.station.name,
            latitude: 0, // Not available in CSV format
            longitude: 0, // Not available in CSV format
            height: 0,
            active: true,
          },
          parameter: {
            name: parsed.parameter.name || parameter,
            unit: parsed.parameter.unit,
          },
          period: {
            from: parsed.period.from ? new Date(parsed.period.from).toISOString() : '',
            to: parsed.period.to ? new Date(parsed.period.to).toISOString() : '',
            sampling: 'historical',
          },
          observations: parsed.observations,
        };
      }

      const response = await client.request<SmhiObservationResponse>(
        `/api/version/1.0/parameter/${paramId}/station/${stationId}/period/${period}/data.json`,
      );

      return {
        station: {
          id: response.station.id,
          name: response.station.name,
          latitude: response.station.latitude,
          longitude: response.station.longitude,
          height: response.station.height || 0,
          active: response.station.active,
        },
        parameter: {
          name: response.parameter.name,
          unit: response.parameter.unit,
        },
        period: {
          from: new Date(response.period.from).toISOString(),
          to: new Date(response.period.to).toISOString(),
          sampling: response.period.sampling,
        },
        observations: transformObservations(response.value),
      };
    } catch (error) {
      if (error instanceof UpstreamApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  },

  async findNearestObservationStation(
    dataType: 'meteorological' | 'hydrological',
    latitude: number,
    longitude: number,
    parameter: string,
  ): Promise<{ id: number; name: string; latitude: number; longitude: number } | null> {
    const paramMap = dataType === 'meteorological' ? MET_OBS_PARAMS : HYDRO_OBS_PARAMS;
    const client = dataType === 'meteorological' ? metobsClient : hydroobsClient;

    const paramEntry = Object.entries(paramMap).find(([, info]) => info.name === parameter);
    if (!paramEntry) return null;

    const paramId = paramEntry[0];

    const response = await client.request<SmhiStationListResponse>(`/api/version/1.0/parameter/${paramId}.json`);
    const activeStations = response.station.filter((s) => s.active);

    return findNearestStation(activeStations, latitude, longitude);
  },

  async listMetStations(): Promise<SmhiStationListResponse['station']> {
    const response = await metobsClient.request<SmhiStationListResponse>('/api/version/1.0/parameter/1.json');
    return response.station.filter((s) => s.active);
  },

  async listHydroStations(): Promise<SmhiHydroStationListResponse['station']> {
    const response = await hydroobsClient.request<SmhiHydroStationListResponse>('/api/version/1.0/parameter/1.json');
    return response.station.filter((s) => s.active);
  },

  async getMetParameters(): Promise<ObservationParameter[]> {
    return Object.entries(MET_OBS_PARAMS).map(([id, info]) => ({
      id: parseInt(id),
      name: info.name,
      description: info.description,
      unit: info.unit,
    }));
  },

  async getHydroParameters(): Promise<ObservationParameter[]> {
    return Object.entries(HYDRO_OBS_PARAMS).map(([id, info]) => ({
      id: parseInt(id),
      name: info.name,
      description: info.description,
      unit: info.unit,
    }));
  },

  // ============================================================================
  // WARNINGS
  // ============================================================================

  async getWarnings(warningLevel?: string): Promise<WarningsResponse> {
    const response = await warningsClient.request<SmhiWarningsResponse>('/ibww/api/version/1/warning.json');

    let warnings = transformWarnings(response);

    if (warningLevel) {
      const levelOrder: Record<string, number> = {
        yellow: 1,
        orange: 2,
        red: 3,
      };
      const minLevel = levelOrder[warningLevel.toLowerCase()] || 0;

      warnings = warnings.filter((w) => {
        const warnLevel = w.warningLevel.toLowerCase();
        return (levelOrder[warnLevel] || 0) >= minLevel;
      });
    }

    return {
      count: warnings.length,
      warnings,
    };
  },

  async getWarningDistricts(): Promise<District[]> {
    const response = await warningsClient.request<SmhiDistrictResponse[]>('/ibww/api/version/1/metadata/area.json');

    return response.map((d) => ({
      id: d.id,
      name: d.name,
      parentId: d.parentid,
    }));
  },

  // ============================================================================
  // RADAR
  // ============================================================================

  async getRadarImage(product: string, area: string, format: string): Promise<RadarImage> {
    const areaResponse = await radarClient.request<SmhiRadarAreaResponse>(
      `/api/version/latest/area/${area}/product/${product}`,
    );

    if (!areaResponse.lastFiles || areaResponse.lastFiles.length === 0) {
      throw new NotFoundError('Radar files', `${product}/${area}`);
    }

    const latestFile = areaResponse.lastFiles[areaResponse.lastFiles.length - 1];

    const formatData = latestFile.formats.find((f) => f.key === format);
    if (!formatData) {
      const availableFormats = latestFile.formats.map((f) => f.key).join(', ');
      throw new NotFoundError('Radar format', `${format} (available: ${availableFormats})`);
    }

    return {
      product,
      area,
      format,
      validTime: new Date(latestFile.valid).toISOString(),
      updatedTime: new Date(latestFile.updated).toISOString(),
      imageUrl: formatData.link,
      // Radar images are in SWEREF99TM - approximate bounding box for Sweden
      boundingBox:
        area === 'sweden'
          ? {
              minX: 218000,
              minY: 6126000,
              maxX: 920000,
              maxY: 7680000,
              crs: 'EPSG:3006',
            }
          : undefined,
    };
  },

  async getRadarProducts(): Promise<SmhiRadarProductsResponse['product']> {
    const response = await radarClient.request<SmhiRadarProductsResponse>('/api/version/latest');
    return response.product || [];
  },

  // ============================================================================
  // LIGHTNING
  // ============================================================================

  async getLightning(date: Date, latitude?: number, longitude?: number, radiusKm?: number): Promise<LightningResponse> {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    try {
      const csv = await lightningClient.request<string>(`/api/version/latest/year/${year}/month/${month}/day/${day}/data.csv`, {
        responseType: 'text',
      });

      let strikes = parseLightningCsv(csv);

      let filterApplied: LightningResponse['filterApplied'];
      if (latitude !== undefined && longitude !== undefined) {
        const radius = radiusKm || 50;
        filterApplied = { latitude, longitude, radiusKm: radius };
        strikes = strikes.filter((s) => haversineDistance(latitude, longitude, s.latitude, s.longitude) <= radius);
      }

      return {
        date: `${year}-${month}-${day}`,
        count: strikes.length,
        filterApplied,
        strikes,
      };
    } catch (error) {
      if (error instanceof UpstreamApiError && error.statusCode === 404) {
        return {
          date: `${year}-${month}-${day}`,
          count: 0,
          filterApplied:
            latitude !== undefined && longitude !== undefined ? { latitude, longitude, radiusKm: radiusKm || 50 } : undefined,
          strikes: [],
        };
      }
      throw error;
    }
  },

  // Lightning data typically available with 1-day delay
  async getLatestLightningDate(): Promise<Date> {
    const today = new Date();

    for (let daysAgo = 1; daysAgo <= 7; daysAgo++) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysAgo);

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      try {
        await lightningClient.request<string>(`/api/version/latest/year/${year}/month/${month}/day/${day}/data.csv`, {
          responseType: 'text',
        });
        return date;
      } catch {
        continue;
      }
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  },
};
