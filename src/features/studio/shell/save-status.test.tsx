import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { toStoredDocument, designFingerprint } from '../persistence/fingerprint';
import { createMemoryRepository, type MemoryRepository } from '../persistence/repository';
import { createBlankDesign, createTextElement } from '../schema/create';
import type { DesignDocument } from '../schema/types';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { StudioApp } from './studio-app';
import { resolveStudioVariant } from './variant';

/**
 * Saving in the full Studio (M11): the save status and menu, Save now, version history with its
 * confirmation, restoring on open, and the screens for designs that can't be opened. An
 * in-memory repository stands in for IndexedDB (jsdom has none).
 */

vi.setConfig({ testTimeout: 20_000 });
// Saving waits on timers and promises: allow for a busy machine running the whole suite.
configure({ asyncUtilTimeout: 3000 });

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

function renderStudio({ repository = createMemoryRepository(), width = 1440, sample = false, designId = null as string | null, slug = 'business-card-classic' } = {}) {
  setWidth(width);
  const router = createMemoryRouter(
    [
      {
        path: '/products/:slug/design',
        element: (
          <TooltipProvider>
            <StudioApp product={product} profile={profile} variantId={null} initialSurface={null} initialTool={null} sample={sample} designId={designId} repository={repository} />
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: [`/products/${slug}/design`] },
  );
  render(<RouterProvider router={router} />);
  return { user: userEvent.setup(), router, repository };
}

/** A design already saved in the repository. */
function savedDesign(repository: MemoryRepository, fields: { text?: string; slug?: string; document?: unknown; id?: string } = {}) {
  // As real saves are: with the product's default options.
  const doc: DesignDocument = createBlankDesign(profile, { newId: () => fields.id ?? 'design_saved', variantId: resolveStudioVariant(product, null)?.id ?? null });
  if (fields.text) doc.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 400, height: 60 }, { id: 'el_saved', text: fields.text }));
  const slug = fields.slug ?? 'business-card-classic';
  const stored = fields.document ?? toStoredDocument({ ...doc, product: { ...doc.product, slug } }, doc.meta);
  repository.designs.set(doc.id, {
    designId: doc.id,
    productSlug: slug,
    productId: doc.product.productId,
    variantId: null,
    name: doc.name,
    schemaVersion: 2,
    createdAt: 1,
    updatedAt: Date.now(),
    revision: 1,
    fingerprint: designFingerprint(doc),
    currentVersionId: null,
    document: stored,
  });
  return doc;
}

const status = () => screen.getByTestId('save-status');
const rows = () => [...(screen.queryByRole('list', { name: 'Layers' })?.querySelectorAll('[data-layer-row]') ?? [])].map((b) => b.getAttribute('aria-label'));

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(status());
  return screen.getByRole('menu');
}

describe('save status', () => {
  it('goes from not saved, to unsaved changes, to saved — locally, never "synced"', async () => {
    const { user, router, repository } = renderStudio();
    expect(await screen.findByTestId('save-status')).toHaveTextContent('Not saved yet');
    await user.click(screen.getByRole('button', { name: 'Add shape' }));
    await user.click(screen.getByRole('button', { name: 'Add circle' }));
    expect(status()).toHaveTextContent('Unsaved changes');
    await waitFor(() => expect(status()).toHaveTextContent('Saved just now'), { timeout: 3000 });
    expect(repository.designs.size).toBe(1);
    expect(router.state.location.search).toMatch(/^\?design=design_/);
    const menu = await openMenu(user);
    expect(menu).toHaveTextContent('Designs are saved automatically in this browser on this device.');
    expect(document.body.textContent).not.toMatch(/synced|cloud/i);
  });

  it('Save now and Ctrl S save at once and say so', async () => {
    const { user, repository } = renderStudio();
    await screen.findByTestId('save-status');
    await user.click(screen.getByRole('button', { name: 'Add text' }));
    await user.click(screen.getByRole('button', { name: 'Add heading' }));
    await user.keyboard('{Control>}{Enter}{/Control}');
    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: /Save now/ }));
    await waitFor(() => expect(screen.getByTestId('save-announcer')).toHaveTextContent('Saved in this browser.'));
    expect(repository.designs.size).toBe(1);
    // One version: "manual", or "initial" when a busy machine let the 1 s autosave land first.
    const reasons = (await repository.listVersions([...repository.designs.keys()][0]!)).map((v) => v.reason);
    expect(reasons).toHaveLength(1);
    expect(['manual', 'initial']).toContain(reasons[0]);
    await user.keyboard('{Control>}s{/Control}');
    expect(status()).toHaveTextContent(/Saved/);
  });

  it('says so when saving fails, keeps the design, and saves on retry', async () => {
    const repository = createMemoryRepository();
    repository.failWrites(Object.assign(new Error('nope'), { name: 'InvalidStateError' }));
    const { user } = renderStudio({ repository });
    await screen.findByTestId('save-status');
    await user.click(screen.getByRole('button', { name: 'Add shape' }));
    await user.click(screen.getByRole('button', { name: 'Add star' }));
    await waitFor(() => expect(status()).toHaveTextContent('Save failed'), { timeout: 3000 });
    expect(screen.getByTestId('save-announcer')).toHaveTextContent('Unable to save locally. Your changes are still in this session.');
    expect(rows()).toEqual(['Star, star']);
    repository.failWrites(null);
    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: /Try again/ }));
    await waitFor(() => expect(status()).toHaveTextContent('Saved just now'));
  });

  it('marks samples as not saved until saved on purpose', async () => {
    const { user, repository, router } = renderStudio({ sample: true });
    expect(status()).toHaveTextContent('Sample · not saved');
    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: /Save now/ }));
    await waitFor(() => expect(repository.designs.size).toBe(1));
    await waitFor(() => expect(router.state.location.search).toMatch(/design=/));
    expect(router.state.location.search).not.toMatch(/sample/);
  });
});

describe('opening a saved design', () => {
  it('restores the latest design for the product with nothing selected', async () => {
    const repository = createMemoryRepository();
    savedDesign(repository, { text: 'Welcome back' });
    renderStudio({ repository });
    await waitFor(() => expect(rows()).toEqual(['Welcome back, text']));
    expect(status()).toHaveTextContent(/Saved/);
    expect(screen.queryByTestId('selected-properties')).not.toBeInTheDocument();
  });

  it('never opens a damaged design or another product’s; offers a new design and keeps the saved one', async () => {
    const repository = createMemoryRepository();
    savedDesign(repository, { document: { format: 'aaraprint.design', schemaVersion: 2, surfaces: 'broken' } });
    const { user } = renderStudio({ repository, designId: 'design_saved' });
    expect(await screen.findByRole('heading', { name: 'This saved design can’t be opened' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start a new design' }));
    expect(await screen.findByTestId('save-status')).toHaveTextContent('Not saved yet');
    expect(repository.designs.get('design_saved')).toBeDefined();
  });

  it('sends another product’s design to its own product', async () => {
    const repository = createMemoryRepository();
    savedDesign(repository, { slug: 'flyer-a4-standard', text: 'Flyer' });
    renderStudio({ repository, designId: 'design_saved' });
    expect(await screen.findByRole('heading', { name: 'This saved design belongs to another product' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open it with its product' })).toHaveAttribute('href', '/products/flyer-a4-standard/design?design=design_saved');
  });

  it('explains a design that isn’t in this browser', async () => {
    renderStudio({ designId: 'design_elsewhere' });
    expect(await screen.findByRole('heading', { name: 'This design isn’t saved in this browser' })).toBeInTheDocument();
  });
});

describe('version history', () => {
  it('lists versions, restores only after confirming, and returns focus to the status', async () => {
    const { user } = renderStudio();
    await screen.findByTestId('save-status');
    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: /Version history/ }));
    let dialog = await screen.findByRole('dialog', { name: 'Version history' });
    expect(dialog).toHaveTextContent('No versions yet.');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(status()).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Add shape' }));
    await user.click(screen.getByRole('button', { name: 'Add circle' }));
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(status()).toHaveTextContent(/Saved/));
    await user.click(screen.getByRole('button', { name: 'Add star' }));
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(rows()).toHaveLength(2));

    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: /Version history/ }));
    dialog = await screen.findByRole('dialog', { name: 'Version history' });
    const versions = within(dialog).getAllByTestId('version-row');
    expect(versions).toHaveLength(2);
    expect(versions[0]).toHaveTextContent(/Manual save.*Current/);
    await user.click(versions[1]!); // a row itself does nothing
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(within(versions[1]!).getByRole('button', { name: /^Restore manual save from / }));
    const confirm = screen.getByRole('alertdialog', { name: 'Restore this version?' });
    expect(confirm).toHaveTextContent('A safety copy of what’s here now is kept first, and you can undo this.');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); // nothing restored
    await user.click(within(versions[1]!).getByRole('button', { name: /^Restore/ }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(rows()).toEqual(['Circle, circle']));
    expect(screen.getByTestId('save-announcer')).toHaveTextContent(/Restored the version from .*Press Ctrl Z to undo\./);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(rows()).toHaveLength(2);
  });

  it('works on phones, from the status in the top bar', async () => {
    const { user } = renderStudio({ width: 390 });
    await screen.findByTestId('save-status');
    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: /Version history/ }));
    expect(await screen.findByRole('dialog', { name: 'Version history' })).toBeInTheDocument();
  });
});

describe('new designs', () => {
  it('start fresh with a new id, leaving the saved one as it was', async () => {
    const repository = createMemoryRepository();
    savedDesign(repository, { text: 'Keep me' });
    const { user, router } = renderStudio({ repository });
    await waitFor(() => expect(rows()).toEqual(['Keep me, text']));
    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: /Start a new design/ }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Start a new design?' });
    await user.click(within(confirm).getByRole('button', { name: 'Start a new design' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Front side is empty' })).toBeInTheDocument());
    expect(router.state.location.search).not.toMatch(/design_saved/);
    expect(repository.designs.get('design_saved')).toBeDefined();
  });
});
