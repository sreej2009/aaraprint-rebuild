import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { setGraphicsLibraryForTests } from '../assets/graphics';
import { setImageLoaderForTests } from '../assets/image-cache';
import { setPreviewRendererForTests, type PreviewCanvasProps, type ProductCanvasProps } from '../preview/renderer';
import type { StudioProfile } from '../profile/types';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { StudioApp } from './studio-app';

/**
 * Pens and mugs on the product (Phase 4 M4) in the full Studio and the Preview: the same choice
 * and pipeline as M1–M2, now with a frame (pens) and a paired photo cut per side (mugs). jsdom has
 * no canvas: the Preview's drawing is a stand-in that reports what it was asked to draw.
 */

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 3000 });

/** A real profile with its photos marked cleared — test stand-ins only (real rights are unconfirmed). */
const cleared = (slug: string): StudioProfile => {
  const profile = readProfile(slug);
  return { ...profile, sides: profile.sides.map((s) => (s.mockup ? { ...s, mockup: { ...s.mockup, rights: 'cleared' as const } } : s)) };
};

const requested: string[] = [];
const realMatchMedia = window.matchMedia;

beforeEach(() => {
  requested.length = 0;
  setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 0 } });
  setImageLoaderForTests(async (url) => {
    requested.push(url);
    return new Image();
  });
  setPreviewRendererForTests({
    Canvas: ({ surface }: PreviewCanvasProps) => <div data-testid="preview-canvas" data-side={surface.id} />,
    ProductCanvas: ({ surface, draw, photoSize, placed }: ProductCanvasProps) => (
      <div
        data-testid="product-canvas"
        data-side={surface.id}
        data-frame={`${photoSize.width}x${photoSize.height}`}
        data-draw={JSON.stringify(draw)}
        data-placed={[placed.x, placed.y, placed.width, placed.height].map((n) => n.toFixed(1)).join()}
      />
    ),
    Thumbnail: () => <div />,
    size: { width: 1000, height: 600 },
  });
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  setImageLoaderForTests(null);
  setGraphicsLibraryForTests(null);
  setPreviewRendererForTests(null);
});

function renderStudio(slug: string, profile: StudioProfile = cleared(slug)) {
  window.matchMedia = ((query: string) => ({
    matches: 1440 >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  const product = readProduct(slug);
  const router = createMemoryRouter(
    [
      {
        path: '/products/:slug/design',
        element: (
          <TooltipProvider>
            <StudioApp product={product} profile={profile} variantId={null} initialSurface={null} initialTool={null} sample />
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: [`/products/${slug}/design`] },
  );
  render(<RouterProvider router={router} />);
  return userEvent.setup();
}

const canvas = () => screen.getByRole('region', { name: /^Design canvas: / });
const canvasChoice = () => screen.queryByRole('radiogroup', { name: 'Canvas view' });
const sideRadio = (name: 'Front' | 'Back') => within(screen.getByRole('radiogroup', { name: 'Side' })).getByRole('radio', { name: new RegExp(`^${name}`) });
const layerRows = () => [...(screen.queryByRole('list', { name: 'Layers' })?.querySelectorAll('[data-layer-row]') ?? [])].map((row) => row.getAttribute('aria-label'));

async function onTheProduct(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('region', { name: /^Design canvas: / });
  await user.click(within(canvasChoice()!).getByRole('radio', { name: 'On the product' }));
  await waitFor(() => expect(canvas()).toHaveAttribute('data-view', 'product'));
}

async function openPreviewOnProduct(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Preview' }));
  const dialog = await screen.findByRole('dialog', { name: 'Preview' });
  await user.click(within(dialog).getByRole('radio', { name: 'On the product' }));
  return { dialog, drawing: () => within(dialog).getByTestId('product-canvas') };
}

describe('pens', () => {
  it('offer the product view; the family’s front and back photos load only when shown; no colour choice', async () => {
    const user = renderStudio('pen-gold-click');
    await screen.findByRole('region', { name: /^Design canvas: / });
    expect(requested.filter((u) => u.includes('pens-2d'))).toEqual([]);
    await onTheProduct(user);
    expect(canvas()).toHaveAccessibleName(/^Design canvas: Front, .+, on the product$/);
    await waitFor(() => expect(requested.filter((u) => u.includes('pens-2d'))).toEqual(['/media/products/pens-2d/classic-front.png']));
    await user.click(sideRadio('Back'));
    await waitFor(() => expect(requested.filter((u) => u.includes('pens-2d'))).toEqual(['/media/products/pens-2d/classic-front.png', '/media/products/pens-2d/classic-back.png']));
    expect(screen.queryByRole('radiogroup', { name: 'Product colour' })).toBeNull();
  });

  it('the Preview draws the photo across the 2000 × 700 frame, with the artwork at the original box', async () => {
    const user = renderStudio('pen-ballpoint-classic');
    await screen.findByRole('region', { name: /^Design canvas: / });
    const { drawing } = await openPreviewOnProduct(user);
    await waitFor(() => expect(drawing()).toHaveAttribute('data-frame', '2000x700'));
    expect(JSON.parse(drawing().dataset.draw!)).toEqual({ crop: null, at: { x: 0, y: 0, width: 2000, height: 700 } });
    // 1200 × 240 at 104 / 240: 520 × 104 at (900, 298).
    expect(drawing()).toHaveAttribute('data-placed', '900.0,298.0,520.0,104.0');
  });

  it('a pen whose photos aren’t recovered (the paper pen), or whose rights aren’t cleared, stays flat with no choice', async () => {
    renderStudio('pen-recycled-paper');
    await screen.findByRole('region', { name: /^Design canvas: / });
    expect(canvasChoice()).toBeNull();
    document.body.innerHTML = '';
    renderStudio('pen-gold-click', readProfile('pen-gold-click'));
    await screen.findByRole('region', { name: /^Design canvas: / });
    expect(canvasChoice()).toBeNull();
    expect(canvas()).toHaveAttribute('data-view', 'flat');
    expect(requested.filter((u) => u.includes('pens-2d'))).toEqual([]);
  });
});

describe('mugs', () => {
  it('one paired photo for both sides: the Preview cuts the front from its left half and the back from its right', async () => {
    const user = renderStudio('gift-mug-custom-black');
    await onTheProduct(user);
    const { dialog, drawing } = await openPreviewOnProduct(user);
    await waitFor(() => expect(drawing()).toHaveAttribute('data-frame', '900x1086'));
    expect(JSON.parse(drawing().dataset.draw!)).toEqual({ crop: { x: 0, y: 0, width: 724, height: 1086 }, at: { x: 0, y: 0, width: 724, height: 1086 } });
    // 2700 × 1050 into 390 × 245 centred at (450, 515).
    expect(drawing()).toHaveAttribute('data-placed', '255.0,439.2,390.0,151.7');
    await user.click(within(dialog).getByRole('radio', { name: /^Back/ }));
    await waitFor(() => expect(drawing()).toHaveAttribute('data-side', 'back'));
    expect(JSON.parse(drawing().dataset.draw!)).toEqual({ crop: { x: 724, y: 0, width: 724, height: 1086 }, at: { x: 176, y: 0, width: 724, height: 1086 } });
    expect(requested.filter((u) => u.includes('mugs-2d'))).toEqual(['/media/products/mugs-2d/custom-black.png']);
  });

  it('a mug whose paired photo isn’t recovered stays flat with no choice; a real one isn’t offered or requested', async () => {
    renderStudio('mug-classic-photo');
    await screen.findByRole('region', { name: /^Design canvas: / });
    expect(canvasChoice()).toBeNull();
    document.body.innerHTML = '';
    renderStudio('gift-mug-personalised', readProfile('gift-mug-personalised'));
    await screen.findByRole('region', { name: /^Design canvas: / });
    expect(canvasChoice()).toBeNull();
    expect(requested.filter((u) => u.includes('mugs-2d'))).toEqual([]);
  });
});

describe('nothing reaches the design', () => {
  it('switching views and sides on a pen or a mug adds no undo step, no layer and no save', async () => {
    for (const slug of ['pen-gold-click', 'gift-mug-custom-decorative']) {
      document.body.innerHTML = '';
      const user = renderStudio(slug);
      await screen.findByRole('region', { name: /^Design canvas: / });
      const status = screen.getByTestId('save-status').getAttribute('data-status');
      const layers = layerRows();
      await onTheProduct(user);
      await user.click(sideRadio('Back'));
      await user.click(sideRadio('Front'));
      await user.click(within(canvasChoice()!).getByRole('radio', { name: 'Flat' }));
      await new Promise((resolve) => setTimeout(resolve, 1300)); // past the autosave delay
      expect(screen.getByTestId('save-status')).toHaveAttribute('data-status', status!);
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
      expect(layerRows()).toEqual(layers);
    }
  });
});
