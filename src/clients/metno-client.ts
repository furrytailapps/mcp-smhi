import { UpstreamApiError } from '@/lib/errors';
import {
  OCEAN_FCST_PARAMS,
  type MetNoOceanforecastResponse,
  type MarineForecastPoint,
  type MarineForecastResult,
} from '@/types/smhi-api';

const OCEANFORECAST_URL = 'https://api.met.no/weatherapi/oceanforecast/2.0/complete';
// MET Norway ToS requires an identifying User-Agent with contact info.
const USER_AGENT = 'YesperMCP/1.0 (peter.blom@gmail.com)';
const TIMEOUT_MS = 30000;
// Fallback cache lifetime when a response omits Expires. MET Norway's oceanforecast
// updates ~hourly; measured Expires sits ~30 min ahead (2026-05-25).
const DEFAULT_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  expires: number;
  lastModified: string | null;
  result: MarineForecastResult;
}

// Module-level cache persists across invocations within a warm serverless instance.
// MET Norway ToS requires caching and respecting Expires: serve from cache until
// Expires, then revalidate with If-Modified-Since (a 304 avoids re-downloading).
const cache = new Map<string, CacheEntry>();

function expiresFrom(headers: Headers, now: number): number {
  const expires = headers.get('expires');
  if (expires) {
    const ms = Date.parse(expires);
    if (!Number.isNaN(ms) && ms > now) return ms;
  }
  return now + DEFAULT_TTL_MS;
}

function parseMarineForecast(body: MetNoOceanforecastResponse): MarineForecastPoint[] {
  return body.properties.timeseries.map((ts) => {
    const details = ts.data.instant.details;
    const point: MarineForecastPoint = { validTime: ts.time };
    for (const [field, mapping] of Object.entries(OCEAN_FCST_PARAMS)) {
      const value = details[field];
      if (value !== undefined) point[mapping.name] = value;
    }
    return point;
  });
}

export async function getMarineForecast(latitude: number, longitude: number): Promise<MarineForecastResult> {
  // MET Norway asks for coordinates truncated to 4 decimals (improves cache hit rate).
  const lat = latitude.toFixed(4);
  const lon = longitude.toFixed(4);
  const key = `${lat},${lon}`;
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && now < cached.expires) return cached.result;

  const headers: Record<string, string> = { 'User-Agent': USER_AGENT, 'Accept': 'application/json' };
  if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

  let response: Response;
  try {
    response = await fetch(`${OCEANFORECAST_URL}?lat=${lat}&lon=${lon}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The marine forecast request timed out — try again.'
        : 'Could not reach the marine forecast service — try again.';
    throw new UpstreamApiError(message, 0, OCEANFORECAST_URL);
  }

  // Not Modified: cached data is still current; extend its lifetime.
  if (response.status === 304 && cached) {
    const refreshed: CacheEntry = { ...cached, expires: expiresFrom(response.headers, now) };
    cache.set(key, refreshed);
    return refreshed.result;
  }

  if (!response.ok) {
    const message =
      response.status >= 500
        ? `The marine forecast service returned an error (HTTP ${response.status}). This is usually temporary — try again.`
        : `The marine forecast service rejected the request (HTTP ${response.status}). The coordinates may be outside coverage.`;
    throw new UpstreamApiError(message, response.status, OCEANFORECAST_URL);
  }

  const body = (await response.json()) as MetNoOceanforecastResponse;
  const result: MarineForecastResult = {
    referenceTime: response.headers.get('last-modified') ?? new Date(now).toISOString(),
    timeSeries: parseMarineForecast(body),
  };
  cache.set(key, {
    expires: expiresFrom(response.headers, now),
    lastModified: response.headers.get('last-modified'),
    result,
  });
  return result;
}
