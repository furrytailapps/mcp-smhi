import { z } from 'zod';
import { smhiClient } from '@/clients/smhi-client';
import { withErrorHandling } from '@/lib/response';
import { ValidationError } from '@/lib/errors';
import { resolveKommun, resolveLan } from '@/lib/location-resolver';

const conditionTypeSchema = z
  .enum(['warnings', 'radar', 'lightning'])
  .describe(
    "Type of current conditions: 'warnings' (active weather warnings), 'radar' (precipitation images), 'lightning' (strike data)",
  );

export const getCurrentConditionsInputSchema = {
  conditionType: conditionTypeSchema,
  warningLevel: z
    .enum(['yellow', 'orange', 'red'])
    .optional()
    .describe('For warnings: minimum level to include. Options: yellow (be aware), orange (be prepared), red (take action).'),
  product: z
    .enum(['comp', 'pcappi'])
    .optional()
    .default('comp')
    .describe("For radar: product type. 'comp' (composite) or 'pcappi' (constant altitude PPI). Default: comp"),
  format: z
    .enum(['png', 'tif', 'h5'])
    .optional()
    .default('png')
    .describe('For radar: image format. png (viewable), tif (GeoTiff), h5 (HDF5). Default: png'),
  date: z
    .string()
    .optional()
    .describe("For lightning: date in YYYY-MM-DD format or 'latest'. Lightning data typically 1-day delayed."),
  latitude: z
    .number()
    .min(55)
    .max(69)
    .optional()
    .describe(
      'For lightning: filter strikes near this latitude (WGS84). Example: 59.33. ' +
        'Alternative: use kommun or lan parameter.',
    ),
  longitude: z
    .number()
    .min(11)
    .max(24)
    .optional()
    .describe(
      'For lightning: filter strikes near this longitude (WGS84). Example: 18.07. ' +
        'Alternative: use kommun or lan parameter.',
    ),
  kommun: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .describe(
      'For lightning: filter strikes near this kommun code (4 digits). ' +
        'Examples: "0180" (Stockholm), "1480" (Göteborg). ' +
        'Use smhi_describe_data with dataType="kommuner" to list valid codes.',
    ),
  lan: z
    .string()
    .regex(/^[A-Z]{1,2}$/)
    .optional()
    .describe(
      'For lightning: filter strikes near this län code (1-2 letters). ' +
        'Examples: "AB" (Stockholm), "O" (Västra Götaland). ' +
        'Use smhi_describe_data with dataType="lan" to list valid codes.',
    ),
  radiusKm: z
    .number()
    .min(1)
    .max(500)
    .optional()
    .default(50)
    .describe('For lightning: radius in km for location filter. Default: 50km.'),
};

export const getCurrentConditionsTool = {
  name: 'smhi_get_current_conditions',
  description:
    'Get current/recent weather conditions in Sweden. ' +
    "Use conditionType='warnings' for active weather warnings (storms, flooding). " +
    "Use conditionType='radar' for precipitation radar images (rain/snow nowcasting). " +
    "Use conditionType='lightning' for recent lightning strikes with WGS84 coordinates (crane/height work safety). " +
    'For lightning location filter: use coordinates, kommun code (4 digits), or län code (1-2 letters). ' +
    "Examples: conditionType='warnings' | conditionType='radar' | conditionType='lightning', kommun='0180'",
  inputSchema: getCurrentConditionsInputSchema,
};

type GetCurrentConditionsInput = {
  conditionType: 'warnings' | 'radar' | 'lightning';
  warningLevel?: 'yellow' | 'orange' | 'red';
  product?: 'comp' | 'pcappi';
  format?: 'png' | 'tif' | 'h5';
  date?: string;
  latitude?: number;
  longitude?: number;
  kommun?: string;
  lan?: string;
  radiusKm?: number;
};

export const getCurrentConditionsHandler = withErrorHandling(async (args: GetCurrentConditionsInput) => {
  switch (args.conditionType) {
    case 'warnings': {
      return smhiClient.getWarnings(args.warningLevel);
    }

    case 'radar': {
      const product = args.product || 'comp';
      const format = args.format || 'png';
      return smhiClient.getRadarImage(product, 'sweden', format);
    }

    case 'lightning': {
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
        }
      }

      if ((latitude !== undefined) !== (longitude !== undefined)) {
        throw new ValidationError('Both latitude and longitude must be provided together, or both omitted');
      }

      const dateStr = args.date || 'latest';
      let date: Date;

      if (dateStr.toLowerCase() === 'latest') {
        date = await smhiClient.getLatestLightningDate();
      } else {
        const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
          throw new ValidationError("Invalid date format. Use YYYY-MM-DD or 'latest'", 'date');
        }
        date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      }

      return smhiClient.getLightning(date, latitude, longitude, args.radiusKm);
    }

    default:
      throw new ValidationError(`Unknown condition type: ${args.conditionType}`);
  }
});
