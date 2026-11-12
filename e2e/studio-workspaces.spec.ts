import type { Page } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { expect, test } from './fixtures';
import { clearedStandIn } from './product-fixtures';

/**
 * Product-first Studio workspaces (Phase 4 M4), in the production build. The workspace comes from
 * the design's product family (registry), so each family opens where the original did, on the tool
 * it did. Real product photos stay rights-blocked: those families open on the flat print area and
 * say why. A cleared stand-in shows the product itself. Widths are set per test, so this runs in
 * the desktop project only.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
    __views?: string[];
  }
}

const WIDTHS = [1440, 1280, 820, 390, 360] as const;

type Expect = { slug: string; family: string; workspace: string; tool: 'Product options' | 'Text' | 'Uploads'; note: RegExp | null; sides: boolean };
const NOT_YET = /isn’t available yet: you’re designing the flat print area/;
const BLOCKED = /flat print area/;
const FAMILIES: Expect[] = [
  { slug: 'umbrella-golf', family: 'umbrella', workspace: 'photo-frame', tool: 'Product options', note: BLOCKED, sides: true },
  { slug: 'raincoat-industrial-safety', family: 'rainwear', workspace: 'photo-frame', tool: 'Product options', note: BLOCKED, sides: true },
  { slug: 'bottle-sipper', family: 'drinkware', workspace: 'photo-frame', tool: 'Product options', note: BLOCKED, sides: true },
  { slug: 'pen-gold-click', family: 'pen', workspace: 'photo-frame', tool: 'Product options', note: BLOCKED, sides: true },
  { slug: 'gift-mug-custom-black', family: 'mug', workspace: 'photo-frame', tool: 'Product options', note: BLOCKED, sides: true },
  { slug: 'apparel-jersey-sports', family: 'apparel', workspace: 'perspective', tool: 'Product options', note: NOT_YET, sides: true },
  { slug: 'apparel-polo-6-degree', family: 'polo', workspace: 'polo-stage', tool: 'Product options', note: NOT_YET, sides: true },
  { slug: 'bag-backpack-american-tourister', family: 'bag', workspace: 'perspective', tool: 'Product options', note: NOT_YET, sides: true },
  { slug: 'brochure-trifold-a4', family: 'marketing-print', workspace: 'perspective', tool: 'Product options', note: NOT_YET, sides: true },
  { slug: 'packaging-hang-tag', family: 'packaging', workspace: 'perspective', tool: 'Product options', note: NOT_YET, sides: true },
  { slug: 'stamp-date', family: 'stamp', workspace: 'perspective', tool: 'Product options', note: NOT_YET, sides: true },
  { slug: 'gift-album-photo', family: 'gift-frame', workspace: 'gift-frame', tool: 'Product options', note: NOT_YET, sides: true },
  { slug: 'banner-backlit-fabric', family: 'sign', workspace: 'perspective', tool: 'Product options', note: NOT_YET, sides: true },
  { slug: 'business-card-classic', family: 'visiting-card', workspace: 'flat', tool: 'Text', note: null, sides: true },
  { slug: 'stationery-letterhead', family: 'letterhead', workspace: 'flat', tool: 'Uploads', note: null, sides: false },
];

let errors: string[] = [];
test.beforeEach(({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own widths');
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

const region = (page: Page) => page.getByRole('region', { name: /^Design canvas: / });

async function open(page: Page, slug: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
  await page.goto(`/products/${slug}/design`);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

for (const f of FAMILIES) {
  test(`${f.family} (${f.slug}) opens in its workspace at every width`, async ({ page }) => {
    for (const width of WIDTHS) {
      await open(page, f.slug, width);
      const canvas = region(page);
      await expect(canvas, `${width}`).toHaveAttribute('data-workspace', f.workspace);
      // Rights-blocked or not yet imported: the flat print area, never an invented product.
      await expect(canvas).toHaveAttribute('data-view', 'flat');
      await expect(page.getByRole('radiogroup', { name: 'Canvas view' })).toHaveCount(0);
      const note = page.getByTestId('canvas-workspace-note');
      if (f.note) await expect(note).toHaveText(f.note);
      else await expect(note).toHaveCount(0);
      // The registry's first tool is open where panels dock (desktop and laptop).
      if (width >= 1280) await expect(page.getByRole('complementary', { name: f.tool })).toBeVisible();
      await expect(page.getByRole('radiogroup', { name: 'Side' })).toHaveCount(f.sides ? 1 : 0);
      // The artwork stays editable: the Konva stage is live and nothing scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}

test.describe('on the product (cleared stand-in)', () => {
  test('a photo-frame product opens straight on the product, with no flat first and no switch, at every width', async ({ page }) => {
    await clearedStandIn(page);
    // Every value the canvas's view ever takes, from its first render.
    await page.addInitScript(() => {
      window.__views = [];
      new MutationObserver(() => {
        const el = document.querySelector('[data-workspace]');
        const view = el?.getAttribute('data-view');
        if (view && window.__views!.at(-1) !== view) window.__views!.push(view);
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-view'] });
    });
    for (const width of WIDTHS) {
      await open(page, 'umbrella-golf', width);
      await expect(region(page)).toHaveAttribute('data-view', 'product');
      await expect(region(page)).toHaveAccessibleName(/on the product$/);
      expect(await page.evaluate(() => window.__views), `${width}`).toEqual(['product']);
      await expect(page.getByTestId('canvas-workspace-note')).toHaveCount(0);
      // On the product only (M4-C): no Flat switch.
      await expect(page.getByRole('radiogroup', { name: 'Canvas view' })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test('the colour is a Product option: undoable, saved with the design, and shown on the photo', async ({ page }) => {
    await clearedStandIn(page, 'umbrella-golf', { mask: 'cleared' });
    await open(page, 'umbrella-golf', 1440);
    const panel = page.getByRole('complementary', { name: 'Product options' });
    const colours = panel.getByRole('radiogroup', { name: /^Canopy Colour/ });
    await expect(colours.getByRole('radio', { name: /^Black/ })).toHaveAttribute('aria-checked', 'true');
    await colours.getByRole('radio', { name: /^Navy/ }).click();
    await expect(region(page)).toHaveAttribute('data-tint', 'applied');
    await expect(panel.getByTestId('studio-product-facts')).toContainText('Navy');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');

    // Saved with the design: a reload reopens it in Navy, on the product.
    await page.reload();
    await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
    await expect(page.getByRole('complementary', { name: 'Product options' }).getByRole('radiogroup', { name: /^Canopy Colour/ }).getByRole('radio', { name: /^Navy/ })).toHaveAttribute('aria-checked', 'true');
    await expect(region(page)).toHaveAttribute('data-tint', 'applied');

    // One undo step, back to Black and the photo as taken.
    await page.getByRole('complementary', { name: 'Product options' }).getByRole('radiogroup', { name: /^Canopy Colour/ }).getByRole('radio', { name: /^Red/ }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('complementary', { name: 'Product options' }).getByRole('radiogroup', { name: /^Canopy Colour/ }).getByRole('radio', { name: /^Navy/ })).toHaveAttribute('aria-checked', 'true');
  });
});
