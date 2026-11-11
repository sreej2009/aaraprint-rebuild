import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { expect, test } from './fixtures';

/**
 * Preview in the browser (Phase 3 M14): opening and closing with focus handled, drawing the
 * current design exactly as the editor does (order, rotation, opacity, hidden layers, images,
 * graphics, missing files) but as the trimmed piece with no guides or controls, front and back,
 * zoom and pan of its own, and never changing the design, its history or the editor's view.
 * Every test starts with an empty browser profile.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const BLANK = '/products/business-card-classic/design';
const SAMPLE = `${BLANK}?sample=1`;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const TEST_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><circle cx="120" cy="120" r="100" fill="#e8930c"/></svg>';

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

async function open(page: Page, url = BLANK) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

const preview = (page: Page) => page.getByRole('dialog', { name: 'Preview' });
const previewButton = (page: Page) => page.getByTestId('preview-button');

async function openPreview(page: Page) {
  await previewButton(page).click();
  await expect(preview(page)).toBeVisible();
  await expect(page.getByTestId('preview-loading')).toHaveCount(0, { timeout: 10_000 });
  await page.waitForFunction(() => window.Konva.stages.some((s) => s.container().classList.contains('studio-preview-stage')));
}

async function closePreview(page: Page) {
  await page.keyboard.press('Escape');
  await expect(preview(page)).toHaveCount(0);
}

/** What a stage draws: element ids bottom to top, with rotation, opacity, text and image state. */
async function drawn(page: Page, which: 'editor' | 'preview') {
  return page.evaluate((kind) => {
    const st = window.Konva.stages.find((s) => (kind === 'editor' ? s.container().closest('#studio-canvas') : s.container().classList.contains('studio-preview-stage')))!;
    return {
      layers: st.getLayers().map((l) => l.name()),
      guides: st.find((n: KonvaNamespace.Node) => n.name().startsWith('guide')).length,
      background: String(st.findOne('.background')?.getAttr('fill') ?? ''),
      scale: st.scaleX(),
      x: st.x(),
      elements: st.find('.element').map((n) => {
        const g = n as KonvaNamespace.Group;
        const image = g.findOne<KonvaNamespace.Image>('Image')?.image() as HTMLImageElement | undefined;
        return {
          id: g.id(),
          rotation: g.rotation(),
          opacity: g.opacity(),
          text: g.findOne<KonvaNamespace.Text>('Text')?.text() ?? null,
          image: image ? image.naturalWidth > 0 : null,
          missing: Boolean(g.findOne('.image-missing')),
        };
      }),
    };
  }, which);
}

async function texts(page: Page) {
  return (await drawn(page, 'preview')).elements.map((e) => e.text).filter(Boolean);
}

async function makePng(page: Page, width: number, height: number): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.fillStyle = '#2f5bd3';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8930c';
      g.fillRect(0, 0, w / 3, h);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    [width, height] as const,
  );
  return Buffer.from(bytes);
}

async function standInLibrary(page: Page) {
  await page.route('**/api/v1/graphics.json', (route) =>
    route.fulfill({
      json: { graphics: [{ id: 'test-seal', name: 'Test seal', group: 'Badges', tags: [], width: 240, height: 240, url: '/studio/graphics/test-seal.svg', rights: 'cleared' }], withheld: 0 },
    }),
  );
  await page.route('**/studio/graphics/test-seal.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: TEST_SVG }));
}

const status = (page: Page) => page.getByTestId('save-status');
const saved = (page: Page) => expect(status(page)).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
const editorSide = (page: Page) => page.getByRole('radiogroup', { name: 'Side' }).locator('[aria-checked="true"]');

test.describe('desktop: preview', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('1–6 · 38 · Preview opens full screen with focus inside, passes axe, and Escape returns focus to the button', async ({ page }) => {
    await open(page, SAMPLE);
    await expect(previewButton(page)).toHaveAccessibleName('Preview');
    await openPreview(page);
    await expect(preview(page)).toHaveAccessibleDescription(/How the front of “.+” will look once printed and trimmed/);
    expect(await preview(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);
    const box = (await preview(page).boundingBox())!;
    expect(box).toMatchObject({ x: 0, y: 0, width: 1440, height: 900 });
    const results = await new AxeBuilder({ page }).include('[data-testid="studio-preview"]').withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    await closePreview(page);
    await expect(previewButton(page)).toBeFocused();
    await openPreview(page);
    await preview(page).getByRole('button', { name: 'Close preview' }).click();
    await expect(preview(page)).toHaveCount(0);
    await expect(previewButton(page)).toBeFocused();
  });

  test('7–14 · 29 · draws what the editor draws: text, shapes, graphics, images, background, order, rotation, opacity', async ({ page }) => {
    await standInLibrary(page);
    await open(page, SAMPLE);
    // A graphic at 40 % opacity, turned 30°, and an uploaded photo on top.
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Graphics' }).click();
    await page.getByRole('button', { name: 'Add graphic: Test seal' }).click();
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('textbox', { name: 'Opacity' }).fill('40');
    await inspector.getByRole('textbox', { name: 'Opacity' }).press('Enter');
    await inspector.getByRole('textbox', { name: 'Rotation' }).fill('30');
    await inspector.getByRole('textbox', { name: 'Rotation' }).press('Enter');
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Uploads' }).click();
    await page.getByTestId('upload-input').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: await makePng(page, 600, 400) });
    await page.getByRole('button', { name: /^Add image: photo\.png/ }).click();
    await expect.poll(async () => (await drawn(page, 'editor')).elements.filter((e) => e.image).length).toBe(2);

    const editor = await drawn(page, 'editor');
    await openPreview(page);
    await expect.poll(async () => (await drawn(page, 'preview')).elements.filter((e) => e.image).length).toBe(2);
    const shown = await drawn(page, 'preview');
    // Same elements, same order, same rotation, opacity, text — hidden layers stay hidden.
    expect(shown.elements).toEqual(editor.elements);
    expect(shown.elements.map((e) => e.id)).not.toContain('el_hidden');
    expect(shown.elements.map((e) => e.id)).toContain('el_badge'); // locked, still shown
    expect(shown.elements.find((e) => e.text === 'Riya Sharma')).toBeTruthy();
    const graphic = shown.elements.at(-2)!;
    expect(graphic).toMatchObject({ rotation: 30, opacity: 0.4, image: true });
    expect(shown.elements.at(-1)).toMatchObject({ image: true, missing: false });
    // The sample's logo file was never uploaded: the M12 crossed frame, not a crash.
    expect(shown.elements.find((e) => e.id === 'el_logo')).toMatchObject({ missing: true });
    expect(shown.background).toBe(editor.background);
  });

  test('15–19 · no guides, bleed, handles or editor controls — the trimmed piece only', async ({ page }) => {
    await open(page, SAMPLE);
    await page
      .getByRole('list', { name: 'Layers' })
      .getByRole('button', { name: /^Star, star/ })
      .click();
    await expect(page.locator('[data-handle]').first()).toBeVisible();
    expect((await drawn(page, 'editor')).guides).toBeGreaterThan(0);
    await openPreview(page);
    const shown = await drawn(page, 'preview');
    expect(shown.layers).toEqual(['preview-shadow', 'artwork']);
    expect(shown.guides).toBe(0);
    await expect(preview(page).locator('[data-handle], [data-testid="selection-frame"], [data-testid="selection-toolbar"]')).toHaveCount(0);
    for (const name of ['Design tools', 'Layers']) await expect(page.getByRole('navigation', { name })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Layers' })).toHaveCount(0); // the editor is hidden behind the preview
    // Clipped at the trim: just outside the left edge, beside the bleeding colour band, nothing is drawn.
    const outside = await page.evaluate(() => {
      const st = window.Konva.stages.find((s) => s.container().classList.contains('studio-preview-stage'))!;
      const layer = st.getLayers().find((l) => l.name() === 'artwork')!;
      const canvas = layer.getCanvas();
      const ratio = canvas.getPixelRatio();
      const x = Math.round((st.x() - 3) * ratio);
      const y = Math.round((st.y() + 540 * st.scaleY()) * ratio);
      return [...canvas.getContext()._context.getImageData(x, y, 1, 1).data];
    });
    expect(outside[3]).toBe(0);
  });

  test('20–22 · 39 · front and back: thumbnails, clicking and arrow keys; the editor stays on its side', async ({ page }) => {
    await open(page, SAMPLE);
    await openPreview(page);
    const sides = preview(page).getByRole('radiogroup', { name: 'Side to preview' });
    await expect(sides.getByRole('radio')).toHaveText(['Front 7 items', 'Back 5 items']);
    await expect(sides.locator('canvas')).toHaveCount(2); // one small drawing per side
    await expect(sides.getByRole('radio', { name: /^Front/ })).toHaveAttribute('aria-checked', 'true');
    expect(await texts(page)).toContain('Riya Sharma');
    await sides.getByRole('radio', { name: /^Back/ }).click();
    await expect.poll(() => texts(page)).toEqual(['Thank you']);
    await expect(preview(page).getByRole('region', { name: /^Back side: 5 items/ })).toBeVisible();
    await sides.getByRole('radio', { name: /^Back/ }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(sides.getByRole('radio', { name: /^Front/ })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => texts(page)).toContain('Riya Sharma');
    await page.keyboard.press('ArrowRight');
    await expect(sides.getByRole('radio', { name: /^Back/ })).toHaveAttribute('aria-checked', 'true');
    await closePreview(page);
    await expect(editorSide(page)).toHaveAccessibleName(/^Front/);
    expect((await drawn(page, 'editor')).elements.map((e) => e.text)).toContain('Riya Sharma');
  });

  test('24–27 · 40 · Fit, zoom in and out, presets and drag — none of it touches the editor’s zoom', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 }); // so 400 % is bigger than the screen
    await open(page, SAMPLE);
    const editorZoom = await page.getByRole('button', { name: /, view options$/ }).getAttribute('aria-label');
    const editorView = await drawn(page, 'editor');
    await openPreview(page);
    const area = page.getByTestId('preview-area');
    await expect(area).toHaveAttribute('data-zoom', 'fit');
    const fit = await drawn(page, 'preview');
    const zoomIn = preview(page).getByRole('button', { name: 'Zoom in' });
    await zoomIn.click();
    await expect(area).toHaveAttribute('data-zoom', 'manual');
    await expect(preview(page).getByRole('button', { name: 'Zoom 300%, zoom options' })).toBeVisible();
    await zoomIn.click();
    await expect(preview(page).getByRole('button', { name: 'Zoom 400%, zoom options' })).toBeVisible();
    expect((await drawn(page, 'preview')).scale).toBeGreaterThan(fit.scale);
    await expect(zoomIn).toHaveAttribute('aria-disabled', 'true'); // 400 % is the limit
    await expect(zoomIn).toBeFocused(); // still in the preview
    // Drag to look around a zoomed piece.
    const before = (await drawn(page, 'preview')).x;
    const box = (await area.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect((await drawn(page, 'preview')).x).toBeGreaterThan(before);
    // Keyboard: the zoom buttons are reachable, Ctrl − zooms the preview out.
    await preview(page).getByRole('button', { name: 'Zoom out' }).focus();
    await page.keyboard.press('Enter');
    await expect(preview(page).getByRole('button', { name: 'Zoom 300%, zoom options' })).toBeVisible();
    await page.keyboard.press('Control+-');
    // Fit (about 264 % here) is one of the stops.
    const menu = preview(page).getByRole('button', { name: /^Zoom 2\d\d%, zoom options$/ });
    await expect(menu).toBeVisible();
    await menu.click();
    await page.getByRole('menuitem', { name: /^50%/ }).click();
    await expect(preview(page).getByRole('button', { name: 'Zoom 50%, zoom options' })).toBeVisible();
    await preview(page).getByRole('button', { name: 'Fit' }).click();
    await expect(area).toHaveAttribute('data-zoom', 'fit');
    expect((await drawn(page, 'preview')).scale).toBeCloseTo(fit.scale, 5);
    await closePreview(page);
    await expect(page.getByRole('button', { name: /, view options$/ })).toHaveAttribute('aria-label', editorZoom!);
    expect((await drawn(page, 'editor')).scale).toBe(editorView.scale);
  });

  test('28 · an empty design and an empty side say so', async ({ page }) => {
    await open(page);
    await openPreview(page);
    await expect(preview(page).getByTestId('preview-empty')).toHaveText('Your design is empty');
    await closePreview(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Text', exact: true }).click();
    await page.getByRole('button', { name: 'Add heading' }).click();
    await page.keyboard.type('Front only');
    await page.keyboard.press('Control+Enter');
    await openPreview(page);
    await expect(preview(page).getByTestId('preview-empty')).toHaveCount(0);
    await preview(page).getByRole('radio', { name: /^Back/ }).click();
    await expect(preview(page).getByTestId('preview-empty')).toHaveText('No artwork on this side');
    await expect(preview(page).getByRole('radio', { name: /^Back/ })).toHaveText('Back Empty');
  });

  test('31–33 · shows unsaved changes, adds no undo step, doesn’t trigger saving, and the saved design still restores', async ({ page }) => {
    await open(page);
    await saved(page).catch(() => {}); // a new design isn't saved until it changes
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Text', exact: true }).click();
    await page.getByRole('button', { name: 'Add heading' }).click();
    await page.keyboard.type('Not saved yet');
    await page.keyboard.press('Control+Enter');
    await openPreview(page); // straight away, before autosave
    expect(await texts(page)).toEqual(['Not saved yet']);
    await preview(page).getByRole('radio', { name: /^Back/ }).click();
    await preview(page).getByRole('button', { name: 'Zoom in' }).click();
    await page.keyboard.press('Control+z'); // no undo inside the preview
    await closePreview(page);
    await saved(page);
    expect((await drawn(page, 'editor')).elements.map((e) => e.text)).toEqual(['Not saved yet']);
    // The preview recorded nothing: the last steps are still typing the heading, then adding it.
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await drawn(page, 'editor')).elements.map((e) => e.text)).toEqual(['Add a heading']);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await drawn(page, 'editor')).elements).toHaveLength(0);
    await page.keyboard.press('Control+Shift+z');
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(async () => (await drawn(page, 'editor')).elements.map((e) => e.text)).toEqual(['Not saved yet']);
    await saved(page);
    // Opening and closing the preview on a saved design leaves it saved.
    await openPreview(page);
    await closePreview(page);
    await expect(status(page)).toHaveAttribute('data-status', 'saved');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openPreview(page);
    expect(await texts(page)).toEqual(['Not saved yet']);
  });

  test('regression: upload, template, edit, preview both sides, keep editing, autosave and reload', async ({ page }) => {
    await open(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Uploads' }).click();
    await page.getByTestId('upload-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await makePng(page, 300, 300) });
    await page.getByRole('button', { name: /^Add image: logo\.png/ }).click();
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Templates' }).click();
    await page.getByRole('button', { name: /^Minimal centred[ .]/ }).click();
    await page.getByRole('button', { name: 'Apply to both sides' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add to both sides' }).click();
    const inspector = page.getByRole('complementary', { name: 'Layers and properties' });
    await inspector.getByRole('button', { name: /^Your Name, text/ }).click();
    await inspector.getByRole('textbox', { name: 'Text content' }).fill('Asha Rao');
    await inspector.getByRole('textbox', { name: 'Text content' }).press('Tab');
    await openPreview(page);
    expect(await texts(page)).toContain('Asha Rao');
    expect((await drawn(page, 'preview')).elements.some((e) => e.image)).toBe(true);
    await preview(page).getByRole('radio', { name: /^Back/ }).click();
    await expect.poll(() => texts(page)).toContain('Company Name');
    await closePreview(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Shapes' }).click();
    await page.getByRole('button', { name: 'Add star', exact: true }).click();
    await saved(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openPreview(page);
    expect(await texts(page)).toContain('Asha Rao');
    await expect.poll(async () => (await drawn(page, 'preview')).elements.filter((e) => e.image).length).toBe(1);
    expect((await drawn(page, 'preview')).elements).toHaveLength(5); // image, 3 template layers, star
  });
});

test.describe('tablet: preview', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('35 · opens by touch, sides and zoom in the header, closes back to the editor', async ({ page }) => {
    await open(page, SAMPLE);
    await previewButton(page).tap();
    await expect(preview(page)).toBeVisible();
    await expect(page.getByTestId('preview-loading')).toHaveCount(0, { timeout: 10_000 });
    await preview(page).getByRole('radio', { name: /^Back/ }).tap();
    await expect.poll(() => texts(page)).toEqual(['Thank you']);
    const close = preview(page).getByRole('button', { name: 'Close preview' });
    expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await close.tap();
    await expect(preview(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('phone: preview', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('36 · full screen, with sides and zoom in a bottom bar; one finger moves a zoomed piece', async ({ page }) => {
    await open(page, SAMPLE);
    await previewButton(page).tap();
    await expect(preview(page)).toBeVisible();
    await expect(page.getByTestId('preview-loading')).toHaveCount(0, { timeout: 10_000 });
    // The drawing loads as its own chunk: wait for its stage, as openPreview() does.
    await page.waitForFunction(() => window.Konva.stages.some((s) => s.container().classList.contains('studio-preview-stage')));
    const viewport = page.viewportSize()!;
    expect((await preview(page).boundingBox())!).toMatchObject({ width: viewport.width, height: viewport.height });
    const back = preview(page).getByRole('radio', { name: /^Back/ });
    expect((await back.boundingBox())!.y).toBeGreaterThan(viewport.height / 2); // in the bottom bar
    await back.tap();
    await expect.poll(() => texts(page)).toEqual(['Thank you']);
    await preview(page).getByRole('button', { name: 'Zoom in' }).tap();
    await expect(page.getByTestId('preview-area')).toHaveAttribute('data-zoom', 'manual');
    for (const name of ['Zoom in', 'Zoom out', 'Close preview']) expect((await preview(page).getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await preview(page).getByRole('button', { name: 'Close preview' }).tap();
    await expect(preview(page)).toHaveCount(0);
  });
});

test.describe('every width', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'sizes set here');

  test('34 · 37 · no sideways scrolling from 1440 to 360 px, with the preview open and zoomed', async ({ page }) => {
    await open(page, SAMPLE);
    await openPreview(page);
    for (const width of [1440, 1280, 1024, 820, 768, 390, 360]) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await expect(preview(page).getByRole('button', { name: 'Close preview' })).toBeVisible();
      await expect(preview(page).getByRole('button', { name: 'Zoom in' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${width}px`).toBeLessThanOrEqual(0);
    }
    await preview(page).getByRole('button', { name: 'Zoom in' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
