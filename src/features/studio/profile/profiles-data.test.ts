import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import meta from '@/data/generated/studio/profiles-meta.json';
import type { Product } from '@/lib/catalogue/types';
import { placementOf } from '../geometry/bounds';
import { pxToMm } from '../geometry/units';
import { profileBoxes, trimShapeOf } from './print';
import { canUseAsset, type StudioProfile } from './types';

/** Integrity checks on the generated Studio profiles (scripts/studio/build-studio-profiles.mjs). */
const catalogueDir = path.resolve('public/api/v1/catalogue/products');
const studioDir = path.resolve('public/api/v1/studio');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

const products = fs.readdirSync(catalogueDir).map((f) => read<Product>(path.join(catalogueDir, f)));
const profiles = new Map(fs.readdirSync(studioDir).map((f) => [f.replace(/\.json$/, ''), read<StudioProfile>(path.join(studioDir, f))]));
const profile = (slug: string): StudioProfile => {
  const found = profiles.get(slug);
  if (!found) throw new Error(`No Studio profile for ${slug}`);
  return found;
};

describe('Studio profiles', () => {
  it('exist for every customisable product and only for those', () => {
    const customisable = products.filter((p) => p.isCustomizable && p.print).map((p) => p.slug);
    expect(customisable).toHaveLength(532);
    expect([...profiles.keys()].sort()).toEqual(customisable.sort());
    expect(profiles.has('card-accessory-metal-holder')).toBe(false);
    expect(meta.profiles).toBe(532);
    expect(meta.byMode).toEqual({ apparel: 104, flat: 354, wrap: 74 });
  });

  it('copy print sizes from the catalogue unchanged (decision D2)', () => {
    for (const product of products) {
      if (!product.print || !product.isCustomizable) continue;
      const { print } = profile(product.slug);
      expect([print.widthPx, print.heightPx, print.dpi, print.bleedPx, print.safeZonePx], product.slug).toEqual([
        product.print.canvasWidthPx,
        product.print.canvasHeightPx,
        product.print.dpi,
        product.print.bleedPx,
        product.print.safeZonePx,
      ]);
    }
  });

  it('give every product a front and a back with sensible geometry', () => {
    for (const p of profiles.values()) {
      expect(p.sides.map((s) => s.id), p.slug).toEqual(['front', 'back']);
      const boxes = profileBoxes(p);
      expect(boxes.safe.width, p.slug).toBeGreaterThan(0);
      expect(boxes.safe.height, p.slug).toBeGreaterThan(0);
    }
    // On rectangular trims the safe box itself classifies as inside.
    const rectangular = [...profiles.values()].filter((p) => p.trim.shape === 'rectangle');
    for (const p of rectangular) {
      const boxes = profileBoxes(p);
      expect(placementOf({ ...boxes.safe, rotation: 0 }, boxes, trimShapeOf(p.trim)), p.slug).toBe('inside');
    }
  });

  it('keep the original Studio’s labels and shapes', () => {
    expect(profile('apparel-polo-classic').sides.map((s) => s.label)).toEqual(['Left chest', 'Upper back']);
    expect(profile('business-card-classic').sides.map((s) => s.label)).toEqual(['Front', 'Back']);
    expect(profile('business-card-oval').trim).toMatchObject({ shape: 'ellipse', source: 'product-override' });
    expect(profile('business-card-circle').trim.shape).toBe('ellipse');
    const rounded = profile('business-card-rounded-corner');
    expect(rounded.trim.shape).toBe('rounded-rectangle');
    expect(pxToMm(rounded.trim.cornerRadiusPx, rounded.print.dpi)).toBeCloseTo(3, 1);
    expect(meta.byTrim).toEqual({ ellipse: 18, rectangle: 499, 'rounded-rectangle': 15 });
  });

  it('record families for the Phase 4 workspaces', () => {
    expect(profile('apparel-polo-classic').family).toBe('polo');
    expect(profile('pen-ballpoint-classic').family).toBe('pen');
    expect(profile('mug-classic-photo').family).toBe('mug');
    expect(profile('umbrella-golf').family).toBe('umbrella');
    expect(profile('gift-mousepad-round-photo').family).toBe('round-pad');
    expect(Object.values(meta.byFamily).reduce((a, b) => a + b, 0)).toBe(532);
  });

  it('find every referenced mockup, mask and model in the recovered folders', () => {
    expect(meta.missing).toEqual([]);
    expect(meta.withMockups).toBe(320 + 48 + 5); // + pens and mugs with photos (Phase 4 M4)
    const polo = profile('apparel-polo-classic').sides[0]?.mockup;
    expect(polo).toMatchObject({ ref: 'products/polo/front.png', width: 1254, height: 1254 });
    const umbrella = profile('umbrella-golf').sides[0]?.mockup;
    expect(umbrella?.mask).toMatchObject({ ref: 'products/umbrellas-rainwear-2d/umbrella-golf-front-mask.png' });
  });

  it('mark asset rights so unconfirmed assets are never used', () => {
    const mockupRights = [...profiles.values()].flatMap((p) => p.sides.flatMap((s) => (s.mockup ? [s.mockup.rights] : [])));
    expect(mockupRights).toHaveLength(640 + (48 + 5) * 2);
    expect(new Set(mockupRights)).toEqual(new Set(['unconfirmed']));
    const poloModel = profile('apparel-polo-classic').model3d;
    expect(poloModel).toMatchObject({ ref: 'models/polo-shirt.glb', rights: 'attribution-required' });
    expect(poloModel?.attribution).toContain('CC BY 4.0');
    expect(profile('apparel-tshirt-classic-cotton').model3d?.rights).toBe('unconfirmed');
    expect(canUseAsset('attribution-required')).toBe(true);
    expect(canUseAsset('unconfirmed')).toBe(false);
  });

  it('report the 8 named-size mismatches without changing them (decision D2)', () => {
    expect(meta.sizeAudit.mismatches.map((m) => m.slug)).toEqual([
      'flyer-a5-heavyweight',
      'flyer-a5-matte',
      'flyer-a5-recycled',
      'flyer-a5-standard',
      'flyer-a6-mini',
      'stationery-diary-a5-personalised',
      'stationery-notebook-a4',
      'stationery-notepad-a5',
    ]);
    expect(profile('flyer-a4-standard').sizeCheck?.matches).toBe(true);
    expect(profile('stationery-envelope-dl').sizeCheck?.matches).toBe(true);
  });

  it('list options that change the real print size, ignoring garment sizes', () => {
    expect(profile('business-card-circle').geometryOptions).toEqual(['Diameter']);
    expect(profile('business-card-rounded-corner').geometryOptions).toEqual(['Corner Radius']);
    expect(profile('apparel-polo-classic').geometryOptions).toEqual([]);
  });
});

const recovered = path.resolve('../recovered');
const additional = path.resolve('../recovered-additional');
const countFiles = (dir: string): number =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1), 0);

describe.skipIf(!fs.existsSync(recovered) || !fs.existsSync(additional))('recovered folders', () => {
  it('are untouched (file counts from the Asset Inventory and Phase 1 recovery)', () => {
    expect(countFiles(recovered)).toBe(1722);
    expect(countFiles(additional)).toBe(192);
  });
});
