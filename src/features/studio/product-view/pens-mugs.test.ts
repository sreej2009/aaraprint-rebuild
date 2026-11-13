/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StudioProfile } from '../profile/types';
import { readProfile } from '../testing/catalogue-fixtures';
import { designToProduct, frameFor, photoRect, placeArtwork, productBounds, productColoursOf, productToDesign, productViewFor, type MediaAccess } from './product-view';

/**
 * Pens and mugs on the product (Phase 4 M4): the original's photo maps and print-area formulas as
 * extracted, the profiles built from them, placement exactness, front and back, the frames and
 * crops, round trips, and the rights gate. Real photos stay blocked; cleared stand-ins are made here.
 */

const STUDIO = path.resolve('public/api/v1/studio');
const all = fs.readdirSync(STUDIO).map((f) => JSON.parse(fs.readFileSync(path.join(STUDIO, f), 'utf8')) as StudioProfile);
const register = JSON.parse(fs.readFileSync(path.resolve('src/data/generated/studio/product-view-placements.json'), 'utf8')) as {
  pens: {
    frame: { width: number; height: number };
    box: number[];
    families: Record<string, { front: string; back: string }>;
    products: Record<string, { family: string; colours: Record<string, string> }>;
  };
  mugs: { frame: { width: number; height: number }; sideWidth: number; backOffsetX: number; products: Record<string, { photo: string; box: number[] }> };
};
const library: MediaAccess = { hasMedia: () => true, mediaUrl: (ref) => `/media/${ref}` };

/** A real profile with its photos marked cleared (a test stand-in; real rights are unconfirmed). */
function cleared(slug: string, change: Record<string, unknown> = {}): StudioProfile {
  const profile = readProfile(slug);
  return { ...profile, sides: profile.sides.map((s) => (s.mockup ? { ...s, mockup: { ...s.mockup, rights: 'cleared' as const }, ...change } : s)) };
}
const viewOf = (profile: StudioProfile, side: 'front' | 'back' = 'front') => {
  const result = productViewFor(profile, side, library);
  if (!result.ok) throw new Error(result.reason);
  return result.view;
};

describe('pens: the original data', () => {
  it('copies the frame and print box exactly: 2000 × 700, centre (1160, 350), at most 700 × 104', () => {
    expect(register.pens.frame).toEqual({ width: 2000, height: 700 });
    expect(register.pens.box).toEqual([1160, 350, 700, 104]);
  });

  it('has 10 families with front and back photos; maps 50 slugs (49 pens and the wooden gift pen)', () => {
    expect(Object.keys(register.pens.families)).toEqual(['classic', 'fountain', 'gel', 'highlighter', 'metal', 'multicolor', 'paper', 'roller', 'stylus', 'wheat']);
    expect(register.pens.families.paper).toMatchObject({ front: 'paper-front-v2.png', back: 'paper-back-v2.png' });
    expect(Object.keys(register.pens.products)).toHaveLength(50);
    expect(register.pens.products['pen-gold-click']).toMatchObject({ family: 'classic', colours: { body: '#fff7e6', clip: '#c49a45' } });
  });

  it('every one of the 49 pens is mapped to its original family; 48 have photos (the paper pen’s aren’t recovered)', () => {
    const pens = all.filter((p) => p.family === 'pen');
    expect(pens).toHaveLength(49);
    expect(pens.every((p) => p.productView === 'pen')).toBe(true);
    const paper = pens.find((p) => p.slug === 'pen-recycled-paper')!;
    expect(paper.sides.map((s) => [s.mockup, s.placement])).toEqual([
      [null, null],
      [null, null],
    ]);
    const box = { centerX: 1160, centerY: 350, maxWidth: 700, maxHeight: 104 };
    for (const pen of pens.filter((p) => p !== paper)) {
      const family = register.pens.families[register.pens.products[pen.slug]!.family]!;
      expect(pen.sides.map((s) => s.mockup!.ref)).toEqual([`products/pens-2d/${family.front}`, `products/pens-2d/${family.back}`]);
      expect(pen.sides.map((s) => s.placement)).toEqual([box, box]);
    }
    // The wooden pen is a gift here: gifts aren't in M4.
    expect(readProfile('gift-pen-wooden-ball').productView).toBeUndefined();
  });

  it('draws the photo across the whole 2000 × 700 frame (the photos are 2118–2120 × 742: the same proportions)', () => {
    const view = viewOf(cleared('pen-gold-click'));
    expect(view.photo).toEqual({ width: 2000, height: 700 });
    expect(view.draw).toEqual({ crop: null, at: { x: 0, y: 0, width: 2000, height: 700 } });
    expect(view.url).toBe('/media/products/pens-2d/classic-front.png');
    expect(viewOf(cleared('pen-gold-click'), 'back').url).toBe('/media/products/pens-2d/classic-back.png');
    expect(viewOf(cleared('pen-highlighter-set')).url).toBe('/media/products/pens-2d/highlighter-front.png');
  });
});

describe('pens: placement, exactly as the original formula', () => {
  // The original: scale = min(700 / w, 104 / h); x = 1160 − w·scale / 2; y = 350 − h·scale / 2.
  const original = (w: number, h: number) => {
    const scale = Math.min(700 / w, 104 / h);
    return { x: 1160 - (w * scale) / 2, y: 350 - (h * scale) / 2, width: w * scale, height: h * scale, scale };
  };
  const box = { centerX: 1160, centerY: 350, maxWidth: 700, maxHeight: 104 };

  it('the standard 1200 × 240 print area: 520 × 104 at (900, 298)', () => {
    expect(placeArtwork(box, { width: 1200, height: 240 })).toEqual({ x: 900, y: 298, width: 520, height: 104, scale: 104 / 240 });
  });

  it('every pen print size, small and oversized artwork: identical to the original, centred, never stretched', () => {
    for (const [w, h] of [
      [1200, 240],
      [1300, 220],
      [1000, 240],
      [1200, 200],
      [100, 20],
      [12000, 2400],
      [4000, 100],
    ]) {
      const ours = placeArtwork(box, { width: w!, height: h! });
      const theirs = original(w!, h!);
      for (const key of ['x', 'y', 'width', 'height', 'scale'] as const) expect(ours[key]).toBeCloseTo(theirs[key], 9);
      expect(ours.x + ours.width / 2).toBeCloseTo(1160, 9);
      expect(ours.y + ours.height / 2).toBeCloseTo(350, 9);
      expect(ours.width / ours.height).toBeCloseTo(w! / h!, 9);
      expect(ours.width).toBeLessThanOrEqual(700 + 1e-9);
      expect(ours.height).toBeLessThanOrEqual(104 + 1e-9);
    }
  });

  it('round-trips design → product → design, and puts the photo around the print area in design px', () => {
    const view = viewOf(cleared('pen-ballpoint-classic'));
    const placed = placeArtwork(view.placement, { width: 1200, height: 240 });
    for (const point of [
      { x: 0, y: 0 },
      { x: 1200, y: 240 },
      { x: 333.3, y: 17 },
    ]) {
      const back = productToDesign(designToProduct(point, placed), placed);
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.y).toBeCloseTo(point.y, 9);
    }
    const bounds = productBounds(view, placed);
    expect(bounds).toEqual(photoRect(view, placed)); // the photo fills the frame
    expect(bounds.x).toBeCloseTo(-900 / placed.scale, 9);
    expect(bounds.width).toBeCloseTo(2000 / placed.scale, 9);
  });
});

describe('mugs: the original data', () => {
  it('copies the frame, the side cut and every mug’s print box exactly', () => {
    expect(register.mugs.frame).toEqual({ width: 900, height: 1086 });
    expect([register.mugs.sideWidth, register.mugs.backOffsetX]).toEqual([724, 176]);
    expect(Object.keys(register.mugs.products)).toHaveLength(9);
    expect(register.mugs.products['gift-mug-custom-black']).toEqual({ photo: 'custom-black.png', box: [450, 515, 390, 245] });
    expect(register.mugs.products['mug-insulated-travel']).toEqual({ photo: 'insulated-travel.png', box: [450, 515, 365, 285] });
    expect(register.mugs.products['gift-mug-magic-colour-change']!.photo).toBe('colour-changing-magic.png');
  });

  it('all 9 mugs get the mug view; 5 have their paired photo, 4 don’t (not recovered) and stay flat', () => {
    const mugs = all.filter((p) => p.family === 'mug');
    expect(mugs.map((p) => p.productView)).toEqual(Array(9).fill('mug'));
    const withPhoto = mugs.filter((p) => p.sides.every((s) => s.mockup && s.placement)).map((p) => p.slug);
    expect(withPhoto.sort()).toEqual(['gift-mug-custom-black', 'gift-mug-custom-decorative', 'gift-mug-magic-colour-change', 'gift-mug-personalised', 'mug-magic-colour-change']);
    for (const slug of ['mug-classic-photo', 'mug-insulated-travel', 'mug-large-latte-15oz', 'mug-two-tone-colour']) {
      expect(productViewFor(cleared(slug), 'front', library)).toEqual({ ok: false, reason: 'no-mockup' });
    }
  });

  it('front is the paired photo’s left half at x 0; back its right half drawn 176 px in; one photo for both', () => {
    const profile = cleared('gift-mug-custom-black');
    const front = viewOf(profile);
    const back = viewOf(profile, 'back');
    expect(front.url).toBe(back.url);
    expect(front.photo).toEqual({ width: 900, height: 1086 });
    expect(front.draw).toEqual({ crop: { x: 0, y: 0, width: 724, height: 1086 }, at: { x: 0, y: 0, width: 724, height: 1086 } });
    expect(back.draw).toEqual({ crop: { x: 724, y: 0, width: 724, height: 1086 }, at: { x: 176, y: 0, width: 724, height: 1086 } });
    expect(front.placement).toEqual(back.placement);
  });

  it('places a 2700 × 1050 wrap at the original box (contain, centred at x 450), round trips, never stretched', () => {
    const view = viewOf(cleared('gift-mug-custom-black'));
    const placed = placeArtwork(view.placement, { width: 2700, height: 1050 });
    expect(placed.scale).toBeCloseTo(390 / 2700, 12);
    expect(placed.x).toBeCloseTo(450 - 195, 9);
    expect(placed.y + placed.height / 2).toBeCloseTo(515, 9);
    expect(placed.width / placed.height).toBeCloseTo(2700 / 1050, 12);
    const tall = placeArtwork({ centerX: 450, centerY: 515, maxWidth: 365, maxHeight: 285 }, { width: 2700, height: 1350 });
    expect(tall.scale).toBeCloseTo(Math.min(365 / 2700, 285 / 1350), 12);
    const back = productToDesign(designToProduct({ x: 1234, y: 567 }, placed), placed);
    expect([back.x, back.y].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([1234, 567]);
    // The back's half starts 176 frame px in: in design px, 176 / scale to the right of the front's.
    const backRect = photoRect(viewOf(cleared('gift-mug-custom-black'), 'back'), placed);
    expect(backRect.x - photoRect(view, placed).x).toBeCloseTo(176 / placed.scale, 9);
  });
});

describe('rights, validation and the registry', () => {
  it('every real pen and mug photo is owner-cleared (M4-C2): shown wherever it was recovered with its box', () => {
    for (const p of all.filter((p) => p.productView === 'pen' || p.productView === 'mug')) {
      for (const side of p.sides) {
        const result = productViewFor(p, side.id, library);
        expect(result.ok ? 'ok' : result.reason, `${p.slug} ${side.id}`).toBe(side.mockup ? (side.placement ? 'ok' : 'no-placement') : 'no-mockup');
      }
    }
  });

  it('missing rights, an odd path, or no media library block a cleared-looking pen', () => {
    const pen = readProfile('pen-ballpoint-classic');
    const with_ = (mockup: Record<string, unknown>) => ({ ...pen, sides: pen.sides.map((s) => ({ ...s, mockup: { ...s.mockup!, rights: 'cleared' as const, ...mockup } })) });
    expect(productViewFor(with_({ rights: undefined }), 'front', library)).toEqual({ ok: false, reason: 'rights' });
    expect(productViewFor(with_({ ref: '../pens-2d/classic-front.png' }), 'front', library)).toEqual({ ok: false, reason: 'invalid' });
    expect(productViewFor(with_({ width: 0 }), 'front', library)).toEqual({ ok: false, reason: 'invalid' });
    expect(productViewFor(cleared('pen-ballpoint-classic'), 'front', { hasMedia: () => false, mediaUrl: (r) => r })).toEqual({ ok: false, reason: 'no-media' });
  });

  it('rejects frames that would stretch, overflow or make no sense', () => {
    const image = { width: 1448, height: 1086 };
    const at = { x: 0, y: 0, width: 724, height: 1086 };
    expect(frameFor({ width: 900, height: 1086, crop: { x: 0, y: 0, width: 724, height: 1086 }, at }, image)).not.toBeNull();
    for (const bad of [
      { width: 900, height: 1086, crop: null, at }, // the whole paired photo squeezed into one side
      { width: 900, height: 1086, crop: { x: 900, y: 0, width: 724, height: 1086 }, at }, // crop off the photo
      { width: 900, height: 1086, crop: { x: 0, y: 0, width: 724, height: 1086 }, at: { ...at, x: 300 } }, // drawn off the frame
      { width: 0, height: 1086, crop: null, at },
      { width: 900, height: 1086, crop: { x: -1, y: 0, width: 724, height: 1086 }, at },
      { width: 900, height: 1086, crop: 'left', at },
      'frame',
    ]) {
      expect(frameFor(bad, image)).toBeNull();
    }
    const pen = cleared('pen-ballpoint-classic', { photoFrame: { width: 2000, height: 700, crop: null, at: { x: 0, y: 0, width: 2000, height: 500 } } });
    expect(productViewFor(pen, 'front', library)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('pens and mugs never get the umbrella and rainwear colour choice (no masks)', () => {
    for (const slug of ['pen-gold-click', 'pen-multicolor-ball', 'gift-mug-custom-black', 'mug-two-tone-colour']) {
      expect(productColoursOf(readProfile(slug))).toBeNull();
    }
    expect(viewOf(cleared('pen-gold-click')).mask).toBeNull();
    expect(viewOf(cleared('gift-mug-custom-black')).mask).toBeNull();
  });
});
