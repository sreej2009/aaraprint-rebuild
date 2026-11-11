import type { StudioProfile } from '../profile/types';

/**
 * Stand-in product photos for development (Phase 4 corrective fix). Every recovered product photo
 * and mask has unconfirmed rights, so the rights gate rightly hides the product view — which left
 * no way to see or check it in the running app. In development only (`npm run dev`), opening a
 * page with `?product-view-fixtures=1` swaps a profile's photos and masks for generated stand-ins
 * marked cleared; the dev media server draws them (tooling/product-view-fixtures.ts) around the
 * product's real placement. Sizes, placements and frames are untouched, so everything downstream —
 * rights gate, placement, editing, Preview, tint — runs exactly as it would on cleared photos.
 * Real photos are never requested, real rights never change, and production builds leave this out
 * (the only caller is behind `import.meta.env.DEV`). `?product-view-fixtures=0` turns it off.
 */

export const FIXTURE_PARAM = 'product-view-fixtures';
export const FIXTURE_FOLDER = 'dev-fixtures/product-view';
const STORAGE_KEY = 'aaraprint:dev:product-view-fixtures';

/** On when the URL says so (remembered for the tab, so "Start designing" keeps it), off with `=0`. */
export function fixturesRequested(url: URL, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): boolean {
  const asked = url.searchParams.get(FIXTURE_PARAM);
  try {
    if (asked === '1') storage?.setItem(STORAGE_KEY, 'on');
    if (asked === '0') storage?.removeItem(STORAGE_KEY);
    return asked === '1' || (asked !== '0' && storage?.getItem(STORAGE_KEY) === 'on');
  } catch {
    return asked === '1';
  }
}

/** `products/pens-2d/classic-front.png` → `dev-fixtures/product-view/<slug>/classic-front.png` (sides sharing a photo keep sharing one). */
export function fixtureRef(slug: string, ref: string): string {
  const name = ref
    .split('/')
    .pop()!
    .replace(/\.(png|webp)$/i, '');
  return `${FIXTURE_FOLDER}/${slug}/${name}.png`;
}

/** The profile with its photos and masks swapped for cleared stand-ins. Everything else is unchanged. */
export function withProductViewFixtures(profile: StudioProfile): StudioProfile {
  return {
    ...profile,
    devFixtures: true,
    sides: profile.sides.map((side) => {
      if (!side.mockup) return side;
      const { mask } = side.mockup;
      return {
        ...side,
        mockup: {
          ...side.mockup,
          ref: fixtureRef(profile.slug, side.mockup.ref),
          format: 'png',
          rights: 'cleared',
          mask: mask ? { ...mask, ref: fixtureRef(profile.slug, mask.ref), rights: 'cleared' } : null,
        },
      };
    }),
  };
}
