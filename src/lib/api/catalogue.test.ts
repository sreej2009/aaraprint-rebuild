import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCatalogueApi } from './catalogue';
import { ApiError } from './http';

const api = createCatalogueApi('/api/v1/');

function mockFetch(status: number, body: unknown, contentType = 'application/json') {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': contentType } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('catalogue API client', () => {
  it('requests the product JSON by slug', async () => {
    const fetchMock = mockFetch(200, { slug: 'pens' });
    await expect(api.getProduct('pen-ballpoint-classic')).resolves.toEqual({ slug: 'pens' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/catalogue/products/pen-ballpoint-classic.json', expect.anything());
  });

  it('returns null for unknown products (404 or the SPA HTML fallback)', async () => {
    mockFetch(404, 'Not found', 'text/plain');
    await expect(api.getProduct('missing')).resolves.toBeNull();
    mockFetch(200, '<!doctype html>', 'text/html');
    await expect(api.getProduct('missing')).resolves.toBeNull();
  });

  it('rejects unsafe slugs without a request', async () => {
    const fetchMock = mockFetch(200, {});
    await expect(api.getProduct('../secrets')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces server errors', async () => {
    mockFetch(500, 'oops', 'text/plain');
    await expect(api.listCategories()).rejects.toBeInstanceOf(ApiError);
  });
});
