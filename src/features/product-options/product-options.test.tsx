import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { PurchasePanel } from '@/features/product/purchase-panel';
import { productWorkflow } from '@/features/product-workflow/registry';
import { createMemoryRepository, type MemoryRepository } from '@/features/studio/persistence/repository';
import type { DesignDocument } from '@/features/studio/schema/types';
import type { StudioStore } from '@/features/studio/store';
import { readProduct, readProfile } from '@/features/studio/testing/catalogue-fixtures';
import type { Product } from '@/lib/catalogue/types';
import { createSessionStore, useProductDesignSession, type ProductDesignSession } from './session';

/**
 * The product options UI (Phase 4 M2) on real catalogue products: registry-driven options, one
 * product command per change, the M1 price resolver, domain validation, and persistence through
 * the Studio's save controller.
 */

const group = (product: Product, name: string) => product.optionGroups.find((g) => g.name === name)!;
const value = (product: Product, groupName: string, label: string) => group(product, groupName).values.find((v) => v.label === label)!.id;
const config = (store: StudioStore) => store.getState().document.product.configuration;
const history = (store: StudioStore) => store.getState().history.past.map((e) => e.label);

function sessionFor(slug: string, change?: (doc: DesignDocument) => DesignDocument): { product: Product; session: ProductDesignSession } {
  const product = readProduct(slug);
  const workflow = productWorkflow(slug);
  const store = createSessionStore(product, product.isCustomizable ? readProfile(slug) : null, workflow);
  if (change) store.getState().actions.replaceDocument(change(store.getState().document));
  return { product, session: { store, workflow, controller: null, persistence: 'memory', flush: async () => {} } };
}

function renderPanel(slug: string, change?: (doc: DesignDocument) => DesignDocument) {
  const { product, session } = sessionFor(slug, change);
  render(
    <MemoryRouter>
      <TooltipProvider>
        <PurchasePanel product={product} categoryName={null} session={session} />
      </TooltipProvider>
    </MemoryRouter>,
  );
  return { product, store: session.store, user: userEvent.setup() };
}

const options = () => screen.getByRole('region', { name: 'Your choices' });
const price = () => document.querySelector('[data-price-summary]')!;
const startLink = () => screen.queryAllByRole('link', { name: /Start designing/ })[0];

describe('registry-driven options', () => {
  it('visiting card: orientation (required), quantity tiers, ink, sets — no Studio-only details', () => {
    renderPanel('business-card-classic');
    const region = options();
    expect(within(region).getByRole('radiogroup', { name: 'Product Orientation' })).toBeInTheDocument();
    expect(within(region).getByText('Required before you design')).toBeInTheDocument();
    // Not chosen yet: the "Design it" entry step asks for it (M3).
    expect(within(region).getByRole('radio', { name: /Horizontal/ })).toHaveAttribute('aria-checked', 'false');
    expect(within(region).getByRole('radio', { name: /Vertical/ })).toHaveAttribute('aria-checked', 'false');
    expect(within(region).getByRole('radiogroup', { name: 'Quantity' })).toBeInTheDocument();
    expect(within(region).getByRole('radiogroup', { name: 'Ink Style' })).toBeInTheDocument();
    expect(within(region).getByRole('spinbutton', { name: 'Number of sets' })).toHaveValue('1');
    expect(within(region).queryByRole('heading', { name: 'Product details' })).not.toBeInTheDocument();
    expect(within(region).queryByRole('switch')).not.toBeInTheDocument();
  });

  it('envelope: the audited Studio sizes with their prices; only the DL envelope has them', () => {
    renderPanel('stationery-envelope-dl');
    const sizes = within(options()).getByRole('radiogroup', { name: 'Size' });
    expect(within(sizes).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'DL (22 cm × 11 cm) ',
      '#10 (24.1 cm × 10.5 cm) +₹42',
      'C5 (22.9 cm × 16.2 cm) +₹63',
      '19 cm × 12 cm ',
      '14.6 cm × 11 cm ',
    ]);
  });

  it('shows the same-design switch only where the registry has it, on by default', () => {
    renderPanel('apparel-tshirt-classic-cotton');
    expect(screen.getByRole('switch', { name: 'Same design on both sides' })).toBeChecked();
  });

  it('mug: three part colours from the original palette and its two size presets', () => {
    renderPanel('gift-mug-custom-black');
    const parts = within(options()).getByRole('group', { name: 'Product colours' });
    expect(within(parts).getAllByRole('textbox').length).toBe(3);
    expect(within(options()).getByRole('radio', { name: /25\.4 × 8\.9 cm/ })).toBeInTheDocument();
  });

  it('keeps unknown values unknown: no invented gift parts or preset sizes', () => {
    renderPanel('gift-acrylic-photo-block');
    expect(within(options()).getAllByText(/Not available to choose online yet/).length).toBe(1);
    expect(within(options()).getByText(/Preset sizes for this product aren’t available online yet/)).toBeInTheDocument();
  });

  it('jute tote: the fabric (substrate) colour, not a custom garment colour', () => {
    renderPanel('bag-jute-tote');
    expect(within(options()).getByRole('textbox', { name: 'Substrate colour, hex code' })).toBeInTheDocument();
    expect(within(options()).queryByRole('textbox', { name: 'Custom colour, hex code' })).not.toBeInTheDocument();
  });

  it('products ordered without a design show their catalogue options only', () => {
    renderPanel('card-accessory-metal-holder');
    expect(screen.queryByRole('radiogroup', { name: 'Product Orientation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Start designing/ })).not.toBeInTheDocument();
    expect(price()).toHaveTextContent(/SKU CARD-ACCESSORY-METAL-HOLDER/);
  });
});

describe('choosing options: product commands, variant and price', () => {
  it('a catalogue option is one undo step that re-resolves the variant, SKU, price and link', async () => {
    const { product, store, user } = renderPanel('business-card-classic');
    await user.click(screen.getByRole('radio', { name: /500 cards/ }));
    const variant = product.variants.find((v) => v.id === store.getState().document.product.variantId)!;
    expect(variant.sku).toBe('BUSINESS-CARD-CLASSIC-QTY-500-INK-CLASSIC-BLACK');
    expect(config(store).options[group(product, 'Quantity').id]).toBe(value(product, 'Quantity', '500 cards'));
    expect(history(store)).toEqual(['Change Quantity']);
    expect(price()).toHaveTextContent('₹629');
    expect(price()).toHaveTextContent(`SKU ${variant.sku}`);
    expect(startLink()).toHaveAttribute('href', `/products/business-card-classic/design?variantId=${variant.id}`);
  });

  it('quantity: one undo step per change; total = resolved unit price × quantity', async () => {
    const { store, user } = renderPanel('business-card-classic');
    await user.click(screen.getByRole('radio', { name: /250 cards/ }));
    await user.click(screen.getByRole('button', { name: 'Increase number of sets' }));
    expect(config(store).quantity).toBe(2);
    expect(history(store)).toEqual(['Change Quantity', 'Change quantity']);
    expect(price()).toHaveTextContent('₹758'); // 2 × ₹379
    expect(price()).toHaveTextContent('500 units');
    expect(price()).toHaveTextContent('₹379 × 2 sets');
  });

  it('undo and redo buttons restore and reapply the product configuration', async () => {
    const { product, store, user } = renderPanel('apparel-tshirt-classic-cotton');
    const before = store.getState().document.product;
    await user.click(screen.getByRole('radio', { name: /^XL/ }));
    const xl = store.getState().document.product;
    expect(price()).toHaveTextContent('₹429');
    await user.click(screen.getByRole('button', { name: 'Undo: Change Size' }));
    expect(store.getState().document.product).toEqual(before);
    expect(price()).toHaveTextContent('₹399');
    await user.click(screen.getByRole('button', { name: 'Redo: Change Size' }));
    expect(store.getState().document.product).toEqual(xl);
    expect(xl.configuration.options[group(product, 'Size').id]).toBe(value(product, 'Size', 'XL'));
  });

  it('a priced Studio format is saved, undoable and shown in the price (no original price bug)', async () => {
    const { store, user } = renderPanel('stationery-envelope-dl');
    await user.click(screen.getByRole('radio', { name: /#10/ }));
    expect(config(store).studio['envelope-size']).toEqual({ type: 'choice', valueId: 'number-10' });
    expect(price()).toHaveTextContent('₹391');
    expect(price()).toHaveTextContent('Includes Size: #10 (24.1 cm × 10.5 cm) (+₹42)');
    await user.click(screen.getByRole('button', { name: 'Undo: Change product option' }));
    expect(config(store).studio).toEqual({});
    expect(price()).toHaveTextContent('₹349');
  });

  it('orientation and the same-design switch are one undo step each', async () => {
    const { store, user } = renderPanel('apparel-tshirt-classic-cotton');
    await user.click(screen.getByRole('radio', { name: 'Vertical' }));
    await user.click(screen.getByRole('switch', { name: 'Same design on both sides' }));
    expect(config(store)).toMatchObject({ orientation: 'vertical', sameDesignBothSides: false });
    expect(history(store)).toEqual(['Change orientation', 'Separate designs per side']);
    await user.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(config(store).sameDesignBothSides).toBe(true);
  });

  it('a part colour preset is stored as the preset with its hex', async () => {
    const { store, user } = renderPanel('gift-mug-custom-black');
    const parts = within(options()).getByRole('group', { name: 'Product colours' });
    await user.click(within(within(parts).getByRole('list', { name: 'Mug body presets' })).getByRole('button', { name: 'Red' }));
    expect(config(store).studio['part-colour:body']).toEqual({ type: 'colour', valueId: 'red', hex: '#dc2626' });
    expect(history(store)).toHaveLength(1);
  });

  it('a custom size is checked against the allowed range before it is saved', async () => {
    const { store, user } = renderPanel('gift-mug-custom-black');
    await user.type(screen.getByRole('textbox', { name: 'Width (cm)' }), '0.5');
    await user.type(screen.getByRole('textbox', { name: 'Height (cm)' }), '9');
    await user.click(screen.getByRole('button', { name: 'Apply size' }));
    expect(screen.getByRole('alert')).toHaveTextContent('from 1 to 100 cm');
    expect(config(store).studio.size).toBeUndefined();
    await user.clear(screen.getByRole('textbox', { name: 'Width (cm)' }));
    await user.type(screen.getByRole('textbox', { name: 'Width (cm)' }), '24');
    await user.click(screen.getByRole('button', { name: 'Apply size' }));
    expect(config(store).studio.size).toEqual({ type: 'dimensions', widthMm: 240, heightMm: 90, presetId: null });
  });
});

describe('validation before designing', () => {
  it('a missing orientation does not block the page: the "Design it" entry step asks for it (M3)', () => {
    renderPanel('business-card-classic', (doc) => ({ ...doc, product: { ...doc.product, configuration: { ...doc.product.configuration, orientation: null } } }));
    expect(within(options()).queryByText('Choose an orientation.')).not.toBeInTheDocument();
    expect(startLink()).toBeDefined();
    expect(document.querySelector('[data-choices-needed]')).toBeNull();
  });

  it('an impossible combination resolves to no variant, with no price and no Start designing', () => {
    const product = readProduct('business-card-classic');
    renderPanel('business-card-classic', (doc) => ({
      ...doc,
      product: { ...doc.product, variantId: null, sku: null, configuration: { ...doc.product.configuration, options: { ...doc.product.configuration.options, [group(product, 'Ink Style').id]: 'retired-value' } } },
    }));
    expect(screen.getByText('Choose the ink style.')).toBeInTheDocument();
    expect(price()).toHaveTextContent('Choose your options to see the price.');
    expect(startLink()).toBeUndefined();
  });
});

describe('persistence through the Studio save controller', () => {
  function Harness({ product, repository, onSession, linkedVariantId = null }: { product: Product; repository: MemoryRepository; onSession(s: ProductDesignSession): void; linkedVariantId?: string | null }) {
    const session = useProductDesignSession({ product, profile: readProfile(product.slug), linkedVariantId, repository });
    onSession(session);
    return (
      <MemoryRouter>
        <TooltipProvider>
          <PurchasePanel product={product} categoryName={null} session={session} />
        </TooltipProvider>
      </MemoryRouter>
    );
  }

  it('autosaves choices with the design; a new visit restores them', async () => {
    const product = readProduct('apparel-tshirt-classic-cotton');
    const repository = createMemoryRepository();
    let session: ProductDesignSession | null = null;
    const user = userEvent.setup();
    const first = render(<Harness product={product} repository={repository} onSession={(s) => (session = s)} />);
    await waitFor(() => expect(session!.persistence).toBe('device'));
    await user.click(screen.getByRole('radio', { name: /^XXL/ }));
    await waitFor(() => expect([...repository.designs.values()]).toHaveLength(1), { timeout: 3000 });
    const saved = [...repository.designs.values()][0]!;
    expect((saved.document as DesignDocument).product.configuration.options[group(product, 'Size').id]).toBe(value(product, 'Size', 'XXL'));
    expect(saved.schemaVersion).toBe(3);
    first.unmount();

    render(<Harness product={product} repository={repository} onSession={(s) => (session = s)} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /^XXL/ })).toHaveAttribute('aria-checked', 'true'));
    expect(price()).toHaveTextContent('₹449');
    // Restoring isn't an undo step.
    expect(session!.store.getState().history.past).toHaveLength(0);
  });

  it('a saved colour is the source of truth: a stale ?variantId= link (e.g. browser Back) never overwrites it (M4-C)', async () => {
    const product = readProduct('umbrella-golf');
    const repository = createMemoryRepository();
    let session: ProductDesignSession | null = null;
    const user = userEvent.setup();
    const first = render(<Harness product={product} repository={repository} onSession={(s) => (session = s)} />);
    await waitFor(() => expect(session!.persistence).toBe('device'));
    await user.click(screen.getByRole('radio', { name: /^Navy/ }));
    await waitFor(() => expect(([...repository.designs.values()][0]?.document as DesignDocument | undefined)?.product.sku).toBe('UMBRELLA-GOLF-COLOUR-NAVY'), { timeout: 3000 });
    first.unmount();

    // Back to the page with the link it had before (Black).
    const black = product.variants.find((v) => v.sku === 'UMBRELLA-GOLF-COLOUR-BLACK')!;
    render(<Harness product={product} repository={repository} linkedVariantId={black.id} onSession={(s) => (session = s)} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Navy/ })).toHaveAttribute('aria-checked', 'true'));
    expect(session!.store.getState().document.product.sku).toBe('UMBRELLA-GOLF-COLOUR-NAVY');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1300)); // past the autosave delay
    });
    expect(([...repository.designs.values()][0]!.document as DesignDocument).product.sku).toBe('UMBRELLA-GOLF-COLOUR-NAVY');
  });

  it('a ?variantId= link still seeds a new design when nothing is saved', async () => {
    const product = readProduct('umbrella-golf');
    const red = product.variants.find((v) => v.sku === 'UMBRELLA-GOLF-COLOUR-RED')!;
    let session: ProductDesignSession | null = null;
    render(<Harness product={product} repository={createMemoryRepository()} linkedVariantId={red.id} onSession={(s) => (session = s)} />);
    await waitFor(() => expect(session!.persistence).toBe('device'));
    expect(screen.getByRole('radio', { name: /^Red/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('nothing is written until the customer changes something', async () => {
    const product = readProduct('business-card-classic');
    const repository = createMemoryRepository();
    let session: ProductDesignSession | null = null;
    render(<Harness product={product} repository={repository} onSession={(s) => (session = s)} />);
    await waitFor(() => expect(session!.persistence).toBe('device'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1300));
    });
    expect(repository.designs.size).toBe(0);
  });
});
