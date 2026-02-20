import { z } from 'zod';
import { smhiClient } from '@/clients/smhi-client';
import { withErrorHandling } from '@/lib/response';
import { resolveKommun, resolveLan } from '@/lib/location-resolver';
import { ValidationError } from '@/lib/errors';

export const getForecastInputSchema = {
  latitude: z
    .number()
    .min(55)
    .max(69)
    .optional()
    .describe(
      'Latitude in WGS84 (decimal degrees). Sweden range: 55-69. Example: 59.33 for Stockholm. ' +
        'Optional if kommun or lan is provided.',
    ),
  longitude: z
    .number()
    .min(11)
    .max(24)
    .optional()
    .describe(
      'Longitude in WGS84 (decimal degrees). Sweden range: 11-24. Example: 18.07 for Stockholm. ' +
        'Optional if kommun or lan is provided.',
    ),
  kommun: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .describe(
      'Swedish kommun code (4 digits). Examples: "0180" (Stockholm), "1480" (Göteborg). ' +
        'Use smhi_describe_data with dataType="kommuner" to list valid codes. Alternative to coordinates.',
    ),
  lan: z
    .string()
    .regex(/^[A-Z]{1,2}$/)
    .optional()
    .describe(
      'Swedish län code (1-2 letters). Examples: "AB" (Stockholm), "O" (Västra Götaland). ' +
        'Use smhi_describe_data with dataType="lan" to list valid codes. Alternative to coordinates.',
    ),
  parameters: z
    .string()
    .optional()
    .describe(
      "Comma-separated list of parameters to include (e.g., 'temperature,windSpeed,precipitationMean'). " +
        'Available: temperature, windSpeed, windGust, windDirection, humidity, cloudCover, ' +
        'precipitationCategory, precipitationMean, visibility, pressure, thunderProbability. ' +
        'If omitted, all parameters are returned.',
    ),
};

export const getForecastTool = {
  name: 'smhi_get_forecast',
  description:
    'Get weather forecast for a specific location in Sweden. ' +
    'Returns 10-day forecast with hourly data for the first 2 days, then 6-hour intervals. ' +
    'Use for planning outdoor construction work, concrete pouring conditions, crane operations. ' +
    'Location can be specified by: (1) latitude/longitude coordinates, (2) kommun code (4 digits), or (3) län code (1-2 letters). ' +
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

export const getForecastHandler = withErrorHandling(async (args: GetForecastInput) => {
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

  const params = args.parameters?.split(',').map((p) => p.trim());
  return smhiClient.getForecast(latitude, longitude, params);
});
