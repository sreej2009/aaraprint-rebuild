import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/http';
import { createStudioApi } from './api';

const api = createStudioApi('/api/v1/');

function mockFetch(status: number, body: unknown, contentType = 'application/json') {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': contentType } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('Studio API client', () => {
  it('requests the profile by slug', async () => {
    const fetchMock = mockFetch(200, { slug: 'business-card-classic' });
    await expect(api.getProfile('business-card-classic')).resolves.toEqual({ slug: 'business-card-classic' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/studio/business-card-classic.json', expect.anything());
  });

  it('returns null for products without a profile and for unsafe slugs', async () => {
    mockFetch(200, '<!doctype html>', 'text/html');
    await expect(api.getProfile('card-accessory-metal-holder')).resolves.toBeNull();
    const fetchMock = mockFetch(200, {});
    await expect(api.getProfile('../package')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces server errors', async () => {
    mockFetch(500, 'oops', 'text/plain');
    await expect(api.getProfile('business-card-classic')).rejects.toBeInstanceOf(ApiError);
  });
});
