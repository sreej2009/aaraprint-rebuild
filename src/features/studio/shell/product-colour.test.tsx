import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { setGraphicsLibraryForTests } from '../assets/graphics';
import { setImageLoaderForTests } from '../assets/image-cache';
import { setPreviewRendererForTests, type PreviewCanvasProps, type ProductCanvasProps } from '../preview/renderer';
import { setTintRendererForTests, type TintRequest } from '../product-view/tint-renderer';
import { createMemoryRepository, type MemoryRepository } from '../persistence/repository';
import type { StudioProfile } from '../profile/types';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { StudioApp } from './studio-app';

/**
 * Product colour in the full Studio and the Preview: since M4 it is the design's product option
 * (Product options panel: undoable, saved, sets the variant), shown on the photo with its mask (M3). jsdom can't read pixels, so the
 * tint itself is a stand-in that reports what it was asked for (the algorithm has its own tests,
 * and the browser tests check real pixels); these check the choice, the rights, what's requested,
 * the fallbacks, and that nothing reaches the design.
 */

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 3000 });

const umbrella = readProduct('umbrella-golf');
const umbrellaProfile = readProfile('umbrella-golf');

/** The real profile with cleared stand-in photos and (unless told otherwise) cleared stand-in masks. */
function stand(maskRights: (sideId: string) => string = () => 'cleared', base: StudioProfile = umbrellaProfile): StudioProfile {
  return {
    ...base,
    sides: base.sides.map((side) => ({
      ...side,
      mockup: {
        ...side.mockup!,
        ref: `studio-fixtures/${base.slug}-${side.id}.png`,
        format: 'png',
        rights: 'cleared',
        mask: { ref: `studio-fixtures/${base.slug}-${side.id}-mask.png`, width: 1122, height: 1402, rights: maskRights(side.id) as never },
      },
    })),
  };
}

const tints = { requests: [] as TintRequest[], fail: false };
const realMatchMedia = window.matchMedia;

beforeEach(() => {
  tints.requests = [];
  tints.fail = false;
  setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 0 } });
  setImageLoaderForTests(async (url) => Object.assign(new Image(), { title: url }));
  setTintRendererForTests(async (request) => {
    tints.requests.push(request);
    if (tints.fail) throw new Error('tainted');
    const canvas = document.createElement('canvas');
    canvas.dataset.hex = request.hex;
    return canvas;
  });
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  setImageLoaderForTests(null);
  setTintRendererForTests(null);
  setGraphicsLibraryForTests(null);
  setPreviewRendererForTests(null);
});

function renderStudio({ product = umbrella, profile = stand(), width = 1440, variantId = null as string | null, repository = null as MemoryRepository | null } = {}) {
  window.matchMedia = ((query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  const router = createMemoryRouter(
    [
      {
        path: '/products/:slug/design',
        element: (
          <TooltipProvider>
            <StudioApp product={product} profile={profile} variantId={variantId} initialSurface={null} initialTool={null} {...(repository ? { repository } : { sample: true })} />
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: [`/products/${product.slug}/design`] },
  );
  render(<RouterProvider router={router} />);
  return userEvent.setup();
}

const canvas = () => screen.getByRole('region', { name: /^Design canvas: / });
const footer = () => canvas().querySelector('footer')!;
const canvasColours = () => footer().querySelector('[role=radiogroup][aria-label="Product colour"]');
const colours = () => screen.queryByRole('radiogroup', { name: /^Canopy Colour/ });
const swatch = (name: string) => within(colours()!).getByRole('radio', { name: new RegExp(`^${name}`) });
const sideRadio = (name: 'Front' | 'Back') => within(screen.getByRole('radiogroup', { name: 'Side' })).getByRole('radio', { name: new RegExp(`^${name}`) });
const layerRows = () => [...(screen.queryByRole('list', { name: 'Layers' })?.querySelectorAll('[data-layer-row]') ?? [])].map((row) => row.getAttribute('aria-label'));

/** Product-first (M4): the umbrella opens on its photo. */
async function onTheProduct() {
  await screen.findByRole('region', { name: /^Design canvas: / });
  await waitFor(() => expect(canvas()).toHaveAttribute('data-view', 'product'));
}

/** The Product options panel (rail on desktop and tablet, More on phones). */
async function openProductOptions(user: ReturnType<typeof userEvent.setup>) {
  if (screen.queryByTestId('studio-product-facts')) return; // umbrellas open on Product options (registry)
  const rail = screen.queryByRole('button', { name: 'Product options' });
  if (rail) await user.click(rail);
  else {
    await user.click(within(screen.getByRole('navigation', { name: 'Design tools' })).getByRole('button', { name: /^More/ }));
    await user.click(await screen.findByRole('button', { name: /^Product options/ }));
  }
  await screen.findByTestId('studio-product-facts');
}

describe('the colour is the design’s product configuration (M4)', () => {
  it('opens on the product in the colour being ordered; the photo is already that colour, so no tint, and no separate picker', async () => {
    const user = renderStudio();
    await onTheProduct();
    expect(canvasColours()).toBeNull(); // the M3 view-only picker is gone: the colour is a product option
    expect(canvas()).toHaveAttribute('data-tint', 'none');
    expect(tints.requests).toEqual([]);
    await openProductOptions(user);
    expect(within(colours()!).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Black', 'Navy', 'Red']);
    expect(swatch('Black')).toHaveAttribute('aria-checked', 'true');
  });

  it('another colour tints the photo with this side’s mask; the back uses its own photo and mask', async () => {
    const user = renderStudio();
    await onTheProduct();
    await openProductOptions(user);
    await user.click(swatch('Navy'));
    expect(swatch('Navy')).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'applied'));
    expect(tints.requests).toEqual([{ photoUrl: '/media/studio-fixtures/umbrella-golf-front.png', maskUrl: '/media/studio-fixtures/umbrella-golf-front-mask.png', hex: '#243052' }]);
    await user.click(sideRadio('Back'));
    await waitFor(() =>
      expect(tints.requests.at(-1)).toEqual({ photoUrl: '/media/studio-fixtures/umbrella-golf-back.png', maskUrl: '/media/studio-fixtures/umbrella-golf-back-mask.png', hex: '#243052' }),
    );
    // Back to the front: already made, not made again.
    await user.click(sideRadio('Front'));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'applied'));
    expect(tints.requests).toHaveLength(2);
  });

  it('is one undo step that changes the variant and SKU; undo restores the colour and the photo, the artwork never changes', async () => {
    const user = renderStudio();
    await onTheProduct();
    const layers = layerRows();
    await openProductOptions(user);
    const facts = () => screen.getByTestId('studio-product-facts').textContent ?? '';
    const before = facts();
    await user.click(swatch('Red'));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'applied'));
    expect(facts()).not.toBe(before);
    expect(facts()).toMatch(/Red/);
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toBeEnabled();
    await user.click(undo);
    expect(swatch('Black')).toHaveAttribute('aria-checked', 'true');
    expect(facts()).toBe(before);
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'none'));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(swatch('Red')).toHaveAttribute('aria-checked', 'true');
    expect(layerRows()).toEqual(layers);
    expect(layerRows().some((name) => /colour|tint|mask|mockup/i.test(name ?? ''))).toBe(false);
  });

  it('starts on the colour of the variant being designed', async () => {
    const group = umbrella.optionGroups.find((g) => /colou?r/i.test(g.name))!;
    const red = group.values.find((v) => v.label === 'Red')!;
    const variant = umbrella.variants.find((v) => v.optionValueIds.includes(red.id))!;
    const user = renderStudio({ variantId: variant.id });
    await onTheProduct();
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'applied'));
    await openProductOptions(user);
    expect(swatch('Red')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('rights and fallbacks', () => {
  it('real (unconfirmed) photos stay flat with a note; cleared photos whose masks aren’t show the photo as taken; the photo-print umbrella has no colour', async () => {
    renderStudio({ profile: umbrellaProfile });
    await screen.findByRole('region', { name: /^Design canvas: / });
    expect(screen.queryByRole('radiogroup', { name: 'Canvas view' })).toBeNull();
    expect(canvas()).toHaveAttribute('data-view', 'flat');
    expect(screen.getByTestId('canvas-workspace-note')).toBeInTheDocument();
    document.body.innerHTML = '';

    let user = renderStudio({ profile: stand(() => 'unconfirmed') });
    await onTheProduct();
    await openProductOptions(user);
    await user.click(swatch('Navy'));
    expect(canvas()).toHaveAttribute('data-tint', 'none');
    expect(tints.requests).toEqual([]);
    document.body.innerHTML = '';

    user = renderStudio({ product: readProduct('umbrella-photo-print'), profile: stand(() => 'cleared', readProfile('umbrella-photo-print')) });
    await onTheProduct();
    await openProductOptions(user);
    expect(colours()).toBeNull();
    expect(tints.requests).toEqual([]); // no mask was ever asked for
  });

  it('a side whose mask isn’t cleared shows its photo as taken, and says the colour can’t be shown there', async () => {
    const user = renderStudio({ profile: stand((side) => (side === 'back' ? 'unconfirmed' : 'cleared')) });
    await onTheProduct();
    await openProductOptions(user);
    await user.click(swatch('Navy'));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'applied'));
    await user.click(sideRadio('Back'));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'none'));
    expect(screen.getByTestId('canvas-colour-unavailable')).toHaveTextContent('Colour preview unavailable for this side.');
    expect(tints.requests.map((r) => r.maskUrl)).toEqual(['/media/studio-fixtures/umbrella-golf-front-mask.png']);
  });

  it('a tint that fails shows the photo as taken, with the note; the editor keeps working', async () => {
    tints.fail = true;
    const user = renderStudio();
    await onTheProduct();
    await openProductOptions(user);
    await user.click(swatch('Red'));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'failed'));
    expect(screen.getByTestId('canvas-colour-unavailable')).toBeInTheDocument();
    expect(canvas()).toHaveAttribute('data-view', 'product');
  });
});

describe('shared with the Preview', () => {
  it('the Preview shows the same colour (the same tinted photo) and has no colour control of its own', async () => {
    const drawn: { photo?: string } = {};
    setPreviewRendererForTests({
      Canvas: ({ surface }: PreviewCanvasProps) => <div data-testid="preview-canvas" data-side={surface.id} />,
      ProductCanvas: ({ photo }: ProductCanvasProps) => {
        drawn.photo = photo.dataset.hex ?? 'photo';
        return <div data-testid="product-canvas" data-photo={drawn.photo} />;
      },
      Thumbnail: () => <div />,
      size: { width: 1000, height: 600 },
    });
    const user = renderStudio();
    await onTheProduct();
    await openProductOptions(user);
    await user.click(swatch('Navy'));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'applied'));
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const dialog = await screen.findByRole('dialog', { name: 'Preview' });
    // On the product only (M4-C): no view switch to press.
    expect(within(dialog).queryByRole('radiogroup', { name: 'Preview view' })).toBeNull();
    await waitFor(() => expect(within(dialog).getByTestId('product-canvas')).toHaveAttribute('data-photo', '#243052'));
    expect(within(dialog).queryByRole('radiogroup', { name: /colou?r/i })).toBeNull();
    expect(tints.requests).toHaveLength(1); // the canvas's tint, reused
  });

  it('Product options are reachable on tablets and phones too', async () => {
    for (const width of [820, 390]) {
      document.body.innerHTML = '';
      const user = renderStudio({ width });
      await onTheProduct();
      await openProductOptions(user);
      expect(colours()).not.toBeNull();
    }
  });
});

describe('the saved colour is the single source of truth (M4-C)', () => {
  const sku = (repository: MemoryRepository) => ([...repository.designs.values()][0]?.document as { product: { sku: string | null } } | undefined)?.product.sku;
  const black = () => umbrella.variants.find((v) => v.sku === 'UMBRELLA-GOLF-COLOUR-BLACK')!;

  it('survives Studio initialisation: reopened without a variant, or with a stale/default ?variantId=, it is still Navy on the photo', async () => {
    const repository = createMemoryRepository();
    const user = renderStudio({ repository });
    await onTheProduct();
    await openProductOptions(user);
    await user.click(swatch('Navy'));
    await waitFor(() => expect(sku(repository)).toBe('UMBRELLA-GOLF-COLOUR-NAVY'), { timeout: 4000 });

    for (const variantId of [null, black().id]) {
      document.body.innerHTML = '';
      const again = renderStudio({ repository, variantId });
      await onTheProduct();
      await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'applied'));
      expect(tints.requests.at(-1)?.hex).toBe('#243052');
      await openProductOptions(again);
      expect(swatch('Navy')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('studio-product-facts').textContent).toMatch(/UMBRELLA-GOLF-COLOUR-NAVY/);
    }
    // Nothing reset it in storage either.
    expect(sku(repository)).toBe('UMBRELLA-GOLF-COLOUR-NAVY');
  });

  it('a colour that can’t be drawn on this side (mask not cleared) says so instead of looking unchanged', async () => {
    const user = renderStudio({ profile: stand(() => 'unconfirmed') });
    await onTheProduct();
    expect(screen.queryByTestId('canvas-colour-unavailable')).toBeNull(); // Black: the photo's own colour
    await openProductOptions(user);
    await user.click(swatch('Navy'));
    expect(canvas()).toHaveAttribute('data-tint', 'none');
    expect(screen.getByTestId('canvas-colour-unavailable')).toHaveTextContent('Colour preview unavailable for this side.');
  });
});
