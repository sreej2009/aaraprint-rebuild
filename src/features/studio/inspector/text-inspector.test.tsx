import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { StudioApp } from '../shell/studio-app';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';

/**
 * The Text tool and the inspector's text controls (M8) in the full Studio, on the sample card.
 * jsdom has no canvas, so heights aren't re-measured here (see canvas/text-layout.test.ts).
 * Demo text: Riya Sharma (Inter Bold 75 px = 18 pt), Brand designer (Manrope italic), Since 2026 (locked).
 */

// The whole Studio renders per test and Radix selects take many steps: give them room under load.
vi.setConfig({ testTimeout: 20_000 });

const product = readProduct('business-card-classic');
const profile = readProfile('business-card-classic');
const realMatchMedia = window.matchMedia;

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
  vi.useRealTimers();
});

/**
 * Edits with the same field merge into one undo step when they come within 600 ms. Tests of that
 * freeze the clock (only Date; timers still run), so a slow machine can't split the steps.
 */
function freezeClock() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T10:00:00.000Z'));
}

function renderStudio(width = 1440) {
  setWidth(width);
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
    { initialEntries: ['/products/business-card-classic/design?sample=1'] },
  );
  render(<RouterProvider router={router} />);
  return userEvent.setup();
}

const layersList = () => screen.getByRole('list', { name: 'Layers' });
const rowNames = () => [...layersList().querySelectorAll<HTMLElement>('[data-layer-row]')].map((b) => b.getAttribute('aria-label'));
const field = (name: string | RegExp) => screen.getByRole('textbox', { name });
const content = () => screen.getByRole('textbox', { name: 'Text content' }) as HTMLTextAreaElement;
const undo = () => screen.getByRole('button', { name: 'Undo' });

async function selectLayer(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(layersList()).getByRole('button', { name: new RegExp(`^${name},`) }));
}

describe('Text tool', () => {
  it('adds a heading centred in the safe area, selected and open for typing', async () => {
    const user = renderStudio();
    await user.click(screen.getByRole('button', { name: 'Text' }));
    const panel = screen.getByRole('complementary', { name: 'Text' });
    expect(within(panel).getAllByRole('button', { name: /^Add / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Add heading', 'Add subheading', 'Add body text', 'Add name and title']);
    await user.click(within(panel).getByRole('button', { name: 'Add heading' }));
    expect(rowNames()[0]).toBe('Add a heading, text');
    expect(within(layersList()).getByRole('button', { name: 'Add a heading, text' })).toHaveAttribute('aria-pressed', 'true');
    expect(content().value).toBe('Add a heading');
    expect(screen.getByRole('combobox', { name: 'Font family' })).toHaveTextContent('Fraunces');
    // 13 pt on a business card, centred: X + W/2 is the middle of the 88.9 mm card.
    expect(field('Font size')).toHaveValue('13');
    const x = Number((field('X, from the left trim edge') as HTMLInputElement).value);
    const w = Number((field('W, width') as HTMLInputElement).value);
    expect(x + w / 2).toBeCloseTo(88.9 / 2, 0);
    await user.click(undo());
    expect(rowNames()[0]).toBe('Hidden layer, text, hidden');
  });

  it('adds name and title as two layers in one undo step', async () => {
    const user = renderStudio();
    await user.click(screen.getByRole('button', { name: 'Text' }));
    await user.click(screen.getByRole('button', { name: 'Add name and title' }));
    expect(rowNames().slice(0, 2)).toEqual(['Job title, text', 'Your Name, text']);
    expect(screen.getByText('Front · 10 items')).toBeInTheDocument();
    await user.click(undo());
    expect(screen.getByText('Front · 8 items')).toBeInTheDocument();
  });
});

describe('text properties', () => {
  it('shows content, font, weight, style, size, colour, alignment and spacing for text only', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Riya Sharma');
    expect(content().value).toBe('Riya Sharma');
    expect(screen.getByRole('combobox', { name: 'Font family' })).toHaveTextContent('Inter');
    expect(screen.getByRole('combobox', { name: 'Font weight' })).toHaveTextContent('Bold');
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Underline' })).toBeInTheDocument();
    expect(field('Font size')).toHaveValue('18');
    expect(field('Line height')).toHaveValue('1.2');
    expect(field('Letter spacing')).toHaveValue('0');
    expect(field('Text colour, hex code')).toHaveValue('#171C26');
    expect(screen.getByRole('radio', { name: 'Align left' })).toHaveAttribute('aria-checked', 'true');
    expect(field('H, height (follows the text)')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Increase Font size' })).toBeInTheDocument(); // − / + on touch screens
    await selectLayer(user, 'Star');
    expect(screen.queryByRole('textbox', { name: 'Text content' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Font family' })).not.toBeInTheDocument();
  });

  it('typing in Content is one undo step; Escape restores the text', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Riya Sharma');
    await user.click(content());
    await user.keyboard('{End} Kapoor');
    expect(rowNames()).toContain('Riya Sharma Kapoor, text'); // the layer name follows live
    await user.keyboard('{Escape}');
    expect(content().value).toBe('Riya Sharma');
    expect(undo()).toBeDisabled();
    await user.keyboard('{End}, MD');
    await user.tab();
    expect(rowNames()).toContain('Riya Sharma, MD, text');
    await user.click(undo());
    expect(content().value).toBe('Riya Sharma');
  });

  it('changes the font, keeping only styles the font has', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Brand designer'); // Manrope italic: Manrope has no italic
    const italic = screen.getByRole('button', { name: 'Italic' });
    expect(italic).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('combobox', { name: 'Font family' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Plus Jakarta Sans', 'Fraunces', 'Inter', 'Manrope']);
    await user.click(screen.getByRole('option', { name: 'Fraunces' }));
    expect(screen.getByRole('combobox', { name: 'Font family' })).toHaveTextContent('Fraunces');
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('combobox', { name: 'Font family' }));
    await user.click(screen.getByRole('option', { name: 'Manrope' }));
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Italic' })).toBeDisabled();
    await user.click(undo());
    await user.click(undo());
    expect(screen.getByRole('combobox', { name: 'Font family' })).toHaveTextContent('Manrope');
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('sets weight, size in pt, colour, alignment, line height and spacing — each one undo step', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Riya Sharma');
    await user.click(screen.getByRole('combobox', { name: 'Font weight' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Regular', 'Medium', 'Semibold', 'Bold', 'Extra bold']);
    await user.click(screen.getByRole('option', { name: 'Semibold' }));
    await user.clear(field('Font size'));
    await user.type(field('Font size'), '24{Enter}');
    await user.click(screen.getByRole('button', { name: 'Red' }));
    await user.click(screen.getByRole('radio', { name: 'Centre' }));
    await user.clear(field('Line height'));
    await user.type(field('Line height'), '1.5{Enter}');
    await user.clear(field('Letter spacing'));
    await user.type(field('Letter spacing'), '0.05{Enter}');
    await user.click(screen.getByRole('button', { name: 'Underline' }));
    expect(screen.getByRole('combobox', { name: 'Font weight' })).toHaveTextContent('Semibold');
    expect(field('Font size')).toHaveValue('24');
    expect(field('Text colour, hex code')).toHaveValue('#B91C1C');
    expect(screen.getByRole('radio', { name: 'Centre' })).toHaveAttribute('aria-checked', 'true');
    expect(field('Line height')).toHaveValue('1.5');
    expect(field('Letter spacing')).toHaveValue('0.05');
    expect(screen.getByRole('button', { name: 'Underline' })).toHaveAttribute('aria-pressed', 'true');

    const steps = ['Underline', 'Letter spacing', 'Line height', 'Alignment', 'Colour', 'Size', 'Weight'];
    for (const _ of steps) await user.click(undo());
    expect(undo()).toBeDisabled();
    expect(field('Font size')).toHaveValue('18');
    expect(field('Text colour, hex code')).toHaveValue('#171C26');
    expect(screen.getByRole('combobox', { name: 'Font weight' })).toHaveTextContent('Bold');
  });

  it('steps merge: + and − on the size within 600 ms are one undo step', async () => {
    freezeClock();
    const user = renderStudio();
    await selectLayer(user, 'Riya Sharma');
    const plus = screen.getByRole('button', { name: 'Increase Font size' });
    await user.click(plus);
    await user.click(plus);
    expect(field('Font size')).toHaveValue('20');
    await user.click(undo());
    expect(field('Font size')).toHaveValue('18');
  });

  it('locked text can’t be edited until it’s unlocked', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Since 2026');
    expect(content()).toBeDisabled();
    for (const name of ['Font size', 'Line height', 'Letter spacing', 'Text colour, hex code']) expect(field(name)).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Font family' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Centre' })).toBeDisabled();
    await user.click(within(screen.getByTestId('selected-properties')).getByRole('button', { name: 'Unlock' }));
    expect(content()).toBeEnabled();
    expect(field('Font size')).toBeEnabled();
  });

  it('hidden text keeps its properties and can be shown again', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Hidden layer');
    expect(screen.getByText('This layer is hidden')).toBeInTheDocument();
    expect(content().value).toBe('Hidden layer');
    await user.click(screen.getByRole('button', { name: 'Hide layer' }));
    expect(screen.queryByText('This layer is hidden')).not.toBeInTheDocument();
    expect(rowNames()[0]).toBe('Hidden layer, text');
  });

  it('deleting text from the inspector removes the layer', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Brand designer');
    await user.click(within(screen.getByRole('toolbar', { name: 'Layer actions' })).getByRole('button', { name: 'Delete' }));
    expect(rowNames()).not.toContain('Brand designer, text');
  });
});

describe('text properties on a phone', () => {
  it('fit in the bottom sheet with labelled − / + controls', async () => {
    const user = renderStudio(390);
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('button', { name: /Layers and properties/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Layers and properties' });
    await user.click(within(sheet).getByRole('button', { name: /^Riya Sharma,/ }));
    expect(within(sheet).getByRole('textbox', { name: 'Text content' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Increase Font size' }));
    expect(within(sheet).getByRole('textbox', { name: 'Font size' })).toHaveValue('19');
    expect(within(sheet).getByRole('button', { name: 'Decrease Line height' })).toBeInTheDocument();
  });
});
