import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Product options UI (Phase 4 M2): registry-driven options on the product page, bound to the
 * design's v3 product configuration — one product command per change, priced by the M1 resolver,
 * validated by the domain, saved with the design and carried into the Studio.
 */

/** One product per family (plan §21): the options section must render without errors. */
const FAMILIES: [slug: string, family: string][] = [
  ['business-card-classic', 'visiting-card'],
  ['stationery-id-cards-pvc', 'stationery'],
  ['stationery-letterhead', 'letterhead'],
  ['invitation-wedding-classic', 'invitation'],
  ['stationery-envelope-dl', 'envelope'],
  ['stationery-notebook-a4', 'notebook'],
  ['stationery-presentation-folder', 'folder'],
  ['stationery-mouse-pad-custom', 'mouse-pad'],
  ['gift-mousepad-round-photo', 'round-mouse-pad'],
  ['stamp-date', 'stamp'],
  ['sign-board-sign', 'sign'],
  ['sign-poster-standard', 'poster'],
  ['flyer-a5-standard', 'marketing-print'],
  ['label-shipping', 'label'],
  ['pkg-box-tuck-top', 'packaging'],
  ['apparel-tshirt-classic-cotton', 'apparel'],
  ['apparel-cap-cotton', 'cap'],
  ['bag-jute-tote', 'bag'],
  ['apparel-polo-6-degree', 'polo'],
  ['umbrella-golf', 'umbrella'],
  ['rainwear-waterproof-jacket-standard', 'rainwear'],
  ['gift-mug-custom-black', 'mug'],
  ['drinkware-bottle-aluminium', 'drinkware'],
  ['pen-gold-click', 'pen'],
  ['gift-acrylic-photo-block', 'gift'],
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

const priceBlock = (page: Page) => page.locator('[data-price-summary]');

test.describe('product options on the product page', () => {
  test('every family: its options render, a price and SKU show, no errors, nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    for (const [slug, family] of FAMILIES) {
      await page.goto(`/products/${slug}`);
      const options = page.locator(`[data-product-options="${family}"]`);
      await expect(options, slug).toBeVisible();
      await expect(options.locator('[data-option-source="entry"]'), slug).toHaveCount(1);
      await expect(options.locator('[data-option-source="order"]'), slug).toHaveCount(1);
      await expect(priceBlock(page), slug).toContainText(/SKU [A-Z0-9-]+/);
      await expect(page.getByRole('link', { name: /Start designing/ }).first(), slug).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), slug).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });

  test('the same-design switch appears only where the registry has it, on by default', async ({ page }) => {
    await page.goto('/products/apparel-tshirt-classic-cotton');
    await expect(page.getByRole('switch', { name: 'Same design on both sides' })).toBeChecked();
    await page.goto('/products/gift-mug-custom-black');
    await expect(page.getByRole('switch', { name: 'Same design on both sides' })).toHaveCount(0);
  });

  test('envelope size is a saved Studio choice with its price; Undo takes it back', async ({ page }) => {
    await page.goto('/products/stationery-envelope-dl');
    await expect(priceBlock(page)).toContainText('₹349');
    await page.getByRole('radio', { name: /#10/ }).click();
    await expect(priceBlock(page)).toContainText('₹391');
    await expect(priceBlock(page)).toContainText('Includes Size: #10 (24.1 cm × 10.5 cm) (+₹42)');
    await page.getByRole('button', { name: 'Undo: Change product option' }).click();
    await expect(priceBlock(page)).toContainText('₹349');
    await expect(priceBlock(page)).not.toContainText('Includes');
  });

  test('choices are saved with the design: a reload keeps them and the Studio opens with them', async ({ page, isMobile }) => {
    await page.goto('/products/apparel-tshirt-classic-cotton');
    await page.getByRole('radio', { name: /^XL/ }).click();
    await page.getByRole('radio', { name: /Front & Back/ }).click();
    await expect(priceBlock(page)).toContainText('₹579');
    await expect(page.getByText('Your choices are saved with your design on this device.')).toBeVisible();
    // Autosave waits a moment after the last change.
    await page.waitForTimeout(1600);

    await page.goto('/products/apparel-tshirt-classic-cotton');
    await expect(page.getByRole('radio', { name: /^XL/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: /Front & Back/ })).toHaveAttribute('aria-checked', 'true');
    await expect(priceBlock(page)).toContainText('₹579');

    // The variant ordered is the one these choices name (looked up by the SKU shown).
    const sku = (await priceBlock(page).getByText(/^SKU /).textContent())!.replace('SKU ', '').trim();
    const product = await (await page.request.get('/api/v1/catalogue/products/apparel-tshirt-classic-cotton.json')).json();
    const variant = product.variants.find((v: { sku: string }) => v.sku === sku);
    expect(variant, sku).toBeDefined();
    await page.getByRole('link', { name: /Start designing/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/products/apparel-tshirt-classic-cotton/design\\?variantId=${variant.id}`));
    // The Studio's top bar names the choices (the phone layout has no room for it).
    if (!isMobile) await expect(page.getByText(/XL · White · Front & Back/).first()).toBeVisible();
  });

  test('an older saved design without an orientation asks for one before designing', async ({ page }) => {
    await page.goto('/products/business-card-classic');
    const product = await (await page.request.get('/api/v1/catalogue/products/business-card-classic.json')).json();
    const variant = product.variants.find((v: { isDefault: boolean }) => v.isDefault) ?? product.variants[0];
    // A design saved before schema v3 (no product configuration), as this browser may still have.
    await page.evaluate(
      async ({ productId, variantId }) => {
        const now = new Date().toISOString();
        const print = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
        const document = {
          format: 'aaraprint.design',
          schemaVersion: 2,
          id: 'design_old',
          name: 'Saved earlier',
          product: { slug: 'business-card-classic', productId, variantId },
          surfaces: [
            { id: 'front', label: 'Front', print, background: { color: null }, elements: [] },
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
          tx.objectStore('designs').put({
            designId: document.id,
            productSlug: 'business-card-classic',
            productId,
            variantId,
            name: document.name,
            schemaVersion: 2,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            revision: 1,
            fingerprint: 'old',
            currentVersionId: null,
            document,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      { productId: product.id, variantId: variant.id },
    );

    await page.goto('/products/business-card-classic');
    await expect(page.getByText('Choose an orientation.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Start designing/ }).first()).toBeDisabled();
    await page.getByRole('radio', { name: 'Vertical' }).click();
    await expect(page.getByText('Choose an orientation.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Start designing/ }).first()).toBeVisible();
  });
});
