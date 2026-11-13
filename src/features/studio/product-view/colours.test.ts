/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioProfile } from '../profile/types';
import { readProfile } from '../testing/catalogue-fixtures';
import { chooseColour, colourUnavailable, productColoursOf, productViewFor, tintFor, type MediaAccess } from './product-view';
import { latestTint, requestTint, setTintRendererForTests, type TintRequest } from './tint-renderer';

/**
 * Product colours (Phase 4 M3): the original's data in the profiles, which products get colours,
 * the default, the mask gate (its own rights), when a side is tinted, and the tint cache.
 */

const STUDIO = path.resolve('public/api/v1/studio');
const all = fs.readdirSync(STUDIO).map((f) => JSON.parse(fs.readFileSync(path.join(STUDIO, f), 'utf8')) as StudioProfile);
const register = JSON.parse(fs.readFileSync(path.resolve('src/data/generated/studio/product-view-placements.json'), 'utf8')) as {
  umbrellaRainwearColours: { palette: Record<string, string>; photoColours: Record<string, [string, string]> };
};
const library: MediaAccess = { hasMedia: () => true, mediaUrl: (ref) => `/media/${ref}` };

/** The real profile with a cleared stand-in photo and, optionally, a cleared stand-in mask. */
function stand(slug: string, { maskRights = 'cleared', change = {} }: { maskRights?: string | undefined; change?: Record<string, unknown> } = {}): StudioProfile {
  const profile = readProfile(slug);
  return {
    ...profile,
    sides: profile.sides.map((side) => ({
      ...side,
      mockup: {
        ...side.mockup!,
        ref: `studio-fixtures/${side.id}.png`,
        rights: 'cleared' as const,
        mask: { ref: `studio-fixtures/${side.id}-mask.png`, width: 1122, height: 1402, rights: maskRights as never, ...change },
      },
    })),
  };
}
const viewOf = (profile: StudioProfile, side = 'front') => {
  const result = productViewFor(profile, side, library);
  if (!result.ok) throw new Error(result.reason);
  return result.view;
};

describe('the colour data', () => {
  it('copies the original palette and photo colours exactly', () => {
    expect(register.umbrellaRainwearColours.palette).toEqual({
      black: '#2b2b2d',
      navy: '#243052',
      red: '#b0262d',
      green: '#1f6a3d',
      grey: '#7d8188',
      blue: '#1f56b0',
      pink: '#e0679f',
      yellow: '#f6c933',
      'safety yellow': '#dbec22',
      orange: '#ee6a1c',
    });
    expect(Object.keys(register.umbrellaRainwearColours.photoColours)).toHaveLength(35);
    expect(register.umbrellaRainwearColours.photoColours['umbrella-promotional']).toEqual(['White', 'Royal Blue']);
  });

  it('umbrellas and rainwear only: 34 with colours (the photo-print umbrella has no colour option); never drinkware or others', () => {
    const coloured = all.filter((p) => p.productColours);
    expect(coloured).toHaveLength(34);
    expect(coloured.every((p) => p.family === 'umbrella' || p.family === 'rainwear')).toBe(true);
    expect(readProfile('umbrella-photo-print').productColours).toBeUndefined();
    for (const p of all.filter((p) => p.family === 'drinkware' || p.family === 'mug' || p.family === 'pen' || p.family === 'apparel' || p.family === 'polo')) {
      expect(productColoursOf(p)).toBeNull();
    }
  });

  it('every option is one of the product’s own colours with its palette hex; the default is the default variant’s colour', () => {
    for (const p of all.filter((p) => p.productColours)) {
      for (const option of p.productColours!.options) expect(register.umbrellaRainwearColours.palette[option.label.toLowerCase()]).toBe(option.hex);
    }
    const golf = readProfile('umbrella-golf');
    expect(golf.productColours!.options.map((o) => [o.label, o.hex])).toEqual([
      ['Black', '#2b2b2d'],
      ['Navy', '#243052'],
      ['Red', '#b0262d'],
    ]);
    expect(golf.productColours!.defaultId).toBe(golf.productColours!.options[0]!.id);
  });

  it('records the mask’s rights (cleared by the owner, M4-C2) on all 35 profiles, and each side’s photo colour where there are colours', () => {
    const family = all.filter((p) => p.family === 'umbrella' || p.family === 'rainwear');
    expect(family).toHaveLength(35);
    for (const side of family.flatMap((p) => p.sides)) expect(side.mockup!.mask!.rights).toBe('cleared');
    for (const p of family.filter((p) => p.productColours)) expect(p.sides.map((s) => s.photoColour)).toEqual(register.umbrellaRainwearColours.photoColours[p.slug]);
    expect(family.filter((p) => !p.productColours).flatMap((p) => p.sides.filter((s) => 'photoColour' in s))).toEqual([]);
  });

  it('validates: bad hex, empty names and repeated ids are dropped; an unknown default falls back to the first', () => {
    const golf = readProfile('umbrella-golf');
    const messy = {
      ...golf,
      productColours: {
        defaultId: 'nope',
        options: [
          { id: 'a', label: 'Red', hex: 'red' },
          { id: 'b', label: ' ', hex: '#111111' },
          { id: 'c', label: 'Navy', hex: '#243052' },
          { id: 'c', label: 'Again', hex: '#000000' },
          { id: 'd', label: 'Green', hex: '#1f6a3d' },
        ],
      },
    };
    expect(productColoursOf(messy)).toEqual({
      options: [
        { id: 'c', label: 'Navy', hex: '#243052' },
        { id: 'd', label: 'Green', hex: '#1f6a3d' },
      ],
      defaultId: 'c',
    });
    expect(productColoursOf({ ...golf, productColours: { options: [], defaultId: 'x' } })).toBeNull();
    expect(productColoursOf({ ...golf, productColours: undefined })).toBeNull();
  });

  it('chooses the colour picked in this session, else the variant’s, else the default', () => {
    const colours = productColoursOf(readProfile('umbrella-golf'))!;
    const [black, navy, red] = colours.options;
    expect(chooseColour(colours, null)).toBe(black);
    expect(chooseColour(colours, null, [navy!.id, 'size-1'])).toBe(navy);
    expect(chooseColour(colours, red!.id, [navy!.id])).toBe(red);
    expect(chooseColour(colours, 'gone', [])).toBe(black);
  });
});

describe('the mask gate', () => {
  it('a mask whose rights aren’t cleared is never used; the real (owner-cleared) masks are', () => {
    const view = viewOf(stand('umbrella-golf', { maskRights: 'unconfirmed' }));
    expect(view.mask).toBeNull();
    const golf = readProfile('umbrella-golf');
    const unconfirmedMask = { ...golf, sides: golf.sides.map((s) => ({ ...s, mockup: { ...s.mockup!, mask: { ...s.mockup!.mask!, rights: 'unconfirmed' as const } } })) };
    expect(viewOf(unconfirmedMask).mask).toBeNull();
    expect(viewOf(golf).mask).toEqual({ url: '/media/products/umbrellas-rainwear-2d/umbrella-golf-front-mask.png' });
  });

  it('a cleared mask is used, front and back, each its own', () => {
    expect(viewOf(stand('umbrella-golf')).mask).toEqual({ url: '/media/studio-fixtures/front-mask.png' });
    expect(viewOf(stand('umbrella-golf'), 'back').mask).toEqual({ url: '/media/studio-fixtures/back-mask.png' });
  });

  it('missing, attribution-required or unrecorded rights, a wrong size, an odd path or no media library block the mask, not the photo', () => {
    for (const profile of [
      stand('umbrella-golf', { change: { rights: undefined } }),
      stand('umbrella-golf', { maskRights: 'attribution-required' }),
      stand('umbrella-golf', { change: { width: 1000 } }),
      stand('umbrella-golf', { change: { ref: '../secret-mask.png' } }),
      stand('umbrella-golf', { change: { ref: 'https://example.com/mask.png' } }),
    ]) {
      expect(viewOf(profile).mask).toBeNull();
    }
    const noMaskMedia: MediaAccess = { hasMedia: (ref) => !ref.endsWith('-mask.png'), mediaUrl: (ref) => `/media/${ref}` };
    const result = productViewFor(stand('umbrella-golf'), 'front', noMaskMedia);
    expect(result.ok && result.view.mask).toBeNull();
  });
});

describe('when a side is tinted', () => {
  const colours = productColoursOf(readProfile('umbrella-golf'))!;
  const [black, navy] = colours.options;

  it('in another colour than its photo, with a mask: the hex; in the photo’s own colour or without a mask: none', () => {
    const view = viewOf(stand('umbrella-golf'));
    expect(view.photoColour).toBe('Black');
    expect(tintFor(view, navy!)).toBe('#243052');
    expect(tintFor(view, black!)).toBeNull();
    expect(tintFor(view, null)).toBeNull();
    expect(tintFor({ ...view, mask: null }, navy!)).toBeNull();
  });

  it('says so when the chosen colour can’t be shown on a side', () => {
    const view = viewOf(stand('umbrella-golf'));
    expect(colourUnavailable(view, navy!, 'applied')).toBe(false);
    expect(colourUnavailable(view, navy!, 'failed')).toBe(true);
    expect(colourUnavailable({ ...view, mask: null }, navy!, 'none')).toBe(true);
    expect(colourUnavailable({ ...view, mask: null }, black!, 'none')).toBe(false); // already that colour
  });
});

describe('the tint cache', () => {
  afterEach(() => setTintRendererForTests(null));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('computes each photo + mask + colour once; another colour or mask computes again', async () => {
    const renderer = vi.fn<(request: TintRequest) => Promise<HTMLCanvasElement>>(async (request) => Object.assign(document.createElement('canvas'), { id: request.hex }));
    setTintRendererForTests(renderer);
    const red = { photoUrl: '/p.png', maskUrl: '/m.png', hex: '#b0262d' };
    expect(requestTint(red)).toEqual({ status: 'loading' });
    expect(requestTint(red)).toEqual({ status: 'loading' });
    await settle();
    const ready = requestTint(red);
    expect(ready.status).toBe('ready');
    expect(requestTint({ ...red, hex: '#B0262D' })).toBe(ready); // same colour, any case
    expect(renderer).toHaveBeenCalledTimes(1);
    requestTint({ ...red, hex: '#243052' });
    requestTint({ ...red, maskUrl: '/other-mask.png' });
    expect(renderer).toHaveBeenCalledTimes(3);
    await settle();
    expect(latestTint('/p.png')).not.toBeNull();
  });

  it('remembers failures (the caller shows the photo as taken) without asking again', async () => {
    const renderer = vi.fn<(request: TintRequest) => Promise<HTMLCanvasElement>>(async () => {
      throw new Error('tainted');
    });
    setTintRendererForTests(renderer);
    const request = { photoUrl: '/p.png', maskUrl: '/m.png', hex: '#1f6a3d' };
    requestTint(request);
    await settle();
    expect(requestTint(request)).toEqual({ status: 'error' });
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(latestTint('/p.png')).toBeNull();
  });
});
