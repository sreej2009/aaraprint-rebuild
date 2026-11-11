import AxeBuilder from '@axe-core/playwright';
import type { Download, Page, Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import type KonvaNamespace from 'konva';
import { expect, test } from './fixtures';

/**
 * "On the product" in the Preview (Phase 4 M1). Every real product photo's rights are unconfirmed,
 * so customers never see one: these tests inject a cleared stand-in instead — the real umbrella
 * profile (same size, same placements) with its photos swapped for a generated 1122 × 1402 PNG,
 * served by the test, never added to the catalogue. Every test starts with an empty browser profile.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const UMBRELLA = '/products/umbrella-golf/design';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
/** The original's boxes for the golf umbrella photos: [centerX, centerY, maxWidth, maxHeight]. */
const BOXES = { front: [563, 374, 170, 227], back: [559, 308, 182, 243] } as const;
/** The umbrella's print area. */
const PRINT = { width: 1800, height: 2400 };
const PHOTO = { width: 1122, height: 1402 };
const PHOTO_RGB = [200, 214, 192];
const MARK_RGB = [32, 32, 32];
const INDIGO = [0x2f, 0x2a, 0x7a];

/** A plain PNG: the photo colour, with a dark 100 × 100 px mark in its top-left corner. */
function fixturePhoto(): Buffer {
  const { width, height } = PHOTO;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) raw.set(x < 100 && y < 100 ? MARK_RGB : PHOTO_RGB, row + 1 + x * 3);
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PHOTO_PNG = fixturePhoto();

let errors: string[] = [];
let mediaRequests: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  mediaRequests = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // The missing-photo test serves a 404 on purpose.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource: the server responded with a status of 404')) errors.push(m.text());
  });
  page.on('request', (r) => {
    if (r.url().includes('/media/')) mediaRequests.push(new URL(r.url()).pathname);
  });
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

/** Serve `slug`'s real profile with its photos swapped for cleared stand-ins (placements untouched). */
async function clearedStandIn(page: Page, slug = 'umbrella-golf', { photo = 'ok' as 'ok' | 'missing' } = {}) {
  await page.route(`**/api/v1/studio/${slug}.json`, async (route: Route) => {
    const response = await route.fetch();
    const profile = await response.json();
    for (const side of profile.sides) {
      if (side.mockup) side.mockup = { ...side.mockup, ref: `studio-fixtures/${slug}-${side.id}.png`, format: 'png', rights: 'cleared' };
    }
    await route.fulfill({ response, json: profile });
  });
  await page.route('**/media/studio-fixtures/**', (route) => (photo === 'ok' ? route.fulfill({ status: 200, contentType: 'image/png', body: PHOTO_PNG }) : route.fulfill({ status: 404, body: '' })));
}

async function open(page: Page, url = UMBRELLA) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

const preview = (page: Page) => page.getByRole('dialog', { name: 'Preview' });
const viewChoice = (page: Page) => preview(page).getByRole('radiogroup', { name: 'Preview view' });
const option = (page: Page, name: 'Flat' | 'On the product') => viewChoice(page).getByRole('radio', { name });
const sideRadio = (page: Page, name: 'Front' | 'Back') =>
  preview(page)
    .getByRole('radiogroup', { name: 'Side to preview' })
    .getByRole('radio', { name: new RegExp(`^${name}`) });

async function openPreview(page: Page) {
  await page.getByTestId('preview-button').click();
  await expect(preview(page)).toBeVisible();
  await expect(page.getByTestId('preview-loading')).toHaveCount(0, { timeout: 10_000 });
}

async function onTheProduct(page: Page, press: 'click' | 'tap' = 'click') {
  await option(page, 'On the product')[press]();
  await expect(preview(page).getByTestId('preview-area')).toHaveAttribute('data-view', 'product');
  await expect(page.getByTestId('preview-loading')).toHaveCount(0, { timeout: 10_000 });
  await page.waitForFunction(() => window.Konva.stages.some((s) => s.container().classList.contains('studio-product-stage')));
}

/** The on-product drawing: its layers, where the artwork group sits, and pixels at photo points. */
async function productStage(page: Page, points: [number, number][] = []) {
  return page.evaluate((at) => {
    const st = window.Konva.stages.find((s) => s.container().classList.contains('studio-product-stage'))!;
    const group = st.findOne('.artwork-clip')!.getParent()!;
    const sample = (layerName: string, [px, py]: [number, number]) => {
      const canvas = st
        .getLayers()
        .find((l) => l.name() === layerName)!
        .getCanvas();
      const ratio = canvas.getPixelRatio();
      const x = Math.round((st.x() + px * st.scaleX()) * ratio);
      const y = Math.round((st.y() + py * st.scaleY()) * ratio);
      return [...canvas.getContext()._context.getImageData(x, y, 1, 1).data];
    };
    const photo = st.findOne<KonvaNamespace.Image>('Image')!;
    return {
      layers: st.getLayers().map((l) => l.name()),
      listening: st.listening(),
      photo: { width: photo.width(), height: photo.height(), natural: (photo.image() as HTMLImageElement).naturalWidth },
      group: { x: group.x(), y: group.y(), scale: group.scaleX() },
      photoPixels: at.map((p) => sample('product-photo', p)),
      artworkPixels: at.map((p) => sample('product-artwork', p)),
      scale: st.scaleX(),
    };
  }, points);
}

/** Where the original places the artwork on a photo: fitted inside the box, centred. */
function placed([cx, cy, w, h]: readonly number[]) {
  const scale = Math.min(w! / PRINT.width, h! / PRINT.height);
  return { x: cx! - (PRINT.width * scale) / 2, y: cy! - (PRINT.height * scale) / 2, width: PRINT.width * scale, height: PRINT.height * scale, scale };
}

const near = (rgba: number[], rgb: number[]) => rgba[3] === 255 && rgb.every((c, i) => Math.abs(rgba[i]! - c) <= 3);

async function setBackground(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Background' }).click();
  await page.getByRole('complementary', { name: 'Background' }).getByRole('button', { name }).click();
}

async function storedDesign(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ designs: unknown[]; versions: unknown[] }>((resolve) => {
        const req = indexedDB.open('aaraprint-studio');
        req.onsuccess = () => {
          const tx = req.result.transaction(['designs', 'versions'], 'readonly');
          const designs = tx.objectStore('designs').getAll();
          const versions = tx.objectStore('versions').getAll();
          tx.oncomplete = () => {
            req.result.close();
            resolve({ designs: designs.result, versions: versions.result });
          };
        };
      }),
  );
}

test.describe('desktop: on the product', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'mouse and keyboard');

  test('1 · a cleared stand-in: Flat first, then the photo with the artwork in the original place (pixels), front and back', async ({ page }) => {
    await clearedStandIn(page);
    await open(page);
    await setBackground(page, 'Deep indigo');
    await openPreview(page);
    await expect(option(page, 'Flat')).toHaveAttribute('aria-checked', 'true');
    await expect(preview(page).getByTestId('preview-area')).toHaveAttribute('data-view', 'flat');
    expect(mediaRequests.filter((p) => p.includes('studio-fixtures'))).toEqual([]); // only loaded when asked for

    await onTheProduct(page);
    const front = placed(BOXES.front);
    const inset = 3;
    const shown = await productStage(page, [
      [50, 50], // the photo's dark mark: drawn the right way round, not stretched
      [600, 1300], // plain photo
      [front.x + inset, front.y + inset], // just inside the artwork's corners
      [front.x + front.width - inset, front.y + front.height - inset],
      [front.x - inset, front.y + front.height / 2], // just outside its edges
      [front.x + front.width + inset, front.y + front.height / 2],
      [front.x + front.width / 2, front.y - inset],
      [front.x + front.width / 2, front.y + front.height + inset],
    ]);
    expect(shown.layers).toEqual(['product-photo', 'product-artwork']);
    expect(shown.listening).toBe(false);
    expect(shown.photo).toEqual({ width: 1122, height: 1402, natural: 1122 });
    expect(shown.group.x).toBeCloseTo(front.x, 6);
    expect(shown.group.y).toBeCloseTo(front.y, 6);
    expect(shown.group.scale).toBeCloseTo(front.scale, 9);
    expect(near(shown.photoPixels[0]!, MARK_RGB), String(shown.photoPixels[0])).toBe(true);
    expect(near(shown.photoPixels[1]!, PHOTO_RGB), String(shown.photoPixels[1])).toBe(true);
    for (const inside of shown.artworkPixels.slice(2, 4)) expect(near(inside, INDIGO), String(inside)).toBe(true);
    for (const outside of shown.artworkPixels.slice(4)) expect(outside[3], String(outside)).toBe(0);
    await expect(preview(page).getByRole('region', { name: /^Front side on the product: / })).toBeVisible();
    // Nothing editor-like: no guides, handles or selection.
    expect(
      await page.evaluate(() => window.Konva.stages.find((s) => s.container().classList.contains('studio-product-stage'))!.find((n: KonvaNamespace.Node) => n.name().startsWith('guide')).length),
    ).toBe(0);
    await expect(preview(page).locator('[data-handle], [data-testid="selection-frame"]')).toHaveCount(0);

    await sideRadio(page, 'Back').click();
    await expect.poll(async () => (await productStage(page)).group.y).toBeCloseTo(placed(BOXES.back).y, 6);
    const back = placed(BOXES.back);
    const backShown = await productStage(page, [
      [back.x + back.width / 2, back.y + back.height / 2],
      [back.x - inset, back.y + back.height / 2],
    ]);
    expect(backShown.artworkPixels[0]![3]).toBe(0); // the back has no background colour: the product shows through, no white box
    expect(backShown.artworkPixels[1]![3]).toBe(0);
    expect(mediaRequests.filter((p) => p.includes('studio-fixtures'))).toEqual(['/media/studio-fixtures/umbrella-golf-front.png', '/media/studio-fixtures/umbrella-golf-back.png']);

    await option(page, 'Flat').click();
    await expect(preview(page).getByTestId('preview-area')).toHaveAttribute('data-view', 'flat');
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.Konva.stages
            .find((s) => s.container().classList.contains('studio-preview-stage'))
            ?.getLayers()
            .map((l) => l.name()),
        ),
      )
      .toEqual(['preview-shadow', 'artwork']);
  });

  test('zoom and pan on the product: 100 % is the artwork at real size; keys and drag move it', async ({ page }) => {
    await clearedStandIn(page);
    await open(page);
    await openPreview(page);
    await onTheProduct(page);
    await page.keyboard.press('Control+0');
    await expect(preview(page).getByRole('button', { name: 'Zoom 100%, zoom options' })).toBeVisible();
    expect((await productStage(page)).scale).toBeCloseTo(96 / (300 * placed(BOXES.front).scale), 4);
    const area = preview(page).getByTestId('preview-area');
    await area.focus();
    const before = await page.evaluate(() => window.Konva.stages.find((s) => s.container().classList.contains('studio-product-stage'))!.y());
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.Konva.stages.find((s) => s.container().classList.contains('studio-product-stage'))!.y())).toBeLessThan(before);
    await page.keyboard.press('Shift+Digit1');
    await expect(area).toHaveAttribute('data-zoom', 'fit');
  });

  test('2 · fallbacks: a photo that can’t load stays flat with a note; other products show no choice', async ({ page }) => {
    await clearedStandIn(page, 'umbrella-golf', { photo: 'missing' });
    await open(page);
    await openPreview(page);
    await option(page, 'On the product').click();
    await expect(preview(page).getByTestId('preview-product-unavailable')).toHaveText('On-product preview unavailable for this product.');
    await expect(preview(page).getByTestId('preview-area')).toHaveAttribute('data-view', 'flat');
    await page.waitForFunction(() => window.Konva.stages.some((s) => s.container().classList.contains('studio-preview-stage') && !s.container().classList.contains('studio-product-stage')));
    await page.keyboard.press('Escape');

    // Not in M1: flat-printed drinkware, pens, mugs, polos, bags, signs and cards.
    for (const slug of ['business-card-classic', 'gift-mug-custom-black', 'apparel-polo-6-degree', 'bag-backpack-american-tourister', 'label-jar-bottle']) {
      await open(page, `/products/${slug}/design?sample=1`);
      await openPreview(page);
      await expect(viewChoice(page), slug).toHaveCount(0);
      await expect(preview(page).getByTestId('preview-area'), slug).toHaveAttribute('data-view', 'flat');
      await page.keyboard.press('Escape');
    }
  });

  test('3 · rights: umbrella, rainwear and drinkware with their real (unconfirmed) photos never offer them', async ({ page }) => {
    for (const slug of ['umbrella-golf', 'cap-rain-waterproof', 'drinkware-bottle-aluminium']) {
      await open(page, `/products/${slug}/design?sample=1`);
      await openPreview(page);
      await expect(viewChoice(page), slug).toHaveCount(0);
      await expect(preview(page).getByTestId('preview-product-unavailable'), slug).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
    expect(mediaRequests.filter((p) => /\/products\/(umbrellas-rainwear|drinkware)-2d\//.test(p))).toEqual([]);
  });

  test('4 · the saved design is unchanged by the product view and holds no photo or placement', async ({ page }) => {
    await clearedStandIn(page);
    await open(page);
    await setBackground(page, 'Deep indigo');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
    const before = await storedDesign(page);
    expect(before.designs).toHaveLength(1);

    await openPreview(page);
    await onTheProduct(page);
    await page.keyboard.press('Control+=');
    await sideRadio(page, 'Back').click();
    await page.keyboard.press('Control+z'); // isolated: never reaches the design
    await page.keyboard.press('Escape');
    await expect(preview(page)).toHaveCount(0);
    await page.keyboard.press('Control+s');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

    const after = await storedDesign(page);
    const design = (records: { designs: unknown[] }) => records.designs[0] as { document: unknown; fingerprint: string };
    expect(design(after).document).toEqual(design(before).document);
    expect(design(after).fingerprint).toBe(design(before).fingerprint);
    const stored = JSON.stringify(after);
    for (const word of ['studio-fixtures', 'mockup', 'placement', 'product-photo', 'data:image', 'blob:']) expect(stored, word).not.toContain(word);
    // The background change is still the one step to undo.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  test('5 · the proof is the flat print file, identical before and after viewing on the product', async ({ page }) => {
    await clearedStandIn(page);
    await open(page, `${UMBRELLA}?sample=1`);
    const proof = async () => {
      await page.getByTestId('print-check-button').click();
      const dialog = page.getByRole('dialog', { name: 'Print check and proof' });
      const frontOnly = dialog.getByRole('radio', { name: 'Front only' });
      if (await frontOnly.count()) await frontOnly.click();
      const planned = /Proof image(\d+) × (\d+) px/.exec((await dialog.getByTestId('proof-facts').textContent()) ?? '')!;
      const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('download-proof').click()]);
      const file = readFileSync((await (download as Download).path())!);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      // The proof is the size the print check plans for the print area.
      expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([Number(planned[1]), Number(planned[2])]);
      return file;
    };
    const first = await proof();
    await openPreview(page);
    await onTheProduct(page);
    await sideRadio(page, 'Back').click();
    await page.keyboard.press('Escape');
    const second = await proof();
    expect(first.subarray(1, 4).toString()).toBe('PNG');
    // Byte for byte the same file: the photo never reaches the proof.
    expect(second.equals(first)).toBe(true);
  });

  test('axe: Flat and On the product', async ({ page }) => {
    test.setTimeout(60_000);
    await clearedStandIn(page);
    await open(page, `${UMBRELLA}?sample=1`);
    await openPreview(page);
    for (const view of ['Flat', 'On the product'] as const) {
      if (view === 'On the product') await onTheProduct(page);
      const results = await new AxeBuilder({ page }).include('[data-testid="studio-preview"]').withTags(TAGS).analyze();
      expect(results.violations.map((v) => `${view} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    }
  });
});

test.describe('6 · every width', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'sizes set here');

  test('1440 to 360 px: the choice fits, the photo draws, nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(90_000);
    await clearedStandIn(page);
    await open(page, `${UMBRELLA}?sample=1`);
    for (const width of [1440, 1280, 1024, 820, 768, 600, 430, 390, 375, 360]) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await openPreview(page);
      for (const view of ['Flat', 'On the product'] as const) {
        if (view === 'On the product') await onTheProduct(page);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `${width}px ${view}` }).toBeLessThanOrEqual(0);
        for (const control of [
          option(page, 'Flat'),
          option(page, 'On the product'),
          preview(page).getByRole('button', { name: 'Close preview' }),
          preview(page).getByRole('button', { name: /, zoom options$/ }),
        ]) {
          const box = (await control.boundingBox())!;
          expect(box, `${width}px ${view}`).toBeTruthy();
          expect(box.x, `${width}px ${view}`).toBeGreaterThanOrEqual(-0.5);
          expect(box.x + box.width, `${width}px ${view}`).toBeLessThanOrEqual(width + 0.5);
        }
        const area = (await preview(page).getByTestId('preview-area').boundingBox())!;
        expect(area.height, `${width}px ${view}`).toBeGreaterThan(200);
      }
      await option(page, 'Flat').click();
      await page.keyboard.press('Escape');
      await expect(preview(page)).toHaveCount(0);
    }
  });
});

test.describe('tablet: on the product by touch', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('tap the choice and the sides; the targets are touch-sized; axe passes', async ({ page }) => {
    test.setTimeout(60_000);
    await clearedStandIn(page);
    await open(page, `${UMBRELLA}?sample=1`);
    await page.getByTestId('preview-button').tap();
    await expect(page.getByTestId('preview-loading')).toHaveCount(0, { timeout: 10_000 });
    for (const name of ['Flat', 'On the product'] as const) expect((await option(page, name).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await onTheProduct(page, 'tap');
    await sideRadio(page, 'Back').tap();
    await expect.poll(async () => (await productStage(page)).group.y).toBeCloseTo(placed(BOXES.back).y, 6);
    const results = await new AxeBuilder({ page }).include('[data-testid="studio-preview"]').withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('phone: on the product', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('the choice sits in the bottom bar; the photo draws; axe passes', async ({ page }) => {
    test.setTimeout(60_000);
    await clearedStandIn(page);
    await open(page, `${UMBRELLA}?sample=1`);
    await page.getByTestId('preview-button').tap();
    await expect(page.getByTestId('preview-loading')).toHaveCount(0, { timeout: 10_000 });
    expect(await viewChoice(page).evaluate((el) => el.closest('header, footer')?.tagName)).toBe('FOOTER');
    await onTheProduct(page, 'tap');
    const results = await new AxeBuilder({ page }).include('[data-testid="studio-preview"]').withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
