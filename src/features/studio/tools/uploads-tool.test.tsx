import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { resetAssetUrlsForTests } from '../assets/asset-library';
import { setImageLoaderForTests } from '../assets/image-cache';
import type { DecodedImage } from '../assets/uploads';
import { createMemoryRepository, type MemoryRepository } from '../persistence/repository';
import { StudioApp } from '../shell/studio-app';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';

/**
 * The Uploads tool and the image inspector (M12) in the full Studio. jsdom has no image decoder
 * or object URLs, so both are injected; the bytes are still checked for real (PNG, JPEG, WebP).
 */

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 3000 });

const product = readProduct('business-card-classic');
const profile = readProfile('business-card-classic');
const realMatchMedia = window.matchMedia;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const png = (name: string) => new File([PNG_BYTES], name, { type: 'image/png' });
/** Pixel sizes by file name: "w x h" in the name, else 1200 × 800. */
const decode = async (blob: Blob): Promise<DecodedImage> => {
  const match = /(\d+)x(\d+)/.exec((blob as File).name ?? '');
  return {
    width: match ? Number(match[1]) : 1200,
    height: match ? Number(match[2]) : 800,
    thumbnail: new Blob(['t'], { type: 'image/webp' }),
  };
};

function setWidth(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  let n = 0;
  resetAssetUrlsForTests({
    create: () => `blob:test/${(n += 1)}`,
    revoke: () => {},
  });
  setImageLoaderForTests(async () => ({ naturalWidth: 10, naturalHeight: 10 }) as HTMLImageElement);
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  setImageLoaderForTests(null);
  resetAssetUrlsForTests();
});

function renderStudio({ width = 1440, sample = false, repository = createMemoryRepository() as MemoryRepository } = {}) {
  setWidth(width);
  const router = createMemoryRouter(
    [
      {
        path: '/products/:slug/design',
        element: (
          <TooltipProvider>
            <StudioApp product={product} profile={profile} variantId={null} initialSurface={null} initialTool={null} sample={sample} repository={repository} decodeImage={decode} />
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: ['/products/business-card-classic/design'] },
  );
  render(<RouterProvider router={router} />);
  return { user: userEvent.setup(), repository };
}

const uploadsPanel = () => screen.getByRole('complementary', { name: 'Uploads' });
const input = () => screen.getByTestId('upload-input') as HTMLInputElement;
const layerRows = () => [...(screen.queryByRole('list', { name: 'Layers' })?.querySelectorAll<HTMLElement>('[data-layer-row]') ?? [])];

async function openUploads(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(await screen.findByRole('navigation', { name: 'Design tools' })).getByRole('button', { name: /^Uploads/ }));
  return uploadsPanel();
}

describe('Uploads tool', () => {
  it('starts empty, with an Upload image button and the accepted types', async () => {
    const { user } = renderStudio();
    const panel = await openUploads(user);
    expect(within(panel).getByRole('heading', { name: 'My uploads' })).toBeInTheDocument();
    expect(await within(panel).findByText('No uploaded images yet.')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Upload image' })).toBeEnabled();
    expect(input()).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp');
    expect(input()).not.toHaveAttribute('accept', expect.stringMatching(/svg/));
  });

  it('lists an upload without changing the design; choosing it places it as one undo step', async () => {
    const { user, repository } = renderStudio();
    const panel = await openUploads(user);
    await user.upload(input(), png('team-photo.png'));
    const add = await within(panel).findByRole('button', {
      name: 'Add image: team-photo.png 1200 × 800 px · 1 KB',
    });
    expect(repository.assets.size).toBe(1);
    expect(layerRows()).toHaveLength(0); // uploading alone doesn't touch the design
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(within(panel).getByTestId('upload-status')).toHaveTextContent('team-photo.png added to My uploads.');

    await user.click(add);
    await waitFor(() => expect(layerRows()).toHaveLength(1));
    expect(layerRows()[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('image-resolution')).toHaveTextContent('Good');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(layerRows()).toHaveLength(0);
    expect(repository.assets.size).toBe(1); // the file stays in My uploads
  });

  it('explains files it can’t use, and can be dismissed', async () => {
    const { user, repository } = renderStudio();
    const panel = await openUploads(user);
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'logo.svg', { type: 'image/svg+xml' });
    await userEvent.setup({ applyAccept: false }).upload(input(), svg);
    const alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent('SVG files can’t be uploaded. Use a PNG, JPEG or WebP image.');
    expect(within(panel).getByRole('button', { name: 'Upload image' })).toHaveAttribute('aria-describedby', alert.id);
    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
    expect(repository.assets.size).toBe(0);
    expect(document.querySelector('script')?.textContent ?? '').not.toContain('alert(1)');
  });

  it('removes an unused upload; keeps one that the design uses', async () => {
    const { user, repository } = renderStudio();
    const panel = await openUploads(user);
    await user.upload(input(), png('kept.png'));
    await user.click(
      await within(panel).findByRole('button', {
        name: /^Add image: kept\.png/,
      }),
    );
    await user.upload(input(), png('spare.png'));
    await within(panel).findByRole('button', {
      name: /^Add image: spare\.png/,
    });

    await user.click(
      within(panel).getByRole('button', {
        name: 'Remove kept.png from My uploads',
      }),
    );
    expect(await within(panel).findByRole('alert')).toHaveTextContent('This image is used in a design');
    expect(within(panel).getByRole('button', { name: /^Add image: kept\.png/ })).toBeInTheDocument();

    await user.click(
      within(panel).getByRole('button', {
        name: 'Remove spare.png from My uploads',
      }),
    );
    await waitFor(() => expect(within(panel).queryByRole('button', { name: /^Add image: spare\.png/ })).not.toBeInTheDocument());
    expect([...repository.assets.values()].map((a) => a.name)).toEqual(['kept.png']);
  });

  it('on phones: Uploads opens as a sheet, which closes once an image is placed', async () => {
    const { user } = renderStudio({ width: 390 });
    await openUploads(user).catch(() => null);
    const sheet = await screen.findByRole('dialog', { name: 'Uploads' });
    await user.upload(within(sheet).getByTestId('upload-input'), png('menu.png'));
    await user.click(
      await within(sheet).findByRole('button', {
        name: /^Add image: menu\.png/,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Uploads' })).not.toBeInTheDocument());
  });
});

describe('image inspector', () => {
  it('shows the file, pixels, size and print resolution; warns when it’s low', async () => {
    const { user } = renderStudio();
    const panel = await openUploads(user);
    await user.upload(input(), png('small-100x50.png'));
    await user.click(
      await within(panel).findByRole('button', {
        name: /^Add image: small-100x50\.png/,
      }),
    );
    const resolution = await screen.findByTestId('image-resolution');
    // Placed at 150 DPI: 100 px across is ⅔ in (200 print px), "Acceptable".
    expect(resolution).toHaveAttribute('data-level', 'acceptable');
    expect(resolution).toHaveTextContent('Acceptable · 150 DPI');
    expect(screen.getByText('100 × 50')).toBeInTheDocument();
    expect(screen.getByText('small-100x50.png', { selector: 'dd' })).toBeInTheDocument();
    // Doubling the width halves the resolution.
    const width = screen.getByRole('textbox', { name: 'W, width' });
    const doubled = String(Number((width as HTMLInputElement).value) * 2);
    await user.clear(width);
    await user.type(width, `${doubled}{Enter}`);
    await waitFor(() => expect(screen.getByTestId('image-resolution')).toHaveAttribute('data-level', 'low'));
    expect(screen.getByTestId('image-resolution')).toHaveTextContent('Low resolution · 75 DPI');
    expect(screen.getByText(/may print soft/)).toBeInTheDocument();
  });

  it('Replace image keeps the place and width, follows the new shape, and undoes in one step', async () => {
    const { user } = renderStudio();
    const panel = await openUploads(user);
    await user.upload(input(), png('wide-3000x1000.png'));
    await user.click(await within(panel).findByRole('button', { name: /^Add image: wide/ }));
    await screen.findByTestId('image-resolution');
    const value = (name: RegExp) => (screen.getByRole('textbox', { name }) as HTMLInputElement).value;
    const before = {
      x: value(/^X,/),
      width: value(/^W,/),
      height: value(/^H,/),
    };
    await user.upload(screen.getByTestId('replace-input'), png('square-1000x1000.png'));
    await waitFor(() => expect(screen.getByText('square-1000x1000.png', { selector: 'dd' })).toBeInTheDocument());
    expect(value(/^X,/)).toBe(before.x);
    expect(value(/^W,/)).toBe(before.width);
    expect(value(/^H,/)).toBe(before.width); // square now
    expect(layerRows()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('wide-3000x1000.png', { selector: 'dd' })).toBeInTheDocument();
    expect(value(/^H,/)).toBe(before.height);
  });

  it('an image this browser doesn’t have stays as a layer, with Retry, Replace and Delete', async () => {
    const { user } = renderStudio({ sample: true });
    await screen.findByRole('list', { name: 'Layers' });
    const logo = layerRows().find((row) => /image/i.test(row.getAttribute('aria-label') ?? ''))!;
    await user.click(logo);
    const section = (await screen.findByRole('heading', { name: 'Image', level: 3 })).closest('section')!;
    expect(await within(section).findByText('Image unavailable')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Replace image' })).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Retry' }));
    expect(await within(section).findByText('Image unavailable')).toBeInTheDocument(); // still not here
    const count = layerRows().length;
    await user.click(within(section).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(layerRows()).toHaveLength(count - 1));
  });
});
