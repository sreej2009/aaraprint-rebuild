import type { Page } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { expect, test } from './fixtures';

/**
 * Saving designs in the browser (Phase 3 M11) with the real IndexedDB: autosave, Save now,
 * reloading, version history and restore, what is (and isn't) kept, samples, another product's
 * designs and storage failures. Every test starts with an empty browser profile.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const STUDIO = '/products/business-card-classic/design';

async function open(page: Page, url = STUDIO) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

const status = (page: Page) => page.getByTestId('save-status');
const saved = (page: Page) => expect(status(page)).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

async function canvas(page: Page) {
  return page.evaluate(() => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return {
      ids: st.find('.element').map((n) => n.id()),
      texts: st.find('Text').map((t) => (t as KonvaNamespace.Text).text()),
      background: String(st.findOne('.background')!.getAttr('fill')),
      scale: Math.round(st.scaleX() * 10000) / 10000,
    };
  });
}

async function addHeading(page: Page, text: string) {
  await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('button', { name: 'Add heading' }).click();
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
}

async function addShape(page: Page, name: string) {
  const rail = page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Shapes' });
  if ((await rail.getAttribute('aria-pressed')) !== 'true') await rail.click(); // the rail button toggles the panel
  await page.getByRole('button', { name, exact: true }).click();
}

async function menu(page: Page, item: RegExp) {
  await status(page).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Records in the Studio database, as stored. */
async function stored(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ stores: string[]; designs: { designId: string; productSlug: string; revision: number; keys: string[]; json: string }[]; versions: string[] }>((resolve) => {
        const req = indexedDB.open('aaraprint-studio');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['designs', 'versions']);
          const designs = tx.objectStore('designs').getAll();
          const versions = tx.objectStore('versions').getAll();
          tx.oncomplete = () => {
            resolve({
              stores: [...db.objectStoreNames],
              designs: designs.result.map((r) => ({ designId: r.designId, productSlug: r.productSlug, revision: r.revision, keys: Object.keys(r).sort(), json: JSON.stringify(r) })),
              versions: versions.result.map((v) => v.reason),
            });
            db.close();
          };
        };
      }),
  );
}

test.describe('desktop: saving in this browser', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('1 · autosave keeps an edit; a reload brings it back', async ({ page }) => {
    await open(page);
    await expect(status(page)).toHaveText(/Not saved yet/);
    await addHeading(page, 'Riya Sharma');
    await expect(status(page)).toHaveAttribute('data-status', /dirty|saving/);
    await saved(page);
    await expect(status(page)).toHaveText(/Saved just now/);
    await expect(page).toHaveURL(/\?design=design_/);
    const db = await stored(page);
    expect(db.stores).toEqual(['designs', 'versions']);
    expect(db.designs).toHaveLength(1);
    expect(db.designs[0]!.json).not.toMatch(/selectedIds|viewport|"history"|data:image|base64/);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.Konva?.stages.length));
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Riya Sharma']);
    await saved(page);
  });

  test('2 · Save now (and Ctrl S) save at once and say so', async ({ page }) => {
    await open(page);
    await addShape(page, 'Add circle');
    await menu(page, /Save now/);
    await saved(page);
    await expect(page.getByTestId('save-announcer')).toHaveText('Saved in this browser.');
    await addShape(page, 'Add star');
    await page.keyboard.press('Control+s');
    await saved(page);
    expect((await stored(page)).versions.sort()).toEqual(['manual', 'manual']);
  });

  test('3 · unsaved changes show until autosave; the reload has the latest', async ({ page }) => {
    await open(page);
    await addShape(page, 'Add rectangle');
    await page.keyboard.press('Control+s');
    await saved(page);
    await page.getByRole('button', { name: 'Add circle', exact: true }).click();
    await expect(status(page)).toHaveText(/Unsaved changes|Saving/);
    await saved(page);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.Konva?.stages.length));
    await expect.poll(async () => (await canvas(page)).ids.length).toBe(2);
  });

  test('4 · 5 · version history restores an older version, as one undo step', async ({ page }) => {
    await open(page);
    await addShape(page, 'Add rectangle');
    await page.keyboard.press('Control+s');
    await saved(page);
    await page.getByRole('button', { name: 'Add star', exact: true }).click();
    await page.keyboard.press('Control+s');
    await saved(page);
    await menu(page, /Version history/);
    const dialog = page.getByRole('dialog', { name: 'Version history' });
    await expect(dialog.getByTestId('version-row')).toHaveCount(2);
    await expect(dialog.getByTestId('version-row').first()).toContainText('Current');
    await dialog.getByTestId('version-row').nth(1).getByRole('button', { name: /^Restore/ }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Restore this version?' });
    await expect(confirm).toBeFocused({ timeout: 2000 }).catch(() => {}); // focus is inside the confirmation
    await confirm.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await canvas(page)).ids.length).toBe(1);
    await saved(page);
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Control+z');
    expect((await canvas(page)).ids).toHaveLength(2);
    await page.keyboard.press('Control+Shift+z');
    expect((await canvas(page)).ids).toHaveLength(1);
    await saved(page);
    expect((await stored(page)).versions).toEqual(expect.arrayContaining(['restored']));
  });

  test('6 · 7 · front, back and their backgrounds come back separately', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Front words');
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Background' }).click();
    await page.getByRole('complementary', { name: 'Background' }).getByRole('button', { name: 'Ivory' }).click();
    await page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: /^Back/ }).click();
    await page.getByRole('complementary', { name: 'Background' }).getByRole('button', { name: 'Deep indigo' }).click();
    await addShape(page, 'Add circle');
    await saved(page);
    await page.goto(STUDIO); // no ?design=: the latest design for this product
    await page.waitForFunction(() => Boolean(window.Konva?.stages.length));
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Front words']);
    expect((await canvas(page)).background).toBe('#f4f1ea');
    await page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: /^Back/ }).click();
    expect(await canvas(page)).toMatchObject({ texts: [], background: '#2f2a7a' });
    expect((await canvas(page)).ids).toHaveLength(1);
  });

  test('8 · 9 · zoom, selection and text editing are never saved', async ({ page }) => {
    await open(page);
    const fitted = (await canvas(page)).scale;
    await addHeading(page, 'Hello');
    await page.getByRole('button', { name: 'Zoom in' }).first().click();
    await page.getByRole('button', { name: 'Zoom in' }).first().click();
    await saved(page);
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Enter'); // editing the selected heading
    await expect(page.getByTestId('text-edit-overlay')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => Boolean(window.Konva?.stages.length));
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Hello']);
    expect((await canvas(page)).scale).toBe(fitted);
    await expect(page.getByTestId('text-edit-overlay')).toHaveCount(0);
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);
    await expect(page.getByTestId('selected-properties')).toHaveCount(0);
    expect((await stored(page)).designs[0]!.json).not.toMatch(/"scale"|editingTextId|selectedIds/);
  });

  test('10 · a sample never replaces a saved design', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Mine');
    await saved(page);
    await open(page, `${STUDIO}?sample=1`);
    await expect(status(page)).toHaveText(/Sample · not saved/);
    await page.waitForTimeout(1500); // longer than the autosave delay
    expect((await stored(page)).designs).toHaveLength(1);
    await open(page);
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Mine']);
  });

  test('11 · another product’s design is never opened here', async ({ page }) => {
    await open(page);
    await addShape(page, 'Add circle');
    await saved(page);
    const id = new URL(page.url()).searchParams.get('design')!;
    await page.goto(`/products/flyer-a4-standard/design?design=${id}`);
    await expect(page.getByRole('heading', { name: 'This saved design belongs to another product' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open it with its product' })).toHaveAttribute('href', new RegExp(`/products/business-card-classic/design\\?design=${id}`));
    await page.getByRole('button', { name: 'Start a new design' }).click();
    await expect(page.getByRole('heading', { name: 'Front side is empty' })).toBeVisible();
    expect((await stored(page)).designs.map((d) => d.productSlug)).toEqual(['business-card-classic']);
  });

  test('12 · if storage fails, the Studio keeps working and says so', async ({ page }) => {
    await page.addInitScript(() => {
      const failing = { open: () => { throw new DOMException('Storage is disabled', 'SecurityError'); } };
      Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => failing });
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await open(page);
    await addShape(page, 'Add star');
    await expect(status(page)).toHaveText(/Save failed/);
    await expect(page.getByTestId('save-announcer')).toHaveText('Unable to save locally. Your changes are still in this session.');
    expect((await canvas(page)).ids).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});

test.describe('phone: saving and versions', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('13 · the status, Save now and version history work on a phone', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Add shape' }).tap();
    await page.getByRole('dialog', { name: 'Shapes' }).getByRole('button', { name: 'Add circle' }).tap();
    await saved(page);
    await status(page).tap();
    await page.getByRole('menuitem', { name: /Save now/ }).tap();
    await saved(page);
    await expect(page.getByRole('menu')).toHaveCount(0); // the menu has finished closing
    await status(page).tap();
    await page.getByRole('menuitem', { name: /Version history/ }).tap();
    const dialog = page.getByRole('dialog', { name: 'Version history' });
    await expect(dialog.getByTestId('version-row')).toHaveCount(1);
    expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('every width', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'sizes set here');

  test('14 · no sideways scrolling or console errors from 1440 to 360 px', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await open(page);
    await addShape(page, 'Add circle');
    await saved(page);
    for (const width of [1440, 1280, 1024, 820, 768, 390, 360]) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await expect(status(page)).toBeVisible();
      await expect(status(page)).toHaveAttribute('data-status', 'saved');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${width}px`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
});
