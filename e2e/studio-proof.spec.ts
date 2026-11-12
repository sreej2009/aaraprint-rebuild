import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type KonvaNamespace from 'konva';
import { expect, test, openTool } from './fixtures';

/**
 * Print check and proof in the browser (Phase 3 M15): advice that follows the design (safe zone,
 * trim, low-resolution and unavailable images, empty sides, front and back) without blocking
 * anything, and real PNG proofs — sizes read from the PNG header, pixels read back to prove they
 * show the current, unsaved design with the bleed tinted. Every test starts with an empty profile.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const BLANK = '/products/business-card-classic/design';
const SAMPLE = `${BLANK}?sample=1`;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

async function open(page: Page, url = BLANK) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

const checkButton = (page: Page) => page.getByTestId('print-check-button');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Print check and proof' });
const summary = (page: Page) => dialog(page).getByTestId('print-check-summary');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Layers and properties' });
const status = (page: Page) => page.getByTestId('save-status');
const saved = (page: Page) => expect(status(page)).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

async function openChecks(page: Page) {
  await checkButton(page).click();
  await expect(dialog(page)).toBeVisible();
}
async function closeChecks(page: Page) {
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
}

async function addHeading(page: Page, text: string) {
  await openTool(page, 'Text');
  await page.getByRole('button', { name: 'Add heading' }).click();
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
}

async function setField(page: Page, name: string, value: string) {
  const field = inspector(page).getByRole('textbox', { name });
  await field.fill(value);
  await field.press('Enter');
}

async function makePng(page: Page, width: number, height: number): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.fillStyle = '#2f5bd3';
      g.fillRect(0, 0, w, h);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    [width, height] as const,
  );
  return Buffer.from(bytes);
}

async function upload(page: Page, name: string, width: number, height: number) {
  const rail = page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Uploads' });
  if ((await rail.getAttribute('aria-pressed')) !== 'true') await rail.click(); // the rail button toggles the panel
  await page.getByTestId('upload-input').setInputFiles({ name, mimeType: 'image/png', buffer: await makePng(page, width, height) });
  await page.getByRole('button', { name: new RegExp(`^Add image: ${name.replace('.', '\\.')}`) }).click();
}

/** Download the proof; returns its file name, PNG size (from the header) and the file itself. */
async function downloadProof(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), dialog(page).getByTestId('download-proof').click()]);
  const path = await (download as Download).path();
  const file = readFileSync(path!);
  expect(file.subarray(1, 4).toString()).toBe('PNG');
  await expect(dialog(page).getByTestId('proof-status')).toHaveText(`Proof downloaded: ${download.suggestedFilename()}`);
  return { name: download.suggestedFilename(), width: file.readUInt32BE(16), height: file.readUInt32BE(20), file };
}

/** Colours of the proof at the given points, read back through a canvas. */
async function pixels(page: Page, file: Buffer, points: [number, number][]) {
  return page.evaluate(
    async ({ data, at }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const c = document.createElement('canvas');
      c.width = image.width;
      c.height = image.height;
      const g = c.getContext('2d')!;
      g.drawImage(image, 0, 0);
      return at.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3));
    },
    { data: file.toString('base64'), at: points },
  );
}

test.describe('desktop: print check', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('1–4 · a good design passes; the dialog passes axe, Escape closes and focus returns', async ({ page }) => {
    await open(page);
    await expect(checkButton(page)).toHaveAccessibleName('Print check design is empty');
    await addHeading(page, 'Riya Sharma');
    await expect(checkButton(page)).toHaveAccessibleName('Print check no warnings');
    await checkButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    await expect(summary(page)).toHaveText('No problems found.');
    await expect(dialog(page).getByRole('list', { name: 'Front: fine' })).toContainText('Everything is inside the safe zone');
    await expect(dialog(page).getByRole('region', { name: 'Back · no artwork' })).toContainText('No artwork on this side');
    const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    await closeChecks(page);
    await expect(checkButton(page)).toBeFocused();
  });

  test('5 · 6 · moving a layer near and past the edge is reported (and named), never blocked or undone', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Edge test');
    await setField(page, 'X, from the left trim edge', '1');
    await expect(checkButton(page)).toHaveAccessibleName('Print check 1 warning');
    await openChecks(page);
    await expect(summary(page)).toHaveText('1 thing to check before you print.');
    const item = dialog(page).locator('li[data-kind="outside-safe"]');
    await expect(item).toContainText('Outside the safe zone');
    await expect(item).toContainText('Part of “Edge test” is outside the safe zone');
    await closeChecks(page);
    await setField(page, 'X, from the left trim edge', '-5');
    await openChecks(page);
    await expect(dialog(page).locator('li[data-kind="outside-trim"]')).toContainText('Past the trim edge');
    await expect(dialog(page).locator('li[data-level="serious"]')).toHaveCount(1);
    // Show takes the customer to the layer; editing goes on as normal.
    await dialog(page).getByRole('button', { name: 'Show Edge test' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(inspector(page).getByRole('textbox', { name: 'X, from the left trim edge' })).toHaveValue('-5');
    await setField(page, 'X, from the left trim edge', '10');
    await expect(checkButton(page)).toHaveAccessibleName('Print check no warnings');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(checkButton(page)).toHaveAccessibleName('Print check 1 warning');
  });

  test('7 · 8 · a low-resolution image is reported with its DPI and left as it is; a good one isn’t', async ({ page }) => {
    await open(page);
    await upload(page, 'sharp.png', 1200, 800);
    await upload(page, 'tiny.png', 100, 100);
    await setField(page, 'W, width', '30'); // 100 px over 1.18 in ≈ 85 DPI
    await openChecks(page);
    const low = dialog(page).locator('li[data-kind="low-resolution"]');
    await expect(low).toHaveCount(1);
    await expect(low).toContainText('Low resolution image — 85 DPI');
    await expect(low).toContainText('Use a higher-resolution image');
    await expect(dialog(page).locator('li[data-kind="image-unavailable"]')).toHaveCount(0);
    await closeChecks(page);
    await expect(inspector(page).getByRole('textbox', { name: 'W, width' })).toHaveValue('30');
    await expect(inspector(page).getByTestId('image-resolution')).toHaveText(/Low resolution · 85 DPI/);
  });

  test('9 · 12 · an image this browser no longer has is “unavailable”; the proof still downloads, with the placeholder', async ({ page }) => {
    await open(page);
    await upload(page, 'logo.png', 600, 600);
    await saved(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const req = indexedDB.open('aaraprint-studio');
          req.onsuccess = () => {
            const tx = req.result.transaction('assets', 'readwrite');
            tx.objectStore('assets').clear();
            tx.oncomplete = () => {
              req.result.close();
              resolve();
            };
          };
        }),
    );
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(checkButton(page)).toHaveAccessibleName('Print check 1 warning');
    await openChecks(page);
    await expect(dialog(page).locator('li[data-kind="image-unavailable"]')).toContainText('“logo.png” isn’t in this browser');
    const proof = await downloadProof(page);
    expect(proof).toMatchObject({ name: 'classic-visiting-cards-design-front-proof.png', width: 1216, height: 983 });
  });

  test('10 · checks are per side; the editor’s side is never changed by them', async ({ page }) => {
    await open(page, SAMPLE);
    await openChecks(page);
    await expect(dialog(page).getByRole('region', { name: 'Front · 2 warnings' })).toBeVisible();
    await expect(dialog(page).getByRole('region', { name: 'Back · no warnings' })).toBeVisible();
    await closeChecks(page);
    await page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: /^Back/ }).click();
    await page
      .getByRole('list', { name: 'Layers' })
      .getByRole('button', { name: /^Thank you, text/ })
      .click();
    await setField(page, 'Y, from the top trim edge', '0.5');
    await openChecks(page);
    await expect(dialog(page).getByRole('region', { name: 'Back · 1 warning' })).toContainText('Outside the safe zone');
    await expect(dialog(page).getByRole('region', { name: 'Front · 2 warnings' })).toBeVisible();
    await closeChecks(page);
    await expect(page.getByRole('radiogroup', { name: 'Side' }).locator('[aria-checked="true"]')).toHaveAccessibleName(/^Back/);
  });

  test('11–13 · the proof is a PNG of the current, unsaved design: both sides, the formula, trim and tinted bleed', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Proof me');
    // An unsaved change right before the proof: the front's background.
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Background' }).click();
    await page.getByRole('complementary', { name: 'Background' }).getByRole('button', { name: 'Deep indigo' }).click();
    await page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: /^Back/ }).click();
    await page.getByRole('complementary', { name: 'Background' }).getByRole('button', { name: 'Marigold' }).click();
    // Preview still works alongside.
    await page.getByTestId('preview-button').click();
    await expect(page.getByRole('dialog', { name: 'Preview' })).toBeVisible();
    await page.keyboard.press('Escape');
    await openChecks(page);
    await expect(dialog(page).getByRole('radio', { name: 'Front and back' })).toBeChecked();
    await expect(dialog(page).getByTestId('proof-facts')).toContainText('2367 × 983 px, full resolution');
    const proof = await downloadProof(page);
    expect(proof).toMatchObject({ name: 'classic-visiting-cards-design-proof.png', width: 2367, height: 983 });
    // Front panel at (65, 152), back at (1216, 152); bleed 18 px; trim 1050 × 600.
    const [frontCentre, frontBleed, backCentre, page_] = await pixels(page, proof.file, [
      [65 + 18 + 900, 152 + 18 + 500],
      [65 + 6, 152 + 300],
      [1216 + 18 + 525, 152 + 18 + 300],
      [20, 20],
    ]);
    expect(frontCentre).toEqual([0x2f, 0x2a, 0x7a]); // deep indigo, as set a moment ago
    expect(frontBleed).not.toEqual(frontCentre); // the bleed is tinted
    expect(backCentre).toEqual([0xe8, 0x93, 0x0c]); // marigold
    expect(page_).toEqual([255, 255, 255]);

    await dialog(page).getByRole('radio', { name: 'Back only' }).click();
    const back = await downloadProof(page);
    expect(back).toMatchObject({ name: 'classic-visiting-cards-design-back-proof.png', width: 1216, height: 983 });
    await closeChecks(page);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled(); // the last edit is still there to undo
  });

  test('14 · 15 · warnings never stop saving; after a reload the checks are the same', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Too close');
    await setField(page, 'X, from the left trim edge', '1');
    await saved(page);
    await expect(checkButton(page)).toHaveAccessibleName('Print check 1 warning');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(checkButton(page)).toHaveAccessibleName('Print check 1 warning');
    await openChecks(page);
    await expect(dialog(page).locator('li[data-kind="outside-safe"]')).toContainText('“Too close”');
  });

  test('a very large print gets a proof scaled to the 16 MP browser limit', async ({ page }) => {
    await open(page, '/products/flyer-canopy-tent/design');
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Background' }).click();
    await page.getByRole('complementary', { name: 'Background' }).getByRole('button', { name: 'Marigold' }).click();
    await openChecks(page);
    await expect(dialog(page).getByTestId('proof-facts')).toContainText(/scaled to \d+% to stay within browser limits/);
    const proof = await downloadProof(page);
    expect(proof.width * proof.height).toBeLessThanOrEqual(16_000_000);
    expect(proof.width * proof.height).toBeGreaterThan(15_800_000);
  });
});

test.describe('tablet: print check', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('16 · opens by touch from the top bar and downloads a proof', async ({ page }) => {
    await open(page, SAMPLE);
    await expect(checkButton(page)).toHaveAccessibleName('Print check 2 warnings');
    await checkButton(page).tap();
    await expect(dialog(page)).toBeVisible();
    const proof = await downloadProof(page);
    expect(proof.width).toBe(2367);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('phone: print check', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('16 · a bottom sheet with the checks, Show and the proof', async ({ page }) => {
    await open(page, SAMPLE);
    await checkButton(page).tap();
    await expect(dialog(page)).toBeVisible();
    const box = (await dialog(page).boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const download = dialog(page).getByTestId('download-proof');
    await download.scrollIntoViewIfNeeded();
    expect((await download.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await dialog(page).getByRole('button', { name: 'Show Rectangle' }).tap();
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('every width', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'sizes set here');

  test('no sideways scrolling from 1440 to 360 px, with and without the dialog', async ({ page }) => {
    await open(page, SAMPLE);
    for (const width of [1440, 1280, 1024, 820, 768, 430, 390, 360]) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await expect(checkButton(page)).toBeVisible();
      // Polled: the layout swaps (tablet → phone) a frame after the resize; a lasting overflow still fails.
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `${width}px` }).toBeLessThanOrEqual(0);
    }
    await openChecks(page);
    for (const width of [360, 430, 820, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await expect(dialog(page).getByTestId('download-proof')).toBeAttached();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `dialog ${width}px` }).toBeLessThanOrEqual(0);
    }
  });
});
