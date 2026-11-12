import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { PurchasePanel } from '@/features/product/purchase-panel';
import { createMemoryRepository, type MemoryRepository } from '@/features/studio/persistence/repository';
import { openSavedDesign } from '@/features/studio/persistence/restore';
import type { DesignDocument } from '@/features/studio/schema/types';
import type { StudioStore } from '@/features/studio/store';
import { readProduct, readProfile } from '@/features/studio/testing/catalogue-fixtures';
import type { Product } from '@/lib/catalogue/types';
import { useProductDesignSession, type ProductDesignSession } from './session';

/**
 * The "Design it" entry step (Phase 4 M3) on the real product page panel: registry-driven
 * questions, a local draft (open/change/cancel change nothing), one product command on confirm,
 * then the Studio — which restores exactly the confirmed design from this browser's storage.
 */

const group = (product: Product, name: string) => product.optionGroups.find((g) => g.name === name)!;
const value = (product: Product, groupName: string, label: string) => group(product, groupName).values.find((v) => v.label === label)!.id;

function StudioStub() {
  const { productSlug } = useParams();
  return <p>Studio for {productSlug}</p>;
}

interface Setup {
  product: Product;
  repository: MemoryRepository;
  session: () => ProductDesignSession;
  store: () => StudioStore;
  user: ReturnType<typeof userEvent.setup>;
  router: ReturnType<typeof createMemoryRouter>;
}

/** The product page panel with its real design session, and a stand-in Studio route. */
async function setup(slug: string, saved?: (product: Product) => unknown): Promise<Setup> {
  const product = readProduct(slug);
  const repository = createMemoryRepository();
  if (saved) {
    const record = saved(product) as { designId: string };
    repository.designs.set(record.designId, record as never);
  }
  let current: ProductDesignSession | null = null;
  const keep = (session: ProductDesignSession) => (current = session);
  function Page({ onSession }: { onSession(session: ProductDesignSession): void }) {
    const session = useProductDesignSession({ product, profile: readProfile(slug), linkedVariantId: null, repository });
    onSession(session);
    return <PurchasePanel product={product} categoryName={null} session={session} />;
  }
  const router = createMemoryRouter(
    [
      { path: '/products/:productSlug', element: <Page onSession={keep} /> },
      { path: '/products/:productSlug/design', element: <StudioStub /> },
    ],
    { initialEntries: [`/products/${slug}`] },
  );
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  await waitFor(() => expect(current!.persistence).toBe('device'));
  return { product, repository, session: () => current!, store: () => current!.store, user: userEvent.setup(), router };
}

const startDesigning = () => screen.getAllByRole('link', { name: /Start designing/ })[0]!;
const dialog = () => screen.getByRole('dialog');
const confirm = () => within(dialog()).getByRole('button', { name: 'Start designing' });

describe('the entry dialog', () => {
  it('opens on "Start designing" for a new design, with the registry’s questions only (card: orientation + quantity)', async () => {
    const { store, user } = await setup('business-card-classic');
    await user.click(startDesigning());
    expect(dialog()).toHaveAccessibleName('Classic Visiting Cards');
    expect(within(dialog()).getByRole('radiogroup', { name: 'Product Orientation (required)' })).toBeInTheDocument();
    expect(within(dialog()).getByRole('radiogroup', { name: 'Quantity' })).toBeInTheDocument();
    // Nothing else is asked: no ink, colour or size at entry.
    expect(within(dialog()).getAllByRole('radiogroup')).toHaveLength(2);
    // Orientation isn't guessed: nothing chosen, confirm disabled, the reason next to the field.
    expect(within(dialog()).getByRole('radio', { name: 'Horizontal' })).toHaveAttribute('aria-checked', 'false');
    expect(confirm()).toBeDisabled();
    expect(within(dialog()).getByText('Choose an orientation.')).toBeInTheDocument();
    // Opening changed nothing.
    expect(store().getState().history.past).toHaveLength(0);
  });

  it('a product without quantity tiers asks orientation only (umbrella)', async () => {
    const { user } = await setup('umbrella-golf');
    await user.click(startDesigning());
    expect(within(dialog()).getAllByRole('radiogroup').map((g) => g.getAttribute('aria-labelledby') && within(g).getAllByRole('radio').length)).toEqual([2]);
  });

  it('changing choices in the dialog is a draft: price updates there, the design does not', async () => {
    const { store, user } = await setup('business-card-classic');
    const before = store().getState().document;
    await user.click(startDesigning());
    await user.click(within(dialog()).getByRole('radio', { name: /500 cards/ }));
    await user.click(within(dialog()).getByRole('radio', { name: 'Vertical' }));
    expect(within(dialog()).getByText('SKU BUSINESS-CARD-CLASSIC-QTY-500-INK-CLASSIC-BLACK')).toBeInTheDocument();
    expect(dialog().querySelector('[data-entry-price]')).toHaveTextContent('₹629');
    expect(store().getState().document).toBe(before);
    expect(store().getState().history.past).toHaveLength(0);
  });

  it('Cancel (and Escape) discards the draft: no change, no undo step, nothing saved, focus back on the button', async () => {
    const { repository, store, user } = await setup('business-card-classic');
    const before = store().getState().document;
    await user.click(startDesigning());
    await user.click(within(dialog()).getByRole('radio', { name: 'Vertical' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(store().getState().document).toBe(before);
    expect(store().getState().history.past).toHaveLength(0);
    expect(startDesigning()).toHaveFocus();

    await user.click(startDesigning());
    expect(within(dialog()).getByRole('radio', { name: 'Vertical' })).toHaveAttribute('aria-checked', 'false');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(store().getState().document).toBe(before);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(repository.designs.size).toBe(0);
  });

  it('Confirm is one product command, saved before the Studio opens; the Studio restores exactly it', async () => {
    const { product, repository, store, user, router } = await setup('business-card-classic');
    await user.click(startDesigning());
    await user.click(within(dialog()).getByRole('radio', { name: /250 cards/ }));
    await user.click(within(dialog()).getByRole('radio', { name: 'Vertical' }));
    await user.click(confirm());
    await waitFor(() => expect(screen.getByText('Studio for business-card-classic')).toBeInTheDocument());

    const document = store().getState().document;
    expect(store().getState().history.past.map((e) => e.label)).toEqual(['Confirm design options']);
    expect(document.product.configuration.orientation).toBe('vertical');
    expect(document.product.configuration.options[group(product, 'Quantity').id]).toBe(value(product, 'Quantity', '250 cards'));
    expect(document.product.sku).toBe('BUSINESS-CARD-CLASSIC-QTY-250-INK-CLASSIC-BLACK');
    expect(router.state.location.search).toBe(`?variantId=${document.product.variantId}`);

    // Written before navigating: the Studio's lookup finds this very design and configuration.
    const opened = await openSavedDesign(repository, { productSlug: 'business-card-classic', designId: null });
    expect(opened.kind).toBe('restored');
    expect(opened.kind === 'restored' && opened.document.product).toEqual(document.product);
  });

  it('no dialog when the entry choices are already valid: straight to the Studio, nothing changed', async () => {
    const { store, user } = await setup('apparel-tshirt-classic-cotton');
    await user.click(screen.getByRole('radio', { name: 'Horizontal' }));
    const chosen = store().getState().document;
    await user.click(startDesigning());
    await waitFor(() => expect(screen.getByText('Studio for apparel-tshirt-classic-cotton')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(store().getState().document).toBe(chosen);
  });

  it('"Upload your file" goes through the same step and keeps upload mode', async () => {
    const { user, router } = await setup('umbrella-golf');
    await user.click(screen.getByRole('link', { name: /Upload your file/ }));
    await user.click(within(dialog()).getByRole('radio', { name: 'Horizontal' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Continue to upload' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/products/umbrella-golf/design'));
    expect(router.state.location.search).toMatch(/mode=upload/);
  });
});

describe('older saved designs', () => {
  /** A design saved before schema v3: no orientation, with artwork. */
  const v2Design = (product: Product, tier?: string, retiredVariant = false) => {
    const now = new Date().toISOString();
    const print = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
    const variant = retiredVariant ? { id: 'retired-variant' } : product.variants.find((v) => v.isDefault)!;
    const text = { id: 'el_old', name: null, x: 10, y: 10, width: 300, height: 60, rotation: 0, opacity: 1, locked: false, hidden: false, type: 'text', text: 'Old artwork', fontFamily: 'Inter', fontSize: 50, fontWeight: 400, italic: false, underline: false, color: '#1b1f27', align: 'left', lineHeight: 1.2, letterSpacing: 0, placeholder: false };
    const document = {
      format: 'aaraprint.design',
      schemaVersion: tier ? 3 : 2,
      id: 'design_old',
      name: 'Saved earlier',
      product: tier
        ? { slug: product.slug, productId: product.id, familyId: 'visiting-card', variantId: variant.id, sku: null, configuration: { options: { [group(product, 'Quantity').id]: tier, [group(product, 'Ink Style').id]: value(product, 'Ink Style', 'Classic Black') }, quantity: 1, orientation: 'horizontal', studio: {}, sameDesignBothSides: null } }
        : { slug: product.slug, productId: product.id, variantId: variant.id },
      surfaces: [
        { id: 'front', label: 'Front', print, background: { color: null }, elements: [text] },
        { id: 'back', label: 'Back', print, background: { color: null }, elements: [] },
      ],
      assets: {},
      meta: { createdAt: now, updatedAt: now, revision: 1 },
    };
    return { designId: 'design_old', productSlug: product.slug, productId: product.id, variantId: variant.id, name: 'Saved earlier', schemaVersion: document.schemaVersion, createdAt: 1, updatedAt: Date.now(), revision: 1, fingerprint: 'old', currentVersionId: null, document };
  };

  it('a v2 design without orientation: asked, never guessed; artwork and variant kept', async () => {
    const { store, user } = await setup('business-card-classic', (product) => v2Design(product));
    await waitFor(() => expect(store().getState().document.id).toBe('design_old'));
    const variantBefore = store().getState().document.product.variantId;
    await user.click(startDesigning());
    expect(within(dialog()).getByText('Choose an orientation.')).toBeInTheDocument();
    await user.click(within(dialog()).getByRole('radio', { name: 'Horizontal' }));
    await user.click(confirm());
    await waitFor(() => expect(screen.getByText('Studio for business-card-classic')).toBeInTheDocument());
    const document: DesignDocument = store().getState().document;
    expect(document.product.configuration.orientation).toBe('horizontal');
    expect(document.product.variantId).toBe(variantBefore);
    expect(document.surfaces[0]!.elements.map((e) => e.id)).toEqual(['el_old']);
  });

  it('a retired tier whose saved variant still exists heals to that variant’s own values: nothing to ask', async () => {
    const { product, store, user } = await setup('business-card-classic', (p) => v2Design(p, 'retired-tier'));
    await waitFor(() => expect(store().getState().document.id).toBe('design_old'));
    const variant = product.variants.find((v) => v.isDefault)!;
    expect(Object.values(store().getState().document.product.configuration.options).sort()).toEqual([...variant.optionValueIds].sort());
    await user.click(startDesigning());
    await waitFor(() => expect(screen.getByText('Studio for business-card-classic')).toBeInTheDocument());
  });

  it('a retired quantity tier with no surviving variant is asked again; the other choices are kept', async () => {
    const { store, user } = await setup('business-card-classic', (product) => v2Design(product, 'retired-tier', true));
    await waitFor(() => expect(store().getState().document.id).toBe('design_old'));
    await user.click(startDesigning());
    expect(within(dialog()).queryByText('Choose an orientation.')).not.toBeInTheDocument();
    expect(within(dialog()).getByRole('radio', { name: 'Horizontal' })).toHaveAttribute('aria-checked', 'true');
    expect(confirm()).toBeDisabled();
    expect(within(dialog()).getByText('Choose the quantity.')).toBeInTheDocument();
    await user.click(within(dialog()).getByRole('radio', { name: /100 cards/ }));
    expect(confirm()).toBeEnabled();
  });
});
