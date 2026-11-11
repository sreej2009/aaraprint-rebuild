import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { setGraphicsLibraryForTests } from '../assets/graphics';
import { setImageLoaderForTests } from '../assets/image-cache';
import { setPreviewRendererForTests, type PreviewCanvasProps, type ProductCanvasProps } from '../preview/renderer';
import { setTintRendererForTests, type TintRequest } from '../product-view/tint-renderer';
import type { StudioProfile } from '../profile/types';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { StudioApp } from './studio-app';

/**
 * Product colour (Phase 4 M3) in the full Studio and the Preview. jsdom can't read pixels, so the
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

function renderStudio({ product = umbrella, profile = stand(), width = 1440, variantId = null as string | null } = {}) {
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
            <StudioApp product={product} profile={profile} variantId={variantId} initialSurface={null} initialTool={null} sample />
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
const colours = (scope: HTMLElement = footer()) => within(scope).queryByRole('radiogroup', { name: 'Product colour' });
const swatch = (name: string, scope: HTMLElement = footer()) => within(colours(scope)!).getByRole('radio', { name });
const sideRadio = (name: 'Front' | 'Back') => within(screen.getByRole('radiogroup', { name: 'Side' })).getByRole('radio', { name: new RegExp(`^${name}`) });
const layerRows = () => [...(screen.queryByRole('list', { name: 'Layers' })?.querySelectorAll('[data-layer-row]') ?? [])].map((row) => row.getAttribute('aria-label'));

async function onTheProduct(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('region', { name: /^Design canvas: / });
  await user.click(within(screen.getByRole('radiogroup', { name: 'Canvas view' })).getByRole('radio', { name: 'On the product' }));
  await waitFor(() => expect(canvas()).toHaveAttribute('data-view', 'product'));
}

describe('the colour choice', () => {
  it('appears on the product with the product’s own colours, named; the variant’s colour is chosen; the photo is already that colour, so no tint', async () => {
    const user = renderStudio();
    await screen.findByRole('region', { name: /^Design canvas: / });
    expect(colours()).toBeNull(); // not on the flat sheet
    await onTheProduct(user);
    expect(
      within(colours()!)
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['Black', 'Navy', 'Red']);
    expect(swatch('Black')).toHaveAttribute('aria-checked', 'true');
    expect(canvas()).toHaveAttribute('data-tint', 'none');
    expect(tints.requests).toEqual([]);
  });

  it('another colour tints the photo with this side’s mask; the back uses its own photo and mask', async () => {
    const user = renderStudio();
    await onTheProduct(user);
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

  it('works from the keyboard: arrows move and choose; Delete on a swatch never deletes artwork', async () => {
    const user = renderStudio();
    await onTheProduct(user);
    const layers = layerRows();
    await user.click(within(screen.getByRole('list', { name: 'Layers' })).getAllByRole('button')[0]!);
    swatch('Black').focus();
    await user.keyboard('{ArrowRight}');
    expect(swatch('Navy')).toHaveFocus();
    expect(swatch('Navy')).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Delete}{Backspace}');
    expect(layerRows()).toEqual(layers);
  });

  it('starts on the colour of the variant being designed', async () => {
    const group = umbrella.optionGroups.find((g) => /colou?r/i.test(g.name))!;
    const red = group.values.find((v) => v.label === 'Red')!;
    const variant = umbrella.variants.find((v) => v.optionValueIds.includes(red.id))!;
    const user = renderStudio({ variantId: variant.id });
    await onTheProduct(user);
    expect(swatch('Red')).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'applied'));
  });
});

describe('rights and fallbacks', () => {
  it('no choice: real (unconfirmed) photos; cleared photos whose masks aren’t; the photo-print umbrella (no colour option)', async () => {
    let user = renderStudio({ profile: umbrellaProfile });
    await screen.findByRole('region', { name: /^Design canvas: / });
    expect(screen.queryByRole('radiogroup', { name: 'Canvas view' })).toBeNull();
    expect(colours()).toBeNull();
    document.body.innerHTML = '';

    user = renderStudio({ profile: stand(() => 'unconfirmed') });
    await onTheProduct(user);
    expect(colours()).toBeNull();
    expect(canvas()).toHaveAttribute('data-tint', 'none');
    document.body.innerHTML = '';

    user = renderStudio({ product: readProduct('umbrella-photo-print'), profile: stand(() => 'cleared', readProfile('umbrella-photo-print')) });
    await onTheProduct(user);
    expect(colours()).toBeNull();
    expect(tints.requests).toEqual([]); // no mask was ever asked for
  });

  it('a side whose mask isn’t cleared shows its photo as taken, and says the colour can’t be shown there', async () => {
    const user = renderStudio({ profile: stand((side) => (side === 'back' ? 'unconfirmed' : 'cleared')) });
    await onTheProduct(user);
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
    await onTheProduct(user);
    await user.click(swatch('Red'));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'failed'));
    expect(screen.getByTestId('canvas-colour-unavailable')).toBeInTheDocument();
    expect(canvas()).toHaveAttribute('data-view', 'product');
  });
});

describe('nothing reaches the design', () => {
  it('colour changes add no undo step, no save and no layer; undo still undoes the last edit', async () => {
    const user = renderStudio();
    await onTheProduct(user);
    const status = screen.getByTestId('save-status').getAttribute('data-status');
    const layers = layerRows();
    await user.click(within(screen.getByRole('list', { name: 'Layers' })).getAllByRole('button')[0]!);
    const x = screen.getByRole('textbox', { name: 'X, from the left trim edge' });
    const before = (x as HTMLInputElement).value;
    await user.clear(x);
    await user.type(x, '12{Enter}');
    const afterEdit = screen.getByTestId('save-status').getAttribute('data-status');
    for (const name of ['Red', 'Navy', 'Black', 'Red']) await user.click(swatch(name));
    await new Promise((resolve) => setTimeout(resolve, 1300)); // past the autosave delay
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe(afterEdit);
    expect(layerRows()).toEqual(layers);
    expect(layerRows().some((name) => /colour|tint|mask|mockup/i.test(name ?? ''))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('textbox', { name: 'X, from the left trim edge' })).toHaveValue(before);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(swatch('Red')).toHaveAttribute('aria-checked', 'true'); // undo never changes the colour
    expect(status).not.toBeNull();
  });
});

describe('shared with the Preview', () => {
  it('the Preview shows the same colour (the same tinted photo), and a colour chosen there comes back to the canvas', async () => {
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
    await onTheProduct(user);
    await user.click(swatch('Navy'));
    await waitFor(() => expect(canvas()).toHaveAttribute('data-tint', 'applied'));
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const dialog = await screen.findByRole('dialog', { name: 'Preview' });
    await user.click(within(dialog).getByRole('radio', { name: 'On the product' }));
    await waitFor(() => expect(within(dialog).getByTestId('product-canvas')).toHaveAttribute('data-photo', '#243052'));
    expect(swatch('Navy', dialog)).toHaveAttribute('aria-checked', 'true');
    expect(tints.requests).toHaveLength(1); // the canvas's tint, reused
    await user.click(swatch('Red', dialog));
    await waitFor(() => expect(within(dialog).getByTestId('product-canvas')).toHaveAttribute('data-photo', '#b0262d'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(swatch('Red')).toHaveAttribute('aria-checked', 'true');
  });

  it('sits in the canvas footer on tablets and phones too', async () => {
    for (const width of [820, 390]) {
      document.body.innerHTML = '';
      const user = renderStudio({ width });
      await onTheProduct(user);
      expect(colours()).not.toBeNull();
    }
  });
});
