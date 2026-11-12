import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type KonvaNamespace from 'konva';
import { expect, settleAnimations, test } from './fixtures';
import { BOXES, clearedStandIn, INDIGO, MARK_RGB, near, PHOTO, PHOTO_RGB, placed } from './product-fixtures';

/**
 * Editing on the product (Phase 4 M2): the product photo behind the artwork in the Studio canvas.
 * The design stays in print px; the photo is a backdrop that is never picked, saved, undone or
 * exported. Real photos stay blocked (rights unconfirmed): these tests serve a cleared stand-in
 * (product-fixtures.ts). Every test starts with an empty browser profile.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const UMBRELLA = '/products/umbrella-golf/design';
const SAMPLE = `${UMBRELLA}?sample=1`;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

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

async function open(page: Page, url = SAMPLE) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

const region = (page: Page) => page.getByRole('region', { name: /^Design canvas: / });
const viewChoice = (page: Page) => page.getByRole('radiogroup', { name: 'Canvas view' });
const side = (page: Page, name: 'Front' | 'Back') => page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: new RegExp(`^${name}`) });
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Layers and properties' });
const rail = (page: Page) => page.getByRole('navigation', { name: 'Design tools' });

/** Photo-frame products are on the product only (M4-C): no Flat switch, no flat state. */
async function onTheProduct(page: Page) {
  await expect(region(page)).toHaveAttribute('data-view', 'product');
  await expect(viewChoice(page)).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Flat' })).toHaveCount(0);
  await page.waitForFunction(() => {
    const st = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'));
    const photo = st?.findOne<KonvaNamespace.Image>('.product-mockup');
    return Boolean(photo && (photo.image() as HTMLImageElement).naturalWidth > 0);
  });
}

/** The editor stage: its view, the photo's place (design px), and pixels at design points per layer. */
async function stage(page: Page, points: [number, number][] = []) {
  return page.evaluate((at) => {
    const st = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!;
    const photo = st.findOne<KonvaNamespace.Image>('.product-mockup');
    const sample = (layerName: string, [dx, dy]: [number, number]) => {
      const canvas = st
        .getLayers()
        .find((l) => l.name() === layerName)!
        .getCanvas();
      const ratio = canvas.getPixelRatio();
      return [...canvas.getContext()._context.getImageData(Math.round((st.x() + dx * st.scaleX()) * ratio), Math.round((st.y() + dy * st.scaleY()) * ratio), 1, 1).data];
    };
    return {
      scale: st.scaleX(),
      x: st.x(),
      y: st.y(),
      layers: st.getLayers().map((l) => ({ name: l.name(), visible: l.visible(), listening: l.listening() })),
      photo: photo ? { x: photo.x(), y: photo.y(), width: photo.width(), height: photo.height(), listening: photo.listening() } : null,
      workspace: at.map((p) => sample('workspace', p)),
      artwork: at.map((p) => sample('artwork', p)),
      ids: st.find('.element').map((n) => n.id()),
    };
  }, points);
}

/** The photo in design px for a placement box (what the editor draws behind the artwork). */
function bounds(box: readonly number[]) {
  const p = placed(box);
  return { x: -p.x / p.scale, y: -p.y / p.scale, width: PHOTO.width / p.scale, height: PHOTO.height / p.scale };
}

/** Screen position of a design point. */
async function at(page: Page, x: number, y: number) {
  const area = (await page.getByTestId('canvas-area').boundingBox())!;
  const s = await stage(page);
  return { x: area.x + s.x + x * s.scale, y: area.y + s.y + y * s.scale, scale: s.scale };
}

async function boxOf(page: Page, id: string) {
  return page.evaluate((elementId) => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    const g = st.findOne<KonvaNamespace.Group>(`#${elementId}`)!;
    return { x: g.x() - g.offsetX(), y: g.y() - g.offsetY(), width: g.offsetX() * 2, height: g.offsetY() * 2, rotation: g.rotation() };
  }, id);
}

async function firstOf(page: Page, type: 'text' | 'shape' | 'image') {
  return page.evaluate((kind) => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return st.find(`.element-${kind}`).map((n) => n.id());
  }, type);
}

async function tool(page: Page, name: string) {
  const button = rail(page).getByRole('button', { name, exact: true });
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
}

async function setField(page: Page, name: string, value: string) {
  const field = inspector(page).getByRole('textbox', { name });
  await field.fill(value);
  await field.press('Enter');
}

async function setBackground(page: Page, name: string) {
  await tool(page, 'Background');
  await page.getByRole('complementary', { name: 'Background' }).getByRole('button', { name }).click();
}

async function storedDesigns(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown[]>((resolve) => {
        const req = indexedDB.open('aaraprint-studio');
        req.onsuccess = () => {
          const tx = req.result.transaction(['designs', 'versions'], 'readonly');
          const designs = tx.objectStore('designs').getAll();
          const versions = tx.objectStore('versions').getAll();
          tx.oncomplete = () => {
            req.result.close();
            resolve([...designs.result, ...versions.result]);
          };
        };
      }),
  );
}

const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

test.describe('desktop: editing on the product', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('pixels: the photo behind, the artwork exactly in the print area, guides on top; hiding guides keeps the photo', async ({ page }) => {
    await clearedStandIn(page);
    await open(page, UMBRELLA);
    await setBackground(page, 'Deep indigo');
    // On the product only (M4-C): the umbrella opens on its photo, with no switch; only the side shown is loaded.
    await expect(viewChoice(page)).toHaveCount(0);
    expect(mediaRequests.filter((p) => p.includes('studio-fixtures'))).toEqual(['/media/studio-fixtures/umbrella-golf-front.png']);
    await onTheProduct(page);
    const photo = bounds(BOXES.front);
    // Samples 3 screen px from each edge (at Fit, a print px is a small fraction of a screen px).
    const inset = 3 / (await stage(page)).scale;
    const s = await stage(page, [
      [photo.x + 50 / placed(BOXES.front).scale, photo.y + 50 / placed(BOXES.front).scale], // the photo's dark corner mark
      [photo.x + photo.width / 2, photo.y + photo.height * 0.95], // plain photo, far from the print area
      [inset, inset], // just inside the print area's corners
      [1800 - inset, 2400 - inset],
      [-inset, 1200], // just outside its edges
      [1800 + inset, 1200],
      [900, -inset],
      [900, 2400 + inset],
    ]);
    expect(s.layers.map((l) => l.name)).toEqual(['workspace', 'artwork', 'guides']);
    expect(s.layers.every((l) => !l.listening)).toBe(true);
    expect(s.photo!.listening).toBe(false);
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(s.photo![key]).toBeCloseTo(photo[key], 6);
    expect(near(s.workspace[0]!, MARK_RGB), String(s.workspace[0])).toBe(true);
    expect(near(s.workspace[1]!, PHOTO_RGB), String(s.workspace[1])).toBe(true);
    for (const inside of s.artwork.slice(2, 4)) expect(near(inside, INDIGO), String(inside)).toBe(true);
    for (const outside of s.artwork.slice(4)) expect(outside[3], String(outside)).toBe(0);
    // The photo stays intact under and around the print area.
    for (const around of s.workspace.slice(4)) expect(near(around, PHOTO_RGB), String(around)).toBe(true);
    // Fit shows the whole photo.
    const area = (await page.getByTestId('canvas-area').boundingBox())!;
    expect(s.x + photo.x * s.scale).toBeGreaterThanOrEqual(-0.5);
    expect(s.x + (photo.x + photo.width) * s.scale).toBeLessThanOrEqual(area.width + 0.5);
    expect(s.y + (photo.y + photo.height) * s.scale).toBeLessThanOrEqual(area.height + 0.5);

    await page.getByRole('button', { name: /^Zoom .*view options$/ }).click();
    await page.getByRole('menuitemcheckbox', { name: /Show print guides/ }).click();
    const hidden = await stage(page, [[photo.x + photo.width / 2, photo.y + photo.height * 0.95]]);
    expect(hidden.layers.find((l) => l.name === 'guides')!.visible).toBe(false);
    expect(near(hidden.workspace[0]!, PHOTO_RGB)).toBe(true);
    expect(hidden.photo).not.toBeNull();
  });

  test('A · select, move, resize and rotate text on the product: print px, one undo step each', async ({ page }) => {
    await clearedStandIn(page);
    await open(page);
    await onTheProduct(page);
    const id = (await firstOf(page, 'text'))[0]!;
    const start = await boxOf(page, id);
    const centre = await at(page, start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.click(centre.x, centre.y);
    await expect(page.locator('[data-handle="se"]')).toBeVisible();
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 30, centre.y + 20, { steps: 5 });
    await page.mouse.up();
    const moved = await boxOf(page, id);
    expect(moved.x).toBeCloseTo(start.x + 30 / centre.scale, -1);
    expect(moved.y).toBeCloseTo(start.y + 20 / centre.scale, -1);
    await expect(inspector(page).getByRole('textbox', { name: 'X, from the left trim edge' })).toHaveValue(String(Math.round((moved.x / 300) * 25.4 * 10) / 10));

    const se = (await page.locator('[data-handle="se"]').boundingBox())!;
    await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
    await page.mouse.down();
    await page.mouse.move(se.x + se.width / 2 + 25, se.y + se.height / 2 + 5, { steps: 4 });
    await page.mouse.up();
    expect((await boxOf(page, id)).width).toBeGreaterThan(moved.width);

    const rotate = (await page.locator('[data-handle="rotate"]').boundingBox())!;
    const now = await boxOf(page, id);
    const mid = await at(page, now.x + now.width / 2, now.y + now.height / 2);
    await page.mouse.move(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2);
    await page.mouse.down();
    await page.mouse.move(mid.x + 60, mid.y - 50, { steps: 4 });
    await page.mouse.move(mid.x + 80, mid.y - 1, { steps: 4 });
    await page.mouse.up();
    expect((await boxOf(page, id)).rotation).toBe(90);
    // The photo never moved: same place, same size.
    const photo = bounds(BOXES.front);
    expect((await stage(page)).photo!.x).toBeCloseTo(photo.x, 6);
    // D · undo and redo change only the artwork; the view stays on the product.
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await boxOf(page, id)).toEqual(start);
    await page.keyboard.press('Control+y');
    expect((await boxOf(page, id)).x).toBeCloseTo(moved.x, 6);
    await expect(region(page)).toHaveAttribute('data-view', 'product');
    await expect(viewChoice(page)).toHaveCount(0);
  });

  test('B · C · add text, a shape and an image on the product; they draw in the print area', async ({ page }) => {
    await clearedStandIn(page);
    await open(page, UMBRELLA);
    await onTheProduct(page);
    await tool(page, 'Text');
    await page.getByRole('button', { name: 'Add heading' }).click();
    await page.keyboard.type('On the umbrella');
    await page.keyboard.press('Control+Enter');
    await tool(page, 'Shapes');
    await page.getByRole('button', { name: 'Add rectangle', exact: true }).click();
    await setField(page, 'X, from the left trim edge', '20');
    await setField(page, 'Y, from the top trim edge', '120');
    const shape = (await firstOf(page, 'shape'))[0]!;
    const box = await boxOf(page, shape);
    expect(box.x).toBeCloseTo((20 / 25.4) * 300, 0);
    const s = await stage(page, [[box.x + box.width / 2, box.y + box.height / 2]]);
    expect(s.artwork[0]![3]).toBe(255); // the shape is drawn there
    expect(near(s.workspace[0]!, PHOTO_RGB)).toBe(true); // over the intact photo
    expect((await firstOf(page, 'text')).length).toBe(1);

    // An image: upload, place, resize; it stays inside the print area.
    await tool(page, 'Uploads');
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 600;
      c.height = 400;
      const g = c.getContext('2d')!;
      g.fillStyle = '#e8930c';
      g.fillRect(0, 0, 600, 400);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
      return [...new Uint8Array(await blob.arrayBuffer())];
    });
    await page.getByTestId('upload-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(png) });
    await page.getByRole('button', { name: /^Add image: logo\.png/ }).click();
    await setField(page, 'W, width', '60');
    const image = (await firstOf(page, 'image'))[0]!;
    const placedImage = await boxOf(page, image);
    expect(placedImage.width).toBeCloseTo((60 / 25.4) * 300, 0);
    expect(placedImage.x).toBeGreaterThanOrEqual(0);
    expect(placedImage.x + placedImage.width).toBeLessThanOrEqual(1800);
    expect(placedImage.y + placedImage.height).toBeLessThanOrEqual(2400);
    // The layers list holds the design only: no photo, no mockup.
    const rows = await page
      .getByRole('list', { name: 'Layers' })
      .locator('[data-layer-row]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => /mockup|photo of|product/i.test(r))).toBe(false);
  });

  test('E · edits on the product autosave and come back after a reload; the view and photo are never saved', async ({ page }) => {
    test.setTimeout(60_000); // a new design, an autosave and a full reload: about 12 s alone, over 30 s under full load
    await clearedStandIn(page);
    await open(page, UMBRELLA); // a new design (the sample is never saved)
    await onTheProduct(page);
    await tool(page, 'Text');
    await page.getByRole('button', { name: 'Add heading' }).click();
    await page.keyboard.type('Saved on the product');
    await page.keyboard.press('Control+Enter');
    const id = (await firstOf(page, 'text'))[0]!;
    await setField(page, 'X, from the left trim edge', '33');
    await saved(page);
    const box = await boxOf(page, id);
    const stored = JSON.stringify(await storedDesigns(page));
    for (const word of ['studio-fixtures', 'mockup', 'placement', 'productView', 'product-mockup', 'data:image', 'blob:']) expect(stored, word).not.toContain(word);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas')?.querySelector('canvas'))));
    await expect.poll(async () => (await boxOf(page, id)).x).toBeCloseTo(box.x, 6);
    // A new session opens in the family's workspace (on the product only, M4-C): the view was never saved.
    await expect(region(page)).toHaveAttribute('data-view', 'product');
    await expect(viewChoice(page)).toHaveCount(0);
  });

  test('viewing the product is not an edit: zoom and sides add no undo step, no autosave, no version', async ({ page }) => {
    await clearedStandIn(page);
    await open(page, UMBRELLA);
    await setBackground(page, 'Deep indigo');
    await saved(page);
    const before = JSON.stringify(await storedDesigns(page));
    await onTheProduct(page);
    await side(page, 'Back').click();
    await side(page, 'Front').click();
    await page.keyboard.press('Control+=');
    await page.waitForTimeout(1600); // past the autosave delay: nothing may be written (a negative check)
    expect(JSON.stringify(await storedDesigns(page))).toBe(before);
    await page.getByRole('button', { name: 'Undo' }).click(); // the background change is still the last step
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await expect(region(page)).toHaveAttribute('data-view', 'product');
  });

  test('F · the proof made on the product is the flat print file, byte for byte', async ({ page }) => {
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
      expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([Number(planned[1]), Number(planned[2])]);
      return file;
    };
    // The same sample where the photo can't be shown (real photos: rights unconfirmed) is flat...
    await open(page);
    await expect(region(page)).toHaveAttribute('data-view', 'flat');
    const flat = await proof();
    // ...and on the product with a cleared stand-in: the proof is identical.
    await clearedStandIn(page);
    await open(page);
    await onTheProduct(page);
    const onProduct = await proof();
    expect(onProduct.subarray(1, 4).toString()).toBe('PNG');
    expect(onProduct.equals(flat)).toBe(true);
  });

  test('G · front and back: each side gets its own photo and placement; editing the back leaves the front alone', async ({ page }) => {
    await clearedStandIn(page);
    await open(page);
    await onTheProduct(page);
    const frontIds = (await stage(page)).ids;
    const frontBoxes = await Promise.all(frontIds.map((id) => boxOf(page, id)));
    await side(page, 'Back').click();
    await expect(region(page)).toHaveAccessibleName(/^Design canvas: Back, .+, on the product$/);
    await expect.poll(async () => (await stage(page)).photo?.y).toBeCloseTo(bounds(BOXES.back).y, 6);
    await tool(page, 'Text');
    await page.getByRole('button', { name: 'Add heading' }).click();
    await page.keyboard.type('Back side');
    await page.keyboard.press('Control+Enter');
    await side(page, 'Front').click();
    await expect.poll(async () => (await stage(page)).photo?.y).toBeCloseTo(bounds(BOXES.front).y, 6);
    expect((await stage(page)).ids).toEqual(frontIds);
    expect(await Promise.all(frontIds.map((id) => boxOf(page, id)))).toEqual(frontBoxes);
    expect(mediaRequests.filter((p) => p.includes('studio-fixtures'))).toEqual(['/media/studio-fixtures/umbrella-golf-front.png', '/media/studio-fixtures/umbrella-golf-back.png']);
  });

  test('H · rights and fallbacks: real photos are never offered; a photo that fails keeps the flat editor working', async ({ page }) => {
    for (const slug of ['umbrella-golf', 'cap-rain-waterproof', 'drinkware-bottle-aluminium', 'business-card-classic', 'gift-mug-custom-black']) {
      await open(page, `/products/${slug}/design?sample=1`);
      await expect(region(page), slug).toHaveAttribute('data-view', 'flat');
      await expect(viewChoice(page), slug).toHaveCount(0);
    }
    expect(mediaRequests.filter((p) => /\/products\/(umbrellas-rainwear|drinkware)-2d\//.test(p))).toEqual([]);

    await clearedStandIn(page, 'umbrella-golf', { photo: 'missing' });
    await open(page);
    await expect(page.getByTestId('canvas-product-unavailable')).toHaveText('On-product view unavailable for this product.');
    await expect(region(page)).toHaveAttribute('data-view', 'flat');
    expect((await stage(page)).photo).toBeNull();
    await expect(viewChoice(page)).toHaveCount(0); // a fallback, never a switch
    // Still a working editor.
    await tool(page, 'Shapes');
    await page.getByRole('button', { name: 'Add rectangle', exact: true }).click();
    expect((await firstOf(page, 'shape')).length).toBeGreaterThan(0);
  });

  test('zoom, pan and Fit on the product: 100 % is real size; photo and artwork move together', async ({ page }) => {
    await clearedStandIn(page);
    await open(page);
    await onTheProduct(page);
    const fitted = await stage(page);
    await page.keyboard.press('Control+0');
    await expect(page.getByRole('button', { name: 'Zoom 100%, view options' })).toBeVisible();
    expect((await stage(page)).scale).toBeCloseTo(96 / 300, 6);
    const before = await stage(page);
    await page.getByTestId('canvas-area').hover();
    await page.mouse.wheel(0, 200);
    const after = await stage(page);
    expect(after.y).toBeLessThan(before.y);
    expect(after.photo).toEqual(before.photo); // one transform: the photo stays where it is in design px
    await page.keyboard.press('Shift+Digit1');
    await expect.poll(async () => (await stage(page)).scale).toBeCloseTo(fitted.scale, 6);
  });

  test('axe: the Studio on the product', async ({ page }) => {
    test.setTimeout(60_000);
    await clearedStandIn(page);
    await open(page);
    await onTheProduct(page);
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
});

test.describe('I · every width', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'sizes set here');

  test('1440 to 360 px: the photo fits, the sides are on screen, there is no view switch, artwork is selectable, nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(90_000);
    await clearedStandIn(page);
    await open(page);
    await onTheProduct(page);
    for (const width of [1440, 1280, 1024, 820, 768, 600, 430, 390, 375, 360]) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await expect(region(page), `${width}px`).toHaveAttribute('data-view', 'product');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `${width}px` }).toBeLessThanOrEqual(0);
      await expect(viewChoice(page), `${width}px`).toHaveCount(0);
      const sides = (await side(page, 'Back').boundingBox())!; // the side choice stays on screen
      expect(sides.x, `${width}px`).toBeGreaterThanOrEqual(-0.5);
      expect(sides.x + sides.width, `${width}px`).toBeLessThanOrEqual(width + 0.5);
      // Fitted: the whole photo is in the canvas area.
      await page.keyboard.press('Shift+Digit1');
      const area = (await page.getByTestId('canvas-area').boundingBox())!;
      const s = await stage(page);
      expect(s.photo, `${width}px`).not.toBeNull();
      expect(s.x + s.photo!.x * s.scale, `${width}px`).toBeGreaterThanOrEqual(-0.5);
      expect(s.x + (s.photo!.x + s.photo!.width) * s.scale, `${width}px`).toBeLessThanOrEqual(area.width + 0.5);
      // Artwork still picks.
      const id = (await firstOf(page, 'text'))[0]!;
      const b = await boxOf(page, id);
      const c = await at(page, b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.click(c.x, c.y);
      await expect(page.locator('[data-handle="se"]'), `${width}px`).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('tablet: on the product by touch', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('on the product with no switch; tap and drag artwork: it moves in print px; axe', async ({ page }) => {
    test.setTimeout(60_000);
    await clearedStandIn(page);
    await open(page);
    await onTheProduct(page);
    // The largest shape (at Fit the print area is small on screen); a second touch on text this soon
    // would be a double-tap, which edits the text.
    const shapes = await Promise.all((await firstOf(page, 'shape')).map(async (shapeId) => ({ shapeId, box: await boxOf(page, shapeId) })));
    const target = shapes.sort((p, q) => q.box.width * q.box.height - p.box.width * p.box.height)[0]!;
    const c = await at(page, target.box.x + target.box.width / 2, target.box.y + target.box.height / 2);
    const cdp = await page.context().newCDPSession(page);
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
    await send('touchStart', [c]);
    await send('touchEnd', []);
    await expect(page.locator('[data-handle="se"]')).toBeVisible();
    // Drag whichever element the tap picked (the top one at that point).
    const id = (await page.getByTestId('selection-frame').getAttribute('data-element-id'))!;
    const start = await boxOf(page, id);
    await send('touchStart', [c]);
    for (let i = 1; i <= 6; i += 1) await send('touchMove', [{ x: c.x + (24 * i) / 6, y: c.y }]);
    await send('touchEnd', []);
    expect((await boxOf(page, id)).x).toBeCloseTo(start.x + 24 / c.scale, -1);
    expect((await stage(page)).photo!.x).toBeCloseTo(bounds(BOXES.front).x, 6);
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('phone: on the product', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('on the product with no switch; the photo draws behind the artwork; axe; no sideways scroll', async ({ page }) => {
    test.setTimeout(60_000);
    await clearedStandIn(page);
    await open(page);
    await onTheProduct(page);
    const s = await stage(page);
    expect(s.photo).not.toBeNull();
    expect(s.layers.map((l) => l.name)).toEqual(['workspace', 'artwork', 'guides']);
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
