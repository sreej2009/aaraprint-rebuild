import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { setGraphicsLibraryForTests } from '../assets/graphics';
import { setImageLoaderForTests } from '../assets/image-cache';
import { readApproval } from '../persistence/records';
import { createMemoryRepository, type MemoryRepository } from '../persistence/repository';
import { createSaveController } from '../persistence/save-controller';
import { setProofPipelineForTests, type ProofDelivery, type ProofRenderProps, type ProofTexts } from '../preflight/proof-export';
import { setPreviewRendererForTests, type PrintCanvasProps } from '../preview/renderer';
import { createBlankDesign, createShapeElement, createTextElement } from '../schema/create';
import type { DesignDocument, SurfaceDesign } from '../schema/types';
import { StudioApp } from '../shell/studio-app';
import { createStudioStore } from '../store';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';

/**
 * Print check inside Review (Phase 4 M6), in the full Studio, saving to an in-memory repository.
 * jsdom can't draw, so the drawings and the proof's rendering and delivery are stand-ins that
 * record what they were given; the browser tests check the real pixels and files.
 */

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 4000 });

const card = readProduct('business-card-classic');
const cardProfile = readProfile('business-card-classic');
const realMatchMedia = window.matchMedia;

interface Delivered {
  surfaces: readonly SurfaceDesign[];
  texts: ProofTexts;
  fileName: string;
  delivery: ProofDelivery;
}
let delivered: Delivered[] = [];
let rendered: readonly SurfaceDesign[] = [];

function StandInRender({ surfaces, onDone }: ProofRenderProps) {
  useEffect(() => {
    rendered = surfaces;
    onDone(surfaces.map(() => document.createElement('canvas')));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

beforeEach(() => {
  delivered = [];
  setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 0 } });
  setImageLoaderForTests(async () => new Image());
  setPreviewRendererForTests({
    Canvas: ({ surface }) => <div data-testid="preview-canvas" data-side={surface.id} />,
    PrintCanvas: ({ surface, flagged }: PrintCanvasProps) => <div data-testid="print-canvas" data-side={surface.id} data-flagged={flagged.map((f) => `${f.elementId}:${f.level}`).join(' ')} />,
    ProductCanvas: () => <div data-testid="product-canvas" />,
    Thumbnail: () => <div />,
    size: { width: 800, height: 600 },
  });
  setProofPipelineForTests({
    Render: StandInRender,
    deliver: async (_layout, _canvases, texts, fileName, delivery) => {
      delivered.push({ surfaces: rendered, texts, fileName, delivery });
    },
  });
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  setImageLoaderForTests(null);
  setGraphicsLibraryForTests(null);
  setPreviewRendererForTests(null);
  setProofPipelineForTests(null);
});

/** A saved card design (as the Studio would have left it), opened by id. */
async function seed(repository: MemoryRepository, build: (doc: DesignDocument) => void) {
  const variant = card.variants.find((v) => v.isDefault) ?? card.variants[0]!;
  const doc = createBlankDesign(cardProfile, { newId: (prefix) => `${prefix}_seed`, variantId: variant.id, catalogue: card });
  build(doc);
  const studio = createStudioStore({ document: doc, catalogue: card });
  const controller = createSaveController({ studio, repository, productSlug: card.slug, productId: card.id });
  await controller.saveNow();
  controller.stop();
  return doc.id;
}

/** Front: a name inside the safe zone and a band past the trim (in the bleed). Back: blank. */
const withBand = (doc: DesignDocument) => {
  doc.surfaces[0]!.elements.push(
    createShapeElement('rect', { x: -18, y: 470, width: 1086, height: 148 }, { id: 'el_band', name: 'Band', fill: '#2f2a7a' }),
    createTextElement({ x: 100, y: 100, width: 500, height: 80 }, { id: 'el_name', text: 'Riya Sharma' }),
  );
};

function renderStudio({ repository, designId = null, sample = false, width = 1440 }: { repository: MemoryRepository; designId?: string | null; sample?: boolean; width?: number }) {
  window.matchMedia = ((query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  const router = createMemoryRouter(
    [
      {
        path: '/products/:slug/design',
        element: (
          <TooltipProvider>
            <StudioApp product={card} profile={cardProfile} variantId={null} initialSurface={null} initialTool={null} repository={repository} designId={designId} sample={sample} />
          </TooltipProvider>
        ),
      },
      { path: '/products/:slug', element: <p>Product page</p> },
    ],
    { initialEntries: [`/products/${card.slug}/design`] },
  );
  render(<RouterProvider router={router} />);
  return userEvent.setup();
}

const review = () => screen.getByRole('dialog', { name: 'Review your design' });
const status = () => within(review()).getByTestId('review-print-status');
const area = () => within(review()).getByTestId('preview-area');
const NBSP = String.fromCharCode(0xa0);

async function openReview(user: ReturnType<typeof userEvent.setup>, name = 'Continue') {
  await screen.findByRole('region', { name: /^Design canvas: / });
  await user.click(screen.getByRole('button', { name }));
  await screen.findByRole('dialog', { name: 'Review your design' });
}

describe('Review → Print check', () => {
  it('says Warning (worth checking, still approvable) with each side’s status; the print check view draws the print area with the band outlined', async () => {
    const repository = createMemoryRepository();
    const designId = await seed(repository, withBand);
    const user = renderStudio({ repository, designId });
    await openReview(user);

    expect(status()).toHaveAttribute('data-status', 'warning');
    expect(status()).toHaveTextContent('Warning1 thing worth checking. You can still approve.');
    expect([...within(status()).getAllByRole('listitem')].map((li) => [li.dataset.side, li.dataset.status])).toEqual([
      ['front', 'warning'],
      ['back', 'blank'],
    ]);
    expect(within(review()).getByRole('button', { name: 'Approve and continue' })).toBeEnabled();
    expect(area()).toHaveAttribute('data-view', 'flat');

    await user.click(within(review()).getByTestId('review-show-print-check'));
    expect(area()).toHaveAttribute('data-view', 'print');
    expect(within(review()).getByTestId('print-canvas')).toHaveAttribute('data-flagged', 'el_band:serious');
    expect(within(review()).getByRole('radio', { name: 'Print check' })).toHaveAttribute('aria-checked', 'true');
    expect(area()).toHaveAccessibleName(/^Front side print check: 2 items, Warning \(1 warning\), 88\.9.×.50\.8.mm\./);
    expect(within(review()).getByTestId('print-legend')).toHaveTextContent('Bleed (cut off)Trim (finished edge)Safe zone (keep important things inside)Worth checking');
    const facts = within(review()).getByTestId('review-print-facts');
    expect(facts.textContent!.replaceAll(NBSP, ' ')).toContain('Print size (trim)88.9 × 50.8 mmWith bleed91.9 × 53.8 mmBleed1.5 mm each sideSafe zone2 mm inside the trimPrint resolution300 DPI');
    const artwork = within(review()).getByRole('list', { name: 'Front artwork' });
    expect([...artwork.querySelectorAll('li')].map((li) => [li.dataset.element, li.dataset.tone, li.dataset.resolution])).toEqual([
      ['el_name', 'ok', 'vector'],
      ['el_band', 'warning', 'vector'],
    ]);
    expect(artwork).toHaveTextContent('Past the trim, in the bleed');
    // Side tabs show the status in the print check view; the back has its own check.
    const sides = within(review()).getByRole('radiogroup', { name: 'Side to preview' });
    expect(within(sides).getByRole('radio', { name: /Front/ })).toHaveTextContent('Front Warning');
    await user.click(within(sides).getByRole('radio', { name: /Back/ }));
    expect(within(review()).getByTestId('print-canvas')).toHaveAttribute('data-side', 'back');
    expect(within(review()).getByTestId('print-canvas')).toHaveAttribute('data-flagged', '');
    expect(within(review()).getByTestId('review-print-details')).toHaveTextContent('Back: print details');

    // Back to the preview: the same Review, nothing changed.
    await user.click(within(review()).getByRole('radio', { name: 'Preview' }));
    expect(area()).toHaveAttribute('data-view', 'flat');
    expect(screen.getByRole('button', { name: 'Undo', hidden: true })).toBeDisabled(); // no edit was made
  });

  it('Needs attention exactly when approval is blocked (a missing file); the side says why', async () => {
    const user = renderStudio({ repository: createMemoryRepository(), sample: true }); // the sample's logo was never uploaded
    await openReview(user);
    expect(status()).toHaveAttribute('data-status', 'blocked');
    expect(status()).toHaveTextContent('Needs attention: one thing has to be fixed before you can approve.');
    expect(within(status()).getByText('A file is missing')).toBeInTheDocument();
    expect(within(review()).getByRole('button', { name: 'Approve and continue' })).toBeDisabled();
    expect(within(review()).getByTestId('review-blockers')).toHaveTextContent('missing');
  });

  it('approving from the print check view goes back to the preview for the picture and approves as in M5', async () => {
    const repository = createMemoryRepository();
    const designId = await seed(repository, withBand);
    const user = renderStudio({ repository, designId });
    await openReview(user);
    await user.click(within(review()).getByTestId('review-show-print-check'));
    expect(area()).toHaveAttribute('data-view', 'print');
    await user.click(within(review()).getByRole('button', { name: 'Approve and continue' }));
    expect(await within(review()).findByTestId('review-handoff')).toHaveTextContent('Design approved');
    expect(area()).toHaveAttribute('data-view', 'flat');
    const approval = readApproval(repository.designs.get(designId)!.approval)!;
    expect(repository.versions.get(approval.versionId)?.reason).toBe('approved');
    expect(approval.fingerprint).toBe(repository.designs.get(designId)!.fingerprint);
  });

  it('checking and downloading proofs never invalidate an approval; an artwork change does', async () => {
    const repository = createMemoryRepository();
    const designId = await seed(repository, withBand);
    const user = renderStudio({ repository, designId });
    await openReview(user);
    await user.click(within(review()).getByRole('button', { name: 'Approve and continue' }));
    await within(review()).findByTestId('review-handoff');
    await user.click(within(review()).getByRole('button', { name: 'Back to design' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await openReview(user);
    expect(within(review()).getByTestId('review-panel')).toHaveAttribute('data-approval', 'approved');
    await user.click(within(review()).getByTestId('review-show-print-check'));
    await user.click(within(review()).getByTestId('download-proof'));
    await waitFor(() => expect(delivered).toHaveLength(1));
    expect(within(review()).getByTestId('review-panel')).toHaveAttribute('data-approval', 'approved');
    await user.click(within(review()).getByRole('button', { name: 'Back to design' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // An artwork change after approving: Review says it must be approved again.
    const text = screen.getByRole('button', { name: 'Text' });
    if (text.getAttribute('aria-pressed') !== 'true') await user.click(text);
    await user.click(await screen.findByRole('button', { name: 'Add subheading' }));
    await user.keyboard('{Escape}');
    await openReview(user);
    expect(within(review()).getByTestId('review-panel')).toHaveAttribute('data-approval', 'changed');
  });
});

describe('Download proof in Review', () => {
  it('makes the proof from the current design (unsaved changes included), as PNG or real-size PDF, with a deterministic name', async () => {
    const repository = createMemoryRepository();
    const designId = await seed(repository, withBand);
    const user = renderStudio({ repository, designId });
    await screen.findByRole('region', { name: /^Design canvas: / });
    // An unsaved change: the name goes.
    await user.click(screen.getByRole('button', { name: /^Riya Sharma, text/ }));
    await user.click(within(screen.getByTestId('selected-properties')).getByRole('button', { name: 'Delete' }));
    await openReview(user);

    const proof = within(review()).getByTestId('proof-section');
    // The back is blank, so the proof is of the front only: no choice of sides.
    expect(within(proof).queryByRole('radiogroup', { name: 'Sides in the proof' })).toBeNull();
    await user.click(within(proof).getByRole('radio', { name: 'PDF, at real size' }));
    await user.click(within(proof).getByRole('button', { name: 'Download proof (PDF)' }));
    await waitFor(() => expect(within(proof).getByTestId('proof-status')).toHaveTextContent('Proof downloaded: aaraprint-business-card-classic-front-proof.pdf'));
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.delivery).toEqual({ format: 'pdf', dpi: 300 });
    expect(delivered[0]!.surfaces.map((s) => s.id)).toEqual(['front']);
    expect(delivered[0]!.surfaces[0]!.elements.map((e) => e.id)).toEqual(['el_band']); // the unsaved deletion is in it
    expect(delivered[0]!.texts.title).toBe('Classic Visiting Cards design — Classic Visiting Cards');
    expect(delivered[0]!.texts.lines[1]).toMatch(/SKU .+ · Quantity \d+$/);
    expect(delivered[0]!.texts.sides[0]!.note.replaceAll(NBSP, ' ')).toBe('88.9 × 50.8 mm · 1.5 mm bleed · 2 mm safe zone');

    await user.click(within(proof).getByRole('radio', { name: 'PNG image' }));
    await user.click(within(proof).getByRole('button', { name: 'Download proof (PNG)' }));
    await waitFor(() => expect(delivered).toHaveLength(2));
    expect(delivered[1]).toMatchObject({ fileName: 'aaraprint-business-card-classic-front-proof.png', delivery: { format: 'png' } });
    // Making proofs is no edit: the deletion is still the only undo step.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('list', { name: 'Layers' })).toHaveTextContent('Riya Sharma');
  });
});

describe('phones', () => {
  it('Preview / Print check sits in the bottom bar; the print view, statuses and proof work at 390 px', async () => {
    const repository = createMemoryRepository();
    const designId = await seed(repository, withBand);
    const user = renderStudio({ repository, designId, width: 390 });
    await openReview(user, 'Next');
    const toggle = within(review()).getByTestId('review-view-toggle');
    expect(toggle.closest('footer')).not.toBeNull();
    await user.click(within(toggle).getByRole('radio', { name: 'Print check' }));
    expect(area()).toHaveAttribute('data-view', 'print');
    expect(within(review()).getByTestId('print-legend')).toBeInTheDocument();
    expect(within(review()).getByRole('radiogroup', { name: 'Side to preview' })).toHaveTextContent('Front WarningBack Blank');
    await user.click(within(review()).getByTestId('download-proof'));
    await waitFor(() => expect(delivered).toHaveLength(1));
  });
});
