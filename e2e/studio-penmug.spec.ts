import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type KonvaNamespace from 'konva';
import { expect, settleAnimations, test, openTool } from './fixtures';
import { clearedStandIn, INDIGO, MARK_RGB, MUG_RGB, near, PEN_RGB, placed } from './product-fixtures';

/**
 * Pens and mugs on the product (Phase 4 M4). Real photos stay blocked (rights unconfirmed): these
 * tests serve cleared stand-ins (product-fixtures.ts) — a pen photo coloured differently front and
 * back, and a paired mug photo whose halves differ — and read the pixels the editor and Preview draw.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const PEN = '/products/pen-ballpoint-classic/design';
const MUG = '/products/gift-mug-custom-black/design';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
/** The original's boxes, [centerX, centerY, maxWidth, maxHeight] in frame px, and the print areas. */
const PEN_BOX = [1160, 350, 700, 104] as const;
const PEN_PRINT = { width: 1200, height: 240 };
const MUG_BOX = [450, 515, 390, 245] as const;
const MUG_PRINT = { width: 2700, height: 1050 };

let errors: string[] = [];
let mediaRequests: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  mediaRequests = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => {
    if (r.url().includes('/media/')) mediaRequests.push(new URL(r.url()).pathname);
  });
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

const region = (page: Page) => page.getByRole('region', { name: /^Design canvas: / });
const canvasChoice = (page: Page) => page.getByRole('radiogroup', { name: 'Canvas view' });
const side = (page: Page, name: 'Front' | 'Back') => page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: new RegExp(`^${name}`) });
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Layers and properties' });

/** Pens and mugs are on the product only (M4-C): they open there, with no Flat switch. */
async function onTheProduct(page: Page) {
  await expect(region(page)).toHaveAttribute('data-view', 'product');
  await expect(canvasChoice(page)).toHaveCount(0);
  await page.waitForFunction(() =>
    Boolean(
      window.Konva.stages
        .find((s) => s.container().closest('#studio-canvas'))
        ?.findOne<KonvaNamespace.Image>('.product-mockup')
        ?.image(),
    ),
  );
}

/** A frame point (photo px of the original's frame) in design px. */
function designPoint([fx, fy]: readonly number[], box: readonly number[], print: { width: number; height: number }) {
  const p = placed(box, print);
  return [(fx! - p.x) / p.scale, (fy! - p.y) / p.scale] as [number, number];
}

/** The editor stage: pixels per layer at design points, and the photo node's place and crop. */
async function editor(page: Page, points: [number, number][] = []) {
  return page.evaluate((at) => {
    const st = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!;
    const sample = (name: string, [x, y]: [number, number]) => {
      const canvas = st
        .getLayers()
        .find((l) => l.name() === name)!
        .getCanvas();
      const ratio = canvas.getPixelRatio();
      return [...canvas.getContext()._context.getImageData(Math.round((st.x() + x * st.scaleX()) * ratio), Math.round((st.y() + y * st.scaleY()) * ratio), 1, 1).data];
    };
    const photo = st.findOne<KonvaNamespace.Image>('.product-mockup');
    return {
      photo: photo ? { x: photo.x(), y: photo.y(), width: photo.width(), height: photo.height(), crop: photo.crop(), listening: photo.listening() } : null,
      workspace: at.map((p) => sample('workspace', p)),
      artwork: at.map((p) => sample('artwork', p)),
    };
  }, points);
}

async function setBackground(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Background' }).click();
  await page.getByRole('complementary', { name: 'Background' }).getByRole('button', { name }).click();
}

async function addHeading(page: Page, text: string) {
  await openTool(page, 'Text');
  await page.getByRole('button', { name: 'Add heading' }).click();
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
}

async function proof(page: Page) {
  await page.getByTestId('print-check-button').click();
  const dialog = page.getByRole('dialog', { name: 'Print check and proof' });
  const frontOnly = dialog.getByRole('radio', { name: 'Front only' });
  if (await frontOnly.count()) await frontOnly.click();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('download-proof').click()]);
  const file = readFileSync((await (download as Download).path())!);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  return file;
}

test.describe('desktop: pens', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('A · the pen photo fills its 2000 × 700 frame; the artwork sits exactly in the original box (pixels); editing stays aligned', async ({ page }) => {
    await clearedStandIn(page, 'pen-ballpoint-classic', { photo: 'pen' });
    await open(page, PEN);
    await setBackground(page, 'Deep indigo');
    await onTheProduct(page);
    const box = placed(PEN_BOX, PEN_PRINT); // 520 × 104 at (900, 298)
    expect([box.x, box.y, box.width, box.height]).toEqual([900, 298, 520, 104]);
    const inset = 3 / (await page.evaluate(() => window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!.scaleX()));
    const s = await editor(page, [
      designPoint([1800, 600], PEN_BOX, PEN_PRINT), // the photo, away from the print area
      designPoint([20, 20], PEN_BOX, PEN_PRINT), // the corner mark (image 0–100 px → frame 0–94 px)
      [inset, inset],
      [1200 - inset, 240 - inset],
      [-inset, 120],
      [1200 + inset, 120],
      [600, -inset],
      [600, 240 + inset],
    ]);
    const frame = designPoint([0, 0], PEN_BOX, PEN_PRINT);
    expect(s.photo).toMatchObject({
      listening: false,
      x: expect.closeTo(frame[0], 6),
      y: expect.closeTo(frame[1], 6),
      width: expect.closeTo(2000 / box.scale, 6),
      height: expect.closeTo(700 / box.scale, 6),
    });
    expect(near(s.workspace[0]!, PEN_RGB.front), String(s.workspace[0])).toBe(true);
    expect(near(s.workspace[1]!, MARK_RGB), String(s.workspace[1])).toBe(true);
    for (const inside of s.artwork.slice(2, 4)) expect(near(inside, INDIGO), String(inside)).toBe(true);
    for (const outside of s.artwork.slice(4)) expect(outside[3], String(outside)).toBe(0);
    expect(mediaRequests.filter((p) => p.includes('studio-fixtures'))).toEqual(['/media/studio-fixtures/pen-ballpoint-classic-front.png']);

    // Edit on the pen: add, move by field, resize, rotate — print px throughout; the photo never moves.
    await addHeading(page, 'Aara Print');
    const field = (name: string | RegExp) => inspector(page).getByRole('textbox', { name });
    for (const [name, value] of [
      ['X, from the left trim edge', '10'],
      ['W, width', '40'],
    ] as const) {
      await field(name).fill(value);
      await field(name).press('Enter');
    }
    await field(/^Rotation/).fill('15');
    await field(/^Rotation/).press('Enter');
    const element = await page.evaluate(() => {
      const g = window.Konva.stages
        .find((st) => st.container().closest('#studio-canvas'))!
        .find('.element-text')
        .at(-1) as KonvaNamespace.Group;
      return { x: g.x() - g.offsetX(), width: g.offsetX() * 2, rotation: g.rotation() };
    });
    expect(element.x).toBeCloseTo((10 / 25.4) * 300, 0);
    expect(element.width).toBeCloseTo((40 / 25.4) * 300, 0);
    expect(element.rotation).toBe(15);
    expect((await editor(page)).photo).toEqual(s.photo);
    await page.getByRole('button', { name: 'Undo' }).click(); // the rotation field still has focus
    expect(
      await page.evaluate(() =>
        (
          window.Konva.stages
            .find((st) => st.container().closest('#studio-canvas'))!
            .find('.element-text')
            .at(-1) as KonvaNamespace.Group
        ).rotation(),
      ),
    ).toBe(0);
    const rows = await page
      .getByRole('list', { name: 'Layers' })
      .locator('[data-layer-row]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    expect(rows).toHaveLength(1);
  });

  test('B · front and back: the back photo; editing the back leaves the front alone', async ({ page }) => {
    await clearedStandIn(page, 'pen-ballpoint-classic', { photo: 'pen' });
    await open(page, `${PEN}?sample=1`);
    await onTheProduct(page);
    const ids = async () =>
      page.evaluate(() =>
        window.Konva.stages
          .find((s) => s.container().closest('#studio-canvas'))!
          .find('.element')
          .map((n) => `${n.id()}:${Math.round(n.x())}:${Math.round(n.y())}`),
      );
    const front = await ids();
    await side(page, 'Back').click();
    await expect(region(page)).toHaveAccessibleName(/^Design canvas: Back, .+, on the product$/);
    await expect.poll(async () => near((await editor(page, [designPoint([1800, 600], PEN_BOX, PEN_PRINT)])).workspace[0]!, PEN_RGB.back)).toBe(true);
    await addHeading(page, 'Back of the pen');
    await side(page, 'Front').click();
    await expect.poll(async () => near((await editor(page, [designPoint([1800, 600], PEN_BOX, PEN_PRINT)])).workspace[0]!, PEN_RGB.front)).toBe(true);
    expect(await ids()).toEqual(front);
    expect(mediaRequests.filter((p) => p.includes('studio-fixtures'))).toEqual(['/media/studio-fixtures/pen-ballpoint-classic-front.png', '/media/studio-fixtures/pen-ballpoint-classic-back.png']);
  });
});

test.describe('desktop: mugs', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('C · D · one paired photo: the front shows its left half, the back its right half drawn 176 px in (pixels); the artwork at the box', async ({ page }) => {
    await clearedStandIn(page, 'gift-mug-custom-black', { photo: 'mug' });
    await open(page, MUG);
    await setBackground(page, 'Deep indigo');
    await onTheProduct(page);
    const box = placed(MUG_BOX, MUG_PRINT);
    const inset = 3 / (await page.evaluate(() => window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!.scaleX()));
    const points: [number, number][] = [
      designPoint([100, 1000], MUG_BOX, MUG_PRINT), // left part of the frame
      designPoint([800, 1000], MUG_BOX, MUG_PRINT), // right part of the frame
      designPoint([20, 20], MUG_BOX, MUG_PRINT), // a half's corner mark (front: at frame x 0)
      [inset, inset],
      [2700 - inset, 1050 - inset],
      [-inset, 525],
      [2700 + inset, 525],
    ];
    const front = await editor(page, points);
    expect(front.photo!.crop).toEqual({ x: 0, y: 0, width: 724, height: 1086 });
    expect(near(front.workspace[0]!, MUG_RGB.front), String(front.workspace[0])).toBe(true);
    expect(front.workspace[1]![3]).toBe(0); // the front half ends at frame x 724: nothing drawn beyond
    expect(near(front.workspace[2]!, MARK_RGB)).toBe(true);
    for (const inside of front.artwork.slice(3, 5)) expect(near(inside, INDIGO), String(inside)).toBe(true);
    for (const outside of front.artwork.slice(5)) expect(outside[3]).toBe(0);
    expect(box.x).toBeCloseTo(255, 9);

    await side(page, 'Back').click();
    await expect.poll(async () => (await editor(page)).photo?.crop?.x).toBe(724);
    const back = await editor(page, points);
    expect(back.workspace[0]![3]).toBe(0); // the back half starts at frame x 176
    expect(near(back.workspace[1]!, MUG_RGB.back), String(back.workspace[1])).toBe(true);
    expect(back.photo!.x - front.photo!.x).toBeCloseTo(176 / box.scale, 6);
    // One paired photo for both sides, loaded once.
    expect(mediaRequests.filter((p) => p.includes('studio-fixtures'))).toEqual(['/media/studio-fixtures/gift-mug-custom-black-paired.png']);
  });

  test('E · the Preview draws the same photo, crop and box as the editor, front and back', async ({ page }) => {
    await clearedStandIn(page, 'gift-mug-custom-black', { photo: 'mug' });
    await open(page, `${MUG}?sample=1`);
    await page.getByTestId('preview-button').click();
    const dialog = page.getByRole('dialog', { name: 'Preview' });
    await expect(dialog.getByRole('radiogroup', { name: 'Preview view' })).toHaveCount(0);
    await page.waitForFunction(() => window.Konva.stages.some((s) => s.container().classList.contains('studio-product-stage')));
    const preview = () =>
      page.evaluate(() => {
        const st = window.Konva.stages.find((s) => s.container().classList.contains('studio-product-stage'))!;
        const photo = st.findOne<KonvaNamespace.Image>('Image')!;
        const group = st.findOne('.artwork-clip')!.getParent()!;
        const canvas = st.getLayers()[0]!.getCanvas();
        const ratio = canvas.getPixelRatio();
        const px = (x: number, y: number) => [...canvas.getContext()._context.getImageData(Math.round((st.x() + x * st.scaleX()) * ratio), Math.round((st.y() + y * st.scaleY()) * ratio), 1, 1).data];
        return {
          at: { x: photo.x(), y: photo.y(), width: photo.width(), height: photo.height() },
          crop: photo.crop(),
          group: { x: group.x(), y: group.y(), scale: group.scaleX() },
          left: px(100, 1000),
          right: px(800, 1000),
        };
      });
    const box = placed(MUG_BOX, MUG_PRINT);
    const front = await preview();
    expect(front).toMatchObject({ at: { x: 0, y: 0, width: 724, height: 1086 }, crop: { x: 0, y: 0, width: 724, height: 1086 } });
    expect(front.group.x).toBeCloseTo(box.x, 9);
    expect(front.group.y).toBeCloseTo(box.y, 9);
    expect(front.group.scale).toBeCloseTo(box.scale, 12);
    expect(near(front.left, MUG_RGB.front)).toBe(true);
    expect(front.right[3]).toBe(0);
    await dialog.getByRole('radiogroup', { name: 'Side to preview' }).getByRole('radio', { name: /^Back/ }).click();
    await expect.poll(async () => (await preview()).at.x).toBe(176);
    const back = await preview();
    expect(back.crop).toEqual({ x: 724, y: 0, width: 724, height: 1086 });
    expect(near(back.right, MUG_RGB.back)).toBe(true);
  });
});

test.describe('desktop: rights, saving and proofs', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('F · real pen and mug photos (rights unconfirmed) are never offered or requested; unrecovered ones stay flat', async ({ page }) => {
    for (const slug of ['pen-ballpoint-classic', 'pen-gold-click', 'gift-mug-custom-black', 'mug-classic-photo', 'pen-recycled-paper']) {
      await open(page, `/products/${slug}/design?sample=1`);
      await expect(canvasChoice(page), slug).toHaveCount(0);
      await expect(region(page), slug).toHaveAttribute('data-view', 'flat');
    }
    expect(mediaRequests.filter((p) => /\/products\/(pens|mugs)-2d\//.test(p))).toEqual([]);
  });

  test('G · edits on a pen autosave and come back after a reload; no view, photo or frame is saved', async ({ page }) => {
    test.setTimeout(60_000); // a new design, an autosave and a full reload, like the M2 save test
    await clearedStandIn(page, 'pen-ballpoint-classic', { photo: 'pen' });
    await open(page, PEN);
    await onTheProduct(page);
    await addHeading(page, 'Saved on the pen');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
    const stored = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const req = indexedDB.open('aaraprint-studio');
          req.onsuccess = () => {
            const tx = req.result.transaction(['designs', 'versions'], 'readonly');
            const d = tx.objectStore('designs').getAll();
            const v = tx.objectStore('versions').getAll();
            tx.oncomplete = () => {
              req.result.close();
              resolve(JSON.stringify([d.result, v.result]));
            };
          };
        }),
    );
    for (const word of ['studio-fixtures', 'pens-2d', 'photoFrame', 'productView', 'mockup', 'data:image', 'blob:']) expect(stored, word).not.toContain(word);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.Konva.stages
            .find((s) => s.container().closest('#studio-canvas'))!
            .find('Text')
            .map((t) => (t as KonvaNamespace.Text).text()),
        ),
      )
      .toEqual(['Saved on the pen']);
    // A new session opens on the product (M4 product-first); the view itself was never saved.
    await expect(region(page)).toHaveAttribute('data-view', 'product');
  });

  test('H · proofs are byte-for-byte the same flat and on the product, for a pen and a mug', async ({ page }) => {
    test.setTimeout(60_000);
    for (const [slug, url] of [
      ['pen-ballpoint-classic', PEN],
      ['gift-mug-custom-black', MUG],
    ] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await open(page, `${url}?sample=1`);
      await expect(region(page), slug).toHaveAttribute('data-view', 'flat');
      const flat = await proof(page);
      await clearedStandIn(page, slug, { photo: slug.startsWith('pen') ? 'pen' : 'mug' });
      await open(page, `${url}?sample=1`);
      await onTheProduct(page);
      const onProduct = await proof(page);
      expect(flat.subarray(1, 4).toString(), slug).toBe('PNG');
      expect(onProduct.equals(flat), slug).toBe(true);
    }
  });

  test('axe: a pen and a mug on the product, in the canvas and the Preview', async ({ page }) => {
    test.setTimeout(60_000);
    for (const [slug, url, photo] of [
      ['pen-ballpoint-classic', PEN, 'pen'],
      ['gift-mug-custom-black', MUG, 'mug'],
    ] as const) {
      await clearedStandIn(page, slug, { photo });
      await open(page, `${url}?sample=1`);
      await onTheProduct(page);
      await settleAnimations(page);
      let results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(results.violations.map((v) => `${slug} studio ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      await page.getByTestId('preview-button').click();
      await expect(page.getByRole('dialog', { name: 'Preview' }).getByRole('radiogroup', { name: 'Preview view' })).toHaveCount(0);
      await page.waitForFunction(() => window.Konva.stages.some((s) => s.container().classList.contains('studio-product-stage')));
      await settleAnimations(page);
      results = await new AxeBuilder({ page }).include('[data-testid="studio-preview"]').withTags(TAGS).analyze();
      expect(results.violations.map((v) => `${slug} preview ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('I · every width', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'sizes set here');

  test('1440 to 360 px, pen and mug: the photo fits, there is no view switch, sides switch, nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(120_000);
    for (const [slug, url, photo] of [
      ['pen-ballpoint-classic', PEN, 'pen'],
      ['gift-mug-custom-black', MUG, 'mug'],
    ] as const) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await clearedStandIn(page, slug, { photo });
      await open(page, `${url}?sample=1`);
      await onTheProduct(page);
      for (const width of [1440, 1280, 1024, 820, 768, 600, 430, 390, 375, 360]) {
        await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
        const label = `${slug} ${width}px`;
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: label }).toBeLessThanOrEqual(0);
        await expect(canvasChoice(page), label).toHaveCount(0);
        await expect(region(page), label).toHaveAttribute('data-view', 'product');
        await page.keyboard.press('Shift+Digit1');
        const area = (await page.getByTestId('canvas-area').boundingBox())!;
        const st = await page.evaluate(() => {
          const s = window.Konva.stages.find((x) => x.container().closest('#studio-canvas'))!;
          return { x: s.x(), scale: s.scaleX(), bounds: s.findOne('.product-mockup') ? true : false };
        });
        expect(st.bounds, label).toBe(true);
        const left = st.x + designPoint([0, 0], slug.startsWith('pen') ? PEN_BOX : MUG_BOX, slug.startsWith('pen') ? PEN_PRINT : MUG_PRINT)[0] * st.scale;
        expect(left, label).toBeGreaterThanOrEqual(-0.5);
        expect(left, label).toBeLessThan(area.width);
      }
      await side(page, 'Back').click();
      await expect(region(page)).toHaveAccessibleName(/^Design canvas: Back, .+, on the product$/);
    }
  });
});

test.describe('tablet: pens and mugs by touch', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('on the product with no switch; tap the sides; the photo draws; axe', async ({ page }) => {
    test.setTimeout(60_000);
    await clearedStandIn(page, 'gift-mug-custom-black', { photo: 'mug' });
    await open(page, `${MUG}?sample=1`);
    await onTheProduct(page);
    await side(page, 'Back').tap();
    await expect.poll(async () => (await editor(page)).photo?.crop?.x).toBe(724);
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('phone: pens and mugs', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('a pen opens on the product with no switch; the photo draws; axe; no sideways scroll', async ({ page }) => {
    test.setTimeout(60_000);
    await clearedStandIn(page, 'pen-ballpoint-classic', { photo: 'pen' });
    await open(page, `${PEN}?sample=1`);
    await onTheProduct(page);
    expect(near((await editor(page, [designPoint([1800, 600], PEN_BOX, PEN_PRINT)])).workspace[0]!, PEN_RGB.front)).toBe(true);
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
