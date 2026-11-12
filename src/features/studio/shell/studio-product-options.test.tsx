import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { setGraphicsLibraryForTests } from '../assets/graphics';
import { setImageLoaderForTests } from '../assets/image-cache';
import { createMemoryRepository, type MemoryRepository } from '../persistence/repository';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { StudioApp } from './studio-app';

/**
 * Product options in the Studio (Phase 4 M4): the M2 options the registry marks editable in the
 * Studio, bound to the design's configuration through the M1 product commands — one undo step
 * each, autosaved with the design, and the variant, SKU and price follow everywhere. Also the
 * workspace's opening tool and the single-surface rule.
 */

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 3000 });

const realMatchMedia = window.matchMedia;
beforeEach(() => {
  setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 0 } });
  setImageLoaderForTests(async () => new Image());
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  setImageLoaderForTests(null);
  setGraphicsLibraryForTests(null);
});

function renderStudio(slug: string, { width = 1440, repository = createMemoryRepository() as MemoryRepository } = {}) {
  window.matchMedia = ((query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  const product = readProduct(slug);
  const profile = readProfile(slug);
  const router = createMemoryRouter(
    [
      {
        path: '/products/:slug/design',
        element: (
          <TooltipProvider>
            <StudioApp product={product} profile={profile} variantId={null} initialSurface={null} initialTool={null} repository={repository} />
          </TooltipProvider>
        ),
      },
      { path: '/products/:slug', element: <p>Product page</p> },
    ],
    { initialEntries: [`/products/${slug}/design`] },
  );
  render(<RouterProvider router={router} />);
  return { user: userEvent.setup(), repository };
}

const panel = () => screen.getByRole('complementary', { name: 'Product options' });
const price = () => within(screen.getByRole('banner')).getByTestId('studio-price').textContent?.replaceAll(String.fromCharCode(0xa0), ' ');
const facts = () => screen.getByTestId('studio-product-facts').textContent ?? '';
const sizeChoice = (label: string) => within(within(panel()).getByRole('radiogroup', { name: /^Size/ })).getByRole('radio', { name: new RegExp(`^${label}\\b`) });

type Stored = { product: { variantId: string | null; sku: string | null; configuration: { options: Record<string, string> } } };
const saved = (repository: MemoryRepository) => [...repository.designs.values()][0]?.document as Stored | undefined;

describe('a garment: product options in the Studio', () => {
  it('opens on Product options (registry), showing only what the Studio may change', async () => {
    renderStudio('apparel-jersey-sports');
    await screen.findByRole('region', { name: /^Design canvas: / });
    expect(screen.getByRole('button', { name: 'Product options' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel()).getByRole('heading', { name: 'Your choices' })).toBeInTheDocument();
    expect(within(panel()).getByRole('radiogroup', { name: /^Size/ })).toBeInTheDocument();
    expect(within(panel()).getByRole('radiogroup', { name: /^Colour/ })).toBeInTheDocument();
    // Ordering choices stay on the product page; the Studio's own Undo covers these changes.
    expect(within(panel()).queryByRole('spinbutton', { name: 'Quantity' })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: /^Undo/ })).toBeNull();
    expect(screen.getByRole('region', { name: /^Design canvas: / })).toHaveAttribute('data-workspace', 'perspective');
    expect(screen.getByTestId('canvas-workspace-note')).toHaveTextContent('On-product view for this product isn’t available yet');
  });

  it('a size changes the variant, SKU and price as one undo step, and is saved with the design', async () => {
    const { user, repository } = renderStudio('apparel-jersey-sports');
    await screen.findByRole('region', { name: /^Design canvas: / });
    const before = { price: price(), facts: facts() };
    await user.click(sizeChoice('XL'));
    expect(sizeChoice('XL')).toHaveAttribute('aria-checked', 'true');
    expect(price()).not.toBe(before.price);
    expect(facts()).toMatch(/SKU APPAREL-JERSEY-SPORTS-SIZE-XL-/);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    // Autosaved like any edit: the saved design carries the new configuration and SKU.
    await waitFor(() => expect(saved(repository)?.product.sku).toMatch(/SIZE-XL/), { timeout: 4000 });
    const group = readProduct('apparel-jersey-sports').optionGroups.find((g) => g.name === 'Size')!;
    expect(saved(repository)?.product.configuration.options[group.id]).toBe(group.values.find((v) => v.label === 'XL')!.id);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(price()).toBe(before.price);
    expect(facts()).toBe(before.facts);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(sizeChoice('XL')).toHaveAttribute('aria-checked', 'true');
  });

  it('a choice made in the Studio survives reopening the design (no ?variantId= resets it)', async () => {
    const { user, repository } = renderStudio('apparel-jersey-sports');
    await screen.findByRole('region', { name: /^Design canvas: / });
    await user.click(sizeChoice('XL'));
    await waitFor(() => expect(saved(repository)?.product.sku).toMatch(/SIZE-XL/), { timeout: 4000 });
    document.body.innerHTML = '';
    renderStudio('apparel-jersey-sports', { repository });
    await screen.findByRole('region', { name: /^Design canvas: / });
    await waitFor(() => expect(sizeChoice('XL')).toHaveAttribute('aria-checked', 'true'));
    expect(facts()).toMatch(/SIZE-XL/);
  });

  it('is in the Product options sheet on phones', async () => {
    const { user } = renderStudio('apparel-jersey-sports', { width: 390 });
    await screen.findByRole('region', { name: /^Design canvas: / });
    await user.click(within(screen.getByRole('navigation', { name: 'Design tools' })).getByRole('button', { name: /^More/ }));
    await user.click(await screen.findByRole('button', { name: /^Product options/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Product options' });
    expect(within(sheet).getByRole('radiogroup', { name: /^Size/ })).toBeInTheDocument();
  });
});

describe('flat print products', () => {
  it('a visiting card opens on Text; its options are chosen on the product page', async () => {
    const { user } = renderStudio('business-card-classic');
    await screen.findByRole('region', { name: /^Design canvas: / });
    expect(screen.getByRole('complementary', { name: 'Text' })).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-workspace-note')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Canvas view' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Product options' }));
    expect(within(panel()).getByText('This product’s options are chosen on the product page.')).toBeInTheDocument();
    expect(within(panel()).getByRole('link', { name: 'Change options' })).toHaveAttribute('href', expect.stringContaining('/products/business-card-classic'));
    // Front and back, as the original.
    expect(screen.getByRole('radiogroup', { name: 'Side' })).toBeInTheDocument();
  });

  it('a letterhead opens on Uploads and, printed on one surface, has no front/back control', async () => {
    renderStudio('stationery-letterhead');
    await screen.findByRole('region', { name: /^Design canvas: / });
    expect(screen.getByRole('complementary', { name: 'Uploads' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Side' })).toBeNull();
  });
});
