import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { confirmEntry, expect, openTool, settleAnimations, test } from './fixtures';

/**
 * Review → Approve → handoff → Design attached → Add to cart (Phase 4 M5), in the production build,
 * from the product page. The approval is checked in this browser's own storage (IndexedDB) and the
 * cart line in localStorage: the cart must refer to exactly the approved design and choices.
 * Widths are set per test, so this runs in the desktop project only.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const CARD = 'business-card-classic';
const UMBRELLA = 'umbrella-photo-custom';

let errors: string[] = [];
test.beforeEach(({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'widths are set here');
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

const review = (page: Page) => page.getByRole('dialog', { name: 'Review your design' });
const attached = (page: Page) => page.getByTestId('attached-design');
const noSidewaysScroll = async (page: Page, label: string) =>
  expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: label }).toBeLessThanOrEqual(0);

async function studioReady(page: Page) {
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

async function startDesigning(page: Page, slug: string, colour?: string) {
  await page.goto(`/products/${slug}`);
  if (colour) await page.getByRole('radiogroup', { name: /^Canopy Colour/ }).getByRole('radio', { name: new RegExp(`^${colour}`) }).click();
  const link = page.getByRole('link', { name: /Start designing/ }).first();
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await confirmEntry(page);
  await studioReady(page);
}

async function addHeading(page: Page, text: string) {
  await openTool(page, 'Text');
  const sheet = page.getByRole('dialog', { name: 'Text' });
  await (((await sheet.count()) > 0 ? sheet : page).getByRole('button', { name: 'Add heading' })).click();
  await page.keyboard.type(text);
  // Phones edit text in a sheet, closed with Done; elsewhere Ctrl Enter ends editing.
  const editSheet = page.getByRole('dialog', { name: 'Edit text' });
  if (await editSheet.isVisible()) await editSheet.getByRole('button', { name: 'Done' }).click();
  else await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
}

async function reviewAndApprove(page: Page, next = 'Continue') {
  await page.getByRole('button', { name: next, exact: true }).click();
  await expect(review(page)).toBeVisible();
  await expect(review(page).getByRole('button', { name: 'Approve and continue' })).toBeEnabled();
  await review(page).getByRole('button', { name: 'Approve and continue' }).click();
  await expect(review(page).getByTestId('review-handoff')).toBeVisible();
  await review(page).getByRole('button', { name: 'Continue as guest' }).click();
  await page.waitForURL(/\/products\/[^/]+\?designId=/);
  await expect(attached(page)).toHaveAttribute('data-status', 'approved', { timeout: 10_000 });
}

type Stored = { designId: string; approval?: { versionId: string; fingerprint: string; sku: string; quantity: number }; fingerprint: string; document: { product: { sku: string; configuration: unknown } } };
const storedDesigns = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Stored[]>((resolve) => {
        const req = indexedDB.open('aaraprint-studio');
        req.onsuccess = () => {
          const g = req.result.transaction('designs').objectStore('designs').getAll();
          g.onsuccess = () => {
            req.result.close();
            resolve(g.result as Stored[]);
          };
        };
      }),
  );
type Line = { lineId: string; sku: string; quantity: number; configuration: unknown; design: { designId: string; versionId: string; fingerprint: string } };
const cartLines = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('aaraprint-cart') ?? '{"lines":[]}') as { lines: Line[] }).lines);

test('A · B · a visiting card: design, review, approve, attached, add to cart — the cart holds exactly the approved design', async ({ page }) => {
  test.setTimeout(90_000);
  await startDesigning(page, CARD);
  await addHeading(page, 'Riya Sharma');

  // A · Review shows this design and what is ordered.
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(review(page)).toBeVisible();
  await expect(review(page).getByTestId('review-summary')).toContainText('Front: 1 item');
  await expect(review(page).getByTestId('review-summary')).toContainText('Quantity');
  await page.waitForFunction(() => window.Konva.stages.some((s) => s.container().classList.contains('studio-preview-stage') && s.find('Text').some((t) => (t as KonvaNamespace.Text).text() === 'Riya Sharma')));
  await settleAnimations(page);
  const axe = await new AxeBuilder({ page }).include('[data-testid="studio-review"]').withTags(TAGS).analyze();
  expect(axe.violations.map((v) => `review ${v.id}`)).toEqual([]);
  await review(page).getByRole('button', { name: 'Approve and continue' }).click();
  await expect(review(page).getByTestId('review-handoff')).toBeVisible();
  await expect(review(page).getByTestId('handoff-account-note')).toContainText('isn’t available yet');
  await review(page).getByRole('button', { name: 'Continue as guest' }).click();
  await page.waitForURL(/\/products\/business-card-classic\?designId=/);

  const [stored] = await storedDesigns(page);
  expect(stored!.approval?.fingerprint).toBe(stored!.fingerprint);
  expect(new URL(page.url()).searchParams.get('designId')).toBe(stored!.designId);
  await expect(attached(page)).toHaveAttribute('data-status', 'approved');
  await expect(attached(page)).toContainText('Your design is attached and ready to order.');
  await expect(attached(page).getByTestId('attached-thumbnail').locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await settleAnimations(page);
  const axeAttached = await new AxeBuilder({ page }).include('[data-testid="attached-design"]').withTags(TAGS).analyze();
  expect(axeAttached.violations.map((v) => `attached ${v.id}`)).toEqual([]);

  // B · Add to cart: one line, the approved version, its SKU, quantity and configuration.
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-confirmation')).toContainText('Added to cart.');
  const [line] = await cartLines(page);
  expect(line).toMatchObject({ sku: stored!.document.product.sku, quantity: stored!.approval!.quantity, design: { designId: stored!.designId, versionId: stored!.approval!.versionId, fingerprint: stored!.approval!.fingerprint } });
  expect(line!.configuration).toEqual(stored!.document.product.configuration);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-confirmation')).toContainText('already in your cart');
  expect(await cartLines(page)).toHaveLength(1);
  expect(await storedDesigns(page)).toHaveLength(1); // no second design

  await page.getByRole('link', { name: 'View cart' }).click();
  await expect(page.getByRole('heading', { name: 'Your cart', level: 1 })).toBeVisible();
  const cartLine = page.getByTestId('cart-line');
  await expect(cartLine).toHaveCount(1);
  await expect(cartLine).toHaveAttribute('data-version-id', stored!.approval!.versionId);
  await expect(cartLine).toContainText('Design ready');
  await expect(cartLine.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(page.getByRole('link', { name: 'Cart, 1 item' })).toBeVisible();
  await settleAnimations(page);
  const axeCart = await new AxeBuilder({ page }).include('main').withTags(TAGS).analyze();
  expect(axeCart.violations.map((v) => `cart ${v.id}`)).toEqual([]);
});

test('C · after approving, a reload of the product page and of the Studio restores the approved state', async ({ page }) => {
  test.setTimeout(90_000);
  await startDesigning(page, CARD);
  await addHeading(page, 'Reload me');
  await reviewAndApprove(page);
  await page.reload();
  await expect(attached(page)).toHaveAttribute('data-status', 'approved', { timeout: 10_000 });
  await page.getByTestId('attached-edit').click();
  await studioReady(page);
  await page.reload();
  await studioReady(page);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(review(page).getByTestId('review-panel')).toHaveAttribute('data-approval', 'approved');
  await expect(review(page).getByTestId('review-approval-status')).toContainText('You approved this design.');
});

test('D · an edit after approving is never added as approved: attached says it changed, then re-approve and add the new version', async ({ page }) => {
  test.setTimeout(120_000);
  await startDesigning(page, CARD);
  await addHeading(page, 'Version one');
  await reviewAndApprove(page);
  const first = (await storedDesigns(page))[0]!.approval!;

  await page.getByTestId('attached-edit').click();
  await studioReady(page);
  await addHeading(page, 'Version two');
  await page.getByRole('link', { name: 'Back to product' }).click();
  await expect(attached(page)).toHaveAttribute('data-status', 'changed', { timeout: 10_000 });
  await expect(attached(page)).toContainText('Design changed since you approved it');
  await expect(page.getByTestId('add-to-cart')).toHaveCount(0);

  await attached(page).getByRole('link', { name: 'Review and approve' }).click();
  await studioReady(page);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(review(page).getByTestId('review-panel')).toHaveAttribute('data-approval', 'changed');
  await page.keyboard.press('Escape');
  await expect(review(page)).toHaveCount(0);
  await reviewAndApprove(page);
  const second = (await storedDesigns(page))[0]!.approval!;
  expect(second.versionId).not.toBe(first.versionId);
  await page.getByTestId('add-to-cart').click();
  const lines = await cartLines(page);
  expect(lines.map((l) => l.design.versionId)).toEqual([second.versionId]);
});

for (const width of [390, 360]) {
  test(`E · ${width} px: the whole flow by phone layout, every step on screen, nothing scrolls sideways`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 800 });
    await startDesigning(page, CARD);
    await addHeading(page, 'Phone');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(review(page)).toBeVisible();
    const approve = review(page).getByRole('button', { name: 'Approve and continue' });
    await expect(approve).toBeInViewport();
    await noSidewaysScroll(page, `${width} review`);
    await approve.click();
    await expect(review(page).getByRole('button', { name: 'Continue as guest' })).toBeInViewport();
    await review(page).getByRole('button', { name: 'Continue as guest' }).click();
    await page.waitForURL(/designId=/);
    await expect(attached(page)).toHaveAttribute('data-status', 'approved', { timeout: 10_000 });
    await noSidewaysScroll(page, `${width} product`);
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-confirmation')).toContainText('Added to cart.');
    await page.goto('/cart');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await noSidewaysScroll(page, `${width} cart`);
  });
}

test('F · the real Custom Photo Umbrella in Navy: review on the product photo, approved Navy attached, Navy in the cart', async ({ page }) => {
  test.setTimeout(120_000);
  await startDesigning(page, UMBRELLA, 'Navy');
  await page.waitForFunction(() => Boolean(window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))?.findOne('.product-mockup')));
  await addHeading(page, 'Umbrella');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(review(page).getByTestId('preview-area')).toHaveAttribute('data-view', 'product');
  await expect(review(page).getByTestId('preview-area')).toHaveAttribute('data-tint', 'applied', { timeout: 10_000 });
  await page.waitForFunction(() => window.Konva.stages.some((s) => s.container().classList.contains('studio-product-stage') && s.find('Text').some((t) => (t as KonvaNamespace.Text).text() === 'Umbrella')));
  await expect(review(page).getByTestId('review-summary')).toContainText('Navy');
  await review(page).getByRole('button', { name: 'Approve and continue' }).click();
  await review(page).getByRole('button', { name: 'Continue as guest' }).click();
  await page.waitForURL(/\/products\/umbrella-photo-custom\?designId=/);
  await expect(attached(page)).toHaveAttribute('data-status', 'approved', { timeout: 10_000 });
  await expect(attached(page).getByTestId('attached-summary')).toContainText('Navy');
  await expect(page.getByRole('radiogroup', { name: /^Canopy Colour/ }).getByRole('radio', { name: /^Navy/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('add-to-cart').click();
  const [line] = await cartLines(page);
  expect(line!.sku).toMatch(/COLOUR-NAVY/);
  await page.goto('/cart');
  await expect(page.getByTestId('cart-line')).toContainText('Navy');
});
