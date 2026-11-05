import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { expect, test } from './fixtures';

/**
 * Front/back and core editor polish (Phase 3 M10) against the real canvas: independent sides,
 * copy front to back, clear side, undo across sides, per-side views, and text editing, shapes
 * and graphics across sides — on desktop, tablet and phone.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const BLANK = '/products/business-card-classic/design';
const SAMPLE = `${BLANK}?sample=1`;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function open(page: Page, url = BLANK) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

/** What the canvas shows right now. */
async function canvas(page: Page) {
  return page.evaluate(() => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return {
      ids: st.find('.element').map((n) => n.id()),
      texts: st.find('Text').map((t) => (t as KonvaNamespace.Text).text()),
      images: st.find('Image').length,
      background: String(st.findOne('.background')!.getAttr('fill')),
      scale: Math.round(st.scaleX() * 10000) / 10000,
      x: Math.round(st.x()),
      y: Math.round(st.y()),
      guides: st.findOne('.guides')!.visible(),
    };
  });
}

const sideRadio = (page: Page, name: 'Front' | 'Back') => page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: new RegExp(`^${name}`) });

async function sideMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Side options' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function axe(page: Page, include: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).include(include).analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

test.describe('desktop: front and back', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('each side has its own content and background; switching never leaks or leaves stale state', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('heading', { name: 'Front side is empty' })).toBeVisible();
    await page.getByRole('button', { name: 'Add text' }).click();
    await page.getByRole('button', { name: 'Add heading' }).click();
    await page.keyboard.type('Front heading');
    // Switch mid-edit: the text is kept on the front and the editor goes away.
    await sideRadio(page, 'Back').click();
    await expect(page.getByTestId('text-edit-overlay')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Back side is empty' })).toBeVisible();
    expect((await canvas(page)).ids).toEqual([]);
    await expect(page.getByTestId('canvas-area').getByTestId('canvas-announcer')).toHaveText('Back side selected. It’s empty.');

    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Shapes' }).click();
    await page.getByRole('button', { name: 'Add circle', exact: true }).click();
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Background' }).click();
    await page.getByRole('complementary', { name: 'Background' }).getByRole('button', { name: 'Deep indigo' }).click();
    const back = await canvas(page);
    expect(back.ids).toHaveLength(1);
    expect(back.background).toBe('#2f2a7a');
    await expect(page.getByRole('list', { name: 'Layers' }).getByRole('button')).toHaveCount(3); // the circle's row and its two toggles

    await sideRadio(page, 'Front').click();
    const front = await canvas(page);
    expect(front.texts).toEqual(['Front heading']);
    expect(front.background).not.toBe('#2f2a7a');
    await expect(page.getByTestId('selected-properties')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /^Front heading, text/ })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /^Circle/ })).toHaveCount(0);
    await expect(sideRadio(page, 'Front')).toHaveAccessibleName('Front, 1 item');
    await expect(sideRadio(page, 'Back')).toHaveAccessibleName('Back, 1 item');
  });

  test('copy front to back: straight onto an empty back, with a choice onto one with artwork; one undo step each', async ({ page }) => {
    await open(page, `${SAMPLE}&side=back`);
    await sideMenu(page, /Clear back/);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear back' }).click();
    await sideRadio(page, 'Front').click();
    const front = await canvas(page);

    await sideMenu(page, /Copy front to back/);
    await expect(page.getByRole('dialog')).toHaveCount(0); // the back was empty
    await expect(sideRadio(page, 'Back')).toHaveAttribute('aria-checked', 'true');
    const copied = await canvas(page);
    expect(copied.texts).toEqual(front.texts);
    expect(copied.ids.some((id) => front.ids.includes(id))).toBe(false); // new ids

    await sideMenu(page, /Copy front to back/);
    const dialog = page.getByRole('dialog', { name: 'Copy the front to the back?' });
    await expect(dialog).toBeVisible();
    expect(await axe(page, '[role="dialog"]')).toEqual([]);
    await dialog.getByRole('button', { name: 'Keep both' }).click();
    expect((await canvas(page)).ids).toHaveLength(front.ids.length * 2);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await canvas(page)).ids).toHaveLength(front.ids.length);
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); // the first copy
    await expect(sideRadio(page, 'Front')).toHaveAttribute('aria-checked', 'true'); // back where you were
    await sideRadio(page, 'Back').click();
    expect((await canvas(page)).ids).toEqual([]);
    await sideRadio(page, 'Front').click();
    expect(await canvas(page)).toMatchObject({ ids: front.ids, texts: front.texts }); // the front never changed
  });

  test('clear the back asks first; undo restores it; the front stays as it was', async ({ page }) => {
    await open(page, `${SAMPLE}&side=back`);
    const back = await canvas(page);
    await sideMenu(page, /Clear back/);
    const confirm = page.getByRole('alertdialog', { name: 'Clear the back?' });
    expect(await axe(page, '[role="alertdialog"]')).toEqual([]);
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    expect((await canvas(page)).ids).toEqual(back.ids);
    await sideMenu(page, /Clear back/);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear back' }).click();
    expect((await canvas(page)).ids).toEqual([]);
    await expect(page.getByRole('heading', { name: 'Back side is empty' })).toBeVisible();
    await page.keyboard.press('Control+z');
    expect((await canvas(page)).ids).toEqual(back.ids);
    await sideRadio(page, 'Front').click();
    expect((await canvas(page)).ids).toHaveLength(7); // 8 layers, one of them hidden
  });

  test('undo and redo follow the side they change; zoom, pan and guides are never undo steps', async ({ page }) => {
    await open(page, SAMPLE);
    await page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /^Star,/ }).click();
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('ArrowRight'); // nudge on the front
    await sideRadio(page, 'Back').click();
    await page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /^Thank you,/ }).click();
    await page.keyboard.press('Delete'); // delete on the back
    await sideRadio(page, 'Front').click();
    await page.getByRole('button', { name: 'Zoom in' }).first().click();
    await page.keyboard.press('Control+;');
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Control+z'); // the delete on the back
    await expect(sideRadio(page, 'Back')).toHaveAttribute('aria-checked', 'true');
    expect((await canvas(page)).texts).toContain('Thank you');
    await page.keyboard.press('Control+z'); // the nudge on the front
    await expect(sideRadio(page, 'Front')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await page.keyboard.press('Control+Shift+z');
    await page.keyboard.press('Control+Shift+z');
    await expect(sideRadio(page, 'Back')).toHaveAttribute('aria-checked', 'true');
    expect((await canvas(page)).texts).not.toContain('Thank you');
    expect((await canvas(page)).guides).toBe(false); // the guide preference is the same on both sides
  });

  test('each side keeps its own zoom and pan', async ({ page }) => {
    await open(page, SAMPLE);
    const fitted = await canvas(page);
    await page.getByRole('button', { name: 'Zoom in' }).first().click();
    await page.getByRole('button', { name: 'Zoom in' }).first().click();
    await page.mouse.move(700, 450);
    await page.mouse.wheel(120, 0);
    const front = await canvas(page);
    expect(front.scale).toBeGreaterThan(fitted.scale);
    await sideRadio(page, 'Back').click();
    expect(await canvas(page)).toMatchObject({ scale: fitted.scale, x: fitted.x, y: fitted.y }); // first visit: fit
    await page.getByRole('button', { name: 'Zoom out' }).first().click();
    const back = await canvas(page);
    await sideRadio(page, 'Front').click();
    expect(await canvas(page)).toMatchObject({ scale: front.scale, x: front.x, y: front.y });
    await sideRadio(page, 'Back').click();
    expect(await canvas(page)).toMatchObject({ scale: back.scale, x: back.x, y: back.y });
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  });

  test('a graphic copied to the back keeps its reference and its file is fetched once', async ({ page }) => {
    let requests = 0;
    await page.route('**/api/v1/graphics.json', (route) =>
      route.fulfill({ json: { graphics: [{ id: 'test-seal', name: 'Test seal', group: 'Badges', tags: [], width: 240, height: 240, url: '/studio/graphics/test-seal.svg', rights: 'cleared' }], withheld: 0 } }),
    );
    await page.route('**/studio/graphics/test-seal.svg', (route) => {
      requests += 1;
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><circle cx="120" cy="120" r="100" fill="#e8930c"/></svg>' });
    });
    await open(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Graphics' }).click();
    await page.getByRole('button', { name: 'Add graphic: Test seal' }).click();
    await expect.poll(async () => (await canvas(page)).images).toBe(1);
    await sideMenu(page, /Copy front to back/);
    await expect.poll(async () => (await canvas(page)).images).toBe(1);
    await sideRadio(page, 'Front').click();
    await sideRadio(page, 'Back').click();
    expect((await canvas(page)).images).toBe(1);
    expect(requests).toBe(1);
  });

  test('?side=back opens the back; an unknown side opens the front', async ({ page }) => {
    await open(page, `${SAMPLE}&side=back`);
    await expect(sideRadio(page, 'Back')).toHaveAttribute('aria-checked', 'true');
    await open(page, `${SAMPLE}&side=inside`);
    await expect(sideRadio(page, 'Front')).toHaveAttribute('aria-checked', 'true');
    expect((await canvas(page)).ids).toHaveLength(7); // 8 layers, one of them hidden
  });
});

test.describe('tablet: sides with the drawer', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('switch, copy and clear; the drawer follows the active side', async ({ page }) => {
    await open(page, SAMPLE);
    await sideRadio(page, 'Back').tap();
    await page.getByRole('button', { name: 'Layers and properties' }).tap();
    const drawer = page.getByRole('dialog', { name: 'Layers and properties' });
    await expect(drawer.getByText('Back · 5 items')).toBeVisible();
    await page.keyboard.press('Escape');
    await sideMenu(page, /Clear back/);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear back' }).tap();
    await expect(page.getByRole('heading', { name: 'Back side is empty' })).toBeVisible();
    await page.getByRole('button', { name: 'Copy front to back' }).tap();
    await page.getByRole('button', { name: 'Layers and properties' }).tap();
    await expect(drawer.getByText('Back · 8 items')).toBeVisible();
  });
});

test.describe('phone: sides above the canvas', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('switch, add, edit text, copy and clear; no sideways scrolling', async ({ page }) => {
    await open(page);
    const backRadio = sideRadio(page, 'Back');
    expect((await backRadio.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Text' }).tap();
    await page.getByRole('button', { name: 'Add heading' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Edit text' });
    await page.keyboard.type('Riya');
    await sheet.getByRole('button', { name: 'Done' }).tap();
    await backRadio.tap();
    await expect(page.getByRole('heading', { name: 'Back side is empty' })).toBeVisible();
    await page.getByRole('button', { name: 'Copy front to back' }).tap();
    expect((await canvas(page)).texts).toEqual(['Riya']);
    await expect(page.getByRole('toolbar', { name: /^Selected:/ })).toHaveCount(0); // nothing selected after a copy
    await sideMenu(page, /Clear back/);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear back' }).tap();
    expect((await canvas(page)).texts).toEqual([]);
    await sideRadio(page, 'Front').tap();
    expect((await canvas(page)).texts).toEqual(['Riya']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await axe(page, '#studio-canvas')).toEqual([]);
  });
});
