import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type KonvaNamespace from 'konva';
import { expect, test, confirmEntry } from './fixtures';

/**
 * Phase 3 hardening (M16): whole-Studio flows that cross milestones — product page to saved design,
 * images and their files, front and back, copying sides, templates, preview, print check and proof,
 * versions, locked and hidden layers — plus shortcut isolation, an axe sweep, every product family
 * and the critical flow on tablet and phone. Each feature also has its own spec; these check that
 * they still work together. Every test starts with an empty browser profile.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const CARD = '/products/business-card-classic/design';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

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

async function open(page: Page, url = CARD) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

/** What the editor canvas draws on the visible side. */
async function canvas(page: Page) {
  return page.evaluate(() => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return {
      ids: st.find('.element').map((n) => n.id()),
      texts: st.find('Text').map((t) => (t as KonvaNamespace.Text).text()),
      background: String(st.findOne('.background')?.getAttr('fill') ?? ''),
      scale: st.scaleX(),
      images: st.find('.element-image').map((g) => {
        const image = (g as KonvaNamespace.Group).findOne<KonvaNamespace.Image>('Image')?.image() as HTMLImageElement | undefined;
        return { loaded: Boolean(image && image.naturalWidth > 0), missing: Boolean((g as KonvaNamespace.Group).findOne('.image-missing')) };
      }),
      boxes: Object.fromEntries(
        st.find('.element').map((n) => {
          const g = n as KonvaNamespace.Group;
          return [g.id(), { x: Math.round(g.x() - g.offsetX()), width: Math.round(g.offsetX() * 2) }];
        }),
      ),
    };
  });
}

const rail = (page: Page) => page.getByRole('navigation', { name: 'Design tools' });
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Layers and properties' });
const layers = (page: Page) => page.getByRole('list', { name: 'Layers' });
const status = (page: Page) => page.getByTestId('save-status');
const saved = (page: Page) => expect(status(page)).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
const side = (page: Page, name: 'Front' | 'Back') => page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: new RegExp(`^${name}`) });
const undo = (page: Page) => page.getByRole('button', { name: 'Undo' });

async function tool(page: Page, name: string) {
  const button = rail(page).getByRole('button', { name, exact: true });
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click(); // rail buttons toggle
}

async function addHeading(page: Page, text: string) {
  await tool(page, 'Text');
  await page.getByRole('button', { name: 'Add heading' }).click();
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
}

async function setField(page: Page, name: string, value: string) {
  const field = inspector(page).getByRole('textbox', { name });
  await field.fill(value);
  await field.press('Enter');
}

async function reload(page: Page) {
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
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
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    [width, height] as const,
  );
  return Buffer.from(bytes);
}

async function placeImage(page: Page, name: string, width: number, height: number) {
  await tool(page, 'Uploads');
  await page.getByTestId('upload-input').setInputFiles({ name, mimeType: 'image/png', buffer: await makePng(page, width, height) });
  await page.getByRole('button', { name: new RegExp(`^Add image: ${name.replace('.', '\\.')}`) }).click();
  await expect.poll(async () => (await canvas(page)).images.some((i) => i.loaded)).toBe(true);
}

async function clearStoredFiles(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('aaraprint-studio');
        req.onsuccess = () => {
          const tx = req.result.transaction('assets', 'readwrite');
          tx.objectStore('assets').clear();
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
        };
      }),
  );
}

test.describe('desktop flows', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('A · product page to a saved design: text and shape, move and resize, undo and redo, save, reload', async ({ page }) => {
    await page.goto('/products/business-card-classic');
    await page.getByRole('link', { name: 'Start designing' }).first().click();
    await confirmEntry(page);
    await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
    await addHeading(page, 'Asha Rao');
    await tool(page, 'Shapes');
    await page.getByRole('button', { name: 'Add rectangle', exact: true }).click();
    await setField(page, 'X, from the left trim edge', '10');
    await setField(page, 'W, width', '20');
    const shape = (await canvas(page)).ids.at(-1)!;
    expect((await canvas(page)).boxes[shape]).toEqual({ x: 118, width: 236 });
    await undo(page).click();
    expect((await canvas(page)).boxes[shape]!.x).toBe(118);
    await page.getByRole('button', { name: 'Redo' }).click();
    expect((await canvas(page)).boxes[shape]!.width).toBe(236);
    await page.keyboard.press('Control+s');
    await saved(page);
    const before = await canvas(page);
    await reload(page);
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Asha Rao']);
    expect((await canvas(page)).boxes).toEqual(before.boxes);
    await expect(undo(page)).toBeDisabled(); // history isn't kept across reloads (by design)
  });

  test('B · an image: place, move, resize, its DPI, save and reload', async ({ page }) => {
    await open(page);
    await placeImage(page, 'photo.png', 1200, 800);
    await setField(page, 'X, from the left trim edge', '5');
    await setField(page, 'W, width', '60');
    await expect(inspector(page).getByTestId('image-resolution')).toHaveText(/Good · 508 DPI/);
    await saved(page);
    await reload(page);
    await expect.poll(async () => (await canvas(page)).images).toEqual([{ loaded: true, missing: false }]);
    await layers(page)
      .getByRole('button', { name: /^photo\.png, image/ })
      .click();
    await expect(inspector(page).getByTestId('image-resolution')).toHaveText(/Good · 508 DPI/);
    await expect(inspector(page).getByRole('textbox', { name: 'W, width' })).toHaveValue('60');
  });

  test('C · a file that goes missing: placeholder after reload, then Replace and Delete still work', async ({ page }) => {
    await open(page);
    await placeImage(page, 'first.png', 600, 600);
    await placeImage(page, 'second.png', 600, 600);
    await saved(page);
    await clearStoredFiles(page);
    await reload(page);
    await expect
      .poll(async () => (await canvas(page)).images)
      .toEqual([
        { loaded: false, missing: true },
        { loaded: false, missing: true },
      ]);
    await layers(page)
      .getByRole('button', { name: /^first\.png, image/ })
      .click();
    await expect(inspector(page).getByText('Image unavailable')).toBeVisible();
    await page.getByTestId('replace-input').setInputFiles({ name: 'fresh.png', mimeType: 'image/png', buffer: await makePng(page, 900, 900) });
    await expect.poll(async () => (await canvas(page)).images.filter((i) => i.loaded)).toHaveLength(1);
    await layers(page)
      .getByRole('button', { name: /^second\.png, image/ })
      .click();
    await inspector(page).getByRole('button', { name: 'Delete', exact: true }).last().click();
    await expect.poll(async () => (await canvas(page)).images).toEqual([{ loaded: true, missing: false }]);
  });

  test('D · front and back edited on their own, saved and reloaded', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Front words');
    await side(page, 'Back').click();
    await addHeading(page, 'Back words');
    await tool(page, 'Background');
    await page.getByRole('complementary', { name: 'Background' }).getByRole('button', { name: 'Deep indigo' }).click();
    await side(page, 'Front').click();
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Front words']);
    await layers(page).getByRole('button', { name: /^Front words/ }).click();
    await setField(page, 'X, from the left trim edge', '12');
    await saved(page);
    await reload(page);
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Front words']);
    expect((await canvas(page)).background).not.toBe('#2f2a7a');
    await side(page, 'Back').click();
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Back words']);
    expect((await canvas(page)).background).toBe('#2f2a7a');
  });

  test('E · copy front to back: fresh ids, the back edits alone, undo puts it back', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Shared title');
    const front = await canvas(page);
    await page.getByRole('button', { name: 'Side options' }).click();
    await page.getByRole('menuitem', { name: /Copy front to back/ }).click();
    await expect(side(page, 'Back')).toHaveAttribute('aria-checked', 'true');
    const back = await canvas(page);
    expect(back.texts).toEqual(['Shared title']);
    expect(back.ids.some((id) => front.ids.includes(id))).toBe(false);
    await layers(page)
      .getByRole('button', { name: /^Shared title/ })
      .click();
    const content = inspector(page).getByRole('textbox', { name: 'Text content' });
    await content.fill('Back only');
    await content.press('Tab');
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Back only']);
    await side(page, 'Front').click();
    expect((await canvas(page)).texts).toEqual(['Shared title']);
    await undo(page).click(); // the back's text edit (undo goes to its side)
    await expect(side(page, 'Back')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Shared title']);
    await undo(page).click(); // the copy: back to the front, where it started; the back is empty again
    await expect(side(page, 'Front')).toHaveAttribute('aria-checked', 'true');
    await expect(side(page, 'Back')).toHaveAccessibleName(/^Back\D*0/);
    expect((await canvas(page)).texts).toEqual(['Shared title']);
  });

  test('F · a template: search, apply, edit, save, reload', async ({ page }) => {
    await open(page);
    await tool(page, 'Templates');
    await page.getByRole('searchbox', { name: 'Search templates' }).fill('emblem');
    await page.getByRole('button', { name: /^Classic emblem[ .]/ }).click();
    await page.getByRole('button', { name: 'Apply to both sides' }).click();
    await expect.poll(async () => (await canvas(page)).texts).toContain('Your Name');
    await layers(page)
      .getByRole('button', { name: /^Your Name, text/ })
      .click();
    const content = inspector(page).getByRole('textbox', { name: 'Text content' });
    await content.fill('Meera Iyer');
    await content.press('Tab');
    await saved(page);
    await reload(page);
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['YN', 'Meera Iyer', 'JOB TITLE']);
    await side(page, 'Back').click();
    await expect.poll(async () => (await canvas(page)).texts).toContain('Company Name');
  });

  test('G · Preview shows unsaved changes and leaves the editor exactly as it was', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Seen in preview');
    await layers(page)
      .getByRole('button', { name: /^Seen in preview/ })
      .click();
    const before = { canvas: await canvas(page), zoom: await page.getByRole('button', { name: /, view options$/ }).getAttribute('aria-label') };
    await page.getByTestId('preview-button').click();
    const preview = page.getByRole('dialog', { name: 'Preview' });
    await expect(page.getByTestId('preview-loading')).toHaveCount(0, { timeout: 10_000 });
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.Konva.stages
            .find((s) => s.container().classList.contains('studio-preview-stage'))
            ?.find('Text')
            .map((t) => (t as KonvaNamespace.Text).text()),
        ),
      )
      .toEqual(['Seen in preview']);
    await preview.getByRole('radio', { name: /^Back/ }).click();
    await preview.getByRole('button', { name: 'Zoom in' }).click();
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await expect(page.getByTestId('preview-button')).toBeFocused();
    expect(await canvas(page)).toEqual(before.canvas);
    await expect(page.getByRole('button', { name: /, view options$/ })).toHaveAttribute('aria-label', before.zoom!);
    await expect(side(page, 'Front')).toHaveAttribute('aria-checked', 'true');
    await expect(layers(page).getByRole('button', { name: /^Seen in preview/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('H · Print check: warnings, Show, a proof of the unsaved design — and no change to history', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Near the edge');
    await setField(page, 'X, from the left trim edge', '1'); // unsaved, outside the safe zone
    await page.getByTestId('print-check-button').click();
    const dialog = page.getByRole('dialog', { name: 'Print check and proof' });
    await expect(dialog.locator('li[data-kind="outside-safe"]')).toContainText('“Near the edge”');
    await dialog.getByRole('button', { name: 'Show Near the edge' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByTestId('print-check-button').click();
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('download-proof').click()]);
    const file = readFileSync((await (download as Download).path())!);
    expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([1216, 983]);
    await page.keyboard.press('Escape');
    // The last step is still the move: one undo puts the heading back where it was added.
    await undo(page).click();
    await expect(inspector(page).getByRole('textbox', { name: 'X, from the left trim edge' })).not.toHaveValue('1');
  });

  test('I · versions: autosave, Save now, another change, restore the earlier one (confirmed, undoable), reload', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Version one');
    await saved(page);
    await page.keyboard.press('Control+s');
    await saved(page);
    await layers(page)
      .getByRole('button', { name: /^Version one/ })
      .click();
    const content = inspector(page).getByRole('textbox', { name: 'Text content' });
    await content.fill('Version two');
    await content.press('Tab');
    await page.keyboard.press('Control+s');
    await saved(page);
    await status(page).click();
    await page.getByRole('menuitem', { name: /Version history/ }).click();
    const history = page.getByRole('dialog', { name: 'Version history' });
    await history
      .getByTestId('version-row')
      .nth(1)
      .getByRole('button', { name: /^Restore/ })
      .click();
    const confirm = page.getByRole('alertdialog', { name: 'Restore this version?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Restore' }).click();
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Version one']);
    // The history dialog closes after a restore and hands focus back to the save status when its
    // exit animation ends: wait for that, or a focus moved earlier is taken back and Ctrl Z lands there.
    await expect(history).toHaveCount(0);
    await expect(status(page)).toBeFocused();
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Version two']);
    await page.keyboard.press('Control+Shift+z');
    await saved(page);
    await reload(page);
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Version one']);
  });

  test('J · locked and hidden layers: protected until unlocked, hidden but kept', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Keep me');
    await addHeading(page, 'Hide me');
    await layers(page).getByRole('button', { name: 'Lock “Keep me”' }).click();
    await layers(page)
      .getByRole('button', { name: /^Keep me, text, locked/ })
      .click();
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Delete');
    await page.keyboard.press('ArrowRight');
    expect((await canvas(page)).texts).toContain('Keep me');
    await expect(inspector(page).getByRole('textbox', { name: 'X, from the left trim edge' })).toBeDisabled();
    await expect(page.getByRole('toolbar', { name: 'Selected layer' }).getByRole('button', { name: 'Move layer up' })).toBeDisabled();
    await layers(page).getByRole('button', { name: 'Hide “Hide me”' }).click();
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Keep me']);
    await expect(layers(page).getByRole('button', { name: /^Hide me, text, hidden/ })).toBeVisible();
    await layers(page).getByRole('button', { name: 'Show “Hide me”' }).click();
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Keep me', 'Hide me']);
    await layers(page).getByRole('button', { name: 'Unlock “Keep me”' }).click();
    await layers(page)
      .getByRole('button', { name: /^Keep me, text$/ })
      .click();
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await canvas(page)).texts).toEqual(['Hide me']);
  });

  test('shortcuts never fire while typing in search, number and name fields, or behind dialogs', async ({ page }) => {
    await open(page);
    await addHeading(page, 'Stay put');
    await layers(page)
      .getByRole('button', { name: /^Stay put/ })
      .click();
    const box = (await canvas(page)).boxes;
    // Template search.
    await tool(page, 'Templates');
    const search = page.getByRole('searchbox', { name: 'Search templates' });
    await search.fill('card');
    for (const key of ['Backspace', 'Delete', 'ArrowLeft', 'Control+d', 'Control+]']) await search.press(key);
    // A number field: arrows change the field, not the selection's position twice.
    const x = inspector(page).getByRole('textbox', { name: 'X, from the left trim edge' });
    await x.focus();
    await page.keyboard.press('Delete');
    // Layer name.
    await page.getByRole('toolbar', { name: 'Selected layer' }).getByRole('button', { name: 'Rename layer' }).click();
    const rename = page.getByRole('textbox', { name: 'Layer name' });
    await rename.press('Backspace');
    await rename.press('Escape');
    expect((await canvas(page)).ids).toHaveLength(1);
    expect((await canvas(page)).boxes).toEqual(box);
    // Behind the print-check dialog.
    await page.getByTestId('print-check-button').click();
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Escape');
    expect((await canvas(page)).texts).toEqual(['Stay put']);
  });

  test('axe: panels, inspector, layers, preview and print check have no violations', async ({ page }) => {
    test.setTimeout(60_000); // four axe scans: the same budget as the other full-page axe tests
    await open(page, `${CARD}?sample=1`);
    const scan = async (include?: string) => {
      const builder = new AxeBuilder({ page }).withTags(TAGS);
      const results = await (include ? builder.include(include) : builder).analyze();
      return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    };
    await layers(page)
      .getByRole('button', { name: /^Star, star/ })
      .click();
    expect(await scan()).toEqual([]); // templates panel, inspector with a selection, layers
    await tool(page, 'Uploads');
    await page.getByTestId('upload-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await makePng(page, 400, 400) });
    await page.getByRole('button', { name: /^Add image: logo\.png/ }).waitFor();
    expect(await scan()).toEqual([]);
    await page.getByTestId('preview-button').click();
    await expect(page.getByTestId('preview-loading')).toHaveCount(0, { timeout: 10_000 });
    expect(await scan('[role="dialog"]')).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByTestId('print-check-button').click();
    await page.getByRole('dialog', { name: 'Print check and proof' }).waitFor();
    expect(await scan('[role="dialog"]')).toEqual([]);
  });
});

test.describe('every product family', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'desktop');

  const FAMILIES = [
    'business-card-classic',
    'business-card-circle',
    'flyer-a5-standard',
    'sign-poster-standard',
    'banner-vinyl-standard',
    'gift-mug-custom-black',
    'bottle-flip-lid-sports',
    'pen-ballpoint-classic',
    'apparel-polo-6-degree',
    'apparel-cap-cotton',
    'umbrella-golf-classic',
    'bag-backpack-american-tourister',
    'stamp-date',
    'gift-mousepad-round-photo',
  ];

  const PROOF_SAMPLES = ['business-card-classic', 'gift-mug-custom-black', 'apparel-polo-6-degree'];

  test('each opens on its flat print area; Preview, Print check and a proof work', async ({ page }) => {
    test.setTimeout(150_000);
    for (const slug of FAMILIES) {
      await open(page, `/products/${slug}/design?sample=1`);
      await expect(page.getByRole('region', { name: /^Design canvas: / }), slug).toBeVisible();
      await page.getByTestId('preview-button').click();
      await expect(page.getByTestId('preview-loading'), slug).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByRole('dialog', { name: 'Preview' }).getByRole('radio'), slug).toHaveCount(2);
      await page.keyboard.press('Escape');
      await page.getByTestId('print-check-button').click();
      const dialog = page.getByRole('dialog', { name: 'Print check and proof' });
      await expect(dialog.getByTestId('proof-facts').or(dialog.getByTestId('proof-empty')), slug).toBeVisible();
      // Real proofs for one product per mode (flat, wrap, apparel): the rest only check the proof's size is planned within the cap.
      if (PROOF_SAMPLES.includes(slug)) {
        const frontOnly = dialog.getByRole('radio', { name: 'Front only' });
        if (await frontOnly.count()) await frontOnly.click();
        const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByTestId('download-proof').click()]);
        const file = readFileSync((await (download as Download).path())!);
        expect(file.subarray(1, 4).toString(), slug).toBe('PNG');
        expect(file.readUInt32BE(16) * file.readUInt32BE(20), slug).toBeLessThanOrEqual(16_000_000);
      } else {
        const size = /Proof image(\d+) × (\d+) px/.exec((await dialog.getByTestId('proof-facts').textContent()) ?? '');
        expect(size, slug).not.toBeNull();
        expect(Number(size![1]) * Number(size![2]), slug).toBeLessThanOrEqual(16_000_000);
      }
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('tablet: critical flow', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('text, shape, image, sides, templates, preview, print check and proof by touch; the top bar fits', async ({ page }) => {
    await open(page);
    const header = page.getByRole('banner');
    const title = header.getByText('Classic Visiting Cards design');
    expect((await title.boundingBox())!.width).toBeGreaterThanOrEqual(56);
    for (const name of ['Preview', /^Print check/, 'Continue']) await expect(header.getByRole('button', { name })).toBeVisible();
    await rail(page).getByRole('button', { name: 'Text', exact: true }).tap();
    await page.getByRole('button', { name: 'Add heading' }).tap();
    await page.keyboard.type('Tablet');
    await page.keyboard.press('Control+Enter');
    await rail(page).getByRole('button', { name: 'Shapes' }).tap();
    await page.getByRole('button', { name: 'Add circle', exact: true }).tap();
    await rail(page).getByRole('button', { name: 'Uploads' }).tap();
    await page.getByTestId('upload-input').setInputFiles({ name: 'tab.png', mimeType: 'image/png', buffer: await makePng(page, 900, 600) });
    await page.getByRole('button', { name: /^Add image: tab\.png/ }).tap();
    await expect.poll(async () => (await canvas(page)).ids).toHaveLength(3);
    await side(page, 'Back').tap();
    await rail(page).getByRole('button', { name: 'Templates' }).tap();
    await page.getByRole('button', { name: /^Bold left-aligned[ .]/ }).tap();
    await page.getByRole('button', { name: 'Apply to back' }).tap();
    await expect.poll(async () => (await canvas(page)).ids).toHaveLength(5);
    await page.getByTestId('preview-button').tap();
    await expect(page.getByRole('dialog', { name: 'Preview' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Preview' }).getByRole('button', { name: 'Close preview' }).tap();
    await page.getByTestId('print-check-button').tap();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-proof').tap()]);
    expect(readFileSync((await (download as Download).path())!).readUInt32BE(16)).toBe(2367);
    await page.keyboard.press('Escape');
    await saved(page);
    await reload(page);
    await expect(side(page, 'Front')).toHaveAccessibleName(/^Front\D*3/);
    await expect(side(page, 'Back')).toHaveAccessibleName(/^Back\D*5/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('phone: critical flow', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('tools, sheets, preview, print check and proof are all reachable; nothing scrolls sideways', async ({ page }) => {
    await open(page);
    const toolbar = page.getByRole('navigation', { name: 'Design tools' });
    await toolbar.getByRole('button', { name: /^Text/ }).tap();
    await page.getByRole('dialog', { name: 'Text' }).getByRole('button', { name: 'Add heading' }).tap();
    await page.keyboard.type('Phone');
    await page.keyboard.press('Control+Enter');
    await page.keyboard.press('Escape'); // deselect: the tool bar comes back in place of the selection's actions
    await toolbar.getByRole('button', { name: /^Templates/ }).tap();
    await page
      .getByRole('dialog', { name: 'Templates' })
      .getByRole('button', { name: /^Editorial serif[ .]/ })
      .tap();
    await page.getByRole('dialog', { name: 'Templates' }).getByRole('button', { name: 'Apply to front' }).tap();
    await page.getByRole('dialog').getByRole('button', { name: 'Add to front' }).tap();
    await expect.poll(async () => (await canvas(page)).ids).toHaveLength(6);
    await page.getByTestId('preview-button').tap();
    await expect(page.getByRole('dialog', { name: 'Preview' })).toBeVisible();
    await page.getByRole('button', { name: 'Close preview' }).tap();
    await page.getByTestId('print-check-button').tap();
    const proof = page.getByTestId('download-proof');
    await proof.scrollIntoViewIfNeeded();
    const [download] = await Promise.all([page.waitForEvent('download'), proof.tap()]);
    expect(readFileSync((await (download as Download).path())!).readUInt32BE(16)).toBe(1216);
    for (const id of ['preview-button', 'print-check-button']) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(36);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('every width', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'sizes set here');

  test('1440 to 360 px: no sideways scroll; name, Preview, Print check and Continue/Next all on screen', async ({ page }) => {
    await open(page, `${CARD}?sample=1`);
    for (const width of [1440, 1280, 1024, 820, 768, 600, 430, 390, 375, 360]) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      const header = page.getByRole('banner');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `${width}px` }).toBeLessThanOrEqual(0);
      for (const control of [
        header.getByText('Classic Visiting Cards design'),
        page.getByTestId('preview-button'),
        page.getByTestId('print-check-button'),
        header.getByRole('button', { name: /^(Continue|Next)$/ }),
      ]) {
        const box = (await control.boundingBox())!;
        expect(box, `${width}px`).toBeTruthy();
        expect(box.width, `${width}px`).toBeGreaterThan(20);
        expect(box.x + box.width, `${width}px`).toBeLessThanOrEqual(width + 0.5);
      }
    }
  });
});
