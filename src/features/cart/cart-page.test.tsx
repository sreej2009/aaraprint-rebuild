import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SiteHeader } from '@/components/shell/site-header';
import { TooltipProvider } from '@/design-system';
import { emptyConfiguration } from '@/features/product-workflow/configuration';
import { CartPage } from './cart-page';
import { CART_STORAGE_KEY, cartLineId, createLocalCart, setCartServiceForTests, type CartLine, type CartService } from './cart';

/** The cart page and the header count (Phase 4 M5), over an in-memory cart. */

let storage: Map<string, string>;
let cart: CartService;

const line = (n: number): CartLine => ({
  lineId: cartLineId(`design_${n}`, `version_${n}`),
  productSlug: 'umbrella-golf',
  productId: 'p1',
  productName: 'Golf Umbrella',
  variantId: 'v1',
  sku: `UMBRELLA-GOLF-COLOUR-NAVY-${n}`,
  optionsLabel: 'Navy',
  quantity: 2,
  unitPriceCents: 89900,
  totalPriceCents: 179800,
  configuration: emptyConfiguration(),
  design: { designId: `design_${n}`, versionId: `version_${n}`, name: `My umbrella ${n}`, approvedAt: 1_700_000_000_000, fingerprint: 'f' },
  addedAt: 1,
});

beforeEach(() => {
  storage = new Map();
  cart = createLocalCart({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) });
  setCartServiceForTests(cart);
});
afterEach(() => setCartServiceForTests(null));

const renderPage = () =>
  render(
    <RouterProvider
      router={createMemoryRouter([
        {
          path: '/cart',
          element: (
            <TooltipProvider>
              <SiteHeader />
              <CartPage />
            </TooltipProvider>
          ),
        },
      ], { initialEntries: ['/cart'] })}
    />,
  );

describe('the cart', () => {
  it('is empty at first, as on the original', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument();
    expect(screen.getByText('Browse our catalog and start designing — everything you add will show up here.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cart, 0 items' })).toBeInTheDocument();
  });

  it('lists approved designs with what is ordered; edit returns to the same design; remove takes the line out', async () => {
    cart.add(line(1));
    cart.add(line(2));
    const user = userEvent.setup();
    renderPage();
    const lines = within(screen.getByRole('list', { name: 'Items in your cart' })).getAllByTestId('cart-line');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('Golf Umbrella');
    expect(lines[0]).toHaveTextContent('Design ready');
    expect(lines[0]).toHaveTextContent('My umbrella 1');
    expect(lines[0]).toHaveTextContent('SKU UMBRELLA-GOLF-COLOUR-NAVY-1');
    expect(within(lines[0]!).getByRole('link', { name: 'Edit design' })).toHaveAttribute('href', '/products/umbrella-golf/design?design=design_1');
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('₹3,596');
    expect(screen.getByRole('link', { name: 'Cart, 2 items' })).toBeInTheDocument();
    // Checkout isn't built: the page says so instead of pretending.
    expect(screen.getByText(/Online checkout is being rebuilt/)).toBeInTheDocument();
    await user.click(within(lines[0]!).getByRole('button', { name: 'Remove Golf Umbrella from your cart' }));
    expect(within(screen.getByRole('list', { name: 'Items in your cart' })).getAllByTestId('cart-line')).toHaveLength(1);
    expect(JSON.parse(storage.get(CART_STORAGE_KEY)!).lines).toHaveLength(1);
  });

  it('ignores damaged stored lines instead of showing them', () => {
    storage.set(CART_STORAGE_KEY, JSON.stringify({ format: 1, lines: [line(1), { ...line(2), lineId: 'forged' }, { nonsense: true }] }));
    const fresh = createLocalCart({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) });
    expect(fresh.lines().map((l) => l.lineId)).toEqual(['design_1:version_1']);
  });
});
