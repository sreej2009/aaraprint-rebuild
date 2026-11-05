import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import type { StudioProfile } from '../profile/types';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { StudioApp } from './studio-app';

/**
 * Front/back in the full Studio (M10): the switcher, the side menu (copy front to back, clear),
 * their confirmations, the empty-side card, per-side backgrounds, and single-sided products.
 * Sample card: front 8 items, back 5 (with a background colour). Blank card: both sides empty.
 */

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
});

function renderStudio({ width = 1440, sample = true, side = null as string | null, studioProfile = profile as StudioProfile } = {}) {
  setWidth(width);
  const router = createMemoryRouter(
    [
      {
        path: '/products/:slug/design',
        element: (
          <TooltipProvider>
            <StudioApp product={product} profile={studioProfile} variantId={null} initialSurface={side} initialTool={null} sample={sample} />
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: [`/products/business-card-classic/design${side ? `?side=${side}` : ''}`] },
  );
  render(<RouterProvider router={router} />);
  return { user: userEvent.setup(), router };
}

const sides = () => screen.getByRole('radiogroup', { name: 'Side' });
const sideRadio = (name: 'Front' | 'Back') => within(sides()).getByRole('radio', { name: new RegExp(`^${name}`) });
const layersCaption = () => screen.getByText(/^(Front|Back) · /).textContent;
const rows = () => [...(screen.queryByRole('list', { name: 'Layers' })?.querySelectorAll('[data-layer-row]') ?? [])].map((b) => b.getAttribute('aria-label'));
const undo = () => screen.getByRole('button', { name: 'Undo' });

async function sideMenu(user: ReturnType<typeof userEvent.setup>, item: RegExp) {
  await user.click(screen.getByRole('button', { name: 'Side options' }));
  return screen.getByRole('menuitem', { name: item });
}

describe('side switcher', () => {
  it('shows each side with its item count and which one is active; switching replaces layers and inspector', async () => {
    const { user, router } = renderStudio();
    expect(sideRadio('Front')).toHaveAccessibleName('Front, 8 items');
    expect(sideRadio('Front')).toHaveAttribute('aria-checked', 'true');
    expect(sideRadio('Back')).toHaveAttribute('aria-checked', 'false');
    await user.click(within(screen.getByRole('list', { name: 'Layers' })).getByRole('button', { name: /^Star,/ }));
    expect(screen.getByTestId('selected-properties')).toBeInTheDocument();

    await user.click(sideRadio('Back'));
    expect(sideRadio('Back')).toHaveAttribute('aria-checked', 'true');
    expect(layersCaption()).toBe('Back · 5 items');
    expect(rows()).toEqual(['Thank you, text', 'Arrow, arrow', 'Line, line', 'Triangle, triangle', 'Circle, circle']);
    expect(screen.queryByTestId('selected-properties')).not.toBeInTheDocument(); // no stale selection
    expect(router.state.location.search).toBe('?side=back');

    // Keyboard: arrow keys move between the options, Space or Enter switches.
    sideRadio('Back').focus();
    await user.keyboard('{ArrowLeft}');
    expect(sideRadio('Front')).toHaveFocus();
    await user.keyboard(' ');
    expect(sideRadio('Front')).toHaveAttribute('aria-checked', 'true');
    expect(layersCaption()).toBe('Front · 8 items');
    expect(router.state.location.search).toBe('');
  });

  it('opens on the back from ?side=back', () => {
    renderStudio({ side: 'back' });
    expect(sideRadio('Back')).toHaveAttribute('aria-checked', 'true');
    expect(layersCaption()).toBe('Back · 5 items');
  });

  it('isn’t shown for single-sided products; the menu then clears the whole design', async () => {
    const single: StudioProfile = { ...profile, sides: [profile.sides[0]!] };
    const { user } = renderStudio({ studioProfile: single, sample: false });
    expect(screen.queryByRole('radiogroup', { name: 'Side' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Side options' }));
    expect(screen.queryByRole('menuitem', { name: /Copy/ })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Clear design' })).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('heading', { name: 'Your design is empty' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy front/ })).not.toBeInTheDocument();
  });
});

describe('copy front to back', () => {
  it('fills an empty back straight away and moves you there', async () => {
    const { user } = renderStudio({ sample: false });
    await user.click(screen.getByRole('button', { name: 'Background' }));
    await user.click(screen.getByRole('button', { name: 'Ivory' }));
    await user.click(await sideMenu(user, /Copy front to back/));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sideRadio('Back')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('textbox', { name: 'Back background colour, hex code' })).toHaveValue('#F4F1EA');
    await user.click(undo());
    // Undo puts you back where you were before the copy (the front), and the back is empty again.
    expect(sideRadio('Front')).toHaveAttribute('aria-checked', 'true');
    expect(sideRadio('Back')).toHaveAccessibleName('Back, 0 items');
    await user.click(sideRadio('Back'));
    expect(screen.getByRole('textbox', { name: 'Back background colour, hex code' })).toHaveValue('');
  });

  it('can’t copy an empty front', async () => {
    const { user } = renderStudio({ sample: false });
    expect(await sideMenu(user, /Copy front to back/)).toHaveAttribute('aria-disabled', 'true');
  });

  it('asks before touching a back with artwork: Replace, Keep both or Cancel', async () => {
    const { user } = renderStudio();
    await user.click(await sideMenu(user, /Copy front to back/));
    let dialog = screen.getByRole('dialog', { name: 'Copy the front to the back?' });
    expect(dialog).toHaveTextContent('The back already has 5 items and a background colour.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(sideRadio('Front')).toHaveAttribute('aria-checked', 'true');
    expect(undo()).toBeDisabled();

    await user.click(await sideMenu(user, /Copy front to back/));
    dialog = screen.getByRole('dialog', { name: 'Copy the front to the back?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep both' }));
    expect(sideRadio('Back')).toHaveAccessibleName('Back, 13 items');
    await user.click(undo());

    await user.click(await sideMenu(user, /Copy front to back/));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Replace back' }));
    expect(sideRadio('Back')).toHaveAccessibleName('Back, 8 items');
    expect(sideRadio('Front')).toHaveAccessibleName('Front, 8 items');
    expect(rows()).toContain('Riya Sharma, text');
  });
});

describe('clear side', () => {
  it('asks first, clears only the active side, and one undo brings it back', async () => {
    const { user } = renderStudio({ side: 'back' });
    await user.click(await sideMenu(user, /Clear back/));
    const confirm = screen.getByRole('alertdialog', { name: 'Clear the back?' });
    expect(confirm).toHaveTextContent('This removes 5 items and a background colour from the back. The other side doesn’t change.');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(layersCaption()).toBe('Back · 5 items');

    await user.click(await sideMenu(user, /Clear back/));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear back' }));
    expect(screen.getByRole('heading', { name: 'Back side is empty' })).toBeInTheDocument();
    expect(sideRadio('Front')).toHaveAccessibleName('Front, 8 items');
    expect(await sideMenu(user, /Clear back/)).toHaveAttribute('aria-disabled', 'true'); // nothing left to clear
    await user.keyboard('{Escape}');
    await user.click(undo());
    expect(layersCaption()).toBe('Back · 5 items');
  });
});

describe('empty side card', () => {
  it('offers text, shapes, graphics and — on the back — a copy of the front', async () => {
    const { user } = renderStudio({ sample: false });
    const card = screen.getByTestId('empty-side');
    expect(within(card).getByRole('heading', { name: 'Front side is empty' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Copy/ })).not.toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Add shape' }));
    expect(screen.getByRole('complementary', { name: 'Shapes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add circle' }));
    expect(screen.queryByTestId('empty-side')).not.toBeInTheDocument();

    await user.click(sideRadio('Back'));
    const back = screen.getByTestId('empty-side');
    expect(within(back).getByRole('heading', { name: 'Back side is empty' })).toBeInTheDocument();
    await user.click(within(back).getByRole('button', { name: 'Copy front to back' }));
    expect(rows()).toEqual(['Circle, circle']);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(within(screen.getByTestId('empty-side')).getByRole('button', { name: 'Add text' }));
    expect(screen.getByRole('complementary', { name: 'Text' })).toBeInTheDocument();
  });
});

describe('backgrounds', () => {
  it('belong to one side each', async () => {
    const { user } = renderStudio({ sample: false });
    await user.click(screen.getByRole('button', { name: 'Background' }));
    await user.click(screen.getByRole('button', { name: 'Royal blue' }));
    expect(screen.getByRole('textbox', { name: 'Front background colour, hex code' })).toHaveValue('#1D4ED8');
    await user.click(sideRadio('Back'));
    expect(screen.getByRole('textbox', { name: 'Back background colour, hex code' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'No background' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(sideRadio('Front'));
    expect(screen.getByRole('textbox', { name: 'Front background colour, hex code' })).toHaveValue('#1D4ED8');
  });
});

describe('phones', () => {
  it('have the side switcher and side menu above the canvas', async () => {
    const { user } = renderStudio({ width: 390 });
    await user.click(sideRadio('Back'));
    expect(sideRadio('Back')).toHaveAttribute('aria-checked', 'true');
    await user.click(await sideMenu(user, /Copy front to back/));
    expect(screen.getByRole('dialog', { name: 'Copy the front to the back?' })).toBeInTheDocument();
  });
});
