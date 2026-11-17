import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/design-system';
import { setAccountServiceForTests } from '@/features/account/account';
import { setGraphicsLibraryForTests } from '../assets/graphics';
import { setImageLoaderForTests } from '../assets/image-cache';
import { readApproval } from '../persistence/records';
import { createMemoryRepository, type MemoryRepository } from '../persistence/repository';
import { setPreviewRendererForTests, type PrintCanvasProps } from '../preview/renderer';
import { StudioApp } from '../shell/studio-app';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';

/**
 * Review your design → Approve and continue → handoff (Phase 4 M5) in the full Studio, saving to
 * an in-memory repository. jsdom can't draw, so the preview drawing is a stand-in; the browser
 * tests check the pixels and the real thumbnail.
 */

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 4000 });

const card = readProduct('business-card-classic');
const cardProfile = readProfile('business-card-classic');
const realMatchMedia = window.matchMedia;

beforeEach(() => {
  setGraphicsLibraryForTests({ status: 'ready', library: { graphics: [], withheld: 0 } });
  setImageLoaderForTests(async () => new Image());
  setPreviewRendererForTests({
    Canvas: () => <div data-testid="preview-canvas" />,
    PrintCanvas: ({ surface, flagged }: PrintCanvasProps) => <div data-testid="print-canvas" data-side={surface.id} data-flagged={flagged.map((f) => `${f.elementId}:${f.level}`).join(' ')} />,
    ProductCanvas: () => <div data-testid="product-canvas" />,
    Thumbnail: () => <div />,
    size: { width: 800, height: 600 },
  });
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  setImageLoaderForTests(null);
  setGraphicsLibraryForTests(null);
  setPreviewRendererForTests(null);
  setAccountServiceForTests(null);
});

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderStudio({ repository = createMemoryRepository() as MemoryRepository, width = 1440, designId = null as string | null } = {}) {
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
            <StudioApp product={card} profile={cardProfile} variantId={null} initialSurface={null} initialTool={null} repository={repository} designId={designId} />
            <Location />
          </TooltipProvider>
        ),
      },
      { path: '/products/:slug', element: <Location /> },
    ],
    { initialEntries: [`/products/${card.slug}/design`] },
  );
  render(<RouterProvider router={router} />);
  return { user: userEvent.setup(), repository };
}

const review = () => screen.getByRole('dialog', { name: 'Review your design' });
const approveButton = () => within(review()).getByRole('button', { name: 'Approve and continue' });

async function addHeading(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('region', { name: /^Design canvas: / });
  await user.click(screen.getByRole('button', { name: 'Add heading' }));
  await user.keyboard('{Escape}');
}

async function openReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('dialog', { name: 'Review your design' });
}

describe('Review your design', () => {
  it('shows the design being edited and what is ordered; an empty design can’t be approved and says why', async () => {
    const { user } = renderStudio();
    await screen.findByRole('region', { name: /^Design canvas: / });
    await openReview(user);
    expect(review()).toHaveAccessibleDescription(/Check positioning, spelling and the safe area before continuing\./);
    const summary = within(review()).getByTestId('review-summary');
    expect(summary).toHaveTextContent('Quantity1');
    expect(summary).toHaveTextContent(/Total₹/);
    expect(summary).toHaveTextContent('Front: empty · Back: empty');
    expect(within(review()).getByTestId('review-blockers')).toHaveTextContent('Your design is empty');
    expect(approveButton()).toBeDisabled();
    expect(approveButton()).toHaveAccessibleDescription(/Your design is empty/);
    expect(within(review()).getByTestId('preview-canvas')).toBeInTheDocument(); // the same preview drawing
  });

  it('Back to design keeps everything as it was: same design, no undo step, nothing saved', async () => {
    const { user, repository } = renderStudio();
    await addHeading(user);
    const undoBefore = screen.getByRole('button', { name: 'Undo' }).getAttribute('disabled');
    await openReview(user);
    await user.click(within(review()).getByRole('button', { name: 'Back to design' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('disabled')).toBe(undoBefore);
    expect(screen.getByText('Front · 1 item')).toBeInTheDocument();
    expect([...repository.versions.values()].some((v) => v.reason === 'approved')).toBe(false);
  });

  it('Approve and continue saves it, keeps the approved version, and hands off to the product page with this design', async () => {
    const { user, repository } = renderStudio();
    await addHeading(user);
    await openReview(user);
    expect(within(review()).queryByTestId('review-blockers')).toBeNull();
    await user.click(approveButton());
    const handoff = await within(review()).findByTestId('review-handoff');
    expect(handoff).toHaveTextContent('Design approved');
    // No accounts in this build: said plainly, nothing pretends to sign in.
    expect(within(handoff).getByTestId('handoff-account-note')).toHaveTextContent('Signing in to save designs to an account isn’t available yet.');
    expect(within(handoff).queryByRole('link', { name: 'Sign in' })).toBeNull();

    const [record] = [...repository.designs.values()];
    const approval = readApproval(record!.approval)!;
    expect(repository.versions.get(approval.versionId)?.reason).toBe('approved');
    expect(approval.fingerprint).toBe(record!.fingerprint);

    await user.click(within(handoff).getByRole('button', { name: 'Continue as guest' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^/products/${card.slug}\\?designId=${record!.designId}&variantId=`)));
  });

  it('an edit after approving is not treated as approved: Review says so, and approving again records the new content', async () => {
    const { user, repository } = renderStudio();
    await addHeading(user);
    await openReview(user);
    await user.click(approveButton());
    await within(review()).findByTestId('review-handoff');
    await user.click(within(review()).getByRole('button', { name: 'Back to design' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const first = readApproval([...repository.designs.values()][0]!.approval)!;

    const text = screen.getByRole('button', { name: 'Text' });
    if (text.getAttribute('aria-pressed') !== 'true') await user.click(text);
    await user.click(await screen.findByRole('button', { name: 'Add subheading' }));
    await user.keyboard('{Escape}');
    await openReview(user);
    expect(within(review()).getByTestId('review-panel')).toHaveAttribute('data-approval', 'changed');
    expect(within(review()).getByTestId('review-approval-status')).toHaveTextContent('You changed this design after approving it.');
    await user.click(approveButton());
    await within(review()).findByTestId('review-handoff');
    const second = readApproval([...repository.designs.values()][0]!.approval)!;
    expect(second.versionId).not.toBe(first.versionId);
    expect(second.fingerprint).not.toBe(first.fingerprint);
    expect([...repository.versions.values()].filter((v) => v.reason === 'approved')).toHaveLength(2);
  });

  it('a design that can’t be saved can’t be approved: the reason is shown and the design stays', async () => {
    const repository = createMemoryRepository();
    const { user } = renderStudio({ repository });
    await addHeading(user);
    repository.failWrites(new Error('quota'));
    await openReview(user);
    await user.click(approveButton());
    expect(await within(review()).findByTestId('review-problem')).toHaveTextContent(/Unable to save locally|Save all changes/);
    expect(within(review()).queryByTestId('review-handoff')).toBeNull();
    expect(screen.getByText('Front · 1 item')).toBeInTheDocument();
  });

  it('on phones the review panel sits under the preview; Escape closes it back to the editor', async () => {
    const { user } = renderStudio({ width: 390 });
    await screen.findByRole('region', { name: /^Design canvas: / });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('dialog', { name: 'Review your design' });
    expect(within(review()).getByRole('button', { name: 'Approve and continue' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
