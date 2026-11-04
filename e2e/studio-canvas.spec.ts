import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { expect, test } from './fixtures';

/**
 * Studio canvas (Phase 3 M5): the real Konva stage, inspected through the global `Konva` object
 * (Konva registers itself on window) and by sampling layer pixels.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const STUDIO = '/products/business-card-classic/design';
const DEMO = '/design-system#canvas-demo';
const layoutOf = (info: TestInfo) => info.project.name as 'desktop' | 'tablet' | 'mobile';

interface StageInfo {
  scale: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

async function waitForStage(page: Page, scope = '#studio-canvas') {
  await page.waitForFunction((s) => Boolean(window.Konva?.stages.some((st) => st.container().closest(s))), scope);
}

async function stageInfo(page: Page, scope = '#studio-canvas'): Promise<StageInfo> {
  await waitForStage(page, scope);
  return page.evaluate((s) => {
    const stage = window.Konva.stages.find((st) => st.container().closest(s))!;
    return { scale: stage.scaleX(), x: stage.x(), y: stage.y(), width: stage.width(), height: stage.height() };
  }, scope);
}

/** RGBA pixels of one layer along a horizontal or vertical run of stage px. */
async function layerPixels(page: Page, layer: string, points: { x: number; y: number }[], scope = '#studio-canvas'): Promise<number[][]> {
  return page.evaluate(
    ({ layer, points, scope }) => {
      const stage = window.Konva.stages.find((st) => st.container().closest(scope))!;
      stage.draw();
      const canvas = stage.findOne<KonvaNamespace.Layer>(`.${layer}`)!.getNativeCanvasElement();
      const ratio = canvas.width / stage.width();
      const ctx = canvas.getContext('2d')!;
      return points.map((p) => [...ctx.getImageData(Math.round(p.x * ratio), Math.round(p.y * ratio), 1, 1).data]);
    },
    { layer, points, scope },
  );
}

const run = (from: number, to: number, at: (v: number) => { x: number; y: number }) => Array.from({ length: to - from + 1 }, (_, i) => at(from + i));
const isDark = ([r, g, b, a]: number[]) => a! > 100 && r! < 90 && g! < 90 && b! < 110;
const isGreen = ([r, g, b, a]: number[]) => a! > 60 && g! > r! + 25 && g! > b!;
const isRed = ([r, g, , a]: number[]) => a! > 60 && r! > 150 && g! < 140;

async function zoomLabel(page: Page) {
  return (await page.getByRole('button', { name: /^Zoom .*view options$/ }).first().textContent())?.trim() ?? '';
}

test.describe('canvas stage', () => {
  test('fills the workspace and fits the sheet at the right proportions', async ({ page }) => {
    await page.goto(STUDIO);
    const s = await stageInfo(page);
    const area = (await page.getByTestId('canvas-area').boundingBox())!;
    expect(Math.abs(s.width - area.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.height - area.height)).toBeLessThanOrEqual(1);
    // Bleed box (−18…1068 × −18…618 print px) is fully inside the area and centred.
    const left = s.x - 18 * s.scale;
    const right = s.x + 1068 * s.scale;
    const top = s.y - 18 * s.scale;
    const bottom = s.y + 618 * s.scale;
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(s.width);
    expect(top).toBeGreaterThan(0);
    expect(bottom).toBeLessThan(s.height);
    expect(Math.abs(left + right - s.width)).toBeLessThan(2);
    // Measurement labels show the finished size; the width label spans the trim.
    await expect(page.getByTestId('measure-width')).toHaveText(/88\.9.mm/);
    await expect(page.getByTestId('measure-height')).toHaveText(/50\.8.mm/);
    const widthLabel = (await page.getByTestId('measure-width').boundingBox())!;
    expect(Math.abs(widthLabel.width - 1050 * s.scale)).toBeLessThan(2);
  });

  test('keeps guides on their own non-printing layer, positioned from the print geometry', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'desktop', 'pixel checks once');
    await page.goto(STUDIO);
    const s = await stageInfo(page);
    const layers = await page.evaluate(() => window.Konva.stages[0]!.getLayers().map((l) => ({ name: l.name(), listening: l.listening() })));
    expect(layers).toEqual([
      { name: 'workspace', listening: false },
      { name: 'artwork', listening: true },
      { name: 'guides', listening: false },
    ]);
    const midY = s.y + 300 * s.scale;
    const across = (designX: number) => run(-3, 3, (d) => ({ x: s.x + designX * s.scale + d, y: midY }));
    const down = (designX: number) => run(-12, 12, (d) => ({ x: s.x + designX * s.scale, y: midY + d }));
    expect((await layerPixels(page, 'guides', across(0))).some(isDark)).toBe(true); // trim at x = 0
    expect((await layerPixels(page, 'guides', across(-18))).some(isRed)).toBe(true); // bleed edge
    expect((await layerPixels(page, 'guides', down(24 - 0.5))).some(isGreen) || (await layerPixels(page, 'guides', down(24))).some(isGreen)).toBe(true); // dashed safe line
    // Nothing is drawn by the guides layer in the middle of the card.
    expect((await layerPixels(page, 'guides', [{ x: s.x + 525 * s.scale, y: midY }]))[0]![3]).toBe(0);
  });

  test('draws every trim shape: rectangle, rounded, oval and circle', async ({ page }, info) => {
    test.skip(layoutOf(info) === 'tablet', 'shape checks on desktop and phone');
    const products = [
      { slug: 'business-card-classic', clippedCorner: false, size: /88\.9.mm/ },
      { slug: 'business-card-rounded-corner', clippedCorner: true, size: /88\.9.mm/ },
      { slug: 'business-card-oval', clippedCorner: true, size: /91\.4.mm/ },
      { slug: 'business-card-circle', clippedCorner: true, size: /59\.3.mm/ },
    ];
    for (const product of products) {
      await page.goto(`/products/${product.slug}/design`);
      const s = await stageInfo(page);
      await expect(page.getByTestId('measure-width')).toHaveText(product.size);
      // The bleed box's top-left corner (just inside) is paper on a rectangle and clipped away on the others.
      const [corner] = await layerPixels(page, 'artwork', [{ x: s.x - 18 * s.scale + 2, y: s.y - 18 * s.scale + 2 }]);
      expect(corner![3] > 200, product.slug).toBe(!product.clippedCorner);
      // The centre is always paper.
      const [centre] = await layerPixels(page, 'artwork', [{ x: s.width / 2, y: s.height / 2 }]);
      expect(centre![3], product.slug).toBe(255);
    }
  });

  test('handles very large and very small print areas', async ({ page }) => {
    await page.goto('/products/flyer-canopy-tent/design'); // 152 × 57 cm at 150 DPI
    const large = await stageInfo(page);
    expect(9000 * large.scale).toBeLessThan(large.width);
    expect(Number.parseFloat(await zoomLabel(page))).toBeLessThan(30);
    await page.goto('/products/stamp-date/design'); // 51 × 17 mm
    const small = await stageInfo(page);
    expect(600 * small.scale).toBeLessThan(small.width);
    expect(Number.parseFloat(await zoomLabel(page))).toBeGreaterThan(100);
  });
});

test.describe('zoom', () => {
  test('steps in and out within 10–400 %, fits and shows real size', async ({ page }, info) => {
    test.skip(layoutOf(info) === 'mobile', 'pill tested separately');
    await page.goto(STUDIO);
    await waitForStage(page);
    const fitted = await zoomLabel(page);
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    while (await zoomIn.isEnabled()) await zoomIn.click();
    expect(await zoomLabel(page)).toBe('400%');
    while (await zoomOut.isEnabled()) await zoomOut.click();
    expect(await zoomLabel(page)).toBe('10%');

    await page.getByRole('button', { name: /^Zoom .*view options$/ }).click();
    await page.getByRole('menuitem', { name: 'Fit to screen' }).click();
    expect(await zoomLabel(page)).toBe(fitted);
    await page.getByRole('button', { name: /^Zoom .*view options$/ }).click();
    await page.getByRole('menuitem', { name: 'Actual size (100%)' }).click();
    expect(await zoomLabel(page)).toBe('100%');

    await page.keyboard.press('Shift+Digit1');
    expect(await zoomLabel(page)).toBe(fitted);
    await page.keyboard.press('Control+Equal');
    expect(Number.parseFloat(await zoomLabel(page))).toBeGreaterThan(Number.parseFloat(fitted));
    await page.keyboard.press('Control+Digit0');
    expect(await zoomLabel(page)).toBe('100%');
  });

  test('phones have a floating zoom control over the canvas', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'mobile', 'phone layout');
    await page.goto(STUDIO);
    await waitForStage(page);
    const pill = page.getByTestId('canvas-area');
    const before = await zoomLabel(page);
    await pill.getByRole('button', { name: 'Zoom in' }).click();
    expect(Number.parseFloat(await zoomLabel(page))).toBeGreaterThan(Number.parseFloat(before));
  });

  test('Ctrl + wheel zooms around the pointer; the wheel and dragging pan', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'desktop', 'mouse');
    await page.goto(STUDIO);
    const area = (await page.getByTestId('canvas-area').boundingBox())!;
    const before = await stageInfo(page);
    const pointer = { x: area.x + area.width * 0.3, y: area.y + area.height * 0.4 };
    const designUnder = (s: StageInfo) => ({ x: (pointer.x - area.x - s.x) / s.scale, y: (pointer.y - area.y - s.y) / s.scale });

    await page.mouse.move(pointer.x, pointer.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await stageInfo(page)).scale).toBeGreaterThan(before.scale * 1.2);
    const zoomed = await stageInfo(page);
    expect(designUnder(zoomed).x).toBeCloseTo(designUnder(before).x, 0);
    expect(designUnder(zoomed).y).toBeCloseTo(designUnder(before).y, 0);

    await page.mouse.wheel(0, 120);
    await expect.poll(async () => (await stageInfo(page)).y).toBeCloseTo(zoomed.y - 120, 0);

    const panned = await stageInfo(page);
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down();
    await page.mouse.move(pointer.x + 80, pointer.y + 40, { steps: 4 });
    await page.mouse.up();
    const dragged = await stageInfo(page);
    expect(dragged.x).toBeCloseTo(panned.x + 80, 0);
    expect(dragged.y).toBeCloseTo(panned.y + 40, 0);
  });

  test('touch: one finger pans, two fingers pinch-zoom', async ({ page }, info) => {
    test.skip(layoutOf(info) === 'desktop', 'touch devices');
    await page.goto(STUDIO);
    const area = (await page.getByTestId('canvas-area').boundingBox())!;
    const before = await stageInfo(page);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: area.x + p.x, y: area.y + p.y, id })) });
    const cx = area.width / 2;
    const cy = area.height / 2;

    await touch('touchStart', [{ x: cx, y: cy }]);
    for (let i = 1; i <= 5; i += 1) await touch('touchMove', [{ x: cx + i * 10, y: cy + i * 6 }]);
    await touch('touchEnd', []);
    const panned = await stageInfo(page);
    expect(panned.x).toBeCloseTo(before.x + 50, 0);
    expect(panned.y).toBeCloseTo(before.y + 30, 0);

    await touch('touchStart', [{ x: cx - 40, y: cy }, { x: cx + 40, y: cy }]);
    for (let i = 1; i <= 6; i += 1) await touch('touchMove', [{ x: cx - 40 - i * 10, y: cy }, { x: cx + 40 + i * 10, y: cy }]);
    await touch('touchEnd', []);
    const pinched = await stageInfo(page);
    expect(pinched.scale / panned.scale).toBeGreaterThan(1.6); // 80 px → 200 px apart
  });

  test('keeps the view when the window resizes', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'desktop', 'resizable window');
    await page.goto(STUDIO);
    await stageInfo(page);
    await page.setViewportSize({ width: 1300, height: 820 });
    await expect
      .poll(async () => {
        const s = await stageInfo(page);
        const left = s.x - 18 * s.scale;
        const right = s.x + 1068 * s.scale;
        return Math.abs(left + right - s.width) < 2 && left > 0;
      })
      .toBe(true);
    // Closing the docked panel widens the canvas; the sheet re-fits.
    const narrow = (await stageInfo(page)).width;
    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect.poll(async () => (await stageInfo(page)).width).toBeGreaterThan(narrow + 200);
  });
});

test.describe('front and back', () => {
  test('switching sides keeps the zoom', async ({ page }) => {
    await page.goto(STUDIO);
    await waitForStage(page);
    const zoomIn = page.getByRole('button', { name: 'Zoom in' }).first();
    await zoomIn.click();
    const zoomed = await zoomLabel(page);
    await page.getByRole('radio', { name: 'Back, 0 items' }).click();
    await expect(page.getByRole('region', { name: /^Design canvas: Back/ })).toBeVisible();
    expect(await zoomLabel(page)).toBe(zoomed);
  });
});

test.describe('rendering a design (sample card on /design-system)', () => {
  test.skip(({ isMobile }) => isMobile, 'reference page demo');

  async function elementIds(page: Page) {
    return page.evaluate(() => {
      const stage = window.Konva.stages.find((st) => st.container().closest('#canvas-demo'))!;
      return stage.find('.element').map((n) => n.id());
    });
  }

  test('draws each side’s elements, keeps both sides, and leaves hidden layers out', async ({ page }) => {
    await page.goto(DEMO);
    const demo = page.locator('#canvas-demo');
    await waitForStage(page, '#canvas-demo');
    expect(await elementIds(page)).toEqual(['el_band', 'el_name', 'el_title', 'el_contact', 'el_logo', 'el_star']); // el_hidden is hidden
    const name = await page.evaluate(() => {
      const stage = window.Konva.stages.find((st) => st.container().closest('#canvas-demo'))!;
      const group = stage.findOne<KonvaNamespace.Group>('#el_name')!;
      const text = group.findOne<KonvaNamespace.Text>('Text')!;
      return { x: group.x(), y: group.y(), text: text.text(), fontSize: text.fontSize(), fontStyle: text.fontStyle() };
    });
    expect(name).toEqual({ x: 70 + 310, y: 70 + 45, text: 'Riya Sharma', fontSize: 75, fontStyle: '700' });

    await demo.getByRole('radio', { name: 'Back, 5 items' }).click();
    await expect.poll(() => elementIds(page)).toEqual(['el_ring', 'el_triangle', 'el_rule', 'el_arrow', 'el_thanks']);
    await demo.getByRole('radio', { name: 'Front, 7 items' }).click();
    await expect.poll(() => elementIds(page)).toEqual(['el_band', 'el_name', 'el_title', 'el_contact', 'el_logo', 'el_star']);
  });

  test('clips artwork to every trim shape', async ({ page }) => {
    await page.goto(DEMO);
    const demo = page.locator('#canvas-demo');
    await waitForStage(page, '#canvas-demo');
    for (const shape of ['Rounded', 'Oval', 'Circle', 'Rectangle']) {
      await demo.getByRole('radio', { name: shape }).click();
      const s = await stageInfo(page, '#canvas-demo');
      const width = shape === 'Oval' ? 1080 : shape === 'Circle' ? 700 : 1050;
      await expect(demo.getByTestId('measure-width')).toHaveText(shape === 'Oval' ? /91\.4.mm/ : shape === 'Circle' ? /59\.3.mm/ : /88\.9.mm/);
      const [corner] = await layerPixels(page, 'artwork', [{ x: s.x - 18 * s.scale + 2, y: s.y - 18 * s.scale + 2 }], '#canvas-demo');
      expect(corner![3] > 200, shape).toBe(shape === 'Rectangle');
      expect(width).toBeGreaterThan(0);
    }
  });

  test('exports artwork without any guides', async ({ page }) => {
    await page.goto(DEMO);
    const demo = page.locator('#canvas-demo');
    await waitForStage(page, '#canvas-demo');
    await demo.getByRole('button', { name: 'Show printable artwork' }).click();
    const img = demo.getByTestId('artwork-export');
    await expect(img).toBeVisible();
    // Half print resolution: bleed box 1086 × 636 → 543 × 318 px; the trim line would sit at x = 9.
    const result = await img.evaluate(async (el: HTMLImageElement) => {
      await el.decode();
      const canvas = document.createElement('canvas');
      canvas.width = el.naturalWidth;
      canvas.height = el.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(el, 0, 0);
      const px = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
      return { width: el.naturalWidth, height: el.naturalHeight, trim: px(9, 120), safe: px(21, 120), bleed: px(1, 120), paper: px(200, 120) };
    });
    expect([result.width, result.height]).toEqual([543, 318]);
    // Background colour #f6f3ec everywhere a guide would be: no trim (dark), safe (green) or bleed (red) lines.
    for (const sample of [result.trim, result.safe, result.bleed]) expect(sample).toEqual(result.paper);
    expect(result.paper.slice(0, 3)).toEqual([0xf6, 0xf3, 0xec]);
  });
});

test.describe('accessibility', () => {
  test('canvas, zoom menu and announcements pass axe and are labelled', async ({ page }) => {
    await page.goto(STUDIO);
    await waitForStage(page);
    await expect(page.getByRole('region', { name: /^Design canvas: Front, 88\.9.×.50\.8.mm$/ })).toBeVisible();
    const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
    const summary = (r: Awaited<ReturnType<AxeBuilder['analyze']>>) => r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
    const menuButton = page.getByRole('button', { name: /^Zoom .*view options$/ });
    await page.getByRole('button', { name: 'Zoom in' }).first().click();
    await expect(page.getByText(/^Zoom \d+(\.\d)?%$/)).toBeAttached(); // polite live region
    // The open menu is modal (the rest of the page is hidden from assistive tech), so check it on its own.
    await menuButton.click();
    await expect(page.getByRole('menuitemcheckbox', { name: /Show print guides/ })).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(250);
    expect(summary(await new AxeBuilder({ page }).include('[role="menu"]').withTags(tags).analyze())).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(menuButton).toBeFocused();
    expect(summary(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
  });

  test('guides can be hidden and the choice is remembered', async ({ page }, info) => {
    test.skip(layoutOf(info) === 'mobile', 'keyboard');
    await page.goto(STUDIO);
    await waitForStage(page);
    await page.keyboard.press('Control+Semicolon');
    await expect(page.getByTestId('measurements')).toHaveCount(0);
    expect(await page.evaluate(() => window.Konva.stages[0]!.findOne('.guides')!.visible())).toBe(false);
    await page.reload();
    await waitForStage(page);
    expect(await page.evaluate(() => window.Konva.stages[0]!.findOne('.guides')!.visible())).toBe(false);
    await page.keyboard.press('Control+Semicolon');
    await expect(page.getByTestId('measurements')).toBeVisible();
  });
});
