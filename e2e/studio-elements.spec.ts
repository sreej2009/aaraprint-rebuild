import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { expect, test, settleAnimations } from './fixtures';

/**
 * Selecting, moving, resizing and rotating elements (Phase 3 M6), on the sample card
 * (`?sample=1`, the demo design fitted to the product). Element geometry is read back from the
 * Konva stage; the selection outline and handles are HTML over it.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const SAMPLE = '/products/business-card-classic/design?sample=1';
const layoutOf = (info: TestInfo) => info.project.name as 'desktop' | 'tablet' | 'mobile';
const nbsp = (text: string | null) => (text ?? '').replaceAll(String.fromCharCode(0xa0), ' ');
const MM = 300 / 25.4; // print px per mm at 300 DPI

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

async function open(page: Page, url = SAMPLE) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas') && st.findOne('.element'))));
}

/** Screen position of a design point (print px from the trim's top-left corner). */
async function at(page: Page, x: number, y: number) {
  const area = (await page.getByTestId('canvas-area').boundingBox())!;
  const s = await page.evaluate(() => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return { scale: st.scaleX(), x: st.x(), y: st.y() };
  });
  return { x: area.x + s.x + x * s.scale, y: area.y + s.y + y * s.scale, scale: s.scale };
}

/** An element's box as the canvas draws it. */
async function boxOf(page: Page, id: string): Promise<Box | null> {
  return page.evaluate((elementId) => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    const g = st.findOne<KonvaNamespace.Group>(`#${elementId}`);
    if (!g) return null;
    return { x: g.x() - g.offsetX(), y: g.y() - g.offsetY(), width: g.offsetX() * 2, height: g.offsetY() * 2, rotation: g.rotation() };
  }, id);
}

async function announced(page: Page) {
  return nbsp(await page.getByTestId('canvas-area').getByTestId('canvas-announcer').textContent());
}

async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
  return {
    tap: async (p: { x: number; y: number }) => {
      await send('touchStart', [p]);
      await send('touchEnd', []);
    },
    drag: async (from: { x: number; y: number }, dx: number, dy: number) => {
      await send('touchStart', [from]);
      for (let i = 1; i <= 6; i += 1) await send('touchMove', [{ x: from.x + (dx * i) / 6, y: from.y + (dy * i) / 6 }]);
      await send('touchEnd', []);
    },
    send,
  };
}

test.describe('mouse: select, move, resize, rotate', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse');

  test('click selects; dragging moves by the pointer distance as one undo step', async ({ page }) => {
    await open(page);
    const start = await at(page, 200, 110); // “Riya Sharma”
    await page.mouse.click(start.x, start.y);
    await expect(page.getByTestId('selection-frame')).toHaveAttribute('data-element-id', 'el_name');
    await expect.poll(() => announced(page)).toBe('“Riya Sharma” selected. 5.9 mm from left, 5.9 mm from top, 52.5 × 7.6 mm.');
    expect(await boxOf(page, 'el_name')).toMatchObject({ x: 70, y: 70 }); // a click never moves

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 30, start.y + 10, { steps: 3 });
    await expect(page.getByTestId('gesture-badge')).toHaveText(/^X \d/);
    await page.mouse.move(start.x + 60 * start.scale, start.y + 30 * start.scale, { steps: 3 });
    await page.mouse.up();
    const moved = (await boxOf(page, 'el_name'))!;
    expect(moved.x).toBeCloseTo(130, 0);
    expect(moved.y).toBeCloseTo(100, 0);
    await expect.poll(() => announced(page)).toBe('Moved “Riya Sharma”. 11 mm from left, 8.5 mm from top, 52.5 × 7.6 mm.');

    // The view didn't pan while the element moved.
    const after = await at(page, 0, 0);
    const before = { x: start.x - 200 * start.scale, y: start.y - 110 * start.scale };
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);

    await page.getByRole('button', { name: 'Undo' }).click();
    expect(await boxOf(page, 'el_name')).toMatchObject({ x: 70, y: 70 });
    await page.getByRole('button', { name: 'Redo' }).click();
    expect((await boxOf(page, 'el_name'))!.x).toBeCloseTo(130, 0);
  });

  test('corner handles resize (Shift keeps proportions); the rotation handle rotates and snaps', async ({ page }) => {
    await open(page);
    const logo = await at(page, 900, 150);
    await page.mouse.click(logo.x, logo.y);
    // Images keep their proportions from a corner.
    const se = (await page.locator('[data-handle="se"]').boundingBox())!;
    await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
    await page.mouse.down();
    await page.mouse.move(se.x + se.width / 2 + 40, se.y + se.height / 2 + 10, { steps: 4 });
    await expect(page.getByTestId('gesture-badge')).toHaveText(/^[\d.]+\s×\s[\d.]+\smm$/);
    await page.mouse.up();
    const resized = (await boxOf(page, 'el_logo'))!;
    expect(resized.width).toBeGreaterThan(160);
    expect(resized.width).toBeCloseTo(resized.height, 1);
    expect(resized).toMatchObject({ x: 820, y: 70 });
    await page.keyboard.press('Control+z');
    expect(await boxOf(page, 'el_logo')).toMatchObject({ width: 160, height: 160 });

    const rotate = (await page.locator('[data-handle="rotate"]').boundingBox())!;
    const centre = await at(page, 900, 150);
    await page.mouse.move(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2);
    await page.mouse.down();
    await page.mouse.move(centre.x + 60, centre.y - 50, { steps: 4 });
    await page.mouse.move(centre.x + 80, centre.y - 1, { steps: 4 }); // just short of 90°
    await expect(page.getByTestId('gesture-badge')).toHaveText('90°');
    await page.mouse.up();
    expect(await boxOf(page, 'el_logo')).toMatchObject({ rotation: 90, x: 820, y: 70, width: 160 });
    await expect.poll(() => announced(page)).toMatch(/^Rotated “logo\.png”\. .*rotated 90°\.$/);
    await page.keyboard.press('Control+z');
    expect((await boxOf(page, 'el_logo'))!.rotation).toBe(0);
  });

  test('locked layers can’t be picked or dragged on the canvas; Layers selects them', async ({ page }) => {
    await open(page);
    const badge = await at(page, 120, 400); // “Since 2026”, locked
    await page.mouse.move(badge.x, badge.y);
    await page.mouse.down();
    await page.mouse.move(badge.x + 50, badge.y, { steps: 4 });
    await page.mouse.up();
    expect(await boxOf(page, 'el_badge')).toMatchObject({ x: 70, y: 380 });
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);

    await page.getByRole('button', { name: 'Since 2026, text, locked' }).click();
    await expect(page.getByTestId('locked-badge')).toBeVisible();
    await expect(page.locator('[data-handle]')).toHaveCount(0);
    await expect(page.getByText('This layer is locked')).toBeVisible();
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Delete');
    await expect.poll(() => announced(page)).toBe('“Since 2026” is locked. Unlock it to change it.');
    expect(await boxOf(page, 'el_badge')).not.toBeNull();
  });

  test('warns in amber outside the safe area and in red past the trim, after moving', async ({ page }) => {
    await open(page);
    const star = await at(page, 905, 325);
    await page.mouse.click(star.x, star.y);
    await expect(page.getByTestId('placement-badge')).toHaveCount(0);
    // Drag the star right until its (turned) corners cross the safe line (1026 px), then the trim (1050 px).
    await page.mouse.move(star.x, star.y);
    await page.mouse.down();
    await page.mouse.move(star.x + 70 * star.scale, star.y, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('placement-badge')).toHaveText('Outside the safe area');
    await expect(page.getByTestId('selection-frame')).toHaveClass(/border-warning/);
    await expect(page.getByTestId('selected-properties').getByText('Part of this layer is outside the safe area and may be trimmed.')).toBeVisible();

    const moved = await at(page, (await boxOf(page, 'el_star'))!.x + 45, 325);
    await page.mouse.move(moved.x, moved.y);
    await page.mouse.down();
    await page.mouse.move(moved.x + 60 * star.scale, moved.y, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('placement-badge')).toHaveText('Past the trim edge');
    await expect(page.getByTestId('selection-frame')).toHaveClass(/border-danger/);
    await expect.poll(() => announced(page)).toMatch(/Part of this layer is past the trim edge and will be cut off\.$/);
  });

  test('the selection follows zoom and pan, and clicking empty canvas deselects', async ({ page }) => {
    await open(page);
    const logo = await at(page, 900, 150);
    await page.mouse.click(logo.x, logo.y);
    const frame = page.getByTestId('selection-frame');
    for (const step of ['in', 'in', 'pan'] as const) {
      if (step === 'in') await page.getByRole('button', { name: 'Zoom in' }).click();
      else await page.mouse.wheel(0, 80);
      const topLeft = await at(page, 820, 70);
      const bottomRight = await at(page, 980, 230);
      await expect
        .poll(async () => {
          const b = (await frame.boundingBox())!;
          return Math.abs(b.x - topLeft.x) < 2.5 && Math.abs(b.y - topLeft.y) < 2.5 && Math.abs(b.x + b.width - bottomRight.x) < 2.5 && Math.abs(b.y + b.height - bottomRight.y) < 2.5;
        })
        .toBe(true);
    }
    const area = (await page.getByTestId('canvas-area').boundingBox())!;
    await page.mouse.click(area.x + 20, area.y + area.height - 20);
    await expect(frame).toHaveCount(0);
  });
});

test.describe('keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard');

  test('arrows nudge 0.5 mm (Shift 5 mm); Delete, Ctrl Z, Ctrl D and Escape', async ({ page }, info) => {
    await open(page);
    if (layoutOf(info) === 'desktop') {
      const star = await at(page, 905, 325);
      await page.mouse.click(star.x, star.y);
    } else {
      // Keyboard-only route on tablets: the layers list lives in the drawer.
      await page.getByRole('button', { name: 'Layers and properties' }).click();
      await page.getByRole('dialog', { name: 'Layers and properties' }).getByRole('button', { name: 'Star, star' }).click();
      await page.keyboard.press('Escape');
      await page.locator('#studio-canvas').focus();
    }
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    const nudged = (await boxOf(page, 'el_star'))!;
    expect(nudged.x).toBeCloseTo(860 + MM, 1);
    expect(nudged.y).toBeCloseTo(280 + 5 * MM, 1);
    await page.keyboard.press('Control+z'); // the burst of nudges is one step
    expect(await boxOf(page, 'el_star')).toMatchObject({ x: 860, y: 280 });

    await page.keyboard.press('Delete');
    await expect.poll(() => boxOf(page, 'el_star')).toBeNull();
    await expect.poll(() => announced(page)).toBe('Deleted “Star”. Press Ctrl Z to undo.');
    await page.keyboard.press('Control+z');
    await expect.poll(() => boxOf(page, 'el_star')).not.toBeNull();

    await page.keyboard.press('Control+d');
    await expect(page.getByRole('radio', { name: 'Front, 9 items' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);
  });

  test('typing in a field never nudges or deletes the selection', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'desktop', 'docked inspector');
    await open(page);
    await page.getByRole('button', { name: 'Star, star' }).click();
    const x = page.getByRole('textbox', { name: 'X, from the left trim edge' });
    await x.fill('25');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    // The arrow moved the text cursor and Backspace deleted the "2": the star went to 5 mm, not nudged.
    expect((await boxOf(page, 'el_star'))!.x).toBeCloseTo(5 * MM, 1);
    const rotation = page.getByRole('textbox', { name: 'Rotation' });
    await rotation.fill('45');
    await rotation.press('Enter');
    expect((await boxOf(page, 'el_star'))!.rotation).toBe(45);
  });
});

test.describe('touch', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'touch devices');

  test('tap selects; one finger drags the selected element; elsewhere it pans', async ({ page }) => {
    await open(page);
    const t = await touch(page);
    await t.tap(await at(page, 905, 325));
    await expect(page.getByTestId('selection-frame')).toHaveAttribute('data-element-id', 'el_star');
    await expect(page.getByRole('toolbar', { name: 'Selected: Star' })).toBeVisible();

    const from = await at(page, 905, 325);
    await t.drag(from, 40, 0);
    const moved = (await boxOf(page, 'el_star'))!;
    expect(moved.x).toBeCloseTo(860 + 40 / from.scale, 0);
    expect(moved.y).toBeCloseTo(280, 0);

    // One finger on an unselected element pans the view; nothing moves.
    const origin = await at(page, 0, 0);
    await t.drag(await at(page, 900, 150), 30, 20);
    expect(await boxOf(page, 'el_logo')).toMatchObject({ x: 820, y: 70 });
    const panned = await at(page, 0, 0);
    expect(panned.x).toBeCloseTo(origin.x + 30, 0);
    expect(panned.y).toBeCloseTo(origin.y + 20, 0);
    await expect(page.getByTestId('selection-frame')).toHaveAttribute('data-element-id', 'el_star');

    // Two fingers still pinch-zoom.
    const c = await at(page, 600, 300);
    await t.send('touchStart', [{ x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }]);
    for (let i = 1; i <= 5; i += 1) await t.send('touchMove', [{ x: c.x - 40 - i * 10, y: c.y }, { x: c.x + 40 + i * 10, y: c.y }]);
    await t.send('touchEnd', []);
    expect((await at(page, 0, 0)).scale).toBeGreaterThan(from.scale * 1.5);
    expect((await boxOf(page, 'el_star'))!.x).toBeCloseTo(moved.x, 1);
  });

  test('the selection toolbar deletes and duplicates; the top bar undoes', async ({ page }) => {
    await open(page);
    const t = await touch(page);
    await t.tap(await at(page, 905, 325));
    const toolbar = page.getByRole('toolbar', { name: 'Selected: Star' });
    await toolbar.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => boxOf(page, 'el_star')).toBeNull();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => boxOf(page, 'el_star')).not.toBeNull();
    await t.tap(await at(page, 905, 325));
    await page.getByRole('toolbar', { name: 'Selected: Star' }).getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.getByRole('radio', { name: /^Front, 9 items/ })).toBeVisible();
  });

  test('handles are big enough for fingers', async ({ page }) => {
    await open(page);
    const t = await touch(page);
    await t.tap(await at(page, 900, 150));
    for (const handle of ['nw', 'se', 'rotate']) {
      const size = await page.locator(`[data-handle="${handle}"]`).evaluate((el) => {
        const before = getComputedStyle(el, '::before');
        const rect = el.getBoundingClientRect();
        return rect.width - 2 * Number.parseFloat(before.left);
      });
      expect(size, handle).toBeGreaterThanOrEqual(24);
    }
  });
});

test.describe('front and back', () => {
  test('each side keeps its own elements and selection; undo returns to the changed side', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'desktop', 'mouse');
    await open(page);
    const name = await at(page, 200, 110);
    await page.mouse.click(name.x, name.y);
    await page.getByRole('radio', { name: 'Back, 5 items' }).click();
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);
    await expect.poll(() => boxOf(page, 'el_triangle')).not.toBeNull();
    const triangle = await at(page, 525, 230);
    await page.mouse.move(triangle.x, triangle.y);
    await page.mouse.down();
    await page.mouse.move(triangle.x + 40, triangle.y, { steps: 4 });
    await page.mouse.up();
    const movedX = (await boxOf(page, 'el_triangle'))!.x;
    expect(movedX).toBeGreaterThan(470);

    await page.getByRole('radio', { name: 'Front, 8 items' }).click();
    await expect.poll(() => boxOf(page, 'el_name')).toMatchObject({ x: 70, y: 70 });
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('radio', { name: 'Back, 5 items' })).toHaveAttribute('aria-checked', 'true');
    expect(await boxOf(page, 'el_triangle')).toMatchObject({ x: 470 });
  });
});

test.describe('regressions', () => {
  test('empty canvas still pans and wheel-zooms with a selection', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'desktop', 'mouse');
    await open(page);
    const logo = await at(page, 900, 150);
    await page.mouse.click(logo.x, logo.y);
    const area = (await page.getByTestId('canvas-area').boundingBox())!;
    const before = await at(page, 0, 0);
    const empty = { x: area.x + 30, y: area.y + area.height - 40 };
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move(empty.x + 50, empty.y - 30, { steps: 4 });
    await page.mouse.up();
    const panned = await at(page, 0, 0);
    expect(panned.x).toBeCloseTo(before.x + 50, 0);
    expect(panned.y).toBeCloseTo(before.y - 30, 0);
    await expect(page.getByTestId('selection-frame')).toHaveCount(1); // a pan isn't a click
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await at(page, 0, 0)).scale).toBeGreaterThan(panned.scale * 1.2);
    expect(await boxOf(page, 'el_logo')).toMatchObject({ x: 820, y: 70 });
  });

  test('exports the same artwork with or without a selection (handles never print)', async ({ page }, info) => {
    test.skip(layoutOf(info) === 'mobile', 'reference page');
    test.slow(); // the heaviest page; slow to hydrate under a full parallel run
    await page.goto('/design-system#canvas-demo');
    const demo = page.locator('#canvas-demo');
    await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#canvas-demo'))));
    await demo.getByRole('button', { name: 'Show printable artwork' }).click();
    const plain = await demo.getByTestId('artwork-export').getAttribute('src');
    const stage = await demo.getByTestId('canvas-area').boundingBox();
    const s = await page.evaluate(() => {
      const st = window.Konva.stages.find((stage) => stage.container().closest('#canvas-demo'))!;
      return { scale: st.scaleX(), x: st.x(), y: st.y() };
    });
    await page.mouse.click(stage!.x + s.x + 905 * s.scale, stage!.y + s.y + 325 * s.scale);
    await expect(demo.getByTestId('selection-frame')).toBeVisible();
    await demo.getByRole('button', { name: 'Show printable artwork' }).click();
    await expect(demo.getByTestId('artwork-export')).toHaveAttribute('src', plain!);
  });

  test('no detectable WCAG 2.2 AA violations with an element selected', async ({ page }, info) => {
    await open(page);
    if (layoutOf(info) === 'desktop') {
      const star = await at(page, 905, 325);
      await page.mouse.click(star.x, star.y);
      await expect(page.getByTestId('selected-properties')).toBeVisible();
    } else {
      const t = await touch(page);
      await t.tap(await at(page, 905, 325));
      await expect(page.getByRole('toolbar', { name: 'Selected: Star' })).toBeVisible();
    }
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  });
});
