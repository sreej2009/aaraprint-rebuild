import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { setGraphicsLibraryForTests, type GraphicEntry } from '../assets/graphics';
import { setImageLoaderForTests } from '../assets/image-cache';
import { StudioApp } from '../shell/studio-app';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';

/**
 * The Shapes and Graphics tools and the shape inspector (M9) in the full Studio, on a blank
 * business card (`sample: false`) or the sample card. The graphics library is set per test:
 * the shipped one is empty until the graphics' rights are confirmed (decision D5).
 */

vi.setConfig({ testTimeout: 20_000 });

const product = readProduct('business-card-classic');
const profile = readProfile('business-card-classic');
const realMatchMedia = window.matchMedia;

const graphic = (id: string, name: string, group: GraphicEntry['group'], tags: string[] = []): GraphicEntry => ({ id, name, group, tags, width: 240, height: 240, url: `/studio/graphics/${id}.svg`, rights: 'cleared' });
const LIBRARY = [graphic('phone', 'Phone', 'Icons', ['call', 'contact']), graphic('email', 'Email', 'Icons', ['mail', 'contact']), graphic('verified-seal', 'Verified seal', 'Badges', ['seal'])];

function setWidth(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setImageLoaderForTests(async (url) => {
    if (url.includes('broken')) throw new Error('404');
    return {} as HTMLImageElement;
  });
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  setGraphicsLibraryForTests(null);
  setImageLoaderForTests(null);
});

function renderStudio({ width = 1440, sample = false } = {}) {
  setWidth(width);
  const router = createMemoryRouter(
    [
      {
        path: '/products/:slug/design',
        element: (
          <TooltipProvider>
            <StudioApp product={product} profile={profile} variantId={null} initialSurface={null} initialTool={null} sample={sample} />
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: ['/products/business-card-classic/design'] },
  );
  render(<RouterProvider router={router} />);
  return userEvent.setup();
}

const layersList = () => screen.getByRole('list', { name: 'Layers' });
const rowNames = () => [...layersList().querySelectorAll<HTMLElement>('[data-layer-row]')].map((b) => b.getAttribute('aria-label'));
const field = (name: string | RegExp) => screen.getByRole('textbox', { name });
const undo = () => screen.getByRole('button', { name: 'Undo' });

async function addShape(user: ReturnType<typeof userEvent.setup>, label: string) {
  if (!screen.queryByRole('complementary', { name: 'Shapes' })) await user.click(screen.getByRole('button', { name: 'Shapes' }));
  await user.click(screen.getByRole('button', { name: label }));
}

describe('Shapes tool', () => {
  it('offers every shape with a name; adding one selects it and lists it in Layers, as one undo step', async () => {
    const user = renderStudio();
    await user.click(screen.getByRole('button', { name: 'Shapes' }));
    const panel = screen.getByRole('complementary', { name: 'Shapes' });
    expect(within(panel).getAllByRole('button', { name: /^Add / }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Add rectangle',
      'Add rounded rectangle',
      'Add circle',
      'Add ellipse',
      'Add triangle',
      'Add star',
      'Add hexagon',
      'Add line',
      'Add arrow',
    ]);
    await user.click(within(panel).getByRole('button', { name: 'Add star' }));
    expect(rowNames()).toEqual(['Star, star']);
    expect(within(layersList()).getByRole('button', { name: 'Star, star' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Star points' })).toHaveValue('5');
    await user.click(undo());
    expect(screen.queryByRole('list', { name: 'Layers' })).not.toBeInTheDocument();
  });
});

describe('shape properties', () => {
  it('fill: presets, hex and no fill — each one undo step', async () => {
    const user = renderStudio();
    await addShape(user, 'Add rectangle');
    expect(field('Fill colour, hex code')).toHaveValue('#2F5BD3');
    await user.click(within(screen.getByRole('list', { name: 'Fill colour presets' })).getByRole('button', { name: 'Red' }));
    expect(field('Fill colour, hex code')).toHaveValue('#B91C1C');
    await user.click(screen.getByRole('button', { name: 'No fill' }));
    expect(screen.getByRole('button', { name: 'No fill' })).toHaveAttribute('aria-pressed', 'true');
    expect(field('Fill colour, hex code')).toHaveValue('');
    await user.type(field('Fill colour, hex code'), '15803d{Enter}');
    expect(field('Fill colour, hex code')).toHaveValue('#15803D');
    await user.click(undo());
    await user.click(undo());
    expect(field('Fill colour, hex code')).toHaveValue('#B91C1C');
  });

  it('border: choosing a colour adds a border; width in pt; 0 or No border removes it', async () => {
    const user = renderStudio();
    await addShape(user, 'Add rectangle');
    expect(screen.getByRole('button', { name: 'No border' })).toHaveAttribute('aria-pressed', 'true');
    expect(field('Border width')).toHaveValue('0');
    await user.click(within(screen.getByRole('list', { name: 'Border colour presets' })).getByRole('button', { name: 'Ink' }));
    expect(field('Border width')).toHaveValue('1');
    await user.clear(field('Border width'));
    await user.type(field('Border width'), '2.5{Enter}');
    expect(field('Border width')).toHaveValue('2.5');
    await user.clear(field('Border width'));
    await user.type(field('Border width'), 'thick{Enter}');
    expect(field('Border width')).toHaveValue('2.5'); // invalid text is ignored
    await user.click(screen.getByRole('button', { name: 'No border' }));
    expect(field('Border width')).toHaveValue('0');
    await user.click(undo());
    expect(field('Border width')).toHaveValue('2.5');
  });

  it('corner radius in mm, bounded by the rectangle', async () => {
    const user = renderStudio();
    await addShape(user, 'Add rectangle');
    const radius = field('Corner radius');
    await user.clear(radius);
    await user.type(radius, '3{Enter}');
    expect(radius).toHaveValue('3');
    await user.clear(radius);
    await user.type(radius, '500{Enter}');
    expect(Number((radius as HTMLInputElement).value)).toBeLessThan(10); // half the shorter side
  });

  it('stars: points and inner radius; polygons: sides', async () => {
    const user = renderStudio();
    await addShape(user, 'Add star');
    await user.clear(field('Star points'));
    await user.type(field('Star points'), '8{Enter}');
    await user.clear(field('Inner radius'));
    await user.type(field('Inner radius'), '30{Enter}');
    expect(field('Star points')).toHaveValue('8');
    expect(field('Inner radius')).toHaveValue('30');
    await user.click(screen.getByRole('button', { name: 'Increase Star points' }));
    expect(field('Star points')).toHaveValue('9');
    await addShape(user, 'Add hexagon');
    expect(rowNames()[0]).toBe('Hexagon, polygon');
    await user.clear(field('Sides'));
    await user.type(field('Sides'), '8{Enter}');
    expect(rowNames()[0]).toBe('Octagon, polygon');
  });

  it('lines: colour, width, ends and style; the height follows the width', async () => {
    const user = renderStudio();
    await addShape(user, 'Add line');
    expect(screen.queryByRole('textbox', { name: 'Fill colour, hex code' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep proportions' })).not.toBeInTheDocument();
    expect(field('H, height (follows the line width)')).toHaveAttribute('readonly'); // derived, never typed
    await user.clear(field('Line width'));
    await user.type(field('Line width'), '4{Enter}');
    expect(field('H, height (follows the line width)')).toHaveValue('1.4'); // 4 pt ≈ 1.4 mm
    await user.click(screen.getByRole('radio', { name: 'Square' }));
    expect(screen.getByRole('radio', { name: 'Square' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Dotted' }));
    expect(screen.getByRole('radio', { name: 'Square' })).toBeDisabled(); // dots are always round
    await user.click(within(screen.getByRole('list', { name: 'Line colour presets' })).getByRole('button', { name: 'Royal blue' }));
    expect(field('Line colour, hex code')).toHaveValue('#1D4ED8');
  });

  it('circles have no proportion toggle and change both sides together; triangles start locked', async () => {
    const user = renderStudio();
    await addShape(user, 'Add circle');
    expect(screen.queryByRole('button', { name: 'Keep proportions' })).not.toBeInTheDocument();
    await user.clear(field('W, width'));
    await user.type(field('W, width'), '30{Enter}');
    expect(field('H, height')).toHaveValue('30');
    await addShape(user, 'Add triangle');
    expect(screen.getByRole('button', { name: 'Keep proportions' })).toHaveAttribute('aria-pressed', 'true');
    await addShape(user, 'Add ellipse');
    expect(screen.getByRole('button', { name: 'Keep proportions' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('locked shapes can’t be restyled until unlocked', async () => {
    const user = renderStudio();
    await addShape(user, 'Add rectangle');
    await user.click(screen.getByRole('button', { name: 'Lock layer' }));
    expect(field('Fill colour, hex code')).toBeDisabled();
    expect(field('Border width')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'No fill' })).toBeDisabled();
    await user.click(within(screen.getByTestId('selected-properties')).getByRole('button', { name: 'Unlock' }));
    expect(field('Fill colour, hex code')).toBeEnabled();
  });
});

describe('Graphics tool', () => {
  it('says graphics are being prepared while none are cleared for use', async () => {
    setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 33 } });
    const user = renderStudio();
    await user.click(screen.getByRole('button', { name: 'Graphics' }));
    expect(screen.getByText('Graphics are being prepared for Studio use.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add graphic/ })).not.toBeInTheDocument();
  });

  it('lists approved graphics by group, searches them and adds one as a selected layer', async () => {
    setGraphicsLibraryForTests({ status: 'ready', library: { graphics: LIBRARY, withheld: 30 } });
    const user = renderStudio();
    await user.click(screen.getByRole('button', { name: 'Graphics' }));
    const panel = screen.getByRole('complementary', { name: 'Graphics' });
    expect(within(panel).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Icons', 'Badges']);
    await user.type(within(panel).getByRole('searchbox', { name: 'Search graphics' }), 'contact');
    expect(within(panel).getAllByRole('button', { name: /^Add graphic/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['Add graphic: Phone', 'Add graphic: Email']);
    expect(within(panel).getByText('2 graphics found')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Clear search' }));
    await user.click(within(panel).getByRole('button', { name: 'Add graphic: Verified seal' }));
    expect(rowNames()).toEqual(['Verified seal, graphic']);
    expect(screen.getByRole('button', { name: 'Keep proportions' })).toHaveAttribute('aria-pressed', 'true');
    // 30 % of the 88.9 mm card.
    expect(Number((field('W, width') as HTMLInputElement).value)).toBeCloseTo(26.7, 1);
    await user.click(undo());
    expect(screen.queryByRole('list', { name: 'Layers' })).not.toBeInTheDocument();
  });

  it('can’t add a graphic whose file failed, and offers a retry when the library fails', async () => {
    setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [graphic('broken', 'Broken', 'Icons')], withheld: 0 } });
    const user = renderStudio();
    await user.click(screen.getByRole('button', { name: 'Graphics' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add graphic: Broken' })).toBeDisabled());
    act(() => setGraphicsLibraryForTests({ status: 'error' }));
    expect(screen.getByText('Graphics couldn’t be loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('explains a graphic that is no longer available, and keeps it in the design', async () => {
    setGraphicsLibraryForTests({ status: 'ready', library: { graphics: LIBRARY, withheld: 0 } });
    const user = renderStudio();
    await user.click(screen.getByRole('button', { name: 'Graphics' }));
    await user.click(screen.getByRole('button', { name: 'Add graphic: Phone' }));
    act(() => setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 3 } }));
    expect(screen.getByText('This graphic isn’t available')).toBeInTheDocument();
    expect(rowNames()).toEqual(['Phone, graphic']);
  });
});

describe('phones', () => {
  it('add shapes from More, then style them in the properties sheet with − / + controls', async () => {
    const user = renderStudio({ width: 390 });
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('button', { name: /^Shapes/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Shapes' });
    await user.click(within(sheet).getByRole('button', { name: 'Add circle' }));
    expect(screen.queryByRole('dialog', { name: 'Shapes' })).not.toBeInTheDocument(); // out of the way of the canvas
    await user.click(within(screen.getByRole('toolbar', { name: 'Selected: Circle' })).getByRole('button', { name: 'Properties' }));
    const inspector = await screen.findByRole('dialog', { name: 'Layers and properties' });
    await user.click(within(within(inspector).getByRole('list', { name: 'Fill colour presets' })).getByRole('button', { name: 'Marigold' }));
    expect(within(inspector).getByRole('textbox', { name: 'Fill colour, hex code' })).toHaveValue('#E8930C');
    await user.click(within(inspector).getByRole('button', { name: 'Increase Border width' }));
    expect(within(inspector).getByRole('textbox', { name: 'Border width' })).toHaveValue('0.25');
  });
});
