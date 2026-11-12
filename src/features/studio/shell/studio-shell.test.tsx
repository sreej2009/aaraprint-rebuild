import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { StudioApp, type StudioAppProps } from './studio-app';
import { StudioNotFound, StudioUnsupported } from './studio-states';

// Like the other full-Studio test files: rendering the whole Studio can take a few seconds on a busy machine.
vi.setConfig({ testTimeout: 20_000 });

const product = readProduct('business-card-classic');
const profile = readProfile('business-card-classic');
const realMatchMedia = window.matchMedia;

/** jsdom has no layout: pretend the window is `width` px wide for the layout media queries. */
function setWidth(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderStudio({ width = 1440, url = '/products/business-card-classic/design', ...props }: Partial<StudioAppProps> & { width?: number; url?: string } = {}) {
  setWidth(width);
  const app = (
    <TooltipProvider>
      <StudioApp product={product} profile={profile} variantId={null} initialSurface={null} initialTool={null} {...props} />
      <LocationProbe />
    </TooltipProvider>
  );
  const router = createMemoryRouter(
    [
      { path: '/products/:slug/design', element: app },
      { path: '/products/:slug', element: <p>Product page</p> },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return { user: userEvent.setup() };
}

describe('Studio shell — desktop (≥ 1280 px)', () => {
  it('shows the product, design name, print size and every region', () => {
    renderStudio();
    expect(screen.getByRole('heading', { level: 1, name: 'Design Studio: Classic Visiting Cards' })).toBeInTheDocument();
    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('Classic Visiting Cards design')).toBeInTheDocument();
    // jsdom has no IndexedDB: the save status says plainly that it can't save (M11).
    expect(within(banner).getByTestId('save-status')).toHaveAccessibleName('Save failed. Saving and versions');
    expect(within(banner).getByText(/100 cards · Classic Black/)).toBeInTheDocument();
    expect(within(banner).getByText('₹229')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Design tools' })).toBeInTheDocument();
    // Opens on the tool the registry names for visiting cards (Text, as on the original; M4).
    expect(screen.getByRole('complementary', { name: 'Text' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Layers and properties' })).toBeInTheDocument();
    const canvas = screen.getByRole('region', { name: /^Design canvas: Front, 88\.9.×.50\.8.mm$/ });
    expect(within(canvas).getByText(/300.DPI/)).toBeInTheDocument();
  });

  it('links back to the product with the same options', () => {
    const variant = product.variants[4]!;
    renderStudio({ variantId: variant.id });
    expect(screen.getByRole('link', { name: 'Back to product' })).toHaveAttribute('href', `/products/business-card-classic?variantId=${variant.id}`);
  });

  it('toggles tool panels from the rail; Escape closes and returns focus', async () => {
    const { user } = renderStudio();
    const text = screen.getByRole('button', { name: 'Text' });
    expect(text).toHaveAttribute('aria-pressed', 'true');
    await user.click(text);
    expect(text).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('complementary', { name: 'Text' })).not.toBeInTheDocument();
    await user.click(text);
    expect(text).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'Text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add heading' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Product options' }));
    await user.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByRole('complementary', { name: 'Product options' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Product options' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Help' }));
    await user.tab(); // Help is the last rail button; the panel comes next
    expect(screen.getByRole('button', { name: 'Close panel' })).toHaveFocus();
    // Keyboard focus opens the button's tooltip: the first Escape closes it, the second the panel.
    await user.keyboard('{Escape}{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Print tips' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Help' })).toHaveFocus();
  });

  it('shows the product and print size in the Product panel', async () => {
    const { user } = renderStudio({ initialTool: 'product' });
    const panel = screen.getByRole('complementary', { name: 'Product options' });
    const text = (panel.textContent ?? '').replaceAll(String.fromCharCode(0xa0), ' ');
    for (const fact of ['88.9 × 50.8 mm', '91.9 × 53.8 mm', '1.5 mm each side', '2 mm from the edge', '300 DPI', 'Rectangle', 'Front and back', '₹229']) {
      expect(text).toContain(fact);
    }
    expect(within(panel).getByRole('link', { name: 'Change options' })).toHaveAttribute('href', expect.stringContaining('/products/business-card-classic?variantId='));
    await user.click(within(panel).getByRole('link', { name: 'Change options' }));
    expect(await screen.findByText('Product page')).toBeInTheDocument();
  });

  it('switches sides, keeps ?side= in the URL and opens on the side from the URL', async () => {
    const { user } = renderStudio();
    await user.click(screen.getByRole('radio', { name: 'Back, 0 items' }));
    expect(screen.getByRole('region', { name: /^Design canvas: Back/ })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/products/business-card-classic/design?side=back');
    expect(screen.getByText(/Nothing on the back yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Front, 0 items' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/design$/);
  });

  it('opens on the requested side and tool', () => {
    renderStudio({ initialSurface: 'back', initialTool: 'uploads' });
    expect(screen.getByRole('region', { name: /^Design canvas: Back/ })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Uploads' })).toBeInTheDocument();
  });

  it('puts the zoom control in the top bar', () => {
    renderStudio();
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: /^Zoom .*view options$/ })).toBeInTheDocument();
  });

  it('has history buttons that are disabled with nothing to undo, and inert coming-soon actions', async () => {
    const { user } = renderStudio();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toHaveAttribute('aria-disabled', 'true');
    expect(continueButton).toHaveAccessibleDescription(/coming soon/);
    await user.click(continueButton);
    expect(screen.getByTestId('location')).toHaveTextContent(/design$/);
  });
});

describe('Studio shell — laptop and tablet', () => {
  it('laptop: docked panel, inspector in a drawer', async () => {
    const { user } = renderStudio({ width: 1100 });
    expect(screen.getByRole('complementary', { name: 'Text' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Layers and properties' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Layers and properties' }));
    const drawer = await screen.findByRole('dialog', { name: 'Layers and properties' });
    expect(within(drawer).getByRole('heading', { name: 'Layers' })).toBeInTheDocument();
    expect(within(drawer).getByText('Front · 0 items')).toBeInTheDocument();
  });

  it('tablet: starts with the canvas only; panels float over it', async () => {
    const { user } = renderStudio({ width: 820 });
    expect(screen.queryByRole('complementary', { name: 'Templates' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Shapes' }));
    expect(screen.getByRole('complementary', { name: 'Shapes' })).toHaveClass('absolute');
  });
});

describe('Studio shell — phone (< 768 px)', () => {
  it('uses a bottom toolbar and opens tools as bottom sheets', async () => {
    const { user } = renderStudio({ width: 390 });
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    const toolbar = screen.getByRole('navigation', { name: 'Design tools' });
    expect(within(toolbar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Templates', 'Text', 'Uploads', 'Graphics', 'More']);
    await user.click(within(toolbar).getByRole('button', { name: 'Text' }));
    const sheet = await screen.findByRole('dialog', { name: 'Text' });
    await user.click(within(sheet).getByRole('button', { name: 'Show more' }));
    expect(within(sheet).getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Text' })).not.toBeInTheDocument();
  });

  it('keeps other tools and layers under More', async () => {
    const { user } = renderStudio({ width: 390 });
    await user.click(screen.getByRole('button', { name: 'More' }));
    const more = await screen.findByRole('dialog', { name: 'More tools' });
    await user.click(within(more).getByRole('button', { name: /Layers and properties/ }));
    expect(await screen.findByRole('dialog', { name: 'Layers and properties' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'More tools' })).not.toBeInTheDocument();
  });

  it('floats the zoom control over the canvas instead of the top bar', () => {
    renderStudio({ width: 390 });
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Zoom in' })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('canvas-area')).getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
  });

  it('puts the side switcher under the top bar', () => {
    renderStudio({ width: 390 });
    expect(within(screen.getByRole('banner')).queryByRole('radiogroup', { name: 'Side' })).not.toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Side' })).toBeInTheDocument();
  });
});

describe('Studio states', () => {
  function renderState(element: React.ReactElement) {
    const router = createMemoryRouter([{ path: '/', element }], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
  }

  it('explains products that need no design', () => {
    renderState(<StudioUnsupported productName="Metal Visiting Card Holder" productHref="/products/card-accessory-metal-holder" />);
    expect(screen.getByRole('heading', { level: 1, name: 'This product doesn’t need a design' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the product' })).toHaveAttribute('href', '/products/card-accessory-metal-holder');
  });

  it('offers the catalogue for unknown products', () => {
    renderState(<StudioNotFound />);
    expect(screen.getByRole('heading', { level: 1, name: 'We couldn’t find that product' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse all products' })).toHaveAttribute('href', '/categories/view-all');
  });
});
