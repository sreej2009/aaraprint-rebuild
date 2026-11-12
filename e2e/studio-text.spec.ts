import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { expect, test, openTool } from './fixtures';

/**
 * Text tool (Phase 3 M8) against the real canvas: adding text, editing it in place (desktop,
 * tablet) or in a sheet (phone), styling it, re-flowing it, and undo. Konva's own measurement
 * decides the stored height, so these tests also check that box and drawn text agree.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const SAMPLE = '/products/business-card-classic/design?sample=1';
const BLANK = '/products/business-card-classic/design';
const PT = 300 / 72; // print px per point at 300 DPI
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function open(page: Page, url = SAMPLE) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

interface DrawnText {
  id: string;
  text: string;
  /** The element's stored box (the group is drawn in it). */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** What Konva laid out. */
  textHeight: number;
  lines: number;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  fill: string;
  align: string;
  lineHeight: number;
  letterSpacing: number;
}

/** Every text element the canvas draws, bottom to top. */
async function texts(page: Page): Promise<DrawnText[]> {
  return page.evaluate(() => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return st.find('.element-text').map((g) => {
      const t = (g as KonvaNamespace.Group).findOne<KonvaNamespace.Text>('Text')!;
      return {
        id: g.id(),
        text: t.text(),
        x: g.x() - g.offsetX(),
        y: g.y() - g.offsetY(),
        width: g.offsetX() * 2,
        height: g.offsetY() * 2,
        rotation: g.rotation(),
        textHeight: t.height(),
        lines: t.textArr.length,
        fontFamily: t.fontFamily(),
        fontSize: t.fontSize(),
        fontStyle: t.fontStyle(),
        fill: String(t.fill()),
        align: t.align(),
        lineHeight: t.lineHeight(),
        letterSpacing: t.letterSpacing(),
      };
    });
  });
}

const topText = async (page: Page) => (await texts(page)).at(-1)!;
const textById = async (page: Page, id: string) => (await texts(page)).find((t) => t.id === id);

async function canvasPoint(page: Page, x: number, y: number) {
  const area = (await page.getByTestId('canvas-area').boundingBox())!;
  const s = await page.evaluate(() => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return { scale: st.scaleX(), x: st.x(), y: st.y() };
  });
  return { x: area.x + s.x + x * s.scale, y: area.y + s.y + y * s.scale };
}

async function addPreset(page: Page, name: string) {
  await openTool(page, 'Text');
  await page.getByRole('button', { name }).click();
}

/** Stored heights match what Konva lays out, for every text on the side (no stale wrapping). */
async function expectHeightsTrue(page: Page) {
  await expect.poll(async () => (await texts(page)).filter((t) => Math.abs(t.height - t.textHeight) > 0.02).map((t) => t.id)).toEqual([]);
}

async function axe(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder.include(include);
  const results = await builder.analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

test.describe('desktop: add, edit and style text', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('add a heading, type a name, set 14 pt bold centred; undo removes the typing in one step', async ({ page }) => {
    await open(page, BLANK);
    await addPreset(page, 'Add heading');
    const editor = page.getByTestId('text-edit-overlay');
    await expect(editor).toBeFocused();
    await expect(editor).toHaveValue('Add a heading');
    // The sample text is selected, so typing replaces it.
    await page.keyboard.type('Riya Sharma');
    // The layer name follows live (the canvas hides its own copy while the editor is open).
    await expect(page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /^Riya Sharma, text/ })).toBeVisible();
    await page.keyboard.press('Control+Enter');
    expect((await topText(page)).text).toBe('Riya Sharma');
    await expect(editor).toHaveCount(0);
    await expect(page.locator('#studio-canvas')).toBeFocused();

    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('textbox', { name: 'Font size' }).fill('14');
    await inspector.getByRole('textbox', { name: 'Font size' }).press('Enter');
    await inspector.getByRole('combobox', { name: 'Font weight' }).click();
    await page.getByRole('option', { name: 'Bold', exact: true }).click();
    await inspector.getByRole('radio', { name: 'Centre' }).click();
    const drawn = await topText(page);
    expect(drawn.fontSize).toBeCloseTo(14 * PT, 1);
    expect(drawn.fontStyle).toBe('700');
    expect(drawn.align).toBe('center');
    expect(drawn.fontFamily).toContain('Fraunces Variable');
    // New text sits centred in the safe area.
    expect(drawn.x + drawn.width / 2).toBeCloseTo(1050 / 2, 0);

    // Undo: weight and size (headings start centred, so Centre changed nothing and left no step),
    // then the whole typing in one step, then the heading itself.
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    for (let i = 0; i < 2; i += 1) await undo.click();
    await expect.poll(async () => (await topText(page))?.text).toBe('Riya Sharma');
    await undo.click();
    await expect.poll(async () => (await topText(page))?.text).toBe('Add a heading');
    await undo.click();
    await expect.poll(async () => (await texts(page)).length).toBe(0);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(async () => (await topText(page))?.text).toBe('Riya Sharma');
  });

  test('double-click edits existing text; Escape restores it; clicking away keeps it', async ({ page }) => {
    await open(page);
    const name = (await textById(page, 'el_name'))!;
    const at = await canvasPoint(page, name.x + 60, name.y + name.height / 2);
    await page.mouse.dblclick(at.x, at.y);
    const editor = page.getByTestId('text-edit-overlay');
    await expect(editor).toBeFocused();
    expect(await textById(page, 'el_name')).toBeUndefined(); // the editor shows it instead
    // Keys edit the text, never the layer.
    await page.keyboard.press('End');
    await page.keyboard.type(' Kapoor');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');
    await expect(editor).toHaveValue('Riya Sharma Kapo');
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    expect((await textById(page, 'el_name'))!).toMatchObject({ text: 'Riya Sharma', x: name.x, y: name.y });
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();

    await page.keyboard.press('Enter'); // the text is still selected: Enter edits it
    await expect(editor).toBeFocused();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Arjun Mehta');
    const empty = await canvasPoint(page, 1000, 560);
    await page.mouse.click(empty.x, empty.y);
    await expect(editor).toHaveCount(0);
    expect((await textById(page, 'el_name'))!.text).toBe('Arjun Mehta');
    await expect(page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /^Arjun Mehta, text/ })).toBeVisible();
  });

  test('narrowing the box re-flows the text and the height follows; font size never changes', async ({ page }) => {
    await open(page);
    const before = (await textById(page, 'el_name'))!;
    const at = await canvasPoint(page, before.x + 60, before.y + before.height / 2);
    await page.mouse.click(at.x, at.y);
    const handle = page.locator('[data-handle="e"]');
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const right = await canvasPoint(page, before.x + 240, 0);
    await page.mouse.move(right.x, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const after = (await textById(page, 'el_name'))!;
    expect(after.width).toBeLessThan(260);
    expect(after.lines).toBeGreaterThan(1);
    expect(after.height).toBeCloseTo(after.textHeight, 1);
    expect(after.height).toBeCloseTo(before.height * after.lines, 0);
    expect(after.fontSize).toBe(before.fontSize);
    // The inspector shows the measured height, read-only.
    const h = page.getByRole('textbox', { name: 'H, height (follows the text)' });
    await expect(h).toHaveAttribute('readonly', '');
    await expect(h).toHaveValue(String(Math.round(((after.height / 300) * 25.4) * 10) / 10));
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await textById(page, 'el_name'))!.lines).toBe(1);
    await expectHeightsTrue(page);
  });

  test('font, colour, line height and letter spacing reach the canvas; fonts load before measuring', async ({ page }) => {
    await open(page);
    await page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /^Brand designer,/ }).click();
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('combobox', { name: 'Font family' }).click();
    await page.getByRole('option', { name: 'Plus Jakarta Sans' }).click();
    await inspector.getByRole('textbox', { name: 'Text colour, hex code' }).fill('#15803d');
    await inspector.getByRole('textbox', { name: 'Text colour, hex code' }).press('Enter');
    await inspector.getByRole('textbox', { name: 'Line height' }).fill('1.5');
    await inspector.getByRole('textbox', { name: 'Line height' }).press('Enter');
    await inspector.getByRole('textbox', { name: 'Letter spacing' }).fill('0.1');
    await inspector.getByRole('textbox', { name: 'Letter spacing' }).press('Enter');
    const title = (await textById(page, 'el_title'))!;
    expect(title).toMatchObject({ fill: '#15803d', lineHeight: 1.5, fontStyle: 'italic 400' });
    expect(title.fontFamily).toContain('Plus Jakarta Sans Variable');
    expect(title.letterSpacing).toBeCloseTo(4.2, 2); // 0.1 em of 42 px
    // The face downloads on demand; once it has arrived, every stored height matches Konva's layout
    // in the real font (the Studio re-measures when a font loads).
    await expect.poll(() => page.evaluate(() => document.fonts.check("italic 400 16px 'Plus Jakarta Sans Variable'", 'Brand designer'))).toBe(true);
    await expectHeightsTrue(page);
    expect(await axe(page, 'aside[aria-label="Layers and properties"]')).toEqual([]);
  });

  test('the editor follows zoom and rotation, and never reaches the exported artwork', async ({ page }) => {
    await open(page);
    await page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /^Riya Sharma,/ }).click();
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    for (const zoom of ['Zoom in', 'Zoom out', 'Zoom out']) {
      await page.getByRole('button', { name: zoom }).first().click();
      await page.locator('#studio-canvas').focus();
      await page.keyboard.press('Enter');
      const editor = page.getByTestId('text-edit-overlay');
      const frame = (await page.getByTestId('editing-frame').boundingBox())!;
      const field = (await editor.boundingBox())!;
      expect(Math.abs(field.x - frame.x)).toBeLessThan(2);
      expect(Math.abs(field.y - frame.y)).toBeLessThan(2);
      expect(Math.abs(field.width - frame.width)).toBeLessThan(2);
      await page.keyboard.press('Escape');
    }
    await inspector.getByRole('textbox', { name: 'Rotation' }).fill('20');
    await inspector.getByRole('textbox', { name: 'Rotation' }).press('Enter');
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('text-edit-overlay')).toHaveCSS('transform', /matrix\(0\.93/);
    expect(await page.evaluate(() => window.Konva.stages[0]!.findOne<KonvaNamespace.Layer>('.artwork')!.find('Text').length)).toBe(3); // 4 visible texts; the edited one is the editor's while editing
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.Konva.stages[0]!.findOne<KonvaNamespace.Layer>('.artwork')!.find('Text').length)).toBe(4);
  });
});

test.describe('tablet: add and edit in place, inspector in the drawer', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('add text, type, tap away; style it from the drawer', async ({ page }) => {
    await open(page, BLANK);
    await page.getByRole('button', { name: 'Text', exact: true }).tap();
    await page.getByRole('button', { name: 'Add subheading' }).tap();
    await expect(page.getByRole('complementary', { name: 'Text' })).toHaveCount(0); // the panel stepped aside
    const editor = page.getByTestId('text-edit-overlay');
    await expect(editor).toBeFocused();
    await page.keyboard.type('Wedding invitation');
    const empty = await canvasPoint(page, 1000, 560);
    await page.touchscreen.tap(empty.x, empty.y);
    await expect(editor).toHaveCount(0);
    expect((await topText(page)).text).toBe('Wedding invitation');

    // Double-tap edits again.
    const t = await topText(page);
    const at = await canvasPoint(page, t.x + t.width / 2, t.y + t.height / 2);
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(120);
    await page.touchscreen.tap(at.x, at.y);
    await expect(editor).toBeFocused();
    await page.keyboard.press('Escape');

    await page.getByRole('toolbar', { name: /^Selected:/ }).getByRole('button', { name: 'Properties' }).tap();
    const drawer = page.getByRole('dialog', { name: 'Layers and properties' });
    await drawer.getByRole('button', { name: 'Increase Font size' }).tap();
    await drawer.getByRole('button', { name: 'Red' }).tap();
    expect((await topText(page)).fill).toBe('#b91c1c');
    expect(await axe(page, '[role="dialog"]')).toEqual([]);
  });
});

test.describe('phone: add and edit in the sheet', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('add a heading, type in the sheet, Done; change the width; undo', async ({ page }) => {
    await open(page, BLANK);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Text' }).tap();
    await page.getByRole('button', { name: 'Add heading' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Edit text' });
    const field = sheet.getByRole('textbox', { name: 'Text content' });
    await expect(field).toBeFocused();
    await page.keyboard.type('Riya Sharma');
    await expect.poll(async () => (await topText(page))?.text).toBe('Riya Sharma'); // live on the canvas
    expect(await axe(page, '[role="dialog"]')).toEqual([]);
    await sheet.getByRole('button', { name: 'Done' }).tap();
    await expect(sheet).toHaveCount(0);

    // Width from the inspector sheet: − / + controls, at least 40 px tall.
    await page.getByRole('toolbar', { name: /^Selected:/ }).getByRole('button', { name: 'Properties' }).tap();
    const inspector = page.getByRole('dialog', { name: 'Layers and properties' });
    const before = await topText(page);
    const width = inspector.getByRole('textbox', { name: 'W, width' });
    await width.fill('20');
    await width.press('Enter');
    await expect.poll(async () => (await topText(page)).lines).toBe(2);
    const after = await topText(page);
    expect(after.height).toBeCloseTo(after.textHeight, 1);
    expect(after.fontSize).toBe(before.fontSize);
    const plus = inspector.getByRole('button', { name: 'Increase Font size' });
    expect((await plus.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Undo' }).tap();
    await expect.poll(async () => (await topText(page)).lines).toBe(1);
    await page.getByRole('button', { name: 'Undo' }).tap();
    await expect.poll(async () => (await topText(page)).text).toBe('Add a heading');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
