import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { setGraphicsLibraryForTests } from '../assets/graphics';
import { setImageLoaderForTests } from '../assets/image-cache';
import { StudioApp } from '../shell/studio-app';
import { TEMPLATE_DEFINITIONS } from '../templates/data';
import { setTemplateSourceForTests } from '../templates/registry';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';

/**
 * The Templates tool (M13) in the full Studio on a blank business card: finding templates, how
 * well each suits the product, the details view, applying (empty side, replace, add, cancel,
 * both sides) as one undo step, load failures, rights-gated graphics and the phone sheet.
 */

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 3000 });

const product = readProduct('business-card-classic');
const profile = readProfile('business-card-classic');
const realMatchMedia = window.matchMedia;
const definition = (id: string) => JSON.parse(JSON.stringify(TEMPLATE_DEFINITIONS.find((t) => (t as { id: string }).id === id))) as Record<string, unknown>;

function setWidth(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 0 } });
  setImageLoaderForTests(async () => ({ naturalWidth: 10, naturalHeight: 10 }) as HTMLImageElement);
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  setTemplateSourceForTests(null);
  setGraphicsLibraryForTests(null);
  setImageLoaderForTests(null);
});

function renderStudio({ width = 1440 } = {}) {
  setWidth(width);
  const router = createMemoryRouter(
    [
      {
        path: '/products/:slug/design',
        element: (
          <TooltipProvider>
            <StudioApp product={product} profile={profile} variantId={null} initialSurface={null} initialTool={null} sample={false} />
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: ['/products/business-card-classic/design'] },
  );
  render(<RouterProvider router={router} />);
  return userEvent.setup();
}

const panel = () => screen.getByRole('complementary', { name: 'Templates' });
const cards = (within_ = panel()) => within_.querySelectorAll<HTMLElement>('[data-template-id]');
const cardIds = () => [...cards()].map((c) => c.dataset.templateId);
const layerCount = () => screen.queryByRole('list', { name: 'Layers' })?.querySelectorAll('[data-layer-row]').length ?? 0;
const undo = () => screen.getByRole('button', { name: 'Undo' });
const openTemplate = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(await within(panel()).findByRole('button', { name: new RegExp(`^${name}[ .]`) }));
  return screen.findByRole('heading', { name, level: 3 });
};

describe('finding templates', () => {
  it('opens with the templates made for this product first; others are tucked away with the reason', async () => {
    const user = renderStudio();
    await within(panel()).findByRole('heading', { name: 'For this product' });
    expect(cardIds()).toEqual(['card-minimal-centred', 'card-bold-left', 'card-diagonal-spotlight', 'card-classic-emblem', 'card-editorial-serif']);
    expect(within(panel()).getByRole('button', { name: 'Minimal centred 2 sides. Business. Fits this product.' })).toBeInTheDocument();
    const others = within(panel()).getByRole('button', { name: /^Made for other products \(11\)/ });
    expect(others).toHaveAttribute('aria-expanded', 'false');
    await user.click(others);
    expect(cards()).toHaveLength(16);
    expect(within(panel()).getByRole('button', { name: 'Event poster Other product: Made for flyers and signs, stationery. Events.' })).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Centred badge Other product: Made for round products. Labels & stamps.' })).toBeInTheDocument();
  });

  it('searches names, categories and tags, filters by category, and says when nothing matches', async () => {
    const user = renderStudio();
    const search = await within(panel()).findByRole('searchbox', { name: 'Search templates' });
    await user.type(search, 'EMBLEM');
    expect(cardIds()).toEqual(['card-classic-emblem']);
    expect(screen.getByText('1 template found, 1 for this product')).toBeInTheDocument();
    await user.clear(search);
    const categories = within(panel()).getByRole('group', { name: 'Template categories' });
    expect(
      within(categories)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All', 'Business', 'Events', 'Promotions', 'Stationery', 'Labels & stamps']);
    await user.click(within(categories).getByRole('button', { name: 'Events' }));
    expect(within(categories).getByRole('button', { name: 'Events' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel()).getByTestId('templates-none-fit')).toHaveTextContent('None of the matching templates fit this product.');
    await user.type(search, 'wedding');
    await user.click(within(panel()).getByRole('button', { name: /^Made for other products/ }));
    expect(cardIds()).toEqual(['invite-modern-wedding']);
    await user.type(search, ' zebra');
    expect(within(panel()).getByText('No templates match your search.')).toBeInTheDocument();
    await user.click(within(panel()).getByRole('button', { name: 'Clear search and filters' }));
    expect(search).toHaveValue('');
    expect(within(categories).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled(); // searching never touches the design
  });
});

describe('details and applying', () => {
  it('shows previews and how it fits; applying to an empty card is one undo step on both sides', async () => {
    const user = renderStudio();
    const heading = await openTemplate(user, 'Minimal centred');
    expect(heading).toHaveFocus();
    expect(screen.getByRole('img', { name: 'Minimal centred, front preview' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Minimal centred, back preview' })).toBeInTheDocument();
    expect(screen.getByTestId('template-fit')).toHaveTextContent('Fits this product.');
    expect(screen.getByText('Front and back')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply to both sides' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // nothing to replace: no question
    expect(layerCount()).toBe(3);
    expect(screen.getByRole('radio', { name: /^Back/ })).toHaveAccessibleName(/2/);
    await user.click(undo());
    expect(layerCount()).toBe(0);
    expect(screen.getByRole('radio', { name: /^Back/ })).toHaveAccessibleName(/0/);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(layerCount()).toBe(3);
    // Back to the list: focus returns to the template's card.
    await user.click(screen.getByRole('button', { name: 'All templates' }));
    await waitFor(() => expect(within(panel()).getByRole('button', { name: /^Minimal centred[ .]/ })).toHaveFocus());
  });

  it('asks before changing a side with artwork: cancel changes nothing, add keeps it, replace swaps it', async () => {
    const user = renderStudio();
    await openTemplate(user, 'Bold left-aligned');
    await user.click(screen.getByRole('button', { name: 'Apply to front' }));
    expect(layerCount()).toBe(5);

    await user.click(screen.getByRole('button', { name: 'Apply to front' }));
    let dialog = await screen.findByRole('dialog', { name: 'Replace what’s on the front?' });
    expect(dialog).toHaveTextContent('The front has 5 items. Replace it with “Bold left-aligned”, or add the template on top. You can undo this.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(layerCount()).toBe(5);
    expect(screen.getByRole('button', { name: 'Apply to front' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Apply to front' }));
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Add to front' }));
    expect(layerCount()).toBe(10);
    await user.click(undo());
    expect(layerCount()).toBe(5);

    await user.click(screen.getByRole('button', { name: 'Apply to front' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(layerCount()).toBe(5);

    await user.click(screen.getByRole('button', { name: 'All templates' }));
    await openTemplate(user, 'Editorial serif');
    await user.click(screen.getByRole('button', { name: 'Apply to front' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Replace front' }));
    expect(layerCount()).toBe(5);
    expect(within(screen.getByRole('list', { name: 'Layers' })).getByRole('button', { name: /^Your Name/ })).toBeInTheDocument();
    await user.click(undo());
    expect(within(screen.getByRole('list', { name: 'Layers' })).getByRole('button', { name: /^Colour block/ })).toBeInTheDocument();
  });

  it('a template for another product can be looked at but not applied', async () => {
    const user = renderStudio();
    await user.click(await within(panel()).findByRole('button', { name: /^Made for other products/ }));
    await openTemplate(user, 'Event poster');
    expect(screen.getByTestId('template-fit')).toHaveTextContent('Not for this product. Made for flyers and signs, stationery. It can’t be applied here.');
    expect(screen.queryByRole('button', { name: /^Apply/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All templates' }));
    await waitFor(() => expect(within(panel()).getByRole('button', { name: /^Event poster[ .]/ })).toHaveFocus());
  });
});

describe('loading and safety', () => {
  it('says when templates can’t be loaded, and tries again', async () => {
    let calls = 0;
    setTemplateSourceForTests(async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return [definition('card-bold-left')];
    });
    const user = renderStudio();
    const alert = await within(panel()).findByRole('alert');
    expect(alert).toHaveTextContent('Templates couldn’t be loaded');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(panel()).findByRole('button', { name: /^Bold left-aligned\./ })).toBeInTheDocument();
  });

  it('shows a loading state while templates load', async () => {
    setTemplateSourceForTests('never');
    renderStudio();
    expect(await within(panel()).findByText('Loading templates…')).toBeInTheDocument();
  });

  it('leaves out broken, withheld or unapproved-graphic templates; the rest still work', async () => {
    const withGraphic = definition('card-bold-left');
    withGraphic.id = 'card-with-seal';
    withGraphic.name = 'With seal';
    const front = (withGraphic.surfaces as { front: { elements: unknown[] } }).front;
    front.elements.push({
      id: 'f-seal',
      type: 'image',
      name: null,
      x: 900,
      y: 450,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      source: { kind: 'graphic', graphicId: 'verified-seal' },
    });
    setTemplateSourceForTests([
      definition('card-editorial-serif'),
      { ...definition('card-bold-left'), category: 'Nope' },
      { ...definition('card-diagonal-spotlight'), rights: 'unconfirmed' },
      withGraphic,
    ]);
    renderStudio();
    await within(panel()).findByRole('button', { name: /^Editorial serif[ .]/ });
    expect(cardIds()).toEqual(['card-editorial-serif']); // the seal isn't an approved graphic
  });

  it('a template using an approved graphic is offered, and its preview shows the graphic', async () => {
    const withGraphic = definition('card-bold-left');
    withGraphic.id = 'card-with-seal';
    withGraphic.name = 'With seal';
    (withGraphic.surfaces as { front: { elements: unknown[] } }).front.elements.push({
      id: 'f-seal',
      type: 'image',
      name: null,
      x: 900,
      y: 450,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      source: { kind: 'graphic', graphicId: 'verified-seal' },
    });
    setGraphicsLibraryForTests({
      status: 'ready',
      library: {
        graphics: [{ id: 'verified-seal', name: 'Verified seal', group: 'Badges', tags: [], width: 240, height: 240, url: '/studio/graphics/verified-seal.svg', rights: 'cleared' }],
        withheld: 0,
      },
    });
    setTemplateSourceForTests([withGraphic]);
    renderStudio();
    const card = await within(panel()).findByRole('button', { name: /^With seal[ .]/ });
    expect(card.parentElement!.querySelector('image')).toHaveAttribute('href', '/studio/graphics/verified-seal.svg');
  });
});

describe('phones', () => {
  it('Templates opens as a sheet; applying closes it to show the design', async () => {
    const user = renderStudio({ width: 390 });
    await user.click(within(screen.getByRole('navigation', { name: 'Design tools' })).getByRole('button', { name: /^Templates/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Templates' });
    await user.click(await within(sheet).findByRole('button', { name: /^Classic emblem[ .]/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Apply to front only' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Templates' })).not.toBeInTheDocument());
    expect(screen.getByRole('radio', { name: /^Front/ })).toHaveAccessibleName(/4/);
  });
});
