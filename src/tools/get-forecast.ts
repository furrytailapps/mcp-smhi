import { smhiClient } from '@/clients/smhi-client';
import { getMarineForecast } from '@/clients/metno-client';
import { withErrorHandling } from '@/lib/response';
import { resolveKommun, resolveLan } from '@/lib/location-resolver';
import { ValidationError, UpstreamApiError } from '@/lib/errors';
import { latitudeSchema, longitudeSchema, kommunSchema, lanSchema } from '@/types/common-schemas';
import { FORECAST_PARAMS, OCEAN_FCST_PARAMS, type ForecastEnvelope } from '@/types/smhi-api';
import { z } from 'zod';

export const getForecastInputSchema = {
  latitude: latitudeSchema
    .optional()
    .describe('Latitude in WGS84 (decimal degrees). Example: 59.33 for Stockholm. Optional if kommun or lan is provided.'),
  longitude: longitudeSchema
    .optional()
    .describe('Longitude in WGS84 (decimal degrees). Example: 18.07 for Stockholm. Optional if kommun or lan is provided.'),
  kommun: kommunSchema
    .optional()
    .describe(
      'Swedish kommun code (4 digits). Examples: "0180" (Stockholm), "1480" (Göteborg). ' +
        'Use smhi_describe_data with dataType="kommuner" to list valid codes. Alternative to coordinates.',
    ),
  lan: lanSchema
    .optional()
    .describe(
      'Swedish län code (1-2 letters). Examples: "AB" (Stockholm), "O" (Västra Götaland). ' +
        'Use smhi_describe_data with dataType="lan" to list valid codes. Alternative to coordinates.',
    ),
  parameters: z
    .string()
    .optional()
    .describe(
      "Comma-separated list of parameters to include (e.g., 'temperature,windSpeed,wave_height'). " +
        'Weather (SMHI): temperature, windSpeed, windGust, windDirection, humidity, cloudCover, ' +
        'precipitationMean, precipitationProbability, visibility, pressure, thunderProbability. ' +
        'Marine (MET Norway): wave_height, sea_temperature, wave_direction. ' +
        'If omitted, all weather parameters are returned; marine parameters are opt-in (request them explicitly). ' +
        'Sea currents and wave period are available via smhi_get_observations, not as forecast.',
    ),
};

export const getForecastTool = {
  name: 'smhi_get_forecast',
  description:
    'Get a weather and/or marine forecast for a location in Sweden. ' +
    'Weather (10-day, hourly for the first 2 days then 6-hour intervals) is from SMHI; ' +
    'marine forecast (wave height, sea temperature, wave direction) is from MET Norway (CC BY 4.0). ' +
    'Use for planning outdoor construction, concrete pouring, crane operations, and coastal/marine work. ' +
    'Request marine parameters explicitly (e.g. parameters="wave_height,sea_temperature"); they are returned ' +
    'as a separate marineTimeSeries. Sea currents and wave period are observations only (smhi_get_observations). ' +
    'Location: latitude/longitude, kommun code (4 digits), or län code (1-2 letters). ' +
    'Examples: latitude=59.33, longitude=18.07 | kommun="0180" | lan="AB"',
  inputSchema: getForecastInputSchema,
};

type GetForecastInput = {
  latitude?: number;
  longitude?: number;
  kommun?: string;
  lan?: string;
  parameters?: string;
};

const ATMOSPHERIC_NAMES = new Set(Object.values(FORECAST_PARAMS).map((p) => p.name));
const MARINE_NAMES = new Set(Object.values(OCEAN_FCST_PARAMS).map((p) => p.name));

// Settle a source independently so one provider failing doesn't sink the other.
async function settle<T>(promise: Promise<T> | null): Promise<{ ok: true; value: T } | { ok: false; error: string } | null> {
  if (!promise) return null;
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export const getForecastHandler = withErrorHandling(async (args: GetForecastInput): Promise<ForecastEnvelope> => {
  let { latitude, longitude } = args;

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
      throw new ValidationError('Location required. Provide latitude/longitude, kommun, or lan parameter.');
    }
  }

  const requested = args.parameters
    ?.split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const atmospheric = requested?.filter((p) => ATMOSPHERIC_NAMES.has(p));
  const marine = requested?.filter((p) => MARINE_NAMES.has(p)) ?? [];
  const unrecognized = requested?.filter((p) => !ATMOSPHERIC_NAMES.has(p) && !MARINE_NAMES.has(p)) ?? [];

  // No params -> weather only (marine is opt-in). With params -> fetch each requested namespace.
  const wantAtmospheric = !requested || (atmospheric?.length ?? 0) > 0;
  const wantMarine = marine.length > 0;

  const [atm, mar] = await Promise.all([
    settle(wantAtmospheric ? smhiClient.getForecast(latitude, longitude, requested ? atmospheric : undefined) : null),
    settle(wantMarine ? getMarineForecast(latitude, longitude) : null),
  ]);

  const envelope: ForecastEnvelope = { latitude, longitude, sources: {} };
  const errors: { atmospheric?: string; marine?: string } = {};

  if (atm?.ok) {
    envelope.sources.atmospheric = 'SMHI';
    envelope.approvedTime = atm.value.approvedTime;
    envelope.referenceTime = atm.value.referenceTime;
    envelope.timeSeries = atm.value.timeSeries;
  } else if (atm) {
    errors.atmospheric = atm.error;
  }

  if (mar?.ok) {
    // MET Norway returns 200 with no marine values for inland/out-of-coverage points.
    const hasMarineData = mar.value.timeSeries.some(
      (p) => p.wave_height !== undefined || p.sea_temperature !== undefined || p.wave_direction !== undefined,
    );
    if (hasMarineData) {
      envelope.sources.marine = 'MET Norway (CC BY 4.0)';
      envelope.marineReferenceTime = mar.value.referenceTime;
      envelope.marineTimeSeries = mar.value.timeSeries;
    } else {
      errors.marine = 'No marine forecast at this location (inland or outside MET Norway coverage).';
    }
  } else if (mar) {
    errors.marine = mar.error;
  }

  if (unrecognized.length > 0) envelope.unrecognizedParameters = unrecognized;
  if (Object.keys(errors).length > 0) envelope.errors = errors;

  // If every requested source failed, surface it as a tool error rather than an empty envelope.
  if (Object.keys(envelope.sources).length === 0) {
    const detail = [errors.atmospheric, errors.marine].filter(Boolean).join('; ') || 'no forecast sources requested';
    throw new UpstreamApiError(`Forecast unavailable: ${detail}`, 0, 'forecast');
  }

  return envelope;
});
