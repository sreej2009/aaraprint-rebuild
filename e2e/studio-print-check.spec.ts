import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type KonvaNamespace from 'konva';
import { confirmEntry, expect, openTool, settleAnimations, test } from './fixtures';

/**
 * Print check and proof inside Review (Phase 4 M6), in the production build, from the product page:
 * the status (Ready, Warning, Needs attention), the Print check view of the whole print area drawn
 * with the trim, bleed, safe zone and flagged elements (read back from the Konva stage), print
 * facts, front and back, the real PNG and PDF proofs from Review, approval from the print check
 * view, and the M5 flow on to the cart. Widths are set per test, so this runs in the desktop
 * project only.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const CARD = 'business-card-classic';
const UMBRELLA = 'umbrella-photo-custom';
const PEN = 'pen-gold-click';

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
const area = (page: Page) => review(page).getByTestId('preview-area');
const printStatus = (page: Page) => review(page).getByTestId('review-print-status');
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
  await ((await sheet.count()) > 0 ? sheet : page).getByRole('button', { name: 'Add heading' }).click();
  await page.keyboard.type(text);
  const editSheet = page.getByRole('dialog', { name: 'Edit text' });
  if (await editSheet.isVisible()) await editSheet.getByRole('button', { name: 'Done' }).click();
  else await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
}

/** Moves the selected layer with the inspector (mm from the left trim edge). */
async function setX(page: Page, mm: string) {
  const field = page.getByRole('complementary', { name: 'Layers and properties' }).getByRole('textbox', { name: 'X, from the left trim edge' });
  await field.fill(mm);
  await field.press('Enter');
}

/** What the print check view's stage draws: its guides and flagged outlines (presentation only). */
const printStage = (page: Page) =>
  page.evaluate(() => {
    const stage = window.Konva.stages.find((s) => s.container().classList.contains('studio-print-stage'));
    if (!stage) return null;
    const count = (name: string) => stage.find(`.${name}`).length;
    return { trim: count('print-trim'), safe: count('print-safe'), bleed: count('print-bleed-band'), flags: count('print-flag'), texts: stage.find('Text').map((t) => (t as KonvaNamespace.Text).text()) };
  });

async function download(page: Page, format: 'PNG' | 'PDF') {
  const section = review(page).getByTestId('proof-section');
  await section.getByRole('radio', { name: format === 'PNG' ? 'PNG image' : 'PDF, at real size' }).check();
  const button = section.getByRole('button', { name: `Download proof (${format})` });
  await button.scrollIntoViewIfNeeded();
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const bytes = readFileSync((await (file as Download).path())!);
  await expect(section.getByTestId('proof-status')).toHaveText(`Proof downloaded: ${file.suggestedFilename()}`);
  return { name: file.suggestedFilename(), bytes };
}

test('a visiting card: Warning in Review, the print area drawn with trim, bleed, safe zone and the flagged layer; PNG and PDF proofs; approve from the print check; on to the cart', async ({ page }) => {
  test.setTimeout(120_000);
  await startDesigning(page, CARD);
  await addHeading(page, 'Riya Sharma');
  await setX(page, '-1'); // past the trim, into the 1.5 mm bleed
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(review(page)).toBeVisible();
  await expect(printStatus(page)).toHaveAttribute('data-status', 'warning');
  await expect(printStatus(page)).toContainText('1 thing worth checking. You can still approve.');
  await expect(printStatus(page).locator('li[data-side="back"]')).toHaveAttribute('data-status', 'blank');
  await expect(review(page).getByRole('button', { name: 'Approve and continue' })).toBeEnabled();

  // The print check view: the same design, the whole print area, its guides drawn (never part of the design).
  await review(page).getByRole('radio', { name: 'Print check' }).click();
  await expect(area(page)).toHaveAttribute('data-view', 'print');
  await expect.poll(() => printStage(page)).toEqual({ trim: 1, safe: 1, bleed: 1, flags: 1, texts: ['Riya Sharma'] });
  await expect(review(page).getByTestId('print-legend')).toContainText('Bleed (cut off)');
  await expect(review(page).getByTestId('review-print-facts')).toContainText('1.5 mm each side');
  await expect(review(page).getByRole('list', { name: 'Front artwork' })).toContainText('Past the trim, in the bleed');
  await expect(review(page).getByRole('list', { name: 'Front artwork' })).toContainText('Vector text: sharp at any size');
  const sides = review(page).getByRole('radiogroup', { name: 'Side to preview' });
  await expect(sides.getByRole('radio', { name: /Front/ })).toContainText('Warning');
  await sides.getByRole('radio', { name: /Back/ }).click();
  await expect.poll(() => printStage(page)).toMatchObject({ flags: 0, texts: [] });
  await expect(review(page).getByTestId('review-print-details')).toContainText('Back: print details');
  await sides.getByRole('radio', { name: /Front/ }).click();
  await settleAnimations(page);
  const axe = await new AxeBuilder({ page }).include('[data-testid="studio-review"]').withTags(TAGS).analyze();
  expect(axe.violations.map((v) => `print check ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);

  // Proofs from Review: the front only (the back is blank), deterministic names.
  const png = await download(page, 'PNG');
  expect(png.name).toBe('aaraprint-business-card-classic-front-proof.png');
  expect(png.bytes.subarray(1, 4).toString()).toBe('PNG');
  expect([png.bytes.readUInt32BE(16), png.bytes.readUInt32BE(20)]).toEqual([1216, 983]);
  const pdf = await download(page, 'PDF');
  expect(pdf.name).toBe('aaraprint-business-card-classic-front-proof.pdf');
  const text = pdf.bytes.toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  // Real size: 1216 × 983 px at 300 DPI = 291.84 × 235.92 pt.
  expect(text).toContain('/MediaBox [0 0 291.84 235.92]');
  expect(text).toContain('/Width 1216 /Height 983');
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);

  // Approve from the print check view: the thumbnail is the preview, the approval is M5's.
  await review(page).getByRole('button', { name: 'Approve and continue' }).click();
  await expect(review(page).getByTestId('review-handoff')).toBeVisible();
  await expect(area(page)).toHaveAttribute('data-view', 'flat');
  await review(page).getByRole('button', { name: 'Continue as guest' }).click();
  await page.waitForURL(/\/products\/business-card-classic\?designId=/);
  await expect(page.getByTestId('attached-design')).toHaveAttribute('data-status', 'approved', { timeout: 10_000 });
  await expect(page.getByTestId('attached-thumbnail').locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-confirmation')).toContainText('Added to cart.');
});

test('Needs attention blocks approval exactly as M5 does; Ready once the problem is gone, with no undo step from checking', async ({ page }) => {
  test.setTimeout(90_000);
  await startDesigning(page, CARD);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(printStatus(page)).toHaveAttribute('data-status', 'blocked');
  await expect(printStatus(page)).toContainText('Needs attention');
  await expect(review(page).getByRole('button', { name: 'Approve and continue' })).toBeDisabled();
  await expect(review(page).getByTestId('proof-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(review(page)).toHaveCount(0);
  await addHeading(page, 'Ready now');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(printStatus(page)).toHaveAttribute('data-status', 'ready');
  await expect(printStatus(page)).toContainText('Ready to print: nothing to fix.');
  await review(page).getByRole('radio', { name: 'Print check' }).click();
  await expect.poll(() => printStage(page)).toMatchObject({ flags: 0 });
  await page.keyboard.press('Escape');
  await expect(review(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
});

test('the real Custom Photo Umbrella in Navy: the photo stays in the preview, the print check shows its print area (no bleed), the proof is the current artwork, the cart gets Navy', async ({ page }) => {
  test.setTimeout(150_000);
  await startDesigning(page, UMBRELLA, 'Navy');
  await page.waitForFunction(() => Boolean(window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))?.findOne('.product-mockup')));
  await addHeading(page, 'Umbrella');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(area(page)).toHaveAttribute('data-view', 'product');
  await expect(area(page)).toHaveAttribute('data-tint', 'applied', { timeout: 10_000 });
  await expect(review(page).getByTestId('review-summary')).toContainText('Navy');

  await review(page).getByRole('radio', { name: 'Print check' }).click();
  await expect(area(page)).toHaveAttribute('data-view', 'print');
  await expect.poll(() => printStage(page)).toEqual({ trim: 1, safe: 1, bleed: 0, flags: 0, texts: ['Umbrella'] });
  await expect(review(page).getByTestId('print-legend')).toContainText('Edge of the print area');
  await expect(review(page).getByTestId('print-legend')).not.toContainText('Bleed');
  await expect(review(page).getByTestId('review-print-facts')).toContainText('No bleed');

  // Back to the preview: the real photo, still Navy.
  await review(page).getByRole('radio', { name: 'Preview' }).click();
  await expect(area(page)).toHaveAttribute('data-view', 'product');
  await expect(area(page)).toHaveAttribute('data-tint', 'applied', { timeout: 10_000 });
  await page.waitForFunction(() => window.Konva.stages.some((s) => s.container().classList.contains('studio-product-stage') && s.find('Text').some((t) => (t as KonvaNamespace.Text).text() === 'Umbrella')));

  const pdf = await download(page, 'PDF');
  expect(pdf.name).toBe('aaraprint-umbrella-photo-custom-front-proof.pdf');
  expect(pdf.bytes.toString('latin1').startsWith('%PDF-1.4')).toBe(true);
  const png = await download(page, 'PNG');
  expect(png.name).toBe('aaraprint-umbrella-photo-custom-front-proof.png');

  await review(page).getByRole('button', { name: 'Approve and continue' }).click();
  await review(page).getByRole('button', { name: 'Continue as guest' }).click();
  await page.waitForURL(/\/products\/umbrella-photo-custom\?designId=/);
  await expect(page.getByTestId('attached-design')).toHaveAttribute('data-status', 'approved', { timeout: 10_000 });
  await expect(page.getByTestId('attached-summary')).toContainText('Navy');
  await page.getByTestId('add-to-cart').click();
  const sku = await page.evaluate(() => (JSON.parse(localStorage.getItem('aaraprint-cart') ?? '{"lines":[]}') as { lines: { sku: string }[] }).lines[0]?.sku);
  expect(sku).toMatch(/COLOUR-NAVY/);
});

test('a pen (another family): its own print area, no bleed, front and back checked separately', async ({ page }) => {
  test.setTimeout(90_000);
  await startDesigning(page, PEN);
  await addHeading(page, 'Pen');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await review(page).getByRole('radio', { name: 'Print check' }).click();
  await expect(area(page)).toHaveAttribute('data-view', 'print');
  await expect.poll(() => printStage(page)).toMatchObject({ trim: 1, bleed: 0, texts: ['Pen'] });
  await expect(review(page).getByTestId('review-print-facts')).toContainText('No bleed');
  await expect(review(page).getByTestId('review-print-facts')).toContainText('300');
  await expect(printStatus(page).locator('li[data-side="back"]')).toHaveAttribute('data-status', 'blank');
});

for (const width of [1440, 1280, 820, 390, 360]) {
  test(`${width} px: Review’s print check and proof fit, the controls are on screen and nothing scrolls sideways`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: width < 500 ? 800 : 900 });
    await startDesigning(page, CARD);
    await addHeading(page, 'Wide or narrow');
    const phone = width < 768;
    await page.getByRole('button', { name: phone ? 'Next' : 'Continue', exact: true }).click();
    await expect(review(page)).toBeVisible();
    const toggle = review(page).getByTestId('review-view-toggle');
    await expect(toggle).toBeInViewport();
    await toggle.getByRole('radio', { name: 'Print check' }).click();
    await expect(area(page)).toHaveAttribute('data-view', 'print');
    await expect.poll(() => printStage(page)).toMatchObject({ trim: 1, safe: 1 });
    await expect(review(page).getByRole('button', { name: 'Approve and continue' })).toBeInViewport();
    await expect(review(page).getByTestId('print-legend')).toBeVisible();
    await noSidewaysScroll(page, `${width} review print check`);
    // Front and back can be switched at every width.
    await review(page).getByRole('radiogroup', { name: 'Side to preview' }).getByRole('radio', { name: /Back/ }).click();
    await expect(review(page).getByTestId('review-print-details')).toContainText('Back: print details');
    // The proof controls are reachable (the panel scrolls; its actions stay pinned).
    const proof = review(page).getByTestId('download-proof');
    await proof.scrollIntoViewIfNeeded();
    await expect(proof).toBeInViewport();
    const box = await proof.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width);
    await expect(review(page).getByRole('button', { name: 'Approve and continue' })).toBeInViewport();
    await noSidewaysScroll(page, `${width} review proof`);
  });
}

test('keyboard: Review’s Preview / Print check is a radio group; Escape closes and focus returns to Continue', async ({ page }) => {
  test.setTimeout(90_000);
  await startDesigning(page, CARD);
  await addHeading(page, 'Keys');
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(review(page)).toBeVisible();
  const preview = review(page).getByRole('radio', { name: 'Preview' });
  await preview.focus();
  await page.keyboard.press('ArrowRight');
  await expect(review(page).getByRole('radio', { name: 'Print check' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(area(page)).toHaveAttribute('data-view', 'print');
  await page.keyboard.press('Escape');
  await expect(review(page)).toHaveCount(0);
  await expect(next).toBeFocused();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled(); // the heading; checking added nothing
});
