import { z } from 'zod';
import { smhiClient } from '@/clients/smhi-client';
import { withErrorHandling } from '@/lib/response';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { resolveKommun, resolveLan } from '@/lib/location-resolver';
import { dataTypeSchema, periodSchema } from '@/types/common-schemas';

// Types for aggregated observations
interface AggregatedObservation {
  period: string; // Date for daily (YYYY-MM-DD), or week start for weekly (YYYY-MM-DD)
  periodType: 'day' | 'week';
  min: number;
  max: number;
  avg: number;
  count: number; // Number of raw observations in this period
}

/**
 * Get ISO week number and year for a date
 */
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/**
 * Get the Monday of a given ISO week
 */
function getWeekStart(year: number, week: number): string {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dayOfWeek = simple.getUTCDay();
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
  return monday.toISOString().split('T')[0];
}

/**
 * Aggregate observations to daily values (min/max/avg)
 */
function aggregateToDaily(observations: Array<{ timestamp: string; value: number; quality: string }>): AggregatedObservation[] {
  const byDay = new Map<string, number[]>();

  for (const obs of observations) {
    const day = obs.timestamp.split('T')[0];
    if (!byDay.has(day)) {
      byDay.set(day, []);
    }
    byDay.get(day)!.push(obs.value);
  }

  const result: AggregatedObservation[] = [];
  for (const [day, values] of Array.from(byDay.entries())) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
    result.push({
      period: day,
      periodType: 'day',
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10,
      avg: Math.round(avg * 10) / 10,
      count: values.length,
    });
  }

  return result.sort((a: AggregatedObservation, b: AggregatedObservation) => a.period.localeCompare(b.period));
}

/**
 * Aggregate observations to weekly values (min/max/avg)
 */
function aggregateToWeekly(
  observations: Array<{ timestamp: string; value: number; quality: string }>,
): AggregatedObservation[] {
  const byWeek = new Map<string, number[]>();

  for (const obs of observations) {
    const date = new Date(obs.timestamp);
    const { year, week } = getISOWeek(date);
    const weekKey = `${year}-W${week.toString().padStart(2, '0')}`;
    if (!byWeek.has(weekKey)) {
      byWeek.set(weekKey, []);
    }
    byWeek.get(weekKey)!.push(obs.value);
  }

  const result: AggregatedObservation[] = [];
  for (const [weekKey, values] of Array.from(byWeek.entries())) {
    const [yearStr, weekStr] = weekKey.split('-W');
    const weekStart = getWeekStart(parseInt(yearStr), parseInt(weekStr));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
    result.push({
      period: weekStart,
      periodType: 'week',
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10,
      avg: Math.round(avg * 10) / 10,
      count: values.length,
    });
  }

  return result.sort((a: AggregatedObservation, b: AggregatedObservation) => a.period.localeCompare(b.period));
}

export const getObservationsInputSchema = {
  dataType: dataTypeSchema,
  stationId: z.number().optional().describe('Station ID. If not provided, finds nearest station to the given location.'),
  latitude: z
    .number()
    .min(55)
    .max(69)
    .optional()
    .describe(
      'Latitude (WGS84) for finding nearest station. Example: 59.33. ' + 'Optional if stationId, kommun, or lan is provided.',
    ),
  longitude: z
    .number()
    .min(11)
    .max(24)
    .optional()
    .describe(
      'Longitude (WGS84) for finding nearest station. Example: 18.07. ' + 'Optional if stationId, kommun, or lan is provided.',
    ),
  kommun: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .describe(
      'Swedish kommun code (4 digits) for finding nearest station. ' +
        'Examples: "0180" (Stockholm), "1480" (Göteborg). ' +
        'Use smhi_describe_data with dataType="kommuner" to list valid codes.',
    ),
  lan: z
    .string()
    .regex(/^[A-Z]{1,2}$/)
    .optional()
    .describe(
      'Swedish län code (1-2 letters) for finding nearest station. ' +
        'Examples: "AB" (Stockholm), "O" (Västra Götaland). ' +
        'Use smhi_describe_data with dataType="lan" to list valid codes.',
    ),
  parameter: z
    .string()
    .describe(
      'Parameter to query. For meteorological: temperature, wind_speed, wind_direction, precipitation, humidity, pressure. ' +
        'For hydrological: water_level, water_flow.',
    ),
  period: periodSchema
    .default('latest-hour')
    .describe(
      'Time period: latest-hour (last hour), latest-day (last 24h), latest-months (last 3-4 months), ' +
        'corrected-archive (full historical data, some stations back to 1960s).',
    ),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      'Filter observations from this date (YYYY-MM-DD). Use with corrected-archive period for historical queries. ' +
        'Example: "2020-01-01"',
    ),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      'Filter observations until this date (YYYY-MM-DD). Use with corrected-archive period for historical queries. ' +
        'Example: "2021-01-01"',
    ),
};

export const getObservationsTool = {
  name: 'smhi_get_observations',
  description:
    'Get current or historical weather/water observations from SMHI stations. ' +
    'For meteorological data: temperature, wind, precipitation, humidity, pressure. ' +
    'For hydrological data: water levels and flows (useful for excavation near waterways). ' +
    'Historical queries (corrected-archive with date range) return aggregated data: ' +
    'daily min/max/avg for ranges < 90 days, weekly min/max/avg for ranges >= 90 days. ' +
    'Returns station location (WGS84 latitude/longitude) alongside observation data. ' +
    'Provide stationId directly, or specify location by coordinates or kommun/län code. ' +
    'Examples: stationId=98210 | latitude=59.33, longitude=18.07 | kommun="0180" | lan="AB"',
  inputSchema: getObservationsInputSchema,
};

type GetObservationsInput = {
  dataType: 'meteorological' | 'hydrological';
  stationId?: number;
  latitude?: number;
  longitude?: number;
  kommun?: string;
  lan?: string;
  parameter: string;
  period: string;
  startDate?: string;
  endDate?: string;
};

export const getObservationsHandler = withErrorHandling(async (args: GetObservationsInput) => {
  let stationId = args.stationId;
  let { latitude, longitude } = args;

  // If no stationId, find nearest station
  if (!stationId) {
    // Resolve coordinates from kommun or län if not provided directly
    if (latitude === undefined || longitude === undefined) {
      if (args.kommun) {
        const resolved = resolveKommun(args.kommun);
        if (!resolved) {
          throw new ValidationError(
            `Invalid kommun code: ${args.kommun}. Use smhi_describe_data with dataType="kommuner" to list valid 4-digit codes.`,
          );
        }
        latitude = resolved.latitude;
        longitude = resolved.longitude;
      } else if (args.lan) {
        const resolved = resolveLan(args.lan);
        if (!resolved) {
          throw new ValidationError(
            `Invalid län code: ${args.lan}. Use smhi_describe_data with dataType="lan" to list valid 1-2 letter codes.`,
          );
        }
        latitude = resolved.latitude;
        longitude = resolved.longitude;
      } else {
        throw new ValidationError('Location required. Provide stationId, latitude/longitude, kommun, or lan parameter.');
      }
    }

    const station = await smhiClient.findNearestObservationStation(args.dataType, latitude, longitude, args.parameter);
    if (!station) {
      throw new NotFoundError(`${args.dataType} station`, `near ${latitude},${longitude} for ${args.parameter}`);
    }
    stationId = station.id;
  }

  // Fetch observation data using unified API
  const result = await smhiClient.getObservation(args.dataType, stationId, args.parameter, args.period);

  if (!result) {
    throw new NotFoundError('Observation data', `station ${stationId}, parameter ${args.parameter}`);
  }

  // Filter by date range if specified (useful for corrected-archive period)
  if (args.startDate || args.endDate) {
    const startMs = args.startDate ? new Date(args.startDate).getTime() : 0;
    const endMs = args.endDate ? new Date(args.endDate + 'T23:59:59.999Z').getTime() : Infinity;

    const filteredObservations = result.observations.filter((obs) => {
      const obsMs = new Date(obs.timestamp).getTime();
      return obsMs >= startMs && obsMs <= endMs;
    });

    // Calculate date range in days
    const startDate = args.startDate ? new Date(args.startDate) : new Date(filteredObservations[0]?.timestamp || 0);
    const endDate = args.endDate
      ? new Date(args.endDate)
      : new Date(filteredObservations[filteredObservations.length - 1]?.timestamp || 0);
    const rangeDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Aggregate based on date range: >= 90 days = weekly, < 90 days = daily
    const aggregationType = rangeDays >= 90 ? 'weekly' : 'daily';
    const aggregatedObservations =
      aggregationType === 'weekly' ? aggregateToWeekly(filteredObservations) : aggregateToDaily(filteredObservations);

    return {
      station: result.station,
      parameter: result.parameter,
      period: result.period,
      aggregation: {
        type: aggregationType,
        rangeDays,
        rawObservationCount: filteredObservations.length,
        aggregatedCount: aggregatedObservations.length,
        note:
          aggregationType === 'weekly'
            ? 'Data aggregated to weekly min/max/avg (range >= 90 days)'
            : 'Data aggregated to daily min/max/avg (range < 90 days)',
      },
      dateFilter: {
        startDate: args.startDate,
        endDate: args.endDate,
      },
      observations: aggregatedObservations,
    };
  }

  return result;
});
