import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogueApi } from '@/lib/api/catalogue';
import { fitScale, workspacePadding } from '../geometry/fit';
import { describePrint, formatLength, formatSize } from '../profile/describe';
import type { StudioApi } from '../profile/api';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { loadStudio } from './load-studio';
import { useStudioLayout } from './use-studio-layout';
import { resolveStudioVariant, variantSummary } from './variant';

const NBSP = String.fromCharCode(0xa0);
const plain = (text: string | null) => text?.replaceAll(NBSP, ' ') ?? null;

const card = readProduct('business-card-classic');
const cardProfile = readProfile('business-card-classic');

function apis(overrides: { product?: unknown; profile?: unknown; error?: Error } = {}) {
  const catalogue = {
    getProduct: vi.fn<() => Promise<unknown>>(async () => {
      if (overrides.error) throw overrides.error;
      return 'product' in overrides ? overrides.product : card;
    }),
  } as unknown as CatalogueApi;
  const studio = { getProfile: vi.fn<() => Promise<unknown>>(async () => ('profile' in overrides ? overrides.profile : cardProfile)) } as unknown as StudioApi;
  return { catalogue, studio };
}
const url = (query = '') => new URL(`http://localhost/products/business-card-classic/design${query}`);

describe('loadStudio', () => {
  it('loads the product and profile; no variant, side or tool unless the URL names one', async () => {
    const result = await loadStudio('business-card-classic', url(), apis());
    expect(result).toMatchObject({ status: 'ready', product: { slug: 'business-card-classic' }, profile: { slug: 'business-card-classic' }, initialSurface: null, initialTool: null });
    // A restored design keeps its own variant; a new one starts on the default (StudioApp).
    expect(result.status === 'ready' && result.variantId).toBeNull();
  });

  it('keeps a valid variant and side from the URL and ignores unknown ones', async () => {
    const variant = card.variants[3]!;
    const ok = await loadStudio('business-card-classic', url(`?variantId=${variant.id}&side=back`), apis());
    expect(ok).toMatchObject({ variantId: variant.id, initialSurface: 'back' });
    const bad = await loadStudio('business-card-classic', url('?variantId=nope&side=inside&tool=lasers'), apis());
    expect(bad).toMatchObject({ variantId: null, initialSurface: null, initialTool: null });
  });

  it('opens Uploads for the product page’s “Upload your design” link, or a named tool', async () => {
    expect(await loadStudio('business-card-classic', url('?mode=upload'), apis())).toMatchObject({ initialTool: 'uploads' });
    expect(await loadStudio('business-card-classic', url('?tool=product'), apis())).toMatchObject({ initialTool: 'product' });
  });

  it('reports unknown and unsupported products', async () => {
    expect(await loadStudio('nope', url(), apis({ product: null, profile: null }))).toEqual({ status: 'not-found' });
    const holder = readProduct('card-accessory-metal-holder');
    expect(await loadStudio(holder.slug, url(), apis({ product: holder, profile: null }))).toEqual({
      status: 'unsupported',
      productName: holder.name,
      productHref: '/products/card-accessory-metal-holder',
    });
    expect(await loadStudio('business-card-classic', url(), apis({ profile: null }))).toMatchObject({ status: 'unsupported' });
  });

  it('lets network errors reach the error boundary', async () => {
    await expect(loadStudio('business-card-classic', url(), apis({ error: new Error('offline') }))).rejects.toThrow('offline');
  });
});

describe('print descriptions', () => {
  it('describes a visiting card in millimetres', () => {
    const print = describePrint(cardProfile);
    expect(Object.fromEntries(Object.entries(print).map(([k, v]) => [k, plain(v)]))).toEqual({
      finishedSize: '88.9 × 50.8 mm',
      withBleed: '91.9 × 53.8 mm',
      bleed: '1.5 mm',
      safeZone: '2 mm',
      dpi: '300 DPI',
      shape: 'Rectangle',
      sides: 'Front and back',
    });
  });

  it('omits bleed for products without it and switches to centimetres for large items', () => {
    const pen = describePrint(readProfile('pen-ballpoint-classic'));
    expect(pen.withBleed).toBeNull();
    expect(pen.bleed).toBeNull();
    expect(plain(pen.finishedSize)).toBe('10.2 × 2 cm');
    expect(plain(describePrint(readProfile('business-card-circle')).shape)).toBe('Round');
    expect(plain(describePrint(readProfile('apparel-polo-classic')).sides)).toBe('Left chest and upper back');
    expect(plain(formatLength(150))).toBe('15 cm');
    expect(plain(formatSize(1524, 568.6))).toBe('152.4 × 56.9 cm');
  });

  it('never lets a value and its unit break apart', () => {
    expect(formatLength(1.7)).toBe(`1.7${NBSP}mm`);
    expect(describePrint(cardProfile).finishedSize).not.toContain(' ');
  });
});

describe('variant helpers', () => {
  it('summarises the chosen options, quantity first', () => {
    const variant = resolveStudioVariant(card, null);
    expect(variantSummary(card, variant)).toBe('100 cards · Classic Black');
    expect(variantSummary(card, undefined)).toBe('');
  });

  it('falls back to the default variant', () => {
    expect(resolveStudioVariant(card, 'missing')?.isDefault).toBe(true);
    expect(resolveStudioVariant(card, card.variants[2]!.id)).toBe(card.variants[2]);
  });
});

describe('fit maths', () => {
  it('fits the bleed box with padding, whatever the aspect ratio', () => {
    expect(fitScale({ width: 1000, height: 600 }, { width: 1086, height: 636 }, 50)).toBeCloseTo(500 / 636, 6);
    expect(fitScale({ width: 400, height: 800 }, { width: 1200, height: 240 }, 20)).toBeCloseTo(360 / 1200, 6);
    expect(fitScale({ width: 30, height: 30 }, { width: 100, height: 100 }, 20)).toBe(0);
    expect(fitScale({ width: 300, height: 300 }, { width: 0, height: 100 }, 20)).toBe(0);
  });

  it('uses less padding on small screens', () => {
    expect(workspacePadding(390)).toBe(36);
    expect(workspacePadding(820)).toBe(48);
    expect(workspacePadding(1440)).toBe(64);
  });
});

describe('useStudioLayout', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  function mockWidth(initial: number) {
    let width = initial;
    const listeners = new Set<() => void>();
    window.matchMedia = ((query: string) => {
      const min = Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0);
      return {
        get matches() {
          return width >= min;
        },
        media: query,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
    return {
      resize(next: number) {
        width = next;
        for (const fn of listeners) fn();
      },
    };
  }

  it.each([
    [390, 'phone'],
    [820, 'tablet'],
    [1100, 'laptop'],
    [1440, 'desktop'],
  ] as const)('%i px → %s', (width, layout) => {
    mockWidth(width);
    expect(renderHook(() => useStudioLayout()).result.current).toBe(layout);
  });

  it('updates when the window crosses a breakpoint', () => {
    const screen = mockWidth(1440);
    const { result } = renderHook(() => useStudioLayout());
    act(() => screen.resize(700));
    expect(result.current).toBe('phone');
  });
});
