import { UpstreamApiError } from './errors';

interface HttpClientConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export function createHttpClient(config: HttpClientConfig) {
  const { baseUrl, timeout = 30000, headers = {} } = config;

  async function request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST';
      params?: Record<string, string | number | undefined>;
      body?: unknown;
      responseType?: 'json' | 'text' | 'blob';
    } = {},
  ): Promise<T> {
    const { method = 'GET', params, body, responseType = 'json' } = options;

    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    const url = new URL(cleanPath, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
    if (params) {
      // WORKAROUND: LLM agents pass "" for optional params
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, String(value));
        }
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          Accept: responseType === 'json' ? 'application/json' : responseType === 'text' ? 'text/plain' : '*/*',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const msg =
          response.status >= 500
            ? `The data service returned an error (HTTP ${response.status}). This is usually temporary — try again.`
            : `The data service rejected the request (HTTP ${response.status}). The query parameters may be invalid.`;
        throw new UpstreamApiError(msg, response.status, baseUrl);
      }

      if (responseType === 'text') {
        return (await response.text()) as T;
      }

      if (responseType === 'blob') {
        return (await response.blob()) as T;
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/plain') || contentType?.includes('text/csv')) {
        return (await response.text()) as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof UpstreamApiError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new UpstreamApiError(
          'The request timed out. The data service may be slow — try again or use a smaller search area.',
          0,
          baseUrl,
        );
      }

      throw new UpstreamApiError('Could not connect to the data service. This is usually temporary — try again.', 0, baseUrl);
    }
  }

  return { request };
}
