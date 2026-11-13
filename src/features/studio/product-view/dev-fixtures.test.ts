import { describe, expect, it } from 'vitest';
import { readProfile } from '../testing/catalogue-fixtures';
import { fixtureRef, fixturesRequested, withProductViewFixtures } from './dev-fixtures';
import { productViewFor, type MediaAccess } from './product-view';

/**
 * Development stand-in photos (corrective fix): the switch, and what the swap changes — refs and
 * rights only. Real profiles stay rights-blocked; the stand-in profile passes the same gate.
 */

const library: MediaAccess = { hasMedia: () => true, mediaUrl: (ref) => `/media/${ref}` };

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
}

describe('the switch', () => {
  it('is off unless asked; ?product-view-fixtures=1 turns it on for the tab, =0 off', () => {
    const storage = memoryStorage();
    expect(fixturesRequested(new URL('http://x/products/a/design'), storage)).toBe(false);
    expect(fixturesRequested(new URL('http://x/products/a?product-view-fixtures=1'), storage)).toBe(true);
    expect(fixturesRequested(new URL('http://x/products/a/design?variantId=v'), storage)).toBe(true); // remembered
    expect(fixturesRequested(new URL('http://x/?product-view-fixtures=0'), storage)).toBe(false);
    expect(fixturesRequested(new URL('http://x/products/a/design'), storage)).toBe(false);
    expect(fixturesRequested(new URL('http://x/?product-view-fixtures=yes'), storage)).toBe(false);
  });

  it('works without storage (or with blocked storage) from the URL alone', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(fixturesRequested(new URL('http://x/?product-view-fixtures=1'), null)).toBe(true);
    expect(fixturesRequested(new URL('http://x/?product-view-fixtures=1'), blocked)).toBe(true);
    expect(fixturesRequested(new URL('http://x/'), blocked)).toBe(false);
  });
});

describe('the swap', () => {
  it('real photo-frame profiles are owner-cleared (M4-C2); stand-ins pass the same gate, sizes, placements and frames unchanged', () => {
    for (const slug of ['umbrella-photo-custom', 'pen-customized-basic', 'gift-mug-custom-black']) {
      const real = readProfile(slug);
      const own = productViewFor(real, 'front', library);
      expect(own.ok && own.view.url).toBe(`/media/${real.sides[0]!.mockup!.ref}`);
      const stand = withProductViewFixtures(real);
      expect(stand.devFixtures).toBe(true);
      const result = productViewFor(stand, 'front', library);
      expect(result.ok).toBe(true);
      for (const [index, side] of stand.sides.entries()) {
        const original = real.sides[index]!;
        expect(side.mockup!.ref).toBe(fixtureRef(slug, original.mockup!.ref));
        expect(side.mockup!.ref.startsWith(`dev-fixtures/product-view/${slug}/`)).toBe(true);
        expect(side.mockup!.rights).toBe('cleared');
        expect([side.mockup!.width, side.mockup!.height, side.placement, side.photoFrame]).toEqual([original.mockup!.width, original.mockup!.height, original.placement, original.photoFrame]);
      }
      // The real profile object is untouched.
      expect(real.sides[0]!.mockup!.ref.startsWith('products/')).toBe(true);
      expect(real.sides[0]!.mockup!.rights).toBe('cleared');
    }
  });

  it('umbrella masks get stand-ins too (so colour works); mug sides keep sharing one paired photo; missing photos stay missing', () => {
    const umbrella = withProductViewFixtures(readProfile('umbrella-photo-custom'));
    expect(umbrella.sides[0]!.mockup!.mask).toMatchObject({ ref: 'dev-fixtures/product-view/umbrella-photo-custom/umbrella-photo-custom-front-mask.png', rights: 'cleared' });
    const view = productViewFor(umbrella, 'front', library);
    expect(view.ok && view.view.mask).toEqual({ url: '/media/dev-fixtures/product-view/umbrella-photo-custom/umbrella-photo-custom-front-mask.png' });
    const mug = withProductViewFixtures(readProfile('gift-mug-custom-black'));
    expect(mug.sides[0]!.mockup!.ref).toBe(mug.sides[1]!.mockup!.ref);
    const paper = withProductViewFixtures(readProfile('pen-recycled-paper'));
    expect(paper.sides.map((s) => s.mockup)).toEqual([null, null]);
    expect(productViewFor(paper, 'front', library)).toEqual({ ok: false, reason: 'no-mockup' });
  });
});
