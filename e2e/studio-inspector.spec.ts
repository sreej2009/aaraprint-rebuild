import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { expect, test } from './fixtures';

/**
 * Inspector and layers panel (Phase 3 M7) against the real canvas, on the sample card
 * (`?sample=1`). Docked on desktop, a drawer on tablets, a bottom sheet on phones.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const SAMPLE = '/products/business-card-classic/design?sample=1';
const MM = 300 / 25.4;
const layoutOf = (info: TestInfo) => info.project.name as 'desktop' | 'tablet' | 'mobile';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function open(page: Page) {
  await page.goto(SAMPLE);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas') && st.findOne('.element'))));
}

/** What the canvas draws for an element: box, rotation, opacity — or null when it isn't drawn. */
async function drawn(page: Page, id: string) {
  return page.evaluate((elementId) => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    const g = st.findOne<KonvaNamespace.Group>(`#${elementId}`);
    if (!g) return null;
    return { x: g.x() - g.offsetX(), y: g.y() - g.offsetY(), width: g.offsetX() * 2, height: g.offsetY() * 2, rotation: g.rotation(), opacity: g.opacity() };
  }, id);
}

/** Element ids in drawing order, bottom to top. */
async function drawingOrder(page: Page) {
  return page.evaluate(() => window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!.find('.element').map((n) => n.id()));
}

async function canvasPoint(page: Page, x: number, y: number) {
  const area = (await page.getByTestId('canvas-area').boundingBox())!;
  const s = await page.evaluate(() => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return { scale: st.scaleX(), x: st.x(), y: st.y() };
  });
  return { x: area.x + s.x + x * s.scale, y: area.y + s.y + y * s.scale };
}

async function axe(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder.include(include);
  const results = await builder.analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

test.describe('desktop: docked inspector and layers', () => {
  test.skip(({ hasTouch }) => hasTouch, 'docked layout');

  test('canvas selection fills the inspector; inspector edits move, size, turn and fade the canvas element', async ({ page }) => {
    await open(page);
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    const star = await canvasPoint(page, 905, 325);
    await page.mouse.click(star.x, star.y);
    const x = inspector.getByRole('textbox', { name: 'X, from the left trim edge' });
    await expect(x).toHaveValue('72.8');
    await expect(inspector.getByRole('button', { name: 'Star, star' })).toHaveAttribute('aria-pressed', 'true');

    await x.fill('20');
    await x.press('Enter');
    await expect.poll(async () => (await drawn(page, 'el_star'))!.x).toBeCloseTo(20 * MM, 1);
    await inspector.getByRole('button', { name: 'Keep proportions' }).click();
    const w = inspector.getByRole('textbox', { name: 'W, width' });
    await w.fill('15.2');
    await w.press('Enter');
    await expect.poll(async () => (await drawn(page, 'el_star'))!.height).toBeCloseTo(180, 0);
    const rotation = inspector.getByRole('textbox', { name: 'Rotation' });
    await rotation.fill('45');
    await rotation.press('Enter');
    const opacity = inspector.getByRole('textbox', { name: 'Opacity' });
    await opacity.fill('40');
    await opacity.press('Enter');
    await expect.poll(() => drawn(page, 'el_star')).toMatchObject({ rotation: 45, opacity: 0.4 });

    // Typed values stay one undo step each.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await drawn(page, 'el_star'))!.opacity).toBe(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await drawn(page, 'el_star'))!.rotation).toBe(12);
  });

  test('centres on the piece, and the canvas agrees', async ({ page }) => {
    await open(page);
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('button', { name: 'logo.png, image' }).click();
    await inspector.getByRole('button', { name: 'Centre horizontally' }).click();
    await inspector.getByRole('button', { name: 'Centre vertically' }).click();
    await expect.poll(() => drawn(page, 'el_logo')).toMatchObject({ x: 445, y: 220 }); // (1050 − 160) / 2, (600 − 160) / 2
    await expect(inspector.getByRole('button', { name: 'Centre vertically' })).toBeDisabled();
  });

  test('layer order actions restack the canvas', async ({ page }) => {
    await open(page);
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('button', { name: 'Rectangle, rectangle' }).click();
    const props = page.getByTestId('selected-properties');
    await props.getByRole('button', { name: 'Bring forward' }).click();
    expect((await drawingOrder(page)).slice(0, 2)).toEqual(['el_name', 'el_band']);
    await props.getByRole('button', { name: 'Bring to front' }).click();
    expect((await drawingOrder(page)).at(-1)).toBe('el_band'); // the hidden layer isn't drawn
    await props.getByRole('button', { name: 'Send backward' }).click();
    await props.getByRole('button', { name: 'Send to back' }).click();
    expect((await drawingOrder(page))[0]).toBe('el_band');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await drawingOrder(page)).at(-1)).toBe('el_band');
  });

  test('hide, show, lock and unlock: hidden layers aren’t drawn; locked ones don’t move', async ({ page }) => {
    await open(page);
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('button', { name: 'Hide “Star”' }).click();
    await expect.poll(() => drawn(page, 'el_star')).toBeNull();
    await expect(inspector.getByRole('button', { name: 'Star, star, hidden' })).toBeVisible();
    await inspector.getByRole('button', { name: 'Show “Hidden layer”' }).click();
    await expect.poll(() => drawn(page, 'el_hidden')).not.toBeNull();

    await inspector.getByRole('button', { name: 'logo.png, image' }).click();
    await inspector.getByRole('button', { name: 'Lock layer' }).click();
    await expect(page.getByTestId('locked-badge')).toBeVisible();
    const logo = await canvasPoint(page, 900, 150);
    await page.mouse.move(logo.x, logo.y);
    await page.mouse.down();
    await page.mouse.move(logo.x + 60, logo.y + 20, { steps: 4 });
    await page.mouse.up();
    expect(await drawn(page, 'el_logo')).toMatchObject({ x: 820, y: 70 });
    await expect(inspector.getByRole('textbox', { name: 'X, from the left trim edge' })).toBeDisabled();
  });

  test('keyboard: one tab stop, arrows select layers on the canvas, Alt+arrows reorder, F2 renames, Delete removes', async ({ page }) => {
    await open(page);
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('button', { name: 'Star, star' }).click();
    await page.keyboard.press('ArrowDown');
    await expect(inspector.getByRole('button', { name: 'logo.png, image' })).toBeFocused();
    await expect(page.getByTestId('selection-frame')).toHaveAttribute('data-element-id', 'el_logo');
    await expect(inspector.getByRole('button', { name: 'logo.png, image' })).toHaveCSS('outline-style', 'solid'); // visible focus

    await page.keyboard.press('Alt+ArrowUp');
    expect((await drawingOrder(page)).slice(-2)).toEqual(['el_logo', 'el_badge']);
    await expect(inspector.getByRole('button', { name: 'logo.png, image' })).toBeFocused();

    await page.keyboard.press('F2');
    await page.keyboard.type('Brand mark');
    await page.keyboard.press('Enter');
    await expect(inspector.getByRole('button', { name: 'Brand mark, image' })).toBeFocused();
    await expect(page.getByTestId('canvas-announcer')).toHaveText(/^Renamed layer\./);

    await page.keyboard.press('Delete');
    await expect.poll(() => drawn(page, 'el_logo')).toBeNull();
    await page.keyboard.press('Control+z');
    await expect.poll(() => drawn(page, 'el_logo')).not.toBeNull();
  });

  test('no detectable WCAG 2.2 AA violations with a selection in the inspector', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Since 2026, text, locked' }).click();
    await expect(page.getByText('This layer is locked')).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await page.getByRole('button', { name: 'Star, star' }).click();
    await page.getByRole('button', { name: 'Hide layer' }).click();
    expect(await axe(page)).toEqual([]);
  });
});

test.describe('tablet: inspector drawer', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet layout');

  test('edits from the drawer reach the canvas; the drawer passes axe', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'tablet');
    await open(page);
    await page.getByRole('button', { name: 'Layers and properties' }).click();
    const drawer = page.getByRole('dialog', { name: 'Layers and properties' });
    await drawer.getByRole('button', { name: 'Star, star' }).click();
    const y = drawer.getByRole('textbox', { name: 'Y, from the top trim edge' });
    await y.fill('30');
    await y.press('Enter');
    await expect.poll(async () => (await drawn(page, 'el_star'))!.y).toBeCloseTo(30 * MM, 1);
    await page.waitForTimeout(300);
    expect(await axe(page, '[role="dialog"]')).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId('selection-frame')).toHaveAttribute('data-element-id', 'el_star');
  });
});

test.describe('phone: inspector sheet', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout');

  test('opens from the selection toolbar, with touch-sized controls and − / + steppers', async ({ page }) => {
    await open(page);
    const star = await canvasPoint(page, 905, 325);
    await page.touchscreen.tap(star.x, star.y);
    await page.getByRole('toolbar', { name: 'Selected: Star' }).getByRole('button', { name: 'Properties' }).click();
    const sheet = page.getByRole('dialog', { name: 'Layers and properties' });
    await expect(sheet.getByRole('textbox', { name: 'W, width' })).toHaveValue('7.6');

    const plus = sheet.getByRole('button', { name: 'Increase W, width' });
    await expect(plus).toBeVisible();
    for (const control of [plus, sheet.getByRole('button', { name: 'Keep proportions' }), sheet.getByRole('button', { name: 'Hide layer' }), sheet.getByRole('button', { name: 'Star, star' })]) {
      const box = (await control.boundingBox())!;
      expect(box.height, (await control.getAttribute('aria-label')) ?? undefined).toBeGreaterThanOrEqual(40);
    }
    await plus.tap();
    await plus.tap();
    await expect(sheet.getByRole('textbox', { name: 'W, width' })).toHaveValue('7.8');
    await expect.poll(async () => (await drawn(page, 'el_star'))!.width).toBeCloseTo(7.8 * MM, 0);

    await sheet.getByRole('button', { name: 'Send to back' }).tap();
    expect((await drawingOrder(page))[0]).toBe('el_star');
    await sheet.getByRole('button', { name: 'Rename layer' }).tap();
    await sheet.getByRole('textbox', { name: 'Layer name' }).fill('Gold star');
    await sheet.getByRole('textbox', { name: 'Layer name' }).press('Enter');
    await expect(sheet.getByRole('button', { name: 'Gold star, star' })).toBeVisible();

    await page.waitForTimeout(300);
    expect(await axe(page, '[role="dialog"]')).toEqual([]);
  });
});
