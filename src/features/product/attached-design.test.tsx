import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { createLocalCart, setCartServiceForTests, type CartService } from '@/features/cart/cart';
import { useProductDesignSession } from '@/features/product-options/session';
import { createMemoryRepository, type MemoryRepository } from '@/features/studio/persistence/repository';
import { createSaveController } from '@/features/studio/persistence/save-controller';
import { readApproval } from '@/features/studio/persistence/records';
import { createBlankDesign, createTextElement } from '@/features/studio/schema/create';
import { createStudioStore } from '@/features/studio/store';
import { readProduct, readProfile } from '@/features/studio/testing/catalogue-fixtures';
import type { Product } from '@/lib/catalogue/types';
import { PurchasePanel } from './purchase-panel';

/**
 * The product page after "Approve and continue" (Phase 4 M5): the design attached from this
 * browser's saved design and its approval (never from the URL alone), Add to cart with exactly the
 * approved design and choices, and what happens when either changes. The approval is made the way
 * the Studio makes it (save controller), against an in-memory repository.
 */

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 4000 });

const umbrella = readProduct('umbrella-golf');
const variantBy = (sku: string) => umbrella.variants.find((v) => v.sku === sku)!;
let cart: CartService;

beforeEach(() => {
  const storage = new Map<string, string>();
  cart = createLocalCart({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) });
  setCartServiceForTests(cart);
});
afterEach(() => setCartServiceForTests(null));

/** A design approved in Navy, as the Studio would leave it. */
async function approvedDesign(repository: MemoryRepository, { id = 'design_umbrella', sku = 'UMBRELLA-GOLF-COLOUR-NAVY' } = {}) {
  const profile = readProfile('umbrella-golf');
  const document = createBlankDesign(profile, { newId: () => id, variantId: variantBy(sku).id, catalogue: umbrella });
  document.name = `Umbrella design ${id}`;
  document.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 600, height: 120 }, { id: 'el_1', text: 'Aaraprint' }));
  const studio = createStudioStore({ document, catalogue: umbrella });
  studio.getState().actions.syncProductVariant(variantBy(sku).id);
  const controller = createSaveController({ studio, repository, productSlug: umbrella.slug, productId: umbrella.id });
  const result = await controller.approve();
  controller.stop();
  if (!result.ok) throw new Error(result.message);
  return result.approval;
}

function Harness({ product, repository, linkedVariantId = null, designId = null }: { product: Product; repository: MemoryRepository; linkedVariantId?: string | null; designId?: string | null }) {
  const session = useProductDesignSession({ product, profile: readProfile(product.slug), linkedVariantId, designId, repository });
  return (
    <MemoryRouter>
      <TooltipProvider>
        <PurchasePanel product={product} categoryName={null} session={session} />
      </TooltipProvider>
    </MemoryRouter>
  );
}

const attached = () => screen.findByTestId('attached-design');
const colour = (name: string) => within(screen.getByRole('radiogroup', { name: /^Canopy Colour/ })).getByRole('radio', { name: new RegExp(`^${name}`) });

describe('Design attached', () => {
  it('shows the approved design from this browser, with its choices, quantity and price; ready to order', async () => {
    const repository = createMemoryRepository();
    await approvedDesign(repository);
    render(<Harness product={umbrella} repository={repository} />);
    const card = await attached();
    expect(card).toHaveAttribute('data-status', 'approved');
    expect(card).toHaveTextContent('Design attached');
    expect(card).toHaveTextContent('Umbrella design design_umbrella');
    expect(card).toHaveTextContent('Your design is attached and ready to order.');
    expect(within(card).getByTestId('attached-summary')).toHaveTextContent('Navy');
    expect(within(card).getByRole('link', { name: 'Edit design' })).toHaveAttribute('href', '/products/umbrella-golf/design?design=design_umbrella');
    expect(colour('Navy')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Start designing/ })).toBeNull();
  });

  it('is never shown from the URL alone: no approval, no attached design (even with ?designId=)', async () => {
    const repository = createMemoryRepository();
    render(<Harness product={umbrella} repository={repository} designId="design_made_up" />);
    await screen.findByRole('link', { name: /Start designing/ });
    expect(screen.queryByTestId('attached-design')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to cart' })).toBeNull();
  });

  it('?designId= opens exactly that design; a stale ?variantId= never overwrites the approved choices', async () => {
    const repository = createMemoryRepository();
    await approvedDesign(repository, { id: 'design_a', sku: 'UMBRELLA-GOLF-COLOUR-NAVY' });
    await approvedDesign(repository, { id: 'design_b', sku: 'UMBRELLA-GOLF-COLOUR-RED' });
    render(<Harness product={umbrella} repository={repository} designId="design_a" linkedVariantId={variantBy('UMBRELLA-GOLF-COLOUR-BLACK').id} />);
    const card = await attached();
    expect(card).toHaveTextContent('design_a');
    expect(card).toHaveAttribute('data-status', 'approved');
    expect(colour('Navy')).toHaveAttribute('aria-checked', 'true');
  });

  it('Add to cart adds the approved design once, with its version, variant, SKU, quantity and configuration — no copy, no new id', async () => {
    const repository = createMemoryRepository();
    const approval = await approvedDesign(repository);
    const user = userEvent.setup();
    render(<Harness product={umbrella} repository={repository} />);
    await attached();
    await user.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(screen.getByTestId('cart-confirmation')).toHaveTextContent('Added to cart.');
    expect(within(screen.getByTestId('cart-confirmation')).getByRole('link', { name: 'View cart' })).toHaveAttribute('href', '/cart');
    const [line] = cart.lines();
    expect(cart.lines()).toHaveLength(1);
    expect(line).toMatchObject({
      lineId: `design_umbrella:${approval.versionId}`,
      productSlug: 'umbrella-golf',
      variantId: variantBy('UMBRELLA-GOLF-COLOUR-NAVY').id,
      sku: 'UMBRELLA-GOLF-COLOUR-NAVY',
      quantity: 1,
      design: { designId: 'design_umbrella', versionId: approval.versionId, fingerprint: approval.fingerprint },
    });
    const saved = await repository.getDesign('design_umbrella');
    expect(line!.configuration).toEqual((saved!.document as { product: { configuration: unknown } }).product.configuration);
    expect(repository.designs.size).toBe(1); // no second design
    await user.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(screen.getByTestId('cart-confirmation')).toHaveTextContent('already in your cart');
    expect(cart.lines()).toHaveLength(1);
  });

  it('changing a choice after approving: no longer ready, Add to cart is gone until it is approved again', async () => {
    const repository = createMemoryRepository();
    await approvedDesign(repository);
    const user = userEvent.setup();
    render(<Harness product={umbrella} repository={repository} />);
    await attached();
    await user.click(colour('Red'));
    const card = await attached();
    expect(card).toHaveAttribute('data-status', 'changed');
    expect(card).toHaveTextContent('Design changed since you approved it');
    expect(within(card).getByRole('link', { name: 'Review and approve' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to cart' })).toBeNull();
    expect(cart.lines()).toHaveLength(0);
    // Undo back to the approved choices: ready again.
    await user.click(screen.getByRole('button', { name: /^Undo/ }));
    await waitFor(() => expect(screen.getByTestId('attached-design')).toHaveAttribute('data-status', 'approved'));
  });

  it('Remove design detaches it (the design itself stays saved); the page goes back to Start designing', async () => {
    const repository = createMemoryRepository();
    await approvedDesign(repository);
    const user = userEvent.setup();
    render(<Harness product={umbrella} repository={repository} />);
    await attached();
    await user.click(screen.getByRole('button', { name: 'Remove design' }));
    await waitFor(() => expect(screen.queryByTestId('attached-design')).toBeNull());
    expect(readApproval((await repository.getDesign('design_umbrella'))!.approval)).toBeNull();
    expect(repository.designs.size).toBe(1);
    expect(await screen.findByRole('link', { name: /Start designing/ })).toBeInTheDocument();
  });
});
