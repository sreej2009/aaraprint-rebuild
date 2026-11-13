import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { setGraphicsLibraryForTests } from '../assets/graphics';
import { setImageLoaderForTests } from '../assets/image-cache';
import type { StudioProfile } from '../profile/types';
import { setPreviewRendererForTests, type PreviewCanvasProps, type PreviewThumbnailProps, type ProductCanvasProps } from './renderer';
import { StudioApp } from '../shell/studio-app';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';

/**
 * Preview (M14) in the full Studio. jsdom has no canvas, so the Konva drawings are stand-ins that
 * report what they were asked to draw (the browser tests check the real drawing), and the space the
 * preview gets is fixed at 1000 × 600 px.
 */

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 3000 });

const fail = { on: false };
const stubRenderer = {
  Canvas: ({ surface, viewport }: PreviewCanvasProps) => {
    if (fail.on) throw new Error('drawing failed');
    return (
      <div data-testid="preview-canvas" data-side={surface.id} data-scale={viewport.scale.toFixed(4)} data-x={viewport.x.toFixed(1)} data-elements={surface.elements.filter((e) => !e.hidden).length} />
    );
  },
  ProductCanvas: ({ surface, viewport, placed, photo, photoSize }: ProductCanvasProps) => (
    <div
      data-testid="product-canvas"
      data-side={surface.id}
      data-scale={viewport.scale.toFixed(4)}
      data-placed={[placed.x, placed.y, placed.width, placed.height].map((n) => n.toFixed(1)).join()}
      data-photo={photo.dataset.url}
      data-photo-size={`${photoSize.width}x${photoSize.height}`}
    />
  ),
  Thumbnail: ({ surface }: PreviewThumbnailProps) => <div data-testid="thumbnail-drawing" data-side={surface.id} />,
  size: { width: 1000, height: 600 },
};

const product = readProduct('business-card-classic');
const cardProfile = readProfile('business-card-classic');
const realMatchMedia = window.matchMedia;

function setWidth(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  fail.on = false;
  setPreviewRendererForTests(stubRenderer);
  setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 0 } });
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  setPreviewRendererForTests(null);
  setGraphicsLibraryForTests(null);
});

function renderStudio({ sample = true, profile = cardProfile as StudioProfile, width = 1440, studioProduct = product } = {}) {
  setWidth(width);
  const router = createMemoryRouter(
    [
      {
        path: '/products/:slug/design',
        element: (
          <TooltipProvider>
            <StudioApp product={studioProduct} profile={profile} variantId={null} initialSurface={null} initialTool={null} sample={sample} />
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: [`/products/${studioProduct.slug}/design`] },
  );
  render(<RouterProvider router={router} />);
  return userEvent.setup();
}

const previewButton = () => screen.getByRole('button', { name: 'Preview' });
const dialog = () => screen.getByRole('dialog', { name: 'Preview' });
const drawing = () => within(dialog()).getByTestId('preview-canvas');
const layerCount = () => screen.getByRole('list', { name: 'Layers' }).querySelectorAll('[data-layer-row]').length;

async function openPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(previewButton());
  await screen.findByRole('dialog', { name: 'Preview' });
  await within(dialog()).findByTestId('preview-canvas');
}

describe('opening and closing', () => {
  it('opens full screen with focus inside, describes itself, and gives focus back on Escape', async () => {
    const user = renderStudio();
    await openPreview(user);
    expect(dialog()).toHaveFocus();
    expect(dialog()).toHaveAccessibleDescription(
      /^How the front of “.+” will look once printed and trimmed \(88\.9\s×\s50\.8\smm\)\. Guides, bleed and editing controls are hidden\. Escape closes the preview\.$/,
    );
    expect(drawing()).toHaveAttribute('data-side', 'front');
    expect(within(dialog()).getByRole('region', { name: /^Front side: 7 items, 88\.9\s×\s50\.8\smm\.$/ })).toBeInTheDocument();
    // The editor is behind it, out of reach.
    expect(screen.queryByRole('list', { name: 'Layers' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(previewButton()).toHaveFocus();
  });

  it('closes from its close button', async () => {
    const user = renderStudio();
    await openPreview(user);
    await user.click(within(dialog()).getByRole('button', { name: 'Close preview' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(previewButton()).toHaveFocus();
  });
});

describe('sides', () => {
  it('shows the sides as thumbnails; arrow keys switch; the editor stays on its own side', async () => {
    const user = renderStudio();
    await openPreview(user);
    const sides = within(dialog()).getByRole('radiogroup', { name: 'Side to preview' });
    const radios = within(sides).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Front 7 items', 'Back 5 items']);
    expect(
      within(sides)
        .getAllByTestId('thumbnail-drawing')
        .map((t) => t.dataset.side),
    ).toEqual(['front', 'back']);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    radios[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(drawing()).toHaveAttribute('data-side', 'back');
    await user.click(radios[0]!);
    expect(drawing()).toHaveAttribute('data-side', 'front');
    await user.click(radios[1]!);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('radiogroup', { name: 'Side' }).querySelector('[aria-checked="true"]')).toHaveAccessibleName(/^Front/);
  });

  it('a product with one side shows no side choice', async () => {
    const oneSided = { ...cardProfile, sides: cardProfile.sides.slice(0, 1) } as StudioProfile;
    const user = renderStudio({ profile: oneSided });
    await openPreview(user);
    expect(within(dialog()).queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(within(dialog()).getByRole('region', { name: /^Design: 7 items/ })).toBeInTheDocument();
  });

  it('an empty design and an empty side say so', async () => {
    const user = renderStudio({ sample: false });
    await openPreview(user);
    expect(within(dialog()).getByTestId('preview-empty')).toHaveTextContent('Your design is empty');
    expect(
      within(dialog())
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Front Empty', 'Back Empty']);
  });
});

describe('zoom', () => {
  it('starts fitted; zoom in, presets and Fit change only the preview’s zoom', async () => {
    const user = renderStudio();
    const editorZoom = screen.getByRole('button', { name: /^Zoom .+, view options$/ }).getAttribute('aria-label');
    await openPreview(user);
    const fitButton = within(dialog()).getByRole('button', { name: 'Fit' });
    expect(fitButton).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog()).getByTestId('preview-area')).toHaveAttribute('data-zoom', 'fit');
    const fitScale = Number(drawing().dataset.scale);
    await user.click(within(dialog()).getByRole('button', { name: 'Zoom in' }));
    expect(Number(drawing().dataset.scale)).toBeGreaterThan(fitScale);
    expect(fitButton).not.toHaveAttribute('aria-disabled');
    await user.click(within(dialog()).getByRole('button', { name: /, zoom options$/ }));
    await user.click(await screen.findByRole('menuitem', { name: /^Actual size \(100%\)/ }));
    expect(within(dialog()).getByRole('button', { name: 'Zoom 100%, zoom options' })).toBeInTheDocument();
    expect(Number(drawing().dataset.scale)).toBeCloseTo(96 / 300, 4);
    await user.click(within(dialog()).getByRole('button', { name: 'Zoom out' }));
    expect(within(dialog()).getByRole('button', { name: 'Zoom 75%, zoom options' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('preview-zoom-announcer')).toHaveTextContent('Zoom 75%'));
    // Keyboard: Ctrl + zooms the preview; Shift 1 fits.
    await user.keyboard('{Control>}={/Control}');
    expect(within(dialog()).getByRole('button', { name: 'Zoom 100%, zoom options' })).toBeInTheDocument();
    await user.keyboard('{Shift>}!{/Shift}');
    expect(Number(drawing().dataset.scale)).toBeCloseTo(fitScale, 4);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Zoom .+, view options$/ })).toHaveAttribute('aria-label', editorZoom);
  });
});

describe('read-only', () => {
  it('editing shortcuts don’t reach the design while previewing; nothing is recorded', async () => {
    const user = renderStudio();
    await user.click(screen.getByRole('button', { name: /^Star, star/ }));
    await user.click(within(screen.getByTestId('selected-properties')).getByRole('button', { name: 'Delete' }));
    expect(layerCount()).toBe(7);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await openPreview(user);
    // The preview shows the design as it is now, unsaved change included.
    expect(drawing()).toHaveAttribute('data-elements', '6');
    await user.keyboard('{Control>}z{/Control}');
    await user.keyboard('{Delete}');
    await user.keyboard('{Control>}d{/Control}');
    await user.click(within(dialog()).getByRole('button', { name: 'Zoom in' }));
    await user.click(within(dialog()).getAllByRole('radio')[1]!);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(layerCount()).toBe(7);
    // The last step is still the delete: one undo brings the star back.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(layerCount()).toBe(8);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('when drawing fails', () => {
  it('says so, keeps the design, and can try again', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fail.on = true;
    const user = renderStudio();
    await user.click(previewButton());
    const alert = await within(await screen.findByRole('dialog', { name: 'Preview' })).findByRole('alert');
    expect(alert).toHaveTextContent('Preview couldn’t be generated.');
    expect(alert).toHaveTextContent('Your design is safe and unchanged.');
    fail.on = false;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog()).findByTestId('preview-canvas')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(layerCount()).toBe(8);
    error.mockRestore();
  });
});

describe('on the product (Phase 4 M1)', () => {
  const umbrella = readProduct('umbrella-golf');
  const umbrellaProfile = readProfile('umbrella-golf');
  /** The real profile with its photos swapped for cleared stand-ins (same size and placements). */
  const cleared = (change: (side: StudioProfile['sides'][number]) => Partial<StudioProfile['sides'][number]> = () => ({})): StudioProfile => ({
    ...umbrellaProfile,
    sides: umbrellaProfile.sides.map((side) => ({ ...side, mockup: { ...side.mockup!, ref: `studio-fixtures/umbrella-${side.id}.png`, format: 'png', rights: 'cleared' }, ...change(side) })),
  });
  const photos = { requested: [] as string[], failing: new Set<string>() };

  beforeEach(() => {
    photos.requested = [];
    photos.failing.clear();
    setImageLoaderForTests(async (url) => {
      photos.requested.push(url);
      if (photos.failing.has(url)) throw new Error('not found');
      const image = new Image();
      image.dataset.url = url;
      return image;
    });
  });
  afterEach(() => setImageLoaderForTests(null));

  const viewChoice = () => within(dialog()).queryByRole('radiogroup', { name: 'Preview view' });
  const productDrawing = () => within(dialog()).getByTestId('product-canvas');
  /** Umbrellas are on the product only (M4-C): the Preview opens on it, with no Flat switch. */
  const openProductPreview = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(previewButton());
    await screen.findByRole('dialog', { name: 'Preview' });
    await within(dialog()).findByTestId('product-canvas');
  };
  const fixturePhotos = () => photos.requested.filter((url) => url.includes('studio-fixtures'));

  it('is not offered for a business card, or for an umbrella whose photos aren’t cleared: Preview stays flat', async () => {
    const unconfirmed: StudioProfile = { ...umbrellaProfile, sides: umbrellaProfile.sides.map((s) => ({ ...s, mockup: { ...s.mockup!, rights: 'unconfirmed' as const } })) };
    let user = renderStudio();
    await openPreview(user);
    expect(viewChoice()).not.toBeInTheDocument();
    expect(within(dialog()).getByTestId('preview-area')).toHaveAttribute('data-view', 'flat');
    await user.keyboard('{Escape}');

    document.body.innerHTML = '';
    user = renderStudio({ studioProduct: umbrella, profile: unconfirmed });
    await openPreview(user);
    expect(viewChoice()).not.toBeInTheDocument();
    expect(within(dialog()).queryByTestId('preview-product-unavailable')).not.toBeInTheDocument();
    // The unconfirmed photos are never even requested.
    expect(photos.requested.filter((url) => url.includes('umbrellas-rainwear-2d'))).toEqual([]);
  });

  it('shows the product straight away, with no Flat switch: the photo with the artwork in its place, front and back', async () => {
    const user = renderStudio({ studioProduct: umbrella, profile: cleared() });
    await openProductPreview(user);
    expect(viewChoice()).not.toBeInTheDocument();
    expect(within(dialog()).queryByRole('radio', { name: 'Flat' })).not.toBeInTheDocument();
    await waitFor(() => expect(productDrawing()).toHaveAttribute('data-side', 'front'));
    expect(within(dialog()).queryByTestId('preview-canvas')).not.toBeInTheDocument();
    expect(within(dialog()).getByTestId('preview-area')).toHaveAttribute('data-view', 'product');
    // 1800 × 2400 px fitted into the original's 170 × 227 box at (563, 374).
    expect(productDrawing()).toHaveAttribute('data-placed', '478.0,260.7,170.0,226.7');
    expect(productDrawing()).toHaveAttribute('data-photo', '/media/studio-fixtures/umbrella-front.png');
    expect(productDrawing()).toHaveAttribute('data-photo-size', '1122x1402');
    expect(fixturePhotos()).toEqual(['/media/studio-fixtures/umbrella-front.png']);
    expect(dialog()).toHaveAccessibleDescription(/^How the front of “.+” will look on the product \(.+ print\), shown on a product photo; colours and fit are approximate\./);
    expect(within(dialog()).getByRole('region', { name: /^Front side on the product: \d+ items?, / })).toBeInTheDocument();

    await user.click(within(dialog()).getByRole('radio', { name: /^Back/ }));
    await waitFor(() => expect(productDrawing()).toHaveAttribute('data-side', 'back'));
    expect(productDrawing()).toHaveAttribute('data-placed', '468.0,186.7,182.0,242.7');
    expect(fixturePhotos()).toEqual(['/media/studio-fixtures/umbrella-front.png', '/media/studio-fixtures/umbrella-back.png']);
    expect(viewChoice()).not.toBeInTheDocument();
  });

  it('zooms on the product like the flat preview (100 % = real size), from the keyboard too', async () => {
    const user = renderStudio({ studioProduct: umbrella, profile: cleared() });
    await openProductPreview(user);
    expect(within(dialog()).getByTestId('preview-area')).toHaveAttribute('data-zoom', 'fit');
    await user.click(within(dialog()).getByRole('button', { name: /, zoom options$/ }));
    await user.click(await screen.findByRole('menuitem', { name: /^Actual size \(100%\)/ }));
    // One printed inch is 96 CSS px: the photo is drawn at 96 / (300 dpi × 170/1800) per photo px.
    expect(Number(productDrawing().dataset.scale)).toBeCloseTo(96 / (300 * (170 / 1800)), 3);
    await user.keyboard('{Shift>}!{/Shift}');
    expect(within(dialog()).getByTestId('preview-area')).toHaveAttribute('data-zoom', 'fit');
  });

  it('falls back to flat, with a note and still no switch, when the photo can’t be loaded or a side has no placement', async () => {
    photos.failing.add('/media/studio-fixtures/umbrella-front.png');
    const user = renderStudio({ studioProduct: umbrella, profile: cleared((side) => (side.id === 'back' ? { placement: null } : {})) });
    await openPreview(user);
    expect(viewChoice()).not.toBeInTheDocument();
    expect(await within(dialog()).findByTestId('preview-product-unavailable')).toHaveTextContent('On-product preview unavailable for this product.');
    expect(drawing()).toHaveAttribute('data-side', 'front');
    expect(within(dialog()).getByTestId('preview-area')).toHaveAttribute('data-view', 'flat');
    expect(dialog()).toHaveAccessibleDescription(/will look once printed and trimmed/);
    // The back has no placement: flat too, and its photo is never requested.
    await user.click(within(dialog()).getByRole('radio', { name: /^Back/ }));
    expect(drawing()).toHaveAttribute('data-side', 'back');
    expect(within(dialog()).getByTestId('preview-product-unavailable')).toBeInTheDocument();
    expect(fixturePhotos()).toEqual(['/media/studio-fixtures/umbrella-front.png']);
    expect(viewChoice()).not.toBeInTheDocument();
  });

  it('changes nothing in the design: no undo steps, same layers after closing', async () => {
    const user = renderStudio({ studioProduct: umbrella, profile: cleared() });
    const layers = layerCount();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await openProductPreview(user);
    await user.click(within(dialog()).getByRole('button', { name: 'Zoom in' }));
    await user.keyboard('{Control>}z{/Control}');
    await user.click(within(dialog()).getByRole('radio', { name: /^Back/ }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(layerCount()).toBe(layers);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('has no view switch on desktop, tablets or phones: always the product', async () => {
    for (const width of [1440, 820, 390]) {
      document.body.innerHTML = '';
      const user = renderStudio({ studioProduct: umbrella, profile: cleared(), width });
      await openProductPreview(user);
      expect(viewChoice()).not.toBeInTheDocument();
      expect(within(dialog()).getByTestId('preview-area')).toHaveAttribute('data-view', 'product');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
  });
});
