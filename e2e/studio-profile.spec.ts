import { expect, test } from './fixtures';

test.describe('Studio profile API (mock)', () => {
  test('serves a profile per customisable product', async ({ request }) => {
    const response = await request.get('/api/v1/studio/business-card-classic.json');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('json');
    const profile = await response.json();
    expect(profile).toMatchObject({
      slug: 'business-card-classic',
      mode: 'flat',
      print: { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24 },
      trim: { shape: 'rectangle' },
    });
  });

  test('has no profile for products that are printed as shown', async ({ request }) => {
    const response = await request.get('/api/v1/studio/card-accessory-metal-holder.json');
    // Static hosting falls back to the app shell (HTML), which the API client treats as "not found".
    expect(response.headers()['content-type'] ?? '').not.toContain('json');
  });
});
