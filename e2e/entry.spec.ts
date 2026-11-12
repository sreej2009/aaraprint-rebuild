import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Page } from '@playwright/test';
import { confirmEntry, expect, settleAnimations, test } from './fixtures';

/**
 * "Design it" entry workflow (Phase 4 M3): product page → entry dialog when a required entry
 * choice is missing → one confirmed product command → the Studio with exactly that configuration.
 */

interface ProductJson {
  id: string;
  slug: string;
  name: string;
  optionGroups: { id: string; name: string; values: { id: string; label: string; quantity?: number | null }[] }[];
  variants: { id: string; sku: string; isDefault: boolean; optionValueIds: string[] }[];
}

const getProduct = async (request: APIRequestContext, slug: string) => (await (await request.get(`/api/v1/catalogue/products/${slug}.json`)).json()) as ProductJson;

/** The original's entry rule (audit §4): a Quantity group with two or more numeric values. */
const quantityTiers = (product: ProductJson) => {
  const group = product.optionGroups.find((g) => g.name === 'Quantity');
  return group && group.values.filter((v) => (v.quantity ?? 0) > 0 || /\d/.test(v.label)).length >= 2 ? group.values.length : 0;
};

const FAMILIES: [slug: string, family: string][] = [
  ['business-card-classic', 'visiting-card'],
  ['stationery-id-cards-pvc', 'stationery'],
  ['invitation-wedding-classic', 'invitation'],
  ['stationery-envelope-dl', 'envelope'],
  ['stationery-notebook-a4', 'notebook'],
  ['stationery-presentation-folder', 'folder'],
  ['stationery-letterhead', 'letterhead'],
  ['flyer-a5-standard', 'marketing-print'],
  ['sign-board-sign', 'sign'],
  ['sign-poster-standard', 'poster'],
  ['label-shipping', 'label'],
  ['pkg-box-tuck-top', 'packaging'],
  ['apparel-tshirt-classic-cotton', 'apparel'],
  ['apparel-cap-cotton', 'cap'],
  ['stationery-mouse-pad-custom', 'mouse-pad'],
  ['gift-mousepad-round-photo', 'round-mouse-pad'],
  ['apparel-polo-6-degree', 'polo'],
  ['bag-jute-tote', 'bag'],
  ['stamp-date', 'stamp'],
  ['umbrella-golf', 'umbrella'],
  ['pen-gold-click', 'pen'],
  ['rainwear-waterproof-jacket-standard', 'rainwear'],
  ['gift-mug-custom-black', 'mug'],
  ['gift-acrylic-photo-block', 'gift'],
  ['drinkware-flask-hip-7oz-black', 'drinkware'],
  ['gift-coaster-soft', 'gift-frame'],
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const start = (page: Page) => page.getByRole('link', { name: /Start designing/ }).first();
const dialog = (page: Page) => page.getByRole('dialog');
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const studioReady = (page: Page) => page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));

/** Every design saved in this browser (IndexedDB `aaraprint-studio`). */
function savedDesigns(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ designId: string; document: { product: Record<string, unknown> & { configuration: Record<string, unknown> }; surfaces: { elements: { text?: string }[] }[] } }[]>((resolve, reject) => {
        const request = indexedDB.open('aaraprint-studio');
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('designs')) return resolve([]);
          const all = db.transaction('designs').objectStore('designs').getAll();
          all.onsuccess = () => resolve(all.result);
          all.onerror = () => reject(all.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

test.describe('Design it: entry dialog per family', () => {
  test('every family: the registry’s entry questions only — orientation, and quantity where it has tiers', async ({ page, request }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    for (const [slug, family] of FAMILIES) {
      const product = await getProduct(request, slug);
      await page.goto(`/products/${slug}`);
      await start(page).click();
      const box = dialog(page);
      await expect(box.locator(`[data-entry-dialog="${family}"]`), slug).toBeVisible();
      await expect(box.getByRole('radiogroup', { name: 'Product Orientation (required)' }), slug).toBeVisible();
      const tiers = quantityTiers(product);
      await expect(box.locator('[data-entry-option="quantity-tier"]'), slug).toHaveCount(tiers ? 1 : 0);
      await expect(box.locator('[data-entry-option]'), slug).toHaveCount(tiers ? 2 : 1);
      await expect(box.getByRole('button', { name: 'Start designing' }), slug).toBeDisabled();
      await box.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog(page)).toHaveCount(0);
      expect(await overflow(page), slug).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('Design it: flows', () => {
  test('A/C · visiting card: orientation and quantity, price, then the Studio has exactly that configuration', async ({ page, request }) => {
    const errors = collectErrors(page);
    const product = await getProduct(request, 'business-card-classic');
    await page.goto('/products/business-card-classic');
    await start(page).click();
    await dialog(page).getByRole('radio', { name: /500 cards/ }).click();
    await dialog(page).getByRole('radio', { name: 'Vertical' }).click();
    await expect(dialog(page).locator('[data-entry-price]')).toContainText('₹629');
    await expect(dialog(page).locator('[data-entry-price]')).toContainText('SKU BUSINESS-CARD-CLASSIC-QTY-500-INK-CLASSIC-BLACK');
    await dialog(page).getByRole('button', { name: 'Start designing' }).click();

    const variant = product.variants.find((v) => v.sku === 'BUSINESS-CARD-CLASSIC-QTY-500-INK-CLASSIC-BLACK')!;
    await expect(page).toHaveURL(new RegExp(`/products/business-card-classic/design\\?variantId=${variant.id}(&|$)`));
    await studioReady(page);

    // An edit in the Studio is saved from the Studio's own document: it carries the configuration.
    await page.getByRole('button', { name: 'Text', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add heading' }).click();
    await page.keyboard.press('Control+Enter');
    await expect.poll(async () => (await savedDesigns(page))[0]?.document.surfaces[0]?.elements.length ?? 0, { timeout: 8000 }).toBe(1);
    const designs = await savedDesigns(page);
    expect(designs).toHaveLength(1);
    const saved = designs[0]!.document.product;
    const tier = product.optionGroups.find((g) => g.name === 'Quantity')!;
    expect(saved).toMatchObject({ slug: 'business-card-classic', productId: product.id, familyId: 'visiting-card', variantId: variant.id, sku: variant.sku });
    expect(saved.configuration).toMatchObject({ orientation: 'vertical', quantity: 1, sameDesignBothSides: null });
    expect((saved.configuration.options as Record<string, string>)[tier.id]).toBe(tier.values.find((v) => v.label === '500 cards')!.id);
    expect(errors).toEqual([]);
  });

  test('B · umbrella (no quantity tiers): orientation only, then the Studio', async ({ page }) => {
    await page.goto('/products/umbrella-golf');
    await start(page).click();
    await expect(dialog(page).locator('[data-entry-option]')).toHaveCount(1);
    await confirmEntry(page);
    await expect(page).toHaveURL(/\/products\/umbrella-golf\/design\?variantId=/);
    await studioReady(page);
  });

  test('D · choices already made are kept: no dialog once orientation is chosen, straight to the Studio', async ({ page }) => {
    await page.goto('/products/apparel-tshirt-classic-cotton');
    await page.getByRole('region', { name: 'Your choices' }).getByRole('radio', { name: 'Vertical' }).click();
    await page.getByRole('radio', { name: /^XL/ }).click();
    await page.waitForTimeout(1600); // autosave
    await page.goto('/products/apparel-tshirt-classic-cotton');
    await expect(page.getByRole('radio', { name: /^XL/ })).toHaveAttribute('aria-checked', 'true');
    await start(page).click();
    await expect(page).toHaveURL(/\/products\/apparel-tshirt-classic-cotton\/design\?variantId=/);
    await expect(dialog(page)).toHaveCount(0);
    const designs = await savedDesigns(page);
    expect(designs).toHaveLength(1);
    expect(designs[0]!.document.product.configuration).toMatchObject({ orientation: 'vertical', sameDesignBothSides: true });
  });

  test('E · an older saved design without orientation: asked, not guessed; its artwork reaches the Studio', async ({ page, request }) => {
    const product = await getProduct(request, 'business-card-classic');
    const variant = product.variants.find((v) => v.isDefault)!;
    await page.goto('/products/business-card-classic');
    await page.evaluate(
      async ({ productId, variantId }) => {
        const now = new Date().toISOString();
        const print = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
        const text = { id: 'el_old', name: null, x: 100, y: 200, width: 600, height: 80, rotation: 0, opacity: 1, locked: false, hidden: false, type: 'text', text: 'Old artwork', fontFamily: 'Inter', fontSize: 50, fontWeight: 400, italic: false, underline: false, color: '#1b1f27', align: 'left', lineHeight: 1.2, letterSpacing: 0, placeholder: false };
        const document = {
          format: 'aaraprint.design',
          schemaVersion: 2,
          id: 'design_old',
          name: 'Saved earlier',
          product: { slug: 'business-card-classic', productId, variantId },
          surfaces: [
            { id: 'front', label: 'Front', print, background: { color: null }, elements: [text] },
            { id: 'back', label: 'Back', print, background: { color: null }, elements: [] },
          ],
          assets: {},
          meta: { createdAt: now, updatedAt: now, revision: 1 },
        };
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('aaraprint-studio');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('designs', 'readwrite');
          tx.objectStore('designs').put({ designId: document.id, productSlug: 'business-card-classic', productId, variantId, name: document.name, schemaVersion: 2, createdAt: Date.now(), updatedAt: Date.now(), revision: 1, fingerprint: 'old', currentVersionId: null, document });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      { productId: product.id, variantId: variant.id },
    );

    await page.goto('/products/business-card-classic');
    await start(page).click();
    await expect(dialog(page).getByText('Choose an orientation.', { exact: true })).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Start designing' })).toBeDisabled();
    await confirmEntry(page, { orientation: 'Horizontal' });
    await studioReady(page);
    // The saved artwork is on the Studio canvas (any layout).
    await page.waitForFunction(() => window.Konva.stages.some((st) => st.find('Text').some((node) => (node as unknown as { text(): string }).text() === 'Old artwork')));
    const [design] = await savedDesigns(page);
    expect(design!.designId).toBe('design_old');
    expect(design!.document.product.configuration).toMatchObject({ orientation: 'horizontal' });
    expect(design!.document.surfaces[0]!.elements.map((e) => e.text)).toEqual(['Old artwork']);
  });

  test('F · Cancel changes nothing: no saved design, choices as before', async ({ page }) => {
    await page.goto('/products/business-card-classic');
    const url = page.url();
    await start(page).click();
    await dialog(page).getByRole('radio', { name: /1000 cards/ }).click();
    await dialog(page).getByRole('radio', { name: 'Vertical' }).click();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(start(page)).toBeFocused();
    await page.waitForTimeout(1600);
    expect(await savedDesigns(page)).toEqual([]);
    expect(page.url()).toBe(url);
    await expect(page.getByRole('region', { name: 'Your choices' }).getByRole('radio', { name: /100 cards/ })).toHaveAttribute('aria-checked', 'true');
  });

  test('keyboard and screen readers: named dialog, focus inside, Escape cancels, no axe violations', async ({ page }) => {
    await page.goto('/products/business-card-classic');
    await start(page).focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveAccessibleName('Classic Visiting Cards');
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(start(page)).toBeFocused();
  });
});

test.describe('Design it: responsive', () => {
  test('G · the dialog fits and works at 1440, 1280, 820, 390 and 360 px', async ({ page }) => {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [820, 1180],
      [390, 844],
      [360, 780],
    ] as const) {
      await page.setViewportSize({ width, height });
      // Each width starts as a new visitor: a design confirmed at 390 px must not skip the dialog at 360 px.
      await page.goto('/');
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase('aaraprint-studio');
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          }),
      );
      await page.goto('/products/business-card-classic');
      await start(page).click();
      const box = await dialog(page).boundingBox();
      expect(box, `${width}`).not.toBeNull();
      expect(box!.x, `${width}`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${width}`).toBeLessThanOrEqual(width + 0.5);
      expect(await overflow(page), `${width}`).toBeLessThanOrEqual(0);
      await dialog(page).getByRole('radio', { name: /250 cards/ }).click();
      const confirm = dialog(page).getByRole('button', { name: 'Start designing' });
      await dialog(page).getByRole('radio', { name: 'Horizontal' }).click();
      await confirm.scrollIntoViewIfNeeded();
      await expect(confirm).toBeInViewport();
      if (width <= 390) {
        await confirm.click();
        await expect(page).toHaveURL(/\/products\/business-card-classic\/design\?variantId=/);
        await studioReady(page);
        expect(await overflow(page), `${width} studio`).toBeLessThanOrEqual(0);
      } else {
        await dialog(page).getByRole('button', { name: 'Cancel' }).click();
      }
    }
  });
});
