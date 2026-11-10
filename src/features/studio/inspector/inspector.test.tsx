import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { StudioApp } from '../shell/studio-app';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';

/**
 * The inspector and layers panel (M7) on the sample card (`?sample=1`). Front layers, top first:
 * Hidden layer (hidden), Since 2026 (locked), Star, logo.png, contact, Brand designer, Riya Sharma, Rectangle.
 */

// The whole Studio renders per test: give it room under a busy machine.
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
const row = (name: string | RegExp) => within(layersList()).getByRole('button', { name: typeof name === 'string' ? new RegExp(`^${name},`) : name, pressed: undefined as unknown as boolean });
const field = (name: string | RegExp) => screen.getByRole('textbox', { name });
const undo = () => screen.getByRole('button', { name: 'Undo' });

async function selectLayer(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(layersList()).getByRole('button', { name: new RegExp(`^${name},`) }));
}

describe('layers panel', () => {
  it('lists every layer, top first, with type and hidden / locked states in the name', () => {
    renderStudio();
    expect(rowNames()).toEqual([
      'Hidden layer, text, hidden',
      'Since 2026, text, locked',
      'Star, star',
      'logo.png, image',
      '+91 98765 43210 · riya@example.…, text', // names shorten to 32 characters
      'Brand designer, text',
      'Riya Sharma, text',
      'Rectangle, rectangle',
    ]);
    expect(within(layersList()).getByRole('button', { name: 'Show “Hidden layer”' })).toBeInTheDocument();
    expect(within(layersList()).getByRole('button', { name: 'Unlock “Since 2026”' })).toBeInTheDocument();
    expect(screen.getByText('Front · 8 items')).toBeInTheDocument();
  });

  it('selects from the list and highlights the selected row; the canvas selection follows', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Star');
    expect(row('Star')).toHaveAttribute('aria-pressed', 'true');
    // (The canvas outline needs layout, so it's checked in the E2E tests; the toolbar follows the selection.)
    expect(screen.getByRole('toolbar', { name: 'Selected: Star' })).toBeInTheDocument();
    await selectLayer(user, 'Riya Sharma');
    expect(row('Star')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('toolbar', { name: 'Selected: Riya Sharma' })).toBeInTheDocument();
  });

  it('is one tab stop; arrows move between layers and select them, without nudging anything', async () => {
    const user = renderStudio();
    const tabbable = () => [...layersList().querySelectorAll('[data-layer-row]')].filter((b) => b.getAttribute('tabindex') === '0');
    expect(tabbable()).toHaveLength(1);
    await selectLayer(user, 'Star');
    const x = field('X, from the left trim edge');
    expect(x).toHaveValue('72.8');
    await user.keyboard('{ArrowDown}');
    expect(row('logo.png')).toHaveFocus();
    expect(row('logo.png')).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(row('Since 2026')).toHaveFocus();
    await user.keyboard('{End}');
    expect(row('Rectangle')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(row('Hidden layer')).toHaveFocus();
    expect(tabbable()).toEqual([row('Hidden layer')]);
    await selectLayer(user, 'Star');
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}{ArrowLeft}');
    expect(field('X, from the left trim edge')).toHaveValue('72.8');
    expect(undo()).toBeDisabled();
  });

  it('reorders with Alt + arrows and the Move buttons, keeping focus on the layer', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Star');
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(rowNames().slice(2, 4)).toEqual(['logo.png, image', 'Star, star']);
    expect(row('Star')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Move layer up' }));
    expect(rowNames()[2]).toBe('Star, star');
    // Locked layers can't be moved (M3).
    await selectLayer(user, 'Since 2026');
    expect(screen.getByRole('button', { name: 'Move layer up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move layer down' })).toBeDisabled();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(rowNames()[1]).toBe('Since 2026, text, locked');
  });

  it('renames with F2, the pencil or a double-click; Escape cancels and empty restores the automatic name', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Star');
    await user.keyboard('{F2}');
    const input = screen.getByRole('textbox', { name: 'Layer name' });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, 'Gold star{Enter}');
    expect(row('Gold star')).toHaveFocus();
    expect(within(screen.getByTestId('selected-properties')).getByText('Gold star')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rename layer' }));
    await user.type(screen.getByRole('textbox', { name: 'Layer name' }), ' (draft){Escape}');
    expect(row('Gold star')).toBeInTheDocument();

    await user.dblClick(row('Gold star'));
    await user.clear(screen.getByRole('textbox', { name: 'Layer name' }));
    await user.keyboard('{Enter}');
    expect(row('Star')).toBeInTheDocument();

    await user.click(undo());
    expect(row('Gold star')).toBeInTheDocument();
    await user.click(undo());
    expect(row('Star')).toBeInTheDocument();
  });

  it('shows, hides, locks and unlocks from each row', async () => {
    const user = renderStudio();
    await user.click(within(layersList()).getByRole('button', { name: 'Show “Hidden layer”' }));
    expect(row('Hidden layer')).toHaveAccessibleName('Hidden layer, text');
    await user.click(within(layersList()).getByRole('button', { name: 'Lock “Star”' }));
    expect(row('Star')).toHaveAccessibleName('Star, star, locked');
    await user.click(undo());
    await user.click(undo());
    expect(rowNames().slice(0, 3)).toEqual(['Hidden layer, text, hidden', 'Since 2026, text, locked', 'Star, star']);
  });
});

describe('properties', () => {
  it('shows the selected element’s values in mm, degrees and percent', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Star');
    const props = screen.getByTestId('selected-properties');
    expect(within(props).getByTitle('Star')).toHaveTextContent('Star');
    expect(field('X, from the left trim edge')).toHaveValue('72.8');
    expect(field('Y, from the top trim edge')).toHaveValue('23.7');
    expect(field('W, width')).toHaveValue('7.6');
    expect(field('H, height')).toHaveValue('7.6');
    expect(field('Rotation')).toHaveValue('12');
    expect(field('Opacity')).toHaveValue('100');
    expect(screen.getByRole('slider', { name: 'Opacity' })).toHaveAttribute('aria-valuetext', '100 percent');
  });

  it('commits a typed value on Enter as one undo step; steps within 600 ms merge; same values add nothing', async () => {
    freezeClock();
    const user = renderStudio();
    await selectLayer(user, 'Star');
    const x = field('X, from the left trim edge');
    await user.clear(x);
    await user.type(x, '20{Enter}');
    expect(x).toHaveValue('20');
    const y = field('Y, from the top trim edge');
    await user.click(y);
    await user.keyboard('{ArrowUp}{ArrowUp}{Shift>}{ArrowUp}{/Shift}');
    expect(y).toHaveValue('24.9');
    await user.click(undo());
    expect(y).toHaveValue('23.7');
    expect(x).toHaveValue('20');
    await user.click(undo());
    expect(x).toHaveValue('72.8');
    expect(undo()).toBeDisabled();

    // Typing the value it already has, or text that isn't a number, records nothing.
    await user.clear(x);
    await user.type(x, '72.8{Enter}');
    await user.clear(y);
    await user.type(y, 'abc{Enter}');
    expect(y).toHaveValue('23.7');
    expect(undo()).toBeDisabled();
  });

  it('wraps rotation into 0–360°', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Star');
    const rotation = field('Rotation');
    await user.clear(rotation);
    await user.type(rotation, '-30{Enter}');
    expect(rotation).toHaveValue('330');
    await user.clear(rotation);
    await user.type(rotation, '370{Enter}');
    expect(rotation).toHaveValue('10');
  });

  it('keeps proportions when locked: images and stars start locked, rectangles start free', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Star');
    const lock = screen.getByRole('button', { name: 'Keep proportions' });
    expect(lock).toHaveAttribute('aria-pressed', 'true'); // M9: stars, triangles and polygons start locked
    await user.clear(field('W, width'));
    await user.type(field('W, width'), '10{Enter}');
    expect(field('H, height')).toHaveValue('10');
    await user.click(lock);
    await user.clear(field('W, width'));
    await user.type(field('W, width'), '20{Enter}');
    expect(field('H, height')).toHaveValue('10');

    await selectLayer(user, 'Rectangle');
    expect(screen.getByRole('button', { name: 'Keep proportions' })).toHaveAttribute('aria-pressed', 'false');

    await selectLayer(user, 'logo.png');
    expect(screen.getByRole('button', { name: 'Keep proportions' })).toHaveAttribute('aria-pressed', 'true');
    await user.clear(field('H, height'));
    await user.type(field('H, height'), '20{Enter}');
    expect(field('W, width')).toHaveValue('20');

    // Text has no lock: its height follows the text.
    await selectLayer(user, 'Riya Sharma');
    expect(screen.queryByRole('button', { name: 'Keep proportions' })).not.toBeInTheDocument();
    expect(field('H, height (follows the text)')).toHaveAttribute('readonly');
  });

  it('centres on the piece horizontally and vertically', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Star');
    await user.click(screen.getByRole('button', { name: 'Centre horizontally' }));
    expect(field('X, from the left trim edge')).toHaveValue('40.6'); // (88.9 − 7.6) / 2
    expect(screen.getByRole('button', { name: 'Centre horizontally' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Centre vertically' }));
    expect(field('Y, from the top trim edge')).toHaveValue('21.6'); // (50.8 − 7.6) / 2
    await user.click(undo());
    expect(field('Y, from the top trim edge')).toHaveValue('23.7');
  });

  it('sets opacity from the field and the slider', async () => {
    freezeClock();
    const user = renderStudio();
    await selectLayer(user, 'Star');
    const opacity = field('Opacity');
    await user.clear(opacity);
    await user.type(opacity, '50{Enter}');
    const slider = screen.getByRole('slider', { name: 'Opacity' });
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    slider.focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(opacity).toHaveValue('47');
    await user.click(undo()); // the key presses were one step
    expect(opacity).toHaveValue('50');
    await user.clear(opacity);
    await user.type(opacity, '150{Enter}');
    expect(opacity).toHaveValue('100');
  });

  it('hides and shows from the inspector, keeping the selection', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Star');
    const hide = screen.getByRole('button', { name: 'Hide layer' });
    await user.click(hide);
    expect(hide).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('This layer is hidden')).toBeInTheDocument();
    expect(row('Star')).toHaveAccessibleName('Star, star, hidden');
    expect(row('Star')).toHaveAttribute('aria-pressed', 'true');
    await user.click(hide);
    expect(row('Star')).toHaveAccessibleName('Star, star');
  });

  it('protects locked layers: no moving, resizing, reordering or deleting until unlocked', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Star');
    await user.click(screen.getByRole('button', { name: 'Lock layer' }));
    expect(screen.getByText('This layer is locked')).toBeInTheDocument();
    for (const name of ['X, from the left trim edge', 'W, width', 'Rotation', 'Opacity']) expect(field(name)).toBeDisabled();
    const props = within(screen.getByTestId('selected-properties'));
    for (const name of ['Delete', 'Bring forward', 'Send to back', 'Centre horizontally']) expect(props.getByRole('button', { name })).toBeDisabled();
    expect(props.getByRole('button', { name: 'Duplicate' })).toBeEnabled(); // copies come unlocked
    await user.click(within(screen.getByTestId('selected-properties')).getByRole('button', { name: 'Unlock' }));
    expect(field('X, from the left trim edge')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Lock layer' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('duplicates and deletes; undo restores', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Star');
    const props = screen.getByTestId('selected-properties');
    await user.click(within(props).getByRole('button', { name: 'Duplicate' }));
    expect(screen.getByText('Front · 9 items')).toBeInTheDocument();
    expect(rowNames().slice(2, 4)).toEqual(['Star, star', 'Star, star']);
    expect(field('X, from the left trim edge')).toHaveValue('75.8'); // 3 mm down and right
    await user.click(within(screen.getByTestId('selected-properties')).getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Front · 8 items')).toBeInTheDocument();
    expect(screen.getByText(/Select something on the canvas/)).toBeInTheDocument();
    await user.click(undo());
    expect(screen.getByText('Front · 9 items')).toBeInTheDocument();
  });

  it('changes the layer order with all four actions', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Star');
    const index = () => rowNames().indexOf('Star, star');
    const props = within(screen.getByTestId('selected-properties'));
    expect(index()).toBe(2);
    await user.click(props.getByRole('button', { name: 'Bring forward' }));
    expect(index()).toBe(1);
    await user.click(props.getByRole('button', { name: 'Bring to front' }));
    expect(index()).toBe(0);
    expect(props.getByRole('button', { name: 'Bring forward' })).toBeDisabled();
    await user.click(props.getByRole('button', { name: 'Send backward' }));
    expect(index()).toBe(1);
    await user.click(props.getByRole('button', { name: 'Send to back' }));
    expect(index()).toBe(7);
    expect(props.getByRole('button', { name: 'Send backward' })).toBeDisabled();
    for (const expected of [1, 0, 1, 2]) {
      await user.click(undo());
      expect(index()).toBe(expected);
    }
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(index()).toBe(1);
  });

  it('warns in words outside the safe area and past the trim', async () => {
    const user = renderStudio();
    await selectLayer(user, 'Rectangle');
    const props = () => within(screen.getByTestId('selected-properties'));
    expect(props().getByText('Part of this layer is past the trim edge and will be cut off.')).toBeInTheDocument();
    await selectLayer(user, 'Star');
    await user.clear(field('X, from the left trim edge'));
    await user.type(field('X, from the left trim edge'), '1{Enter}'); // turned 12°: its corners reach further left
    expect(props().getByText('Part of this layer is outside the safe area and may be trimmed.')).toBeInTheDocument();
  });
});

describe('layouts', () => {
  it('laptop and tablet: the drawer has the same inspector, with its own announcements', async () => {
    const user = renderStudio(1100);
    await user.click(screen.getByRole('button', { name: 'Layers and properties' }));
    const drawer = await screen.findByRole('dialog', { name: 'Layers and properties' });
    await user.click(within(drawer).getByRole('button', { name: /^Star,/ }));
    expect(within(drawer).getByRole('textbox', { name: 'X, from the left trim edge' })).toHaveValue('72.8');
    expect(within(drawer).getByTestId('canvas-announcer')).toBeInTheDocument();
  });

  it('phone: the selection toolbar opens the properties sheet', async () => {
    const user = renderStudio(390);
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'More tools' })).getByRole('button', { name: /Layers and properties/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Layers and properties' });
    await user.click(within(sheet).getByRole('button', { name: /^Star,/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Layers and properties' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('toolbar', { name: 'Selected: Star' })).getByRole('button', { name: 'Properties' }));
    expect(await screen.findByRole('dialog', { name: 'Layers and properties' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'W, width' })).toHaveValue('7.6');
  });
});
