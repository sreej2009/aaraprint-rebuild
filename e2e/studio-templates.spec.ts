import type { Page } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { expect, test } from './fixtures';

/**
 * Templates in the browser (Phase 3 M13): finding them, how well each suits the product,
 * applying to an empty side, replace / add / cancel on a side with artwork, one undo step, both
 * sides, fresh ids, editing what was applied, a fitted template on another size, saving and
 * versions, keyboard use, and the tablet and phone layouts. Every test starts with an empty
 * browser profile.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const CARD = '/products/business-card-classic/design';

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

async function open(page: Page, url = CARD) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Templates' });
const card = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}[ .]`) });
const status = (page: Page) => page.getByTestId('save-status');
const saved = (page: Page) => expect(status(page)).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
const side = (page: Page, name: 'Front' | 'Back') => page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: new RegExp(`^${name}`) });

/** What the canvas draws on the visible side. */
async function canvas(page: Page) {
  return page.evaluate(() => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return {
      ids: st.find('.element').map((n) => n.id()),
      texts: st.find('Text').map((t) => (t as KonvaNamespace.Text).text()),
      background: String(st.findOne('.background')?.getAttr('fill') ?? ''),
    };
  });
}

async function openTemplate(page: Page, name: string) {
  await card(page, name).click();
  await expect(page.getByRole('heading', { name, level: 3 })).toBeFocused();
}

test.describe('desktop: templates', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('1 · 2 · 29 · the panel opens with the templates made for this product; others are tucked away', async ({ page }) => {
    await open(page);
    await expect(panel(page).getByRole('heading', { name: 'For this product' })).toBeVisible();
    const fitting = panel(page).locator('[data-template-id][data-fit="exact"]');
    await expect(fitting).toHaveCount(5);
    await expect(card(page, 'Minimal centred')).toHaveAccessibleName('Minimal centred 2 sides. Business. Fits this product.');
    // Previews are light SVGs, never canvases.
    await expect(panel(page).getByTestId('template-preview')).toHaveCount(5);
    await expect(panel(page).locator('canvas')).toHaveCount(0);
    const others = panel(page).getByRole('button', { name: /^Made for other products \(11\)/ });
    await others.click();
    await expect(others).toHaveAttribute('aria-expanded', 'true');
    await expect(panel(page).locator('[data-template-id]')).toHaveCount(16);
    await expect(card(page, 'Sleek pen wordmark')).toHaveAccessibleName(/Other product: Made for pens\./);
  });

  test('3 · 4 · 5 · search and categories combine; no results says so and clears', async ({ page }) => {
    await open(page);
    const search = panel(page).getByRole('searchbox', { name: 'Search templates' });
    await search.fill('Emblem');
    await expect(panel(page).locator('[data-template-id]')).toHaveCount(1);
    await expect(card(page, 'Classic emblem')).toBeVisible();
    await search.fill('');
    const categories = panel(page).getByRole('group', { name: 'Template categories' });
    await categories.getByRole('button', { name: 'Labels & stamps' }).click();
    await expect(categories.getByRole('button', { name: 'Labels & stamps' })).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page).getByTestId('templates-none-fit')).toBeVisible();
    await panel(page)
      .getByRole('button', { name: /^Made for other products \(3\)/ })
      .click();
    await expect(panel(page).locator('[data-template-id]')).toHaveCount(3);
    await search.fill('address'); // a tag
    await expect(panel(page).locator('[data-template-id]')).toHaveCount(1);
    await search.fill('address zebra');
    await expect(panel(page).getByText('No templates match your search.')).toBeVisible();
    await panel(page).getByRole('button', { name: 'Clear search and filters' }).click();
    await expect(search).toHaveValue('');
    await expect(categories.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  test('6 · 9 · 17 · 18 · 19 · a two-sided template applies to both sides of an empty card in one step', async ({ page }) => {
    await open(page);
    await openTemplate(page, 'Classic emblem');
    await expect(page.getByTestId('template-fit')).toHaveAttribute('data-fit', 'exact');
    await expect(page.getByRole('img', { name: 'Classic emblem, back preview' })).toBeVisible();
    await page.getByRole('button', { name: 'Apply to both sides' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['YN', 'Your Name', 'JOB TITLE']);
    expect((await canvas(page)).background).toBe('#f6f3ec');
    await expect(side(page, 'Back')).toHaveAccessibleName(/3/);
    await side(page, 'Back').click();
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Company Name', '+91 00000 00000\nhello@yourcompany.com\nyourcompany.com']);
    expect((await canvas(page)).background).toBe('#2f2a7a');
    // One step for both sides.
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await canvas(page)).ids).toEqual([]);
    await side(page, 'Front').click();
    await expect.poll(async () => (await canvas(page)).ids).toEqual([]);
  });

  test('a one-sided template on the back changes only the back', async ({ page }) => {
    await open(page);
    await side(page, 'Back').click();
    await openTemplate(page, 'Diagonal spotlight');
    await page.getByRole('button', { name: 'Apply to back' }).click();
    await expect.poll(async () => (await canvas(page)).ids).toHaveLength(4);
    await expect(side(page, 'Front')).toHaveAccessibleName(/0/);
  });

  test('7 · 8 · a template for another product shows why and can’t be applied', async ({ page }) => {
    await open(page);
    await panel(page)
      .getByRole('button', { name: /^Made for other products/ })
      .click();
    await expect(card(page, 'Centred badge')).toHaveAttribute('data-fit', 'none');
    await openTemplate(page, 'Centred badge');
    await expect(page.getByTestId('template-fit')).toHaveText(/Not for this product\. Made for round products\./);
    await expect(page.getByRole('button', { name: /^Apply/ })).toHaveCount(0);
  });

  test('10 · 11 · 12 · 13 · 14 · 15 · 16 · replace, add and cancel on a side with artwork, each one undo step', async ({ page }) => {
    await open(page);
    await openTemplate(page, 'Bold left-aligned');
    const apply = page.getByRole('button', { name: 'Apply to front' });
    await apply.click();
    await expect.poll(async () => (await canvas(page)).ids).toHaveLength(5);
    const first = (await canvas(page)).ids;

    // Cancel: no change, no undo step.
    await apply.click();
    const dialog = page.getByRole('dialog', { name: 'Replace what’s on the front?' });
    await expect(dialog).toContainText('The front has 5 items.');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(apply).toBeFocused();
    expect((await canvas(page)).ids).toEqual(first);

    // Add: keeps the artwork, adds on top.
    await apply.click();
    await dialog.getByRole('button', { name: 'Add to front' }).click();
    await expect.poll(async () => (await canvas(page)).ids).toHaveLength(10);
    expect((await canvas(page)).ids.slice(0, 5)).toEqual(first);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await canvas(page)).ids).toEqual(first);

    // Replace with another template: swaps it.
    await page.getByRole('button', { name: 'All templates' }).click();
    await openTemplate(page, 'Editorial serif');
    await page.getByRole('button', { name: 'Apply to front' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Replace front' }).click();
    await expect.poll(async () => (await canvas(page)).texts).toContain('Job Title — Company');
    expect((await canvas(page)).ids.some((id) => first.includes(id))).toBe(false);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await canvas(page)).ids).toEqual(first);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect.poll(async () => (await canvas(page)).texts).toContain('Job Title — Company');
  });

  test('22 · 23 · applied elements get fresh ids, even when the same template is applied twice', async ({ page }) => {
    await open(page);
    await openTemplate(page, 'Minimal centred');
    await page.getByRole('button', { name: 'Apply to front only' }).click();
    await page.getByRole('button', { name: 'Apply to front only' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add to front' }).click();
    await expect.poll(async () => (await canvas(page)).ids).toHaveLength(6);
    const { ids } = await canvas(page);
    expect(new Set(ids).size).toBe(6);
    expect(ids.every((id) => /^el_[0-9a-f-]{36}$/.test(id))).toBe(true); // never the template's own "f-name" ids
  });

  test('24 · what a template adds stays fully editable', async ({ page }) => {
    await open(page);
    await openTemplate(page, 'Bold left-aligned');
    await page.getByRole('button', { name: 'Apply to front' }).click();
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('button', { name: /^Your Name, text/ }).click();
    const content = inspector.getByRole('textbox', { name: 'Text content' });
    await content.fill('Riya Sharma');
    await content.press('Tab');
    await expect.poll(async () => (await canvas(page)).texts).toContain('Riya Sharma');
    await inspector.getByRole('button', { name: /^Colour block, rectangle/ }).click();
    const x = inspector.getByRole('textbox', { name: 'X, from the left trim edge' });
    await x.fill('10');
    await x.press('Enter');
    await expect(x).toHaveValue('10');
  });

  test('a template made for another size is fitted inside this product’s safe area', async ({ page }) => {
    await open(page, '/products/flyer-a4-standard/design');
    await expect(card(page, 'Sale announcement')).toHaveAttribute('data-fit', 'adapted');
    await openTemplate(page, 'Sale announcement');
    await expect(page.getByTestId('template-fit')).toHaveText(/Fitted to 210 × 297 mm\./);
    await page.getByRole('button', { name: 'Apply to front' }).click();
    await expect.poll(async () => (await canvas(page)).texts).toContain('50%');
    const outside = await page.evaluate(() => {
      const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
      // A4 at 300 DPI with a 48 px safe area.
      return st
        .find('.element')
        .filter((n) => (n as KonvaNamespace.Group).findOne('Text'))
        .filter((n) => {
          const g = n as KonvaNamespace.Group;
          const x = g.x() - g.offsetX();
          const y = g.y() - g.offsetY();
          return x < 47.9 || y < 47.9 || x + g.offsetX() * 2 > 2480 - 47.9 || y + g.offsetY() * 2 > 3508 - 47.9;
        }).length;
    });
    expect(outside).toBe(0);
    expect((await canvas(page)).background).toBe('#e8930c');
  });

  test('20 · autosave keeps a template design; a reload brings it back', async ({ page }) => {
    await open(page);
    await openTemplate(page, 'Minimal centred');
    await page.getByRole('button', { name: 'Apply to both sides' }).click();
    await saved(page);
    const before = await canvas(page);
    const stored = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const req = indexedDB.open('aaraprint-studio');
          req.onsuccess = () => {
            const get = req.result.transaction('designs').objectStore('designs').getAll();
            get.onsuccess = () => resolve(JSON.stringify(get.result));
          };
        }),
    );
    expect(stored).toContain('Your Name');
    expect(stored).not.toMatch(/card-minimal-centred|"f-name"|<svg|data:/); // design data only, no template ids or previews
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect.poll(async () => (await canvas(page)).ids).toEqual(before.ids);
    await side(page, 'Back').click();
    await expect.poll(async () => (await canvas(page)).texts).toContain('Company Name');
  });

  test('21 · restoring a version brings the template content back', async ({ page }) => {
    await open(page);
    await openTemplate(page, 'Editorial serif');
    await page.getByRole('button', { name: 'Apply to front' }).click();
    await page.keyboard.press('Control+s');
    await saved(page);
    await page.getByRole('button', { name: 'All templates' }).click();
    await openTemplate(page, 'Diagonal spotlight');
    await page.getByRole('button', { name: 'Apply to front' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Replace front' }).click();
    await expect.poll(async () => (await canvas(page)).texts).toContain('Job Title');
    await page.keyboard.press('Control+s');
    await saved(page);
    await status(page).click();
    await page.getByRole('menuitem', { name: /Version history/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Version history' });
    await dialog
      .getByTestId('version-row')
      .nth(1)
      .getByRole('button', { name: /^Restore/ })
      .click();
    await page.getByRole('alertdialog', { name: 'Restore this version?' }).getByRole('button', { name: 'Restore' }).click();
    await expect.poll(async () => (await canvas(page)).texts).toContain('Job Title — Company');
  });

  test('26 · 27 · 28 · keyboard only: search, open, apply, answer the question; focus is never lost', async ({ page }) => {
    await open(page);
    await openTemplate(page, 'Bold left-aligned');
    await page.getByRole('button', { name: 'Apply to front' }).click(); // something to replace
    await page.getByRole('button', { name: 'All templates' }).focus();
    await page.keyboard.press('Enter');
    await expect(card(page, 'Bold left-aligned')).toBeFocused();
    const search = panel(page).getByRole('searchbox', { name: 'Search templates' });
    await search.focus();
    await page.keyboard.type('editorial');
    await page.keyboard.press('Tab'); // clear-search button
    await page.keyboard.press('Tab'); // first category
    await expect(panel(page).getByRole('group', { name: 'Template categories' }).getByRole('button', { name: 'All' })).toBeFocused();
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
    await expect(card(page, 'Editorial serif')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Editorial serif', level: 3 })).toBeFocused();
    const apply = page.getByRole('button', { name: 'Apply to front' });
    await apply.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Replace what’s on the front?' });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(apply).toBeFocused();
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Replace front' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await canvas(page)).texts).toContain('Job Title — Company');
    await expect(page.getByTestId('canvas-announcer')).toHaveText(/Applied template “Editorial serif”\. Press Ctrl Z to undo\./);
  });
});

test.describe('tablet: templates', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('30 · the Templates panel works by touch and gets out of the way after applying', async ({ page }) => {
    await open(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Templates' }).tap();
    await expect(panel(page)).toBeVisible();
    await card(page, 'Classic emblem').tap();
    const apply = page.getByRole('button', { name: 'Apply to both sides' });
    expect((await apply.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await apply.tap();
    await expect(panel(page)).toHaveCount(0);
    await expect.poll(async () => (await canvas(page)).ids).toHaveLength(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('phone: templates', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('31 · Templates opens as a sheet; a template can be found, opened and applied', async ({ page }) => {
    await open(page);
    await page
      .getByRole('navigation', { name: 'Design tools' })
      .getByRole('button', { name: /^Templates/ })
      .tap();
    const sheet = page.getByRole('dialog', { name: 'Templates' });
    await sheet.getByRole('searchbox', { name: 'Search templates' }).fill('serif');
    await expect(sheet.locator('[data-template-id][data-fit="exact"]')).toHaveCount(1);
    expect((await sheet.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await card(page, 'Editorial serif').tap();
    const apply = sheet.getByRole('button', { name: 'Apply to front' });
    await apply.scrollIntoViewIfNeeded();
    await apply.tap();
    await expect(sheet).toHaveCount(0);
    await expect.poll(async () => (await canvas(page)).ids).toHaveLength(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('every width', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'sizes set here');

  test('no sideways scrolling or console errors from 1440 to 360 px, in the list and in a template’s details', async ({ page }) => {
    await open(page);
    await panel(page).getByRole('button', { name: /^Made for other products/ }).click();
    const widths = [1440, 1280, 1024, 820, 768, 390, 360];
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await expect(page.locator('#studio-canvas')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `list at ${width}px`).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await panel(page).getByRole('button', { name: /^Made for other products/ }).click();
    await openTemplate(page, 'Modern wedding');
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await expect(page.locator('#studio-canvas')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `details at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
});
