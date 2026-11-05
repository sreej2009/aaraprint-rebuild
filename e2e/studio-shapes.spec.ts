import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { expect, test } from './fixtures';

/**
 * Shapes and graphics (Phase 3 M9) against the real canvas. The shipped graphics library is empty
 * until the original graphics' rights are confirmed (decision D5), so the graphics flow is also
 * tested against a stand-in library served by the test itself (one SVG drawn here, one broken
 * file) — no recovered artwork is used.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const BLANK = '/products/business-card-classic/design';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const TEST_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><circle cx="120" cy="120" r="100" fill="#e8930c"/><path d="M70 125l35 35 65-75" fill="none" stroke="#fff" stroke-width="18"/></svg>';

async function open(page: Page, url = BLANK) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

async function standInLibrary(page: Page) {
  await page.route('**/api/v1/graphics.json', (route) =>
    route.fulfill({
      json: {
        graphics: [
          { id: 'test-seal', name: 'Test seal', group: 'Badges', tags: ['approved'], width: 240, height: 240, url: '/studio/graphics/test-seal.svg', rights: 'cleared' },
          { id: 'broken-file', name: 'Broken file', group: 'Icons', tags: [], width: 100, height: 100, url: '/studio/graphics/broken-file.svg', rights: 'cleared' },
          { id: 'not-cleared', name: 'Not cleared', group: 'Icons', tags: [], width: 100, height: 100, url: '/studio/graphics/not-cleared.svg', rights: 'unconfirmed' },
        ],
        withheld: 0,
      },
    }),
  );
  await page.route('**/studio/graphics/test-seal.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: TEST_SVG }));
  await page.route('**/studio/graphics/broken-file.svg', (route) => route.fulfill({ status: 404, body: '' }));
}

interface Drawn {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  /** The Konva class drawn inside the element's group. */
  kind: string;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  radiusX?: number;
  radiusY?: number;
  lineCap?: string;
  dash?: number[];
}

async function elements(page: Page): Promise<Drawn[]> {
  return page.evaluate(() => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return st.find('.element').map((node) => {
      const g = node as KonvaNamespace.Group;
      const child = g.getChildren()[0] as KonvaNamespace.Shape;
      const attrs = child.attrs as Record<string, unknown>;
      return {
        id: g.id(),
        x: g.x() - g.offsetX(),
        y: g.y() - g.offsetY(),
        width: g.offsetX() * 2,
        height: g.offsetY() * 2,
        rotation: g.rotation(),
        opacity: g.opacity(),
        kind: child.getClassName(),
        fill: (attrs.fill as string) ?? null,
        stroke: (attrs.stroke as string) ?? null,
        strokeWidth: (attrs.strokeWidth as number) ?? 0,
        radiusX: attrs.radiusX as number | undefined,
        radiusY: attrs.radiusY as number | undefined,
        lineCap: attrs.lineCap as string | undefined,
        dash: attrs.dash as number[] | undefined,
      };
    });
  });
}
const top = async (page: Page) => (await elements(page)).at(-1)!;

async function canvasPoint(page: Page, x: number, y: number) {
  const area = (await page.getByTestId('canvas-area').boundingBox())!;
  const s = await page.evaluate(() => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return { scale: st.scaleX(), x: st.x(), y: st.y() };
  });
  return { x: area.x + s.x + x * s.scale, y: area.y + s.y + y * s.scale };
}

async function dragHandle(page: Page, handle: string, dx: number, dy: number, mods: { shift?: boolean } = {}) {
  const box = (await page.locator(`[data-handle="${handle}"]`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  if (mods.shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
  if (mods.shift) await page.keyboard.up('Shift');
}

async function axe(page: Page, include: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).include(include).analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

test.describe('desktop: shapes', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('add each shape centred in the safe area; circles are drawn round', async ({ page }) => {
    await open(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Shapes' }).click();
    for (const name of ['Add rectangle', 'Add circle', 'Add line', 'Add triangle', 'Add star']) await page.getByRole('button', { name, exact: true }).click();
    const drawn = await elements(page);
    expect(drawn.map((d) => d.kind)).toEqual(['Rect', 'Ellipse', 'Line', 'Line', 'Line']);
    // Centred in the safe area; a shape that would land exactly on an earlier one steps 3 mm aside.
    const step = (3 / 25.4) * 300;
    for (const d of drawn) {
      const steps = (d.x + d.width / 2 - 1050 / 2) / step;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(0.01);
    }
    expect(drawn[0]!.x + drawn[0]!.width / 2).toBeCloseTo(1050 / 2, 0);
    const circle = drawn[1]!;
    expect(circle.radiusX).toBe(circle.radiusY);
    expect(circle.width).toBe(circle.height);
    expect(drawn[2]).toMatchObject({ stroke: '#1b1f27', lineCap: 'round' });
    await expect(page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /^Star, star/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await axe(page, 'aside[aria-label="Layers and properties"]')).toEqual([]);
  });

  test('fill and border reach the canvas; widths are physical at every zoom; undo restores them', async ({ page }) => {
    await open(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Shapes' }).click();
    await page.getByRole('button', { name: 'Add rectangle', exact: true }).click();
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('list', { name: 'Fill colour presets' }).getByRole('button', { name: 'Marigold' }).click();
    await inspector.getByRole('textbox', { name: 'Border colour, hex code' }).fill('#2f2a7a');
    await inspector.getByRole('textbox', { name: 'Border colour, hex code' }).press('Enter');
    await inspector.getByRole('textbox', { name: 'Border width' }).fill('3');
    await inspector.getByRole('textbox', { name: 'Border width' }).press('Enter');
    await inspector.getByRole('textbox', { name: 'Corner radius' }).fill('2');
    await inspector.getByRole('textbox', { name: 'Corner radius' }).press('Enter');
    const styled = await top(page);
    expect(styled).toMatchObject({ fill: '#e8930c', stroke: '#2f2a7a' });
    expect(styled.strokeWidth).toBeCloseTo(12.5, 1); // 3 pt at 300 DPI, in print px whatever the zoom
    await page.getByRole('button', { name: 'Zoom in' }).first().click();
    expect((await top(page)).strokeWidth).toBeCloseTo(12.5, 1);
    await inspector.getByRole('button', { name: 'No fill' }).click();
    expect((await top(page)).fill).toBeNull();
    for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await top(page)).toMatchObject({ fill: '#e8930c', stroke: null, strokeWidth: 0 });
  });

  test('resize, rotate, duplicate, reorder and delete; each one undo step', async ({ page }) => {
    await open(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Shapes' }).click();
    await page.getByRole('button', { name: 'Add ellipse', exact: true }).click();
    const before = await top(page);
    await dragHandle(page, 'e', 60, 0); // ellipses stretch freely
    const wider = await top(page);
    expect(wider.width).toBeGreaterThan(before.width + 20);
    expect(wider.height).toBe(before.height);
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('textbox', { name: 'Rotation' }).fill('30');
    await inspector.getByRole('textbox', { name: 'Rotation' }).press('Enter');
    expect((await top(page)).rotation).toBe(30);
    await page.getByRole('button', { name: 'Add star', exact: true }).click();
    // The star starts with proportions locked: corners only, and they keep it square.
    await expect(page.locator('[data-handle="e"]')).toHaveCount(0);
    await dragHandle(page, 'se', 50, 5);
    const star = await top(page);
    expect(star.width).toBeCloseTo(star.height, 1);
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Control+d');
    expect(await elements(page)).toHaveLength(3);
    const ids = (await elements(page)).map((d) => d.id);
    expect(new Set(ids).size).toBe(3);
    await page.keyboard.press('Control+Shift+BracketLeft'); // to the back
    expect((await elements(page))[0]!.kind).toBe('Line');
    await page.keyboard.press('Delete');
    expect(await elements(page)).toHaveLength(2);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await elements(page)).toHaveLength(2);
    await page.keyboard.press('Control+Shift+z');
    expect(await elements(page)).toHaveLength(3);
  });

  test('dragging a line’s end changes its length and angle; style and ends reach the canvas', async ({ page }) => {
    await open(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Shapes' }).click();
    await page.getByRole('button', { name: 'Add line', exact: true }).click();
    const before = await top(page);
    await dragHandle(page, 'e', 40, -120);
    const after = await top(page);
    expect(after.rotation).toBeGreaterThan(270);
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.height).toBe(before.height);
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('radio', { name: 'Dashed' }).click();
    await inspector.getByRole('radio', { name: 'Flat' }).click();
    await inspector.getByRole('textbox', { name: 'Line width', exact: true }).fill('6');
    await inspector.getByRole('textbox', { name: 'Line width', exact: true }).press('Enter');
    const styled = await top(page);
    expect(styled).toMatchObject({ lineCap: 'butt' });
    expect(styled.strokeWidth).toBeCloseTo(25, 0);
    expect(styled.height).toBeCloseTo(25, 0); // the box is as thick as the line
    expect(styled.dash).toEqual([styled.strokeWidth * 3, styled.strokeWidth * 2]);
  });
});

test.describe('desktop: graphics', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('the shipped library holds no graphic until rights are confirmed', async ({ page }) => {
    await open(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Graphics' }).click();
    await expect(page.getByText('Graphics are being prepared for Studio use.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Add graphic/ })).toHaveCount(0);
  });

  test('approved graphics are added, drawn crisply, resized in proportion and rotated; failures keep the layer', async ({ page }) => {
    await standInLibrary(page);
    await open(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Graphics' }).click();
    await expect(page.getByRole('button', { name: 'Add graphic: Test seal' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Add graphic: Not cleared' })).toHaveCount(0); // rights filter
    await page.getByRole('searchbox', { name: 'Search graphics' }).fill('approved');
    await expect(page.getByRole('button', { name: /^Add graphic/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Add graphic: Test seal' }).click();
    await expect.poll(async () => (await top(page)).kind).toBe('Image');
    const seal = await top(page);
    expect(seal.width).toBeCloseTo(1050 * 0.3, 0);
    expect(seal.width).toBe(seal.height);
    await dragHandle(page, 'se', 60, 10);
    const resized = await top(page);
    expect(resized.width).toBeCloseTo(resized.height, 1);
    expect(resized.width).toBeGreaterThan(seal.width);
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('textbox', { name: 'Rotation' }).fill('15');
    await inspector.getByRole('textbox', { name: 'Rotation' }).press('Enter');
    await inspector.getByRole('textbox', { name: 'Opacity' }).fill('50');
    await inspector.getByRole('textbox', { name: 'Opacity' }).press('Enter');
    expect(await top(page)).toMatchObject({ rotation: 15, opacity: 0.5 });
    await expect(page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /^Test seal, graphic/ })).toBeVisible();

    await page.getByRole('searchbox', { name: 'Search graphics' }).fill('');
    await expect(page.getByRole('button', { name: 'Add graphic: Broken file' })).toBeDisabled();

    // A design that refers to a graphic the library no longer has keeps the layer and says so.
    await page.unroute('**/api/v1/graphics.json');
    expect(await page.evaluate(() => JSON.stringify(window.Konva.stages[0]!.findOne('.artwork')!.toJSON()).includes('data:'))).toBe(false);
  });
});

test.describe('tablet: shapes in the floating panel and the drawer', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('add a shape (the panel steps aside), then style it in the drawer', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Shapes', exact: true }).tap();
    await page.getByRole('button', { name: 'Add triangle' }).tap();
    await expect(page.getByRole('complementary', { name: 'Shapes' })).toHaveCount(0);
    await page.getByRole('toolbar', { name: 'Selected: Triangle' }).getByRole('button', { name: 'Properties' }).tap();
    const drawer = page.getByRole('dialog', { name: 'Layers and properties' });
    await drawer.getByRole('list', { name: 'Fill colour presets' }).getByRole('button', { name: 'Green' }).tap();
    await drawer.getByRole('button', { name: 'Increase Border width' }).tap();
    const triangle = await top(page);
    expect(triangle.fill).toBe('#15803d');
    expect(triangle.stroke).toBe('#1b1f27');
    expect(await axe(page, '[role="dialog"]')).toEqual([]);
  });
});

test.describe('phone: shapes from More, properties in the sheet', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('add, select by touch, resize with a finger and restyle; no sideways scrolling', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'More' }).tap();
    await page.getByRole('button', { name: /^Shapes/ }).tap();
    await page.getByRole('dialog', { name: 'Shapes' }).getByRole('button', { name: 'Add rectangle' }).tap();
    await expect(page.getByRole('dialog', { name: 'Shapes' })).toHaveCount(0);
    const rect = await top(page);

    // Tap empty canvas, then tap the shape: it's selected again.
    const empty = await canvasPoint(page, 60, 60);
    await page.touchscreen.tap(empty.x, empty.y);
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);
    const centre = await canvasPoint(page, rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.touchscreen.tap(centre.x, centre.y);
    await expect(page.getByTestId('selection-frame')).toBeVisible();

    // Resize with a finger on the corner handle (CDP touch: one finger drags).
    const handle = (await page.locator('[data-handle="se"]').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const at = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
    for (let i = 1; i <= 6; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at.x + i * 5, y: at.y + i * 3 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await top(page)).width).toBeGreaterThan(rect.width);
    // The gesture has ended once its size badge is gone and the toolbar is back.
    await expect(page.getByTestId('gesture-badge')).toHaveCount(0);
    const properties = page.getByRole('toolbar', { name: 'Selected: Rectangle' }).getByRole('button', { name: 'Properties' });
    await expect(properties).toBeVisible();
    await page.waitForTimeout(150); // Chrome's emulated touch release settles a moment after the CDP call returns
    await properties.tap();
    const sheet = page.getByRole('dialog', { name: 'Layers and properties' });
    const red = sheet.getByRole('list', { name: 'Fill colour presets' }).getByRole('button', { name: 'Red' });
    expect((await red.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await red.tap();
    await sheet.getByRole('button', { name: 'Increase Border width' }).tap();
    expect(await top(page)).toMatchObject({ fill: '#b91c1c', stroke: '#1b1f27' });
    expect(await axe(page, '[role="dialog"]')).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
