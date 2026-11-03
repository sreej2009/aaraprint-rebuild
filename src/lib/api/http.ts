export class ApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, message?: string) {
    super(message ?? `Request to ${url} failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }
}

/** GET a JSON resource. Throws ApiError for HTTP errors and non-JSON responses. */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new ApiError(response.status, url);
  const contentType = response.headers.get('content-type') ?? '';
  // Static hosts answer unknown paths with the SPA's HTML; treat that as "not found".
  if (!contentType.includes('json')) throw new ApiError(404, url, `Expected JSON from ${url}, got "${contentType}"`);
  return (await response.json()) as T;
}
