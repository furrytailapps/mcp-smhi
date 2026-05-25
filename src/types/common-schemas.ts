import { z } from 'zod';

// Raw shapes (not wrapped in z.object()) for use with mcp-handler

// Bounds cover Swedish land plus surrounding waters so offshore marine stations
// are accepted — the westernmost wave buoy (Väderöarna) sits at 10.93°E, below
// the previous 11°E floor. Margins are deliberate maritime sanity guards.
export const latitudeSchema = z
  .number()
  .min(54.5)
  .max(69.5)
  .describe('Latitude in WGS84 (decimal degrees). Sweden + surrounding waters: 54.5-69.5. Example: 59.33 for Stockholm');

export const longitudeSchema = z
  .number()
  .min(10)
  .max(24.5)
  .describe('Longitude in WGS84 (decimal degrees). Sweden + surrounding waters: 10-24.5. Example: 18.07 for Stockholm');

export const dataTypeSchema = z
  .enum(['meteorological', 'hydrological', 'oceanographic'])
  .describe(
    'Type of observation data: meteorological (weather), hydrological (water levels/flows), or oceanographic (sea temperature, currents, waves, sea level)',
  );

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
    'ocean_stations',
    'met_parameters',
    'hydro_parameters',
    'ocean_parameters',
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
  .regex(/^[A-Z]{1,2}$/)
  .describe('Swedish län (county) code. 1-2 uppercase letters, e.g., "AB" for Stockholms län, "O" for Västra Götalands län');
