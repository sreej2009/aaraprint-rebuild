/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { zoomPercent } from '../geometry/viewport';
import type { StudioMockup, StudioProfile } from '../profile/types';
import { readProfile } from '../testing/catalogue-fixtures';
import { designToProduct, hasProductView, isValidPlacement, placeArtwork, productBounds, productSpace, productToDesign, productViewFor, type MediaAccess } from './product-view';

/**
 * The "On the product" preview's data (Phase 4 M1): the original placements as extracted, which
 * products carry them, the fitting maths, and the rights gate. Real profiles throughout; a cleared
 * photo only ever appears as a test fixture made here.
 */

const STUDIO = path.resolve('public/api/v1/studio');
const all = fs.readdirSync(STUDIO).map((f) => JSON.parse(fs.readFileSync(path.join(STUDIO, f), 'utf8')) as StudioProfile);
const register = JSON.parse(fs.readFileSync(path.resolve('src/data/generated/studio/product-view-placements.json'), 'utf8')) as {
  sets: Record<string, { folder: string; extension: string; mockupSize: { width: number; height: number }; entries: Record<string, [number, number, number, number]> }>;
};

const library: MediaAccess = { hasMedia: () => true, mediaUrl: (ref) => `/media/${ref}` };
const noLibrary: MediaAccess = { hasMedia: () => false, mediaUrl: (ref) => `/media/${ref}` };

/** A real profile whose photos are swapped for a cleared stand-in (same size, same placements). */
function cleared(slug: string, change: (mockup: StudioMockup) => Partial<StudioMockup> = () => ({})): StudioProfile {
  const profile = readProfile(slug);
  return {
    ...profile,
    sides: profile.sides.map((side) =>
      side.mockup ? { ...side, mockup: { ...side.mockup, ref: `studio-fixtures/${side.id}.png`, format: 'png' as const, rights: 'cleared' as const, ...change(side.mockup) } } : side,
    ),
  };
}

describe('the extracted placements', () => {
  it('copies 290 boxes, all on their 1122 × 1402 photos', () => {
    const sets = Object.values(register.sets);
    expect(sets.map((s) => Object.keys(s.entries).length)).toEqual([220, 70]);
    for (const set of sets) {
      expect(set.mockupSize).toEqual({ width: 1122, height: 1402 });
      for (const [cx, cy, w, h] of Object.values(set.entries)) expect(isValidPlacement({ centerX: cx, centerY: cy, maxWidth: w, maxHeight: h }, set.mockupSize)).toBe(true);
    }
  });

  it('keeps the original numbers exactly', () => {
    expect(register.sets['umbrella-rainwear']!.entries['umbrella-golf-front']).toEqual([563, 374, 170, 227]);
    expect(register.sets['umbrella-rainwear']!.entries['umbrella-golf-back']).toEqual([559, 308, 182, 243]);
    expect(register.sets.drinkware!.entries['bottle-steel-classic-front']).toEqual([561, 781, 270, 236]);
    expect(register.sets.drinkware!.entries['bottle-vacuum-insulated-back']).toEqual([559, 735, 254, 222]);
  });
});

describe('which products have an on-product view', () => {
  it('umbrellas (15), rainwear (20) and wrap-printed drinkware (49) only', () => {
    const count = (kind: string) => all.filter((p) => p.productView === kind).length;
    expect([count('umbrella'), count('rainwear'), count('drinkware-wrap')]).toEqual([15, 20, 49]);
    for (const p of all.filter(hasProductView)) {
      expect(p.productView === 'drinkware-wrap' ? p.family === 'drinkware' && p.mode === 'wrap' : p.family === p.productView).toBe(true);
    }
    // Flat drinkware, pens, mugs, apparel, bags, signs and gifts carry nothing new.
    for (const p of all.filter((p) => !hasProductView(p))) {
      expect(p.sides.every((s) => !('placement' in s))).toBe(true);
    }
    expect(all.find((p) => p.family === 'drinkware' && p.mode === 'flat' && p.sides.some((s) => s.mockup))!.productView).toBeUndefined();
  });

  it("gives every side the original's box for its exact photo, or none", () => {
    const expected = (ref: string | undefined) => {
      if (!ref) return null; // no photo, no placement
      const set = Object.values(register.sets).find((s) => ref.startsWith(s.folder))!;
      const box = set.entries[ref.slice(set.folder.length, -set.extension.length)]!;
      return { centerX: box[0], centerY: box[1], maxWidth: box[2], maxHeight: box[3] };
    };
    const sides = all.filter(hasProductView).flatMap((p) => p.sides);
    for (const side of sides) expect(side.placement).toEqual(expected(side.mockup?.ref));
    expect(sides.filter((s) => s.placement).length).toBe(83 * 2);
  });
});

describe('placing the artwork (contain, centred)', () => {
  it('golf umbrella front: 1800 × 2400 px fitted into 170 × 227 at (563, 374)', () => {
    const box = readProfile('umbrella-golf').sides[0]!.placement!;
    const placed = placeArtwork(box, { width: 1800, height: 2400 });
    expect(placed.scale).toBeCloseTo(170 / 1800, 10);
    expect(placed.width).toBeCloseTo(170, 10);
    expect(placed.height).toBeCloseTo(226.6667, 3);
    expect(placed.x).toBeCloseTo(478, 10);
    expect(placed.y).toBeCloseTo(374 - 226.6667 / 2, 3);
  });

  it('a rain cap and an aluminium bottle fill their boxes one way and stay inside the other', () => {
    const cap = placeArtwork(readProfile('cap-rain-waterproof').sides[0]!.placement!, { width: 900, height: 500 });
    expect(cap.scale).toBeCloseTo(Math.min(617 / 900, 343 / 500), 10);
    expect(cap.width).toBeCloseTo(617, 10);
    expect(cap.height).toBeLessThanOrEqual(343);
    expect([cap.x + cap.width / 2, cap.y + cap.height / 2]).toEqual([562, 533]);
    // Taller artwork in the same box is limited by height instead.
    expect(placeArtwork(readProfile('cap-rain-waterproof').sides[0]!.placement!, { width: 900, height: 900 }).height).toBeCloseTo(343, 10);

    const bottle = placeArtwork(readProfile('drinkware-bottle-aluminium').sides[1]!.placement!, { width: 2250, height: 2100 });
    expect(bottle.scale).toBeCloseTo(238 / 2100, 10);
    expect(bottle.width).toBeCloseTo(2250 * (238 / 2100), 10);
    expect(bottle.x + bottle.width / 2).toBeCloseTo(560, 10);
  });

  it('100 % on the product is still the artwork at its real size', () => {
    const profile = cleared('umbrella-golf');
    const result = productViewFor(profile, 'front', library);
    if (!result.ok) throw new Error(result.reason);
    const placed = placeArtwork(result.view.placement, { width: 1800, height: 2400 });
    const space = productSpace(result.view, placed, { dpi: 300 });
    expect(space).toMatchObject({ widthPx: 1122, heightPx: 1402 });
    // One printed inch (300 print px) at 100 %: 96 CSS px.
    const scale100 = 96 / space.dpi;
    expect(zoomPercent(scale100, space.dpi)).toBeCloseTo(100, 10);
    expect(300 * placed.scale * scale100).toBeCloseTo(96, 10);
  });
});

describe('the rights gate and fallbacks', () => {
  it('every real photo is unconfirmed, so no product shows one', () => {
    for (const p of all.filter(hasProductView)) {
      for (const side of p.sides) expect(productViewFor(p, side.id, library)).toEqual({ ok: false, reason: side.mockup ? 'rights' : 'no-mockup' });
    }
  });

  it('a cleared photo with a placement is allowed, front and back', () => {
    const profile = cleared('umbrella-golf');
    const front = productViewFor(profile, 'front', library);
    const back = productViewFor(profile, 'back', library);
    expect(front).toEqual({
      ok: true,
      view: {
        kind: 'umbrella',
        sideId: 'front',
        url: '/media/studio-fixtures/front.png',
        photo: { width: 1122, height: 1402 },
        placement: { centerX: 563, centerY: 374, maxWidth: 170, maxHeight: 227 },
      },
    });
    expect(back.ok && back.view.placement).toEqual({ centerX: 559, centerY: 308, maxWidth: 182, maxHeight: 243 });
  });

  it('missing or unknown rights block, and so does attribution-required (mockups carry no attribution)', () => {
    for (const rights of [undefined, '', 'attribution-required', 'CLEARED', 'unconfirmed']) {
      expect(
        productViewFor(
          cleared('umbrella-golf', () => ({ rights: rights as never })),
          'front',
          library,
        ),
      ).toEqual({ ok: false, reason: 'rights' });
    }
  });

  it('other products, a missing photo or side, and a published site without media all stay flat', () => {
    expect(productViewFor(readProfile('business-card-classic'), 'front', library)).toEqual({ ok: false, reason: 'unsupported' });
    expect(productViewFor({ ...cleared('umbrella-golf'), productView: 'polo' as never }, 'front', library)).toEqual({ ok: false, reason: 'unsupported' });
    expect(productViewFor(readProfile('gift-water-bottle-steel'), 'front', library)).toEqual({ ok: false, reason: 'no-mockup' });
    expect(productViewFor(cleared('umbrella-golf'), 'inside', library)).toEqual({ ok: false, reason: 'no-mockup' });
    expect(productViewFor(cleared('umbrella-golf'), 'front', noLibrary)).toEqual({ ok: false, reason: 'no-media' });
  });

  it('a missing or nonsensical placement, or an odd photo path, never draws', () => {
    const withPlacement = (placement: unknown): StudioProfile => {
      const profile = cleared('umbrella-golf');
      return { ...profile, sides: profile.sides.map((s) => ({ ...s, placement: placement as never })) };
    };
    expect(productViewFor(withPlacement(null), 'front', library)).toEqual({ ok: false, reason: 'no-placement' });
    expect(productViewFor(withPlacement(undefined), 'front', library)).toEqual({ ok: false, reason: 'no-placement' });
    for (const bad of [
      { centerX: Number.NaN, centerY: 1, maxWidth: 1, maxHeight: 1 },
      { centerX: 100, centerY: 100, maxWidth: 0, maxHeight: 10 },
      { centerX: 1100, centerY: 700, maxWidth: 200, maxHeight: 100 },
      { centerX: '563', centerY: 374, maxWidth: 170, maxHeight: 227 },
      [563, 374, 170, 227],
    ]) {
      expect(productViewFor(withPlacement(bad), 'front', library)).toEqual({ ok: false, reason: 'invalid' });
    }
    for (const ref of ['../secret.png', 'https://example.com/photo.png', '//cdn.example.com/a.png', 'javascript:alert(1).png', 'products/photo.svg', '/products/a.png']) {
      expect(
        productViewFor(
          cleared('umbrella-golf', () => ({ ref })),
          'front',
          library,
        ),
      ).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(
      productViewFor(
        cleared('umbrella-golf', () => ({ width: 0 })),
        'front',
        library,
      ),
    ).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('the editing workspace on the product (M2): design ↔ product ↔ screen', () => {
  const view = (slug: string, side: 'front' | 'back') => {
    const result = productViewFor(cleared(slug), side, library);
    if (!result.ok) throw new Error(result.reason);
    return result.view;
  };

  it('puts the whole photo around the print area in design px (golf umbrella front)', () => {
    const front = view('umbrella-golf', 'front');
    const placed = placeArtwork(front.placement, { width: 1800, height: 2400 });
    const bounds = productBounds(front, placed);
    const s = 170 / 1800;
    expect(bounds.x).toBeCloseTo(-478 / s, 6);
    expect(bounds.y).toBeCloseTo(-(374 - (2400 * s) / 2) / s, 6);
    expect(bounds.width).toBeCloseTo(1122 / s, 6);
    expect(bounds.height).toBeCloseTo(1402 / s, 6);
    // The print area (0, 0)–(1800, 2400) lies inside, and the photo keeps its proportions.
    expect(bounds.x).toBeLessThan(0);
    expect(bounds.y).toBeLessThan(0);
    expect(bounds.x + bounds.width).toBeGreaterThan(1800);
    expect(bounds.y + bounds.height).toBeGreaterThan(2400);
    expect(bounds.width / bounds.height).toBeCloseTo(1122 / 1402, 10);
  });

  it('maps the print area onto the box: centre, scale and proportions, front and back', () => {
    for (const [side, box] of [
      ['front', [563, 374, 170, 227]],
      ['back', [559, 308, 182, 243]],
    ] as const) {
      const placed = placeArtwork(view('umbrella-golf', side).placement, { width: 1800, height: 2400 });
      const centre = designToProduct({ x: 900, y: 1200 }, placed);
      expect(centre.x).toBeCloseTo(box[0], 9);
      expect(centre.y).toBeCloseTo(box[1], 9);
      const topLeft = designToProduct({ x: 0, y: 0 }, placed);
      const bottomRight = designToProduct({ x: 1800, y: 2400 }, placed);
      const width = bottomRight.x - topLeft.x;
      const height = bottomRight.y - topLeft.y;
      expect(width).toBeLessThanOrEqual(box[2] + 1e-9);
      expect(height).toBeLessThanOrEqual(box[3] + 1e-9);
      expect(width / height).toBeCloseTo(1800 / 2400, 10); // not stretched
    }
  });

  it('round-trips design → product → screen → product → design', () => {
    const bottle = view('drinkware-bottle-aluminium', 'back');
    const placed = placeArtwork(bottle.placement, { width: 2250, height: 2100 });
    // A product-space view (the whole photo at some zoom and pan) and the editor's design-space view
    // it amounts to: one transform, so artwork and photo can never drift apart.
    const productView = { scale: 0.61, x: 37.5, y: -12.25 };
    const designView = { scale: productView.scale * placed.scale, x: productView.x + placed.x * productView.scale, y: productView.y + placed.y * productView.scale };
    for (const point of [
      { x: 0, y: 0 },
      { x: 2250, y: 2100 },
      { x: 1125.5, y: 17.25 },
      { x: -300, y: 4000 },
    ]) {
      const onPhoto = designToProduct(point, placed);
      const onScreen = { x: productView.x + onPhoto.x * productView.scale, y: productView.y + onPhoto.y * productView.scale };
      expect(onScreen.x).toBeCloseTo(designView.x + point.x * designView.scale, 9);
      expect(onScreen.y).toBeCloseTo(designView.y + point.y * designView.scale, 9);
      const back = productToDesign({ x: (onScreen.x - productView.x) / productView.scale, y: (onScreen.y - productView.y) / productView.scale }, placed);
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.y).toBeCloseTo(point.y, 9);
    }
  });
});
