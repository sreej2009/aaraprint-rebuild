import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { setGraphicsLibraryForTests } from '../assets/graphics';
import { setImageLoaderForTests } from '../assets/image-cache';
import type { StudioProfile } from '../profile/types';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { StudioApp } from './studio-app';

/**
 * The editing workspace on the product (Phase 4 M2; product-first since M4) in the full Studio. jsdom has no layout, so the
 * Konva stage itself isn't drawn here (the browser tests check the drawing and the editing on it);
 * these check the choice, what is loaded, the fallbacks and that nothing reaches the design.
 */

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 3000 });

const umbrella = readProduct('umbrella-golf');
const umbrellaProfile = readProfile('umbrella-golf');
const card = readProduct('business-card-classic');
const cardProfile = readProfile('business-card-classic');

/** The real umbrella profile with its photos swapped for cleared stand-ins (same size and placements). */
const cleared = (change: (side: StudioProfile['sides'][number]) => Partial<StudioProfile['sides'][number]> = () => ({})): StudioProfile => ({
  ...umbrellaProfile,
  sides: umbrellaProfile.sides.map((side) => ({ ...side, mockup: { ...side.mockup!, ref: `studio-fixtures/umbrella-${side.id}.png`, format: 'png', rights: 'cleared' }, ...change(side) })),
});

/** A real profile with its photos and masks marked unconfirmed: the rights gate must still block it. */
const blocked = (profile: StudioProfile): StudioProfile => ({
  ...profile,
  sides: profile.sides.map((side) => (side.mockup ? { ...side, mockup: { ...side.mockup, rights: 'unconfirmed' as const, mask: side.mockup.mask ? { ...side.mockup.mask, rights: 'unconfirmed' as const } : null } } : side)),
});

const photos = { requested: [] as string[], failing: new Set<string>() };
const realMatchMedia = window.matchMedia;

beforeEach(() => {
  photos.requested = [];
  photos.failing.clear();
  setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 0 } });
  setImageLoaderForTests(async (url) => {
    photos.requested.push(url);
    if (photos.failing.has(url)) throw new Error('not found');
    return new Image();
  });
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  setImageLoaderForTests(null);
  setGraphicsLibraryForTests(null);
});

function renderStudio({ product = umbrella, profile = cleared(), width = 1440 } = {}) {
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
            <StudioApp product={product} profile={profile} variantId={null} initialSurface={null} initialTool={null} sample />
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
const viewChoice = () => screen.queryByRole('radiogroup', { name: 'Canvas view' });
const fixturePhotos = () => photos.requested.filter((url) => url.includes('studio-fixtures'));
const layerRows = () => [...(screen.queryByRole('list', { name: 'Layers' })?.querySelectorAll('[data-layer-row]') ?? [])].map((row) => row.getAttribute('aria-label'));
const sideRadio = (name: 'Front' | 'Back') => within(screen.getByRole('radiogroup', { name: 'Side' })).getByRole('radio', { name: new RegExp(`^${name}`) });

async function ready() {
  await screen.findByRole('region', { name: /^Design canvas: / });
}

describe('which products offer it', () => {
  it('a business card, and an umbrella whose photos aren’t cleared, stay flat', async () => {
    renderStudio({ product: card, profile: cardProfile });
    await ready();
    expect(viewChoice()).not.toBeInTheDocument();
    expect(canvas()).toHaveAttribute('data-view', 'flat');
    document.body.innerHTML = '';

    renderStudio({ profile: blocked(umbrellaProfile) });
    await ready();
    expect(viewChoice()).not.toBeInTheDocument();
    expect(canvas()).toHaveAttribute('data-view', 'flat');
    expect(screen.queryByTestId('canvas-product-unavailable')).not.toBeInTheDocument();
    expect(photos.requested.filter((url) => url.includes('umbrellas-rainwear-2d'))).toEqual([]);
    // The umbrella is a product-first workspace; without a usable photo it says why it is flat.
    expect(screen.getByTestId('canvas-workspace-note')).toHaveTextContent('The product photo isn’t available here');
  });
});

describe('on the product only (photo-frame, M4-C)', () => {
  it('opens and stays on the product: no Flat switch anywhere; front and back each on their photo', async () => {
    const user = renderStudio();
    await ready();
    expect(viewChoice()).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Flat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'On the product' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-workspace-note')).not.toBeInTheDocument();
    expect(canvas()).toHaveAttribute('data-view', 'product');
    expect(canvas()).toHaveAccessibleName(/^Design canvas: Front, .+, on the product$/);
    expect(within(canvas()).getByText(/· on a product photo$/)).toBeInTheDocument();
    await waitFor(() => expect(fixturePhotos()).toEqual(['/media/studio-fixtures/umbrella-front.png']));

    await user.click(sideRadio('Back'));
    expect(canvas()).toHaveAccessibleName(/^Design canvas: Back, .+, on the product$/);
    expect(canvas()).toHaveAttribute('data-view', 'product');
    await waitFor(() => expect(fixturePhotos()).toEqual(['/media/studio-fixtures/umbrella-front.png', '/media/studio-fixtures/umbrella-back.png']));
    await user.click(sideRadio('Front'));
    expect(canvas()).toHaveAttribute('data-view', 'product');
    expect(viewChoice()).not.toBeInTheDocument();
  });

  it('works from the keyboard on the product; Delete on the side choice never deletes the selected artwork', async () => {
    const user = renderStudio();
    await ready();
    const layers = layerRows();
    await user.click(within(screen.getByRole('list', { name: 'Layers' })).getAllByRole('button')[0]!);
    sideRadio('Front').focus();
    await user.keyboard('{Delete}');
    await user.keyboard('{Backspace}');
    expect(layerRows()).toEqual(layers);
    await user.keyboard('{ArrowRight} ');
    expect(canvas()).toHaveAccessibleName(/^Design canvas: Back, .+, on the product$/);
    expect(canvas()).toHaveAttribute('data-view', 'product');
  });

  it('falls back to the flat sheet, with a note, when the photo can’t load or a side has no placement — still with no switch', async () => {
    photos.failing.add('/media/studio-fixtures/umbrella-front.png');
    const user = renderStudio({ profile: cleared((side) => (side.id === 'back' ? { placement: null } : {})) });
    await ready();
    expect(await screen.findByTestId('canvas-product-unavailable')).toHaveTextContent('On-product view unavailable for this product.');
    expect(canvas()).toHaveAttribute('data-view', 'flat');
    expect(viewChoice()).not.toBeInTheDocument();
    await user.click(sideRadio('Back'));
    expect(canvas()).toHaveAttribute('data-view', 'flat');
    expect(screen.getByTestId('canvas-product-unavailable')).toBeInTheDocument();
    expect(fixturePhotos()).toEqual(['/media/studio-fixtures/umbrella-front.png']); // the back's photo is never requested
    expect(viewChoice()).not.toBeInTheDocument();
  });
});

describe('nothing about the view reaches the design', () => {
  it('switching sides on the product adds no undo step, no layer and no save; edits on the product work as usual', async () => {
    const user = renderStudio();
    await ready();
    const status = screen.getByTestId('save-status').getAttribute('data-status');
    const layers = layerRows();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await user.click(sideRadio('Back'));
    await user.click(sideRadio('Front'));
    // Past the autosave delay: still nothing to save.
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(screen.getByTestId('save-status')).toHaveAttribute('data-status', status!);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(layerRows()).toEqual(layers);
    expect(layerRows().some((name) => /mockup|photo|product/i.test(name ?? ''))).toBe(false);

    // The inspector edits print-space values on the product, as one undo step.
    await user.click(within(screen.getByRole('list', { name: 'Layers' })).getAllByRole('button')[0]!);
    const x = screen.getByRole('textbox', { name: 'X, from the left trim edge' });
    const before = (x as HTMLInputElement).value;
    await user.clear(x);
    await user.type(x, '12{Enter}');
    expect(x).toHaveValue('12');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('textbox', { name: 'X, from the left trim edge' })).toHaveValue(before);
    expect(canvas()).toHaveAttribute('data-view', 'product'); // undo never changes the view
  });

  it('the proof made on the product is the same print file as the flat print area of the same design', async () => {
    const facts = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByTestId('print-check-button'));
      const dialog = await screen.findByRole('dialog', { name: 'Print check and proof' });
      const text = within(dialog).getByTestId('proof-facts').textContent;
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      return text;
    };
    let user = renderStudio();
    await ready();
    expect(canvas()).toHaveAttribute('data-view', 'product');
    const onProduct = await facts(user);
    document.body.innerHTML = '';
    // The same sample design where the photo can't be shown (photos marked unconfirmed): flat.
    user = renderStudio({ profile: blocked(umbrellaProfile) });
    await ready();
    expect(canvas()).toHaveAttribute('data-view', 'flat');
    const flat = await facts(user);
    expect(onProduct).toBe(flat);
    expect(flat).toMatch(/Proof image\d+ × \d+ px/);
  });

  it('stays on the product with no switch on tablets and phones too', async () => {
    for (const width of [820, 390]) {
      document.body.innerHTML = '';
      renderStudio({ width });
      await ready();
      expect(canvas()).toHaveAttribute('data-view', 'product');
      expect(viewChoice()).not.toBeInTheDocument();
    }
  });
});
