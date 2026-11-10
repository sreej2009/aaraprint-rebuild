import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { setGraphicsLibraryForTests } from '../assets/graphics';
import type { SurfaceDesign } from '../schema/types';
import { StudioApp } from '../shell/studio-app';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { setProofPipelineForTests, type ProofRenderProps, type ProofTexts } from './proof-export';
import type { ProofLayout } from './proof-layout';

/**
 * Print check and proof (M15) in the full Studio. jsdom can't draw, so the proof's drawing and
 * delivery are stand-ins that record what they were given (the browser tests download the real PNG).
 */

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 3000 });

const product = readProduct('business-card-classic');
const profile = readProfile('business-card-classic');
const realMatchMedia = window.matchMedia;

interface Delivered {
  layout: ProofLayout;
  surfaces: readonly SurfaceDesign[];
  texts: ProofTexts;
  fileName: string;
}
let delivered: Delivered[] = [];
let rendered: readonly SurfaceDesign[] = [];
let failDelivery = false;

function StandInRender({ surfaces, onDone }: ProofRenderProps) {
  useEffect(() => {
    rendered = surfaces;
    onDone(surfaces.map(() => document.createElement('canvas')));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function setWidth(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  delivered = [];
  rendered = [];
  failDelivery = false;
  setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 0 } });
  setProofPipelineForTests({
    Render: StandInRender,
    deliver: async (layout, _canvases, texts, fileName) => {
      if (failDelivery) throw new Error('no canvas');
      delivered.push({ layout, surfaces: rendered, texts, fileName });
    },
  });
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  setProofPipelineForTests(null);
  setGraphicsLibraryForTests(null);
});

function renderStudio({ sample = true, width = 1440 } = {}) {
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

const button = () => screen.getByTestId('print-check-button');
const dialog = () => screen.getByRole('dialog', { name: 'Print check and proof' });

async function openChecks(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button());
  return screen.findByRole('dialog', { name: 'Print check and proof' });
}

describe('the button', () => {
  it('shows how many things to check, once editing settles', async () => {
    renderStudio({ sample: false });
    expect(button()).toHaveAccessibleName('Print check design is empty');
    renderStudio(); // the sample: a band past the trim, and a logo that was never uploaded
    await waitFor(() => expect(screen.getAllByTestId('print-check-button')[1]).toHaveAccessibleName('Print check 2 warnings'));
  });
});

describe('print check', () => {
  it('lists each side’s warnings and what’s fine; Escape closes and focus returns', async () => {
    const user = renderStudio();
    await openChecks(user);
    expect(within(dialog()).getByTestId('print-check-summary')).toHaveTextContent('2 things to check before you print.');
    const front = within(dialog()).getByRole('region', { name: 'Front · 2 warnings' });
    expect(
      within(front)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('p')?.textContent ?? li.textContent),
    ).toEqual(['Warning: Past the trim edge', 'Warning: Image unavailable', 'All fonts are available']);
    const back = within(dialog()).getByRole('region', { name: 'Back · no warnings' });
    expect(within(back).getByRole('list', { name: 'Back: fine' })).toHaveTextContent('Nothing is past the trim edgeEverything is inside the safe zoneAll fonts are available');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(button()).toHaveFocus();
  });

  it('Show selects the layer on its side for the customer to fix — nothing is changed for them', async () => {
    const user = renderStudio();
    await openChecks(user);
    await user.click(within(dialog()).getByRole('button', { name: 'Show logo.png' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('list', { name: 'Layers' }).querySelector('[aria-pressed="true"]')).toHaveAccessibleName(/^logo\.png, image/);
    expect(document.getElementById('studio-canvas')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled(); // no edit was made
  });

  it('an empty design says so, and has no proof to download', async () => {
    const user = renderStudio({ sample: false });
    await openChecks(user);
    expect(within(dialog()).getByTestId('print-check-summary')).toHaveTextContent('Your design is empty.');
    expect(within(dialog()).getByTestId('proof-empty')).toHaveTextContent('Your design is empty. Add something to it to make a proof.');
    expect(within(dialog()).queryByTestId('download-proof')).not.toBeInTheDocument();
  });
});

describe('proof', () => {
  it('shows what the proof is, and makes it from the current design (unsaved changes included)', async () => {
    const user = renderStudio();
    // An unsaved edit: the star goes.
    await user.click(screen.getByRole('button', { name: /^Star, star/ }));
    await user.click(within(screen.getByTestId('selected-properties')).getByRole('button', { name: 'Delete' }));
    await openChecks(user);
    const facts = within(dialog()).getByTestId('proof-facts');
    expect([...facts.querySelectorAll('dt')].map((dt) => `${dt.textContent}: ${dt.nextElementSibling?.textContent}`)).toEqual([
      'Product: Classic Visiting Cards',
      'Sides: Front and Back',
      'Finished size: 88.9 × 50.8 mm',
      'Resolution: 300 DPI',
      'Bleed: 1.5 mm each side',
      'Safe zone: 2 mm from the edge',
      'Proof image: 2367 × 983 px, full resolution',
      'Print check: 2 warnings',
    ]);
    expect(within(dialog()).getByRole('radio', { name: 'Front and back' })).toBeChecked();
    await user.click(within(dialog()).getByTestId('download-proof'));
    await waitFor(() => expect(within(dialog()).getByTestId('proof-status')).toHaveTextContent('Proof downloaded: classic-visiting-cards-design-proof.png'));
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.layout).toMatchObject({ width: 2367, height: 983, scaled: false });
    expect(delivered[0]!.surfaces.map((s) => s.id)).toEqual(['front', 'back']);
    expect(delivered[0]!.surfaces[0]!.elements.map((e) => e.id)).not.toContain('el_star');
    expect(delivered[0]!.texts.lines[0]).toBe('Proof only — not a print-ready file. Colours on screen and in print can differ.');

    await user.click(within(dialog()).getByRole('radio', { name: 'Back only' }));
    expect(within(dialog()).getByTestId('proof-facts')).toHaveTextContent('1216 × 983 px');
    await user.click(within(dialog()).getByTestId('download-proof'));
    await waitFor(() => expect(delivered).toHaveLength(2));
    expect(delivered[1]).toMatchObject({ fileName: 'classic-visiting-cards-design-back-proof.png' });
    expect(delivered[1]!.surfaces.map((s) => s.id)).toEqual(['back']);
    // Making a proof is no edit.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('list', { name: 'Layers' })).toHaveTextContent('Star');
  });

  it('a failure says so and leaves the design alone', async () => {
    failDelivery = true;
    const user = renderStudio();
    await openChecks(user);
    await user.click(within(dialog()).getByTestId('download-proof'));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('The proof couldn’t be made. Your design is unchanged — try again.');
    failDelivery = false;
    await user.click(within(dialog()).getByTestId('download-proof'));
    await waitFor(() => expect(delivered).toHaveLength(1));
  });

  it('only sides with artwork can go in the proof', async () => {
    const user = renderStudio({ sample: false });
    await user.click(screen.getByRole('button', { name: 'Add text' }));
    await user.click(screen.getByRole('button', { name: 'Add heading' }));
    await user.keyboard('{Control>}{Enter}{/Control}');
    await openChecks(user);
    expect(within(dialog()).queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(within(dialog()).getByTestId('proof-facts')).toHaveTextContent('SidesFront');
    expect(within(dialog()).getByRole('region', { name: 'Back · no artwork' })).toHaveTextContent('No artwork on this side');
  });
});

describe('phones', () => {
  it('the button is an icon with the same name; the dialog works as a bottom sheet', async () => {
    const user = renderStudio({ width: 390 });
    await waitFor(() => expect(button()).toHaveAccessibleName('Print check 2 warnings'));
    await openChecks(user);
    await user.click(within(dialog()).getByTestId('download-proof'));
    await waitFor(() => expect(delivered).toHaveLength(1));
  });
});
