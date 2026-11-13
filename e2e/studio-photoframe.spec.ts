import type { Locator, Page } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { confirmEntry, expect, test } from './fixtures';
import { clearedStandIn } from './product-fixtures';

/**
 * Photo-frame Studio workflow (Phase 4 M4-C), from the product page, in the production build.
 * Umbrella, rainwear, drinkware, pen and mug are on the product only: no Flat switch, ever. The
 * colour is the design's product configuration — the single source of truth — through Start
 * designing, the Studio, autosave, reload and undo/redo.
 *
 * The pixel checks use cleared stand-ins (product-fixtures.ts) so they're deterministic; the real
 * photos and masks (owner-cleared, M4-C2) are checked on the reported page at the end. Umbrellas and rainwear recolour their photo through its fabric mask. Pens,
 * mugs and drinkware choose part colours in the Studio; the original drew those with part masks
 * that aren't imported, so the photo can't show them: the choice is saved and the canvas says so.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

type Case =
  | { family: string; slug: string; photo: 'ok' | 'pen' | 'mug'; kind: 'catalogue'; group: RegExp; from: string; to: string; skuTo: string }
  | { family: string; slug: string; photo: 'ok' | 'pen' | 'mug'; kind: 'part'; field: string; preset: string | null; hex: string };

const CASES: Case[] = [
  { family: 'umbrella', slug: 'umbrella-golf', photo: 'ok', kind: 'catalogue', group: /^Canopy Colour/, from: 'Black', to: 'Navy', skuTo: 'UMBRELLA-GOLF-COLOUR-NAVY' },
  { family: 'rainwear', slug: 'raincoat-industrial-safety', photo: 'ok', kind: 'catalogue', group: /^Colour/, from: 'Safety Yellow', to: 'Orange', skuTo: '-COLOUR-ORANGE' },
  // Drinkware body presets differ per product and aren't imported: a custom colour.
  { family: 'drinkware', slug: 'bottle-sipper', photo: 'ok', kind: 'part', field: 'Bottle body colour', preset: null, hex: '#1d4ed8' },
  { family: 'pen', slug: 'pen-gold-click', photo: 'pen', kind: 'part', field: 'Body', preset: 'Black', hex: '#171717' },
  { family: 'mug', slug: 'gift-mug-custom-decorative', photo: 'mug', kind: 'part', field: 'Mug body', preset: 'Red', hex: '#dc2626' },
];
const WIDTHS = [1440, 1280, 820, 390, 360] as const;
const PART_NOTE = 'Your product colours are saved with the design; the photo doesn’t show part colours yet.';

let errors: string[] = [];
test.beforeEach(({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'mouse and keyboard; widths are set here');
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
const panel = (page: Page) => page.getByRole('complementary', { name: 'Product options' });
const studioReady = (page: Page) => page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
const photoReady = (page: Page) =>
  page.waitForFunction(() => {
    const photo = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))?.findOne<KonvaNamespace.Image>('.product-mockup');
    return Boolean(photo?.image());
  });
const artworkCount = (page: Page) => page.evaluate(() => window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!.find('.element').length);
/** The photo as the editor draws it (tinted or as photographed), at a point on the fabric. */
const photoPixel = (page: Page) =>
  page.evaluate(() => {
    const node = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!.findOne<KonvaNamespace.Image>('.product-mockup')!;
    const source = node.image() as HTMLCanvasElement | HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = source.width;
    c.height = source.height;
    const g = c.getContext('2d')!;
    g.drawImage(source, 0, 0);
    return [...g.getImageData(560, 700, 1, 1).data];
  });
const storedDesigns = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const req = indexedDB.open('aaraprint-studio');
        req.onsuccess = () => {
          const g = req.result.transaction('designs').objectStore('designs').getAll();
          g.onsuccess = () => {
            req.result.close();
            resolve(JSON.stringify(g.result));
          };
        };
      }),
  );

/** No Flat / On the product switch anywhere: canvas, Preview, any radio named Flat. */
async function noFlatSwitch(page: Page, label: string) {
  await expect(region(page), label).toHaveAttribute('data-view', 'product');
  await expect(page.getByRole('radiogroup', { name: 'Canvas view' }), label).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Flat' }), label).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'On the product' }), label).toHaveCount(0);
}

const swatch = (page: Page, c: Extract<Case, { kind: 'catalogue' }>, name: string) => panel(page).getByRole('radiogroup', { name: c.group }).getByRole('radio', { name: new RegExp(`^${name}`) });
const hexField = (page: Page, c: Extract<Case, { kind: 'part' }>): Locator => panel(page).getByRole('textbox', { name: `${c.field}, hex code` });

async function choosePart(page: Page, c: Extract<Case, { kind: 'part' }>) {
  if (c.preset) await panel(page).getByRole('list', { name: `${c.field} presets` }).getByRole('button', { name: c.preset }).click();
  else {
    await hexField(page, c).fill(c.hex);
    await hexField(page, c).press('Enter');
  }
}

for (const c of CASES) {
  test(`${c.family} (${c.slug}): Start designing opens on the product; colour change, reload, undo and redo keep one source of truth`, async ({ page }) => {
    test.setTimeout(90_000);
    await clearedStandIn(page, c.slug, { photo: c.photo, mask: 'cleared' });

    // A · the product page → Start designing → the Studio, on the product with no Flat switch.
    await page.goto(`/products/${c.slug}`);
    const link = page.getByRole('link', { name: /Start designing/ }).first();
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await confirmEntry(page);
    await expect(page).toHaveURL(new RegExp(`/products/${c.slug}/design`));
    await studioReady(page);
    await photoReady(page);
    await noFlatSwitch(page, 'A');
    await expect(panel(page)).toBeVisible(); // the registry's first tool
    const artwork = await artworkCount(page);
    const price = await page.getByTestId('studio-price').textContent();

    if (c.kind === 'catalogue') {
      await expect(swatch(page, c, c.from)).toHaveAttribute('aria-checked', 'true');
      await expect(region(page)).toHaveAttribute('data-tint', 'none'); // the photo is already that colour
      const before = await photoPixel(page);

      // B · another colour: the configuration, variant and SKU, and the photo itself.
      await swatch(page, c, c.to).click();
      await expect(swatch(page, c, c.to)).toHaveAttribute('aria-checked', 'true');
      await expect(region(page)).toHaveAttribute('data-tint', 'applied', { timeout: 10_000 });
      await expect.poll(async () => JSON.stringify(await photoPixel(page))).not.toBe(JSON.stringify(before));
      await expect(panel(page).getByTestId('studio-product-facts')).toContainText(c.skuTo);
      // These colours cost the same in the catalogue, so the resolver keeps the price.
      await expect(page.getByTestId('studio-price')).toHaveText(price!);
      expect(await artworkCount(page)).toBe(artwork);
      await expect.poll(() => storedDesigns(page), { timeout: 10_000 }).toContain(c.skuTo);
      const tinted = await photoPixel(page);

      // C · reload: the same colour, on the photo, nothing reset to a default.
      await page.reload();
      await studioReady(page);
      await photoReady(page);
      await noFlatSwitch(page, 'C');
      await expect(swatch(page, c, c.to)).toHaveAttribute('aria-checked', 'true');
      await expect(region(page)).toHaveAttribute('data-tint', 'applied', { timeout: 10_000 });
      await expect.poll(async () => JSON.stringify(await photoPixel(page))).toBe(JSON.stringify(tinted));
      expect(await storedDesigns(page)).toContain(c.skuTo);

      // D · undo restores the previous colour, redo the new one (A → B → A → B).
      await swatch(page, c, c.from).click();
      await expect(region(page)).toHaveAttribute('data-tint', 'none');
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(swatch(page, c, c.to)).toHaveAttribute('aria-checked', 'true');
      await expect(region(page)).toHaveAttribute('data-tint', 'applied', { timeout: 10_000 });
      await page.getByRole('button', { name: 'Redo' }).click();
      await expect(swatch(page, c, c.from)).toHaveAttribute('aria-checked', 'true');
      await expect(region(page)).toHaveAttribute('data-tint', 'none');
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(swatch(page, c, c.to)).toHaveAttribute('aria-checked', 'true');
    } else {
      await expect(hexField(page, c)).toHaveValue('');
      await expect(page.getByTestId('canvas-part-colours')).toHaveCount(0);
      const before = await photoPixel(page);

      // B · a part colour: saved with the design, never a new variant or price; said on the canvas.
      await choosePart(page, c);
      await expect(hexField(page, c)).toHaveValue(c.hex.toUpperCase());
      await expect(page.getByTestId('canvas-part-colours')).toHaveText(PART_NOTE);
      await expect(page.getByTestId('studio-price')).toHaveText(price!);
      expect(await artworkCount(page)).toBe(artwork);
      expect(await photoPixel(page)).toEqual(before); // shown as photographed: no invented recolouring
      await expect.poll(() => storedDesigns(page), { timeout: 10_000 }).toContain(c.hex);

      // C · reload: the same part colour, and the note.
      await page.reload();
      await studioReady(page);
      await photoReady(page);
      await noFlatSwitch(page, 'C');
      await expect(hexField(page, c)).toHaveValue(c.hex.toUpperCase());
      await expect(page.getByTestId('canvas-part-colours')).toHaveText(PART_NOTE);

      // D · A → B, undo restores A, redo B (history starts fresh after a reload).
      const other = '#16A34A';
      await hexField(page, c).fill(other);
      await hexField(page, c).press('Enter');
      await expect(hexField(page, c)).toHaveValue(other);
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(hexField(page, c)).toHaveValue(c.hex.toUpperCase());
      await page.getByRole('button', { name: 'Redo' }).click();
      await expect(hexField(page, c)).toHaveValue(other);
      // One more undo is the reloaded design's own colour; nothing older is undone into.
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(hexField(page, c)).toHaveValue(c.hex.toUpperCase());
      await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
      await expect(page.getByTestId('canvas-part-colours')).toBeVisible();
    }
    await noFlatSwitch(page, 'D');
    expect(await artworkCount(page)).toBe(artwork);
  });
}

test('E · every width: umbrella, rainwear, drinkware, pen and mug are on the product with no Flat switch, in the canvas and the Preview, and nothing scrolls sideways', async ({ page }) => {
  test.setTimeout(150_000);
  for (const c of CASES) {
    await clearedStandIn(page, c.slug, { photo: c.photo, mask: 'cleared' });
    for (const width of WIDTHS) {
      const label = `${c.slug} ${width}px`;
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await page.goto(`/products/${c.slug}/design?sample=1`);
      await studioReady(page);
      await photoReady(page);
      await noFlatSwitch(page, label);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: label }).toBeLessThanOrEqual(0);
      await page.getByTestId('preview-button').click();
      const preview = page.getByRole('dialog', { name: 'Preview' });
      await expect(preview.getByTestId('preview-area'), label).toHaveAttribute('data-view', 'product');
      await expect(preview.getByRole('radiogroup', { name: 'Preview view' }), label).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `${label} preview` }).toBeLessThanOrEqual(0);
      await page.keyboard.press('Escape');
      await expect(preview).toHaveCount(0);
    }
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('the real Custom Photo Umbrella (the reported page): its own photo, never the flat fallback; each colour recolours it; reload and reopen keep it', async ({ page }) => {
  test.setTimeout(120_000);
  const real = (p: Page) =>
    p.evaluate(() => {
      const node = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!.findOne<KonvaNamespace.Image>('.product-mockup')!;
      return { width: (node.image() as HTMLCanvasElement | HTMLImageElement).width };
    });
  await page.goto('/products/umbrella-photo-custom');
  await page.getByRole('radio', { name: /^Navy/ }).first().click();
  const link = page.getByRole('link', { name: /Start designing/ }).first();
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await confirmEntry(page);
  await studioReady(page);
  await photoReady(page);
  await noFlatSwitch(page, 'open');
  await expect(page.getByTestId('canvas-workspace-note')).toHaveCount(0);
  await expect(page.getByText(/product photo isn’t available/)).toHaveCount(0);
  expect((await real(page)).width).toBe(1122); // the real photo (1122 × 1402), not a placeholder
  await expect(region(page)).toHaveAttribute('data-tint', 'applied', { timeout: 10_000 }); // Navy from the product page
  const navy = JSON.stringify(await photoPixel(page));
  const seen = new Set([navy]);
  for (const name of ['Black', 'Red', 'Green']) {
    await panel(page).getByRole('radiogroup', { name: /^Canopy Colour/ }).getByRole('radio', { name: new RegExp(`^${name}`) }).click();
    await expect.poll(async () => seen.has(JSON.stringify(await photoPixel(page))), { message: name, timeout: 10_000 }).toBe(false);
    seen.add(JSON.stringify(await photoPixel(page)));
  }
  await panel(page).getByRole('radiogroup', { name: /^Canopy Colour/ }).getByRole('radio', { name: /^Navy/ }).click();
  await expect.poll(async () => JSON.stringify(await photoPixel(page)), { timeout: 10_000 }).toBe(navy);
  await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('button', { name: 'Add heading' }).click();
  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

  // Reload, then Back to the product page and reopen: the same photo, colour and artwork.
  for (const step of ['reload', 'reopen'] as const) {
    if (step === 'reload') await page.reload();
    else {
      await page.goBack();
      await expect(page.getByRole('radio', { name: /^Navy/ }).first()).toHaveAttribute('aria-checked', 'true');
      await page.getByRole('link', { name: /Start designing/ }).first().click();
    }
    await studioReady(page);
    await photoReady(page);
    await noFlatSwitch(page, step);
    await expect(page.getByTestId('canvas-workspace-note'), step).toHaveCount(0);
    await expect.poll(async () => JSON.stringify(await photoPixel(page)), { message: step, timeout: 10_000 }).toBe(navy);
    expect(await artworkCount(page), step).toBe(1);
  }
});
