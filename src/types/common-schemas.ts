import { z } from 'zod';

// Raw shapes (not wrapped in z.object()) for use with mcp-handler

export const latitudeSchema = z
  .number()
  .min(55)
  .max(69)
  .describe('Latitude in WGS84 (decimal degrees). Sweden range: 55-69. Example: 59.33 for Stockholm');

export const longitudeSchema = z
  .number()
  .min(11)
  .max(24)
  .describe('Longitude in WGS84 (decimal degrees). Sweden range: 11-24. Example: 18.07 for Stockholm');

export const dataTypeSchema = z
  .enum(['meteorological', 'hydrological'])
  .describe('Type of observation data: meteorological (weather) or hydrological (water levels/flows)');

export const periodSchema = z
  .enum(['latest-hour', 'latest-day', 'latest-months', 'corrected-archive'])
  .describe(
    'Time period: latest-hour, latest-day, latest-months, or corrected-archive (full historical data, some stations back to 1960s)',
  );

export const describeDataTypeSchema = z
  .enum([
    'forecast_parameters',
    'met_stations',
    'hydro_stations',
    'met_parameters',
    'hydro_parameters',
    'warning_districts',
    'radar_products',
    'kommuner',
    'lan',
  ])
  .describe('Type of metadata to retrieve');

export const kommunSchema = z
  .string()
  .regex(/^\d{4}$/)
  .describe('Swedish kommun (municipality) code. 4-digit code, e.g., "0180" for Stockholm, "1480" for Göteborg');

export const lanSchema = z
  .string()
  .regex(/^[A-Za-z]{1,2}$/)
  .describe('Swedish län (county) code. 1-2 letters, e.g., "AB" for Stockholms län, "O" for Västra Götalands län');
