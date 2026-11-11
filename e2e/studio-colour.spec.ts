import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type KonvaNamespace from 'konva';
import { expect, settleAnimations, test } from './fixtures';
import { BOXES, clearedStandIn, FABRIC, INDIGO, MARK_RGB, near, PHOTO, PHOTO_RGB, placed, SHADES } from './product-fixtures';

/**
 * Product colour and masked tint (Phase 4 M3). Real photos and masks stay blocked (rights
 * unconfirmed): these tests serve a cleared stand-in fabric photo and stand-in masks
 * (product-fixtures.ts) — a grey band in shadow, midtone and highlight, masked whole on the front
 * and only its left part on the back — and read the real pixels the tint produces.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const UMBRELLA = '/products/umbrella-golf/design';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const RED = [0xb0, 0x26, 0x2d];
const NAVY = [0x24, 0x30, 0x52];
/** Photo points: on the fabric (shadow, midtone, highlight), off it, and the corner mark. */
const POINTS = { shadow: [300, 700], mid: [560, 700], highlight: [850, 700], off: [560, 900], mark: [50, 50] } as const;

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

async function open(page: Page, url = UMBRELLA) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

const region = (page: Page) => page.getByRole('region', { name: /^Design canvas: / });
const canvasFooter = (page: Page) => region(page).locator('footer');
const swatch = (scope: ReturnType<Page['locator']>, name: string) => scope.getByRole('radiogroup', { name: 'Product colour' }).getByRole('radio', { name });
const side = (page: Page, name: 'Front' | 'Back') => page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: new RegExp(`^${name}`) });
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Layers and properties' });

async function onTheProduct(page: Page, press: 'click' | 'tap' = 'click') {
  await page.getByRole('radiogroup', { name: 'Canvas view' }).getByRole('radio', { name: 'On the product' })[press]();
  await expect(region(page)).toHaveAttribute('data-view', 'product');
  await page.waitForFunction(() => {
    const photo = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))?.findOne<KonvaNamespace.Image>('.product-mockup');
    return Boolean(photo?.image());
  });
}

async function choose(page: Page, name: string, press: 'click' | 'tap' = 'click', scope = canvasFooter(page)) {
  await swatch(scope, name)[press]();
  await expect(swatch(scope, name)).toHaveAttribute('aria-checked', 'true');
}

/** A photo point (photo px) in design px, on a side's placement. */
function designPoint([px, py]: readonly number[], box: readonly number[] = BOXES.front) {
  const p = placed(box);
  return [(px! - p.x) / p.scale, (py! - p.y) / p.scale] as [number, number];
}

/** Pixels from the editor's layers at design points. */
async function editorPixels(page: Page, layer: 'workspace' | 'artwork', points: [number, number][]) {
  return page.evaluate(
    ([name, at]) => {
      const st = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!;
      const canvas = st
        .getLayers()
        .find((l) => l.name() === name)!
        .getCanvas();
      const ratio = canvas.getPixelRatio();
      return at.map(([x, y]) => [...canvas.getContext()._context.getImageData(Math.round((st.x() + x * st.scaleX()) * ratio), Math.round((st.y() + y * st.scaleY()) * ratio), 1, 1).data]);
    },
    [layer, points] as const,
  );
}

/** The photo's own pixels as the editor draws them (the photo image itself, not the screen). */
async function photoPixels(page: Page, points: readonly (readonly number[])[], stageClass = '#studio-canvas') {
  return page.evaluate(
    ([selector, at]) => {
      const st = window.Konva.stages.find((s) => (selector.startsWith('#') ? s.container().closest(selector) : s.container().classList.contains(selector)))!;
      const node = st.findOne<KonvaNamespace.Image>(selector.startsWith('#') ? '.product-mockup' : 'Image')!;
      const source = node.image() as HTMLCanvasElement | HTMLImageElement;
      const c = document.createElement('canvas');
      c.width = 1122;
      c.height = 1402;
      const g = c.getContext('2d')!;
      g.drawImage(source, 0, 0);
      return at.map(([x, y]) => [...g.getImageData(x!, y!, 1, 1).data]);
    },
    [stageClass, points] as const,
  );
}

const lum = (p: number[]) => 0.2126 * p[0]! + 0.7152 * p[1]! + 0.0722 * p[2]!;
const closeTo = (p: number[], rgb: readonly number[], tolerance = 3) => rgb.every((c, i) => Math.abs(p[i]! - c) <= tolerance);
const tinted = (page: Page) => expect(region(page)).toHaveAttribute('data-tint', 'applied', { timeout: 10_000 });

async function setBackground(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Background' }).click();
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

test.describe('desktop: product colour', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('A · the photo’s fabric takes the colour with its shading; everything off the mask, and the artwork, stay exactly as they were', async ({ page }) => {
    await clearedStandIn(page, 'umbrella-golf', { photo: 'fabric', mask: 'cleared' });
    await open(page);
    await setBackground(page, 'Deep indigo');
    await onTheProduct(page);
    // Black is the variant's colour and the photo's own: shown as taken.
    await expect(swatch(canvasFooter(page), 'Black')).toHaveAttribute('aria-checked', 'true');
    await expect(region(page)).toHaveAttribute('data-tint', 'none');
    const points = Object.values(POINTS);
    const before = await photoPixels(page, points);
    expect(before.map((p) => p.slice(0, 3))).toEqual([SHADES.shadow, SHADES.mid, SHADES.highlight, PHOTO_RGB, MARK_RGB]);
    const artworkAt: [number, number][] = [
      [900, 1200],
      [100, 100],
      [1700, 2300],
    ];
    const artworkBefore = await editorPixels(page, 'artwork', artworkAt);
    expect(artworkBefore.every((p) => near(p, INDIGO))).toBe(true);
    expect(mediaRequests.filter((p) => p.endsWith('-mask.png'))).toEqual([]); // not needed until a colour needs it

    await choose(page, 'Red');
    await tinted(page);
    const red = await photoPixels(page, points);
    const [shadow, mid, highlight, off, mark] = red as [number[], number[], number[], number[], number[]];
    // The midtone (the fabric's typical brightness) becomes the colour; shading keeps its order.
    expect(closeTo(mid, RED), String(mid)).toBe(true);
    expect(lum(shadow)).toBeLessThan(lum(mid) - 5);
    expect(lum(highlight)).toBeGreaterThan(lum(mid) + 5);
    for (const p of [shadow, highlight]) expect(p[0]!).toBeGreaterThan(p[1]! + 20); // red, not grey
    // Off the mask and the corner mark: untouched, and alpha everywhere unchanged.
    expect(off).toEqual([...PHOTO_RGB, 255]);
    expect(mark).toEqual([...MARK_RGB, 255]);
    expect(red.every((p) => p[3] === 255)).toBe(true);
    // The screen agrees: the photo layer shows the tint behind the artwork; the artwork is identical.
    const onScreen = await editorPixels(page, 'workspace', [designPoint(POINTS.mid), designPoint(POINTS.off)]);
    expect(closeTo(onScreen[0]!, RED, 6), String(onScreen[0])).toBe(true);
    expect(closeTo(onScreen[1]!, PHOTO_RGB, 3), String(onScreen[1])).toBe(true);
    expect(await editorPixels(page, 'artwork', artworkAt)).toEqual(artworkBefore);
    expect(mediaRequests.filter((p) => p.endsWith('-mask.png'))).toEqual(['/media/studio-fixtures/umbrella-golf-front-mask.png']);

    await choose(page, 'Navy');
    await tinted(page);
    await expect.poll(async () => closeTo((await photoPixels(page, [POINTS.mid]))[0]!, NAVY)).toBe(true);
    // Layers holds the design only.
    const rows = await page.getByRole('list', { name: 'Layers' }).locator('[data-layer-row]').count();
    expect(rows).toBe(0);
  });

  test('B · front and back each use their own mask', async ({ page }) => {
    await clearedStandIn(page, 'umbrella-golf', { photo: 'fabric', mask: 'cleared' });
    await open(page, `${UMBRELLA}?sample=1`);
    await onTheProduct(page);
    await choose(page, 'Red');
    await tinted(page);
    await side(page, 'Back').click();
    await expect(region(page)).toHaveAccessibleName(/^Design canvas: Back, /);
    await tinted(page);
    // The back mask covers only the band's left part (x < 560): the highlight zone stays grey there.
    await expect.poll(async () => (await photoPixels(page, [POINTS.shadow, POINTS.highlight])).map((p) => p.slice(0, 3))).toEqual([expect.anything(), SHADES.highlight]);
    const [backShadow] = await photoPixels(page, [POINTS.shadow]);
    expect(backShadow![0]!).toBeGreaterThan(backShadow![1]! + 20);
    await side(page, 'Front').click();
    await tinted(page);
    await expect.poll(async () => (await photoPixels(page, [POINTS.highlight]))[0]![1]! < SHADES.highlight[1]! - 20).toBe(true);
    expect(mediaRequests.filter((p) => p.endsWith('-mask.png')).sort()).toEqual(['/media/studio-fixtures/umbrella-golf-back-mask.png', '/media/studio-fixtures/umbrella-golf-front-mask.png']);
  });

  test('C · G · editing on a coloured product: move, resize, rotate, add a shape; the tint stays behind; undo undoes the edit, not the colour', async ({ page }) => {
    await clearedStandIn(page, 'umbrella-golf', { photo: 'fabric', mask: 'cleared' });
    await open(page, `${UMBRELLA}?sample=1`);
    await onTheProduct(page);
    const id = await page.evaluate(() =>
      window.Konva.stages
        .find((s) => s.container().closest('#studio-canvas'))!
        .find('.element-text')[0]!
        .id(),
    );
    const box = async () =>
      page.evaluate((elementId) => {
        const g = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!.findOne<KonvaNamespace.Group>(`#${elementId}`)!;
        return { x: g.x() - g.offsetX(), width: g.offsetX() * 2, rotation: g.rotation() };
      }, id);
    const start = await box();
    // Move (drag), then colour, colour.
    const stage = await page.evaluate(() => {
      const st = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!;
      return { x: st.x(), y: st.y(), scale: st.scaleX() };
    });
    const area = (await page.getByTestId('canvas-area').boundingBox())!;
    const el = await page.evaluate((elementId) => {
      const g = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!.findOne<KonvaNamespace.Group>(`#${elementId}`)!;
      return { cx: g.x(), cy: g.y() };
    }, id);
    const from = { x: area.x + stage.x + el.cx * stage.scale, y: area.y + stage.y + el.cy * stage.scale };
    await page.mouse.click(from.x, from.y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y, { steps: 4 });
    await page.mouse.up();
    const moved = await box();
    expect(moved.x).toBeGreaterThan(start.x);
    await choose(page, 'Red');
    await choose(page, 'Navy');
    await tinted(page);
    await page.keyboard.press('Control+z');
    expect((await box()).x).toBeCloseTo(start.x, 6); // the move is undone, not a colour
    await expect(swatch(canvasFooter(page), 'Navy')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Control+y');

    await page.getByRole('list', { name: 'Layers' }).locator('[data-layer-row]').first().click();
    const field = (name: string) => inspector(page).getByRole('textbox', { name });
    await field('W, width').fill('40');
    await field('W, width').press('Enter');
    const rotation = inspector(page).getByRole('textbox', { name: /^Rotation/ });
    await rotation.fill('30');
    await rotation.press('Enter');
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Shapes', exact: true }).click();
    await page.getByRole('button', { name: 'Add rectangle', exact: true }).click();
    await tinted(page);
    // The photo layer still shows the tint, under the artwork layer.
    const layers = await page.evaluate(() =>
      window.Konva.stages
        .find((s) => s.container().closest('#studio-canvas'))!
        .getLayers()
        .map((l) => l.name()),
    );
    expect(layers).toEqual(['workspace', 'artwork', 'guides']);
    expect(closeTo((await photoPixels(page, [POINTS.mid]))[0]!, NAVY)).toBe(true);
  });

  test('D · the Preview shows the same colour with the same pixels, and shares the choice', async ({ page }) => {
    await clearedStandIn(page, 'umbrella-golf', { photo: 'fabric', mask: 'cleared' });
    await open(page, `${UMBRELLA}?sample=1`);
    await onTheProduct(page);
    await choose(page, 'Red');
    await tinted(page);
    const inEditor = await photoPixels(page, Object.values(POINTS));
    await page.getByTestId('preview-button').click();
    const dialog = page.getByRole('dialog', { name: 'Preview' });
    await dialog.getByRole('radiogroup', { name: 'Preview view' }).getByRole('radio', { name: 'On the product' }).click();
    await expect(dialog.getByTestId('preview-area')).toHaveAttribute('data-tint', 'applied');
    await expect(swatch(dialog, 'Red')).toHaveAttribute('aria-checked', 'true');
    await page.waitForFunction(() => window.Konva.stages.some((s) => s.container().classList.contains('studio-product-stage')));
    expect(await photoPixels(page, Object.values(POINTS), 'studio-product-stage')).toEqual(inEditor);
    await choose(page, 'Navy', 'click', dialog);
    await expect.poll(async () => closeTo((await photoPixels(page, [POINTS.mid], 'studio-product-stage'))[0]!, NAVY)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(swatch(canvasFooter(page), 'Navy')).toHaveAttribute('aria-checked', 'true');
  });

  test('E · rights: real photos and masks are never offered or requested; a cleared photo with an unconfirmed mask shows no colours', async ({ page }) => {
    for (const slug of ['umbrella-golf', 'rainwear-waterproof-jacket-standard', 'cap-rain-waterproof']) {
      await open(page, `/products/${slug}/design?sample=1`);
      await expect(page.getByRole('radiogroup', { name: 'Canvas view' }), slug).toHaveCount(0);
      await expect(page.getByRole('radiogroup', { name: 'Product colour' }), slug).toHaveCount(0);
    }
    await clearedStandIn(page, 'umbrella-golf', { photo: 'fabric' }); // the real masks: unconfirmed
    await open(page);
    await onTheProduct(page);
    await expect(page.getByRole('radiogroup', { name: 'Product colour' })).toHaveCount(0);
    await expect(region(page)).toHaveAttribute('data-tint', 'none');
    expect(mediaRequests.filter((p) => p.endsWith('-mask.png') || /\/products\/umbrellas-rainwear-2d\//.test(p))).toEqual([]);
  });

  test('F · colour changes are never saved: no autosave, no version, the stored design is unchanged', async ({ page }) => {
    await clearedStandIn(page, 'umbrella-golf', { photo: 'fabric', mask: 'cleared' });
    await open(page);
    await setBackground(page, 'Deep indigo');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
    const before = JSON.stringify(await storedDesigns(page));
    await onTheProduct(page);
    await choose(page, 'Red');
    await choose(page, 'Navy');
    await tinted(page);
    await page.waitForTimeout(1600); // past the autosave delay: nothing may be written (a negative check)
    const after = JSON.stringify(await storedDesigns(page));
    expect(after).toBe(before);
    for (const word of ['mask', 'tint', 'productColour', '#b0262d', '#243052', 'studio-fixtures', 'mockup']) expect(after, word).not.toContain(word);
    await page.getByRole('button', { name: 'Undo' }).click(); // the background is still the last step
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  test('H · the proof is byte-for-byte the same flat, on the product, and in every colour', async ({ page }) => {
    await clearedStandIn(page, 'umbrella-golf', { photo: 'fabric', mask: 'cleared' });
    await open(page, `${UMBRELLA}?sample=1`);
    const proof = async () => {
      await page.getByTestId('print-check-button').click();
      const dialog = page.getByRole('dialog', { name: 'Print check and proof' });
      const frontOnly = dialog.getByRole('radio', { name: 'Front only' });
      if (await frontOnly.count()) await frontOnly.click();
      const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('download-proof').click()]);
      const file = readFileSync((await (download as Download).path())!);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      return file;
    };
    const flat = await proof();
    await onTheProduct(page);
    const black = await proof();
    await choose(page, 'Red');
    await tinted(page);
    const red = await proof();
    await choose(page, 'Navy');
    await tinted(page);
    const navy = await proof();
    expect(flat.subarray(1, 4).toString()).toBe('PNG');
    for (const file of [black, red, navy]) expect(file.equals(flat)).toBe(true);
  });

  test('axe: the canvas and the Preview with the colour choice', async ({ page }) => {
    test.setTimeout(60_000);
    await clearedStandIn(page, 'umbrella-golf', { photo: 'fabric', mask: 'cleared' });
    await open(page, `${UMBRELLA}?sample=1`);
    await onTheProduct(page);
    await choose(page, 'Red');
    await settleAnimations(page);
    let results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `studio ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    await page.getByTestId('preview-button').click();
    const dialog = page.getByRole('dialog', { name: 'Preview' });
    await dialog.getByRole('radiogroup', { name: 'Preview view' }).getByRole('radio', { name: 'On the product' }).click();
    await expect(swatch(dialog, 'Red')).toBeVisible();
    await settleAnimations(page);
    results = await new AxeBuilder({ page }).include('[data-testid="studio-preview"]').withTags(TAGS).analyze();
    expect(results.violations.map((v) => `preview ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
});

test.describe('every width', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'sizes set here');

  test('1440 to 360 px: the swatches are on screen, usable and marked; nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(90_000);
    await clearedStandIn(page, 'umbrella-golf', { photo: 'fabric', mask: 'cleared' });
    await open(page, `${UMBRELLA}?sample=1`);
    await onTheProduct(page);
    const names = ['Black', 'Navy', 'Red'];
    for (const [i, width] of [1440, 1280, 1024, 820, 768, 600, 430, 390, 375, 360].entries()) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `${width}px` }).toBeLessThanOrEqual(0);
      for (const name of names) {
        const box = (await swatch(canvasFooter(page), name).boundingBox())!;
        expect(box.x, `${width}px ${name}`).toBeGreaterThanOrEqual(-0.5);
        expect(box.x + box.width, `${width}px ${name}`).toBeLessThanOrEqual(width + 0.5);
        expect(box.width, `${width}px ${name}`).toBeGreaterThanOrEqual(36);
      }
      const name = names[i % 3]!;
      await choose(page, name);
      await expect(region(page)).toHaveAttribute('data-tint', name === 'Black' ? 'none' : 'applied', { timeout: 10_000 });
    }
  });
});

test.describe('tablet: product colour by touch', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('44 px swatches; a tap recolours the photo; axe', async ({ page }) => {
    test.setTimeout(60_000);
    await clearedStandIn(page, 'umbrella-golf', { photo: 'fabric', mask: 'cleared' });
    await open(page, `${UMBRELLA}?sample=1`);
    await onTheProduct(page, 'tap');
    for (const name of ['Black', 'Navy', 'Red']) expect((await swatch(canvasFooter(page), name).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await choose(page, 'Red', 'tap');
    await tinted(page);
    expect(closeTo((await photoPixels(page, [POINTS.mid]))[0]!, RED)).toBe(true);
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('phone: product colour', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('the swatches sit in the canvas footer; a tap recolours; axe; no sideways scroll', async ({ page }) => {
    test.setTimeout(60_000);
    await clearedStandIn(page, 'umbrella-golf', { photo: 'fabric', mask: 'cleared' });
    await open(page, `${UMBRELLA}?sample=1`);
    await onTheProduct(page, 'tap');
    await choose(page, 'Navy', 'tap');
    await tinted(page);
    expect(closeTo((await photoPixels(page, [POINTS.mid]))[0]!, NAVY)).toBe(true);
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

// Keep the fixture's geometry in one place (and used): the print area sits on the midtone.
test('fixture geometry: the front print area lies inside the fabric’s midtone band', () => {
  const p = placed(BOXES.front);
  expect(p.x).toBeGreaterThan(420);
  expect(p.x + p.width).toBeLessThan(700);
  expect(p.y).toBeGreaterThan(FABRIC.y0);
  expect(p.y + p.height).toBeLessThan(FABRIC.y1);
  expect(PHOTO.width).toBe(1122);
});
