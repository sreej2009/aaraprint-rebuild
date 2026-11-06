import type { Page } from '@playwright/test';
import type KonvaNamespace from 'konva';
import { expect, test } from './fixtures';

/**
 * Uploaded images in the browser (Phase 3 M12), with the real IndexedDB and the browser's own
 * image decoder: uploading, refusing files, placing, editing, saving and restoring, one file on
 * both sides, versions, a file this browser doesn't have, and the phone and tablet layouts.
 * Test images are drawn in the page with a canvas, so no binary files live in the repository.
 * Every test starts with an empty browser profile.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const STUDIO = '/products/business-card-classic/design';
/** Print px per mm on the business card (300 DPI). */
const MM = 300 / 25.4;

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

async function open(page: Page, url = STUDIO) {
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

/** An image drawn in the page: w × h px, blue with an orange band on the left third. */
async function makeImage(page: Page, type: 'image/png' | 'image/jpeg' | 'image/webp', width: number, height: number): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ([mime, w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#2f5bd3';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8930c';
      g.fillRect(0, 0, w / 3, h);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), mime, 0.9));
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    [type, width, height] as const,
  );
  return Buffer.from(bytes);
}

/** A JPEG whose EXIF says "rotate 90° clockwise to view" (orientation 6), as phone photos are. */
function withExifOrientation6(jpeg: Buffer): Buffer {
  // APP1 "Exif": big-endian TIFF header, one IFD entry: Orientation (0x0112), SHORT, 1, value 6.
  const app1 = Buffer.from([
    0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

const rail = (page: Page) => page.getByRole('navigation', { name: 'Design tools' });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Uploads' });
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Layers and properties' });
const status = (page: Page) => page.getByTestId('save-status');
const saved = (page: Page) =>
  expect(status(page)).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
const addButton = (page: Page, name: string) =>
  page.getByRole('button', {
    name: new RegExp(`^Add image: ${name.replace('.', '\\.')}`),
  });

async function openUploads(page: Page) {
  const button = rail(page).getByRole('button', { name: 'Uploads' });
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click(); // the rail button toggles the panel
  await expect(panel(page)).toBeVisible();
}

async function upload(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.getByTestId('upload-input').setInputFiles({ name, mimeType, buffer });
}

/** Upload a w × h PNG and place it on the side being edited. */
async function placePng(page: Page, name = 'team-photo.png', width = 1200, height = 800) {
  await openUploads(page);
  await upload(page, name, 'image/png', await makeImage(page, 'image/png', width, height));
  await addButton(page, name).click();
  await expect.poll(() => images(page).then((list) => list.filter((i) => i.loaded).length)).toBeGreaterThan(0);
}

/** The image layers the canvas draws: box, rotation, and whether the picture itself is showing. */
async function images(page: Page) {
  return page.evaluate(() => {
    const st = window.Konva.stages.find((stage) => stage.container().closest('#studio-canvas'))!;
    return st.find('.element-image').map((node) => {
      const g = node as KonvaNamespace.Group;
      const picture = g.findOne<KonvaNamespace.Image>('Image');
      const bitmap = picture?.image() as HTMLImageElement | undefined;
      return {
        id: g.id(),
        x: g.x() - g.offsetX(),
        y: g.y() - g.offsetY(),
        width: g.offsetX() * 2,
        height: g.offsetY() * 2,
        rotation: g.rotation(),
        loaded: Boolean(bitmap && bitmap.naturalWidth > 0),
        natural: bitmap ? [bitmap.naturalWidth, bitmap.naturalHeight] : null,
        missing: Boolean(g.findOne('.image-missing')),
      };
    });
  });
}

/** What the Studio database holds. */
async function database(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        version: number;
        stores: string[];
        assets: {
          assetId: string;
          name: string;
          mime: string;
          blob: boolean;
        }[];
        designs: string[];
      }>((resolve) => {
        const req = indexedDB.open('aaraprint-studio');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['assets', 'designs']);
          const assets = tx.objectStore('assets').getAll();
          const designs = tx.objectStore('designs').getAll();
          tx.oncomplete = () => {
            resolve({
              version: db.version,
              stores: [...db.objectStoreNames],
              assets: assets.result.map((a) => ({
                assetId: a.assetId,
                name: a.name,
                mime: a.mime,
                blob: a.blob instanceof Blob,
              })),
              designs: designs.result.map((d) => JSON.stringify(d)),
            });
            db.close();
          };
        };
      }),
  );
}

async function setField(page: Page, name: string, value: string) {
  const field = inspector(page).getByRole('textbox', { name });
  await field.fill(value);
  await field.press('Enter');
}

test.describe('desktop: uploading and placing', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('1 · a PNG appears in My uploads, with its size and a thumbnail', async ({ page }) => {
    await open(page);
    await openUploads(page);
    await expect(panel(page).getByText('No uploaded images yet.')).toBeVisible();
    await upload(page, 'team-photo.png', 'image/png', await makeImage(page, 'image/png', 1200, 800));
    await expect(addButton(page, 'team-photo.png')).toHaveAttribute('aria-label', /team-photo\.png, 1200 × 800 px · \d+ KB$/);
    const thumb = addButton(page, 'team-photo.png').locator('img');
    await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    expect(await thumb.evaluate((img: HTMLImageElement) => Math.max(img.naturalWidth, img.naturalHeight))).toBeLessThanOrEqual(240);
    await expect(panel(page).getByText('No uploaded images yet.')).toHaveCount(0);
    const db = await database(page);
    expect(db).toMatchObject({
      version: 2,
      assets: [{ name: 'team-photo.png', mime: 'image/png', blob: true }],
    });
    expect(db.designs).toEqual([]); // uploading alone doesn't save or change a design
  });

  test('the product page’s “Upload your file” opens the Studio at Uploads', async ({ page }) => {
    await page.goto('/products/business-card-classic');
    await page.getByRole('link', { name: 'Upload your file' }).first().click();
    await expect(page).toHaveURL(/\/design\?.*mode=upload/);
    await expect(panel(page).getByRole('button', { name: 'Upload image' })).toBeVisible();
  });

  test('2 · a JPEG appears correctly, turned the way its EXIF says', async ({ page }) => {
    await open(page);
    await openUploads(page);
    // Stored 300 × 200, viewed upright as 200 × 300.
    await upload(page, 'phone-photo.jpg', 'image/jpeg', withExifOrientation6(await makeImage(page, 'image/jpeg', 300, 200)));
    await expect(addButton(page, 'phone-photo.jpg')).toHaveAttribute('aria-label', /200 × 300 px/);
    await addButton(page, 'phone-photo.jpg').click();
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    const [image] = await images(page);
    expect(image!.width / image!.height).toBeCloseTo(200 / 300, 2);
    expect((await database(page)).assets[0]).toMatchObject({
      mime: 'image/jpeg',
    });
  });

  test('3 · files it can’t use get a clear message and nothing breaks', async ({ page }) => {
    await open(page);
    await openUploads(page);
    const alert = panel(page).getByRole('alert');
    await upload(page, 'logo.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="window.__ran=1"><script>window.__ran=1</script></svg>'));
    await expect(alert).toHaveText(/SVG files can’t be uploaded\. Use a PNG, JPEG or WebP image\./);
    await upload(page, 'notes.png', 'image/png', Buffer.from('<html><body>not an image</body></html>'));
    await expect(alert).toHaveText(/This file type isn’t supported/);
    // Right signature, damaged inside.
    await upload(page, 'broken.png', 'image/png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]));
    await expect(alert).toHaveText(/couldn’t be read as an image/);
    await upload(page, 'animation.gif', 'image/gif', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;'));
    await expect(alert).toHaveText(/This file type isn’t supported/);
    expect(await page.evaluate(() => (window as unknown as { __ran?: number }).__ran)).toBeUndefined();
    expect((await database(page)).assets).toEqual([]);
    await alert.getByRole('button', { name: 'Dismiss' }).click();
    await expect(alert).toHaveCount(0);
    await placePng(page, 'after.png', 400, 400); // the Studio still works
  });

  test('4 · a file over 10 MB is refused before it’s read', async ({ page }) => {
    await open(page);
    await openUploads(page);
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(big);
    await upload(page, 'poster.png', 'image/png', big);
    await expect(panel(page).getByRole('alert')).toHaveText(/Image is too large\. Maximum file size is 10 MB\./);
    expect((await database(page)).assets).toEqual([]);
  });

  test('5 · 7 · an inserted image appears on the canvas in the safe area, in its own proportions', async ({ page }) => {
    await open(page);
    await placePng(page);
    const [image] = await images(page);
    expect(image).toMatchObject({
      loaded: true,
      natural: [1200, 800],
      missing: false,
    });
    expect(image!.width / image!.height).toBeCloseTo(1.5, 3);
    // 35 % of the trim width at most, centred within the safe area (business card: 1050 × 600 px).
    expect(image!.width).toBeCloseTo(1050 * 0.35, 0);
    expect(image!.x + image!.width / 2).toBeCloseTo(525, 0);
    await expect(inspector(page).getByRole('button', { name: /^team-photo\.png/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(inspector(page).getByRole('button', { name: 'Keep proportions' })).toHaveAttribute('aria-pressed', 'true');
    // Resizing keeps the proportions.
    await setField(page, 'W, width', '50');
    await expect.poll(async () => (await images(page))[0]!.width).toBeCloseTo(50 * MM, 0);
    const [resized] = await images(page);
    expect(resized!.width / resized!.height).toBeCloseTo(1.5, 2);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  test('6 · moved, resized and turned, then reloaded: the image comes back as it was', async ({ page }) => {
    await open(page);
    await placePng(page);
    await setField(page, 'X, from the left trim edge', '10');
    await setField(page, 'W, width', '30');
    await setField(page, 'Rotation', '15');
    await expect.poll(async () => (await images(page))[0]!.rotation).toBe(15);
    const before = (await images(page))[0]!;
    await saved(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    const after = (await images(page))[0]!;
    expect(after).toMatchObject({
      id: before.id,
      rotation: 15,
      natural: [1200, 800],
    });
    expect(after.x).toBeCloseTo(10 * MM, 0);
    expect(after.width).toBeCloseTo(before.width, 1);
    expect(after.height).toBeCloseTo(before.height, 1);
  });

  test('8 · the print resolution updates as the image is resized', async ({ page }) => {
    await open(page);
    await placePng(page, 'logo.png', 600, 600);
    const resolution = inspector(page).getByTestId('image-resolution');
    // 600 px at 150 DPI would be 4 in, over the 35 % cap, so it's placed smaller: 31.1 mm, 490 DPI.
    await expect(resolution).toHaveText(/Good · 490 DPI/);
    await setField(page, 'W, width', '25.4'); // 1 in: 600 DPI
    await expect(resolution).toHaveText(/Good · 600 DPI/);
    await expect(resolution).toHaveAttribute('data-level', 'good');
    await setField(page, 'W, width', '76.2'); // 3 in: 200 DPI
    await expect(resolution).toHaveText(/Acceptable · 200 DPI/);
    await setField(page, 'W, width', '127'); // 5 in: 120 DPI
    await expect(resolution).toHaveText(/Low resolution · 120 DPI/);
    await expect(inspector(page).getByText(/may print soft/)).toBeVisible();
  });

  test('9 · a deleted image comes back with undo', async ({ page }) => {
    await open(page);
    await placePng(page);
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await images(page)).length).toBe(0);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    expect((await database(page)).assets).toHaveLength(1); // the file was never removed
  });

  test('10 · 11 · one upload on the front and the back: stored once, both shown after a reload', async ({ page }) => {
    await open(page);
    await placePng(page);
    await page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: /^Back/ }).click();
    await openUploads(page);
    await addButton(page, 'team-photo.png').click();
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    await saved(page);
    const db = await database(page);
    expect(db.assets).toHaveLength(1);
    const [design] = db.designs;
    const assetId = db.assets[0]!.assetId;
    expect(design!.split(`"assetId":"${assetId}"`)).toHaveLength(3); // referenced by both sides
    expect(design).not.toMatch(/data:|base64|blob:/); // the design holds the reference only

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    await page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: /^Back/ }).click();
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    expect((await images(page))[0]!.missing).toBe(false);
  });

  test('12 · restoring a version brings back its image', async ({ page }) => {
    await open(page);
    await placePng(page);
    await page.keyboard.press('Control+s');
    await saved(page);
    await page.locator('#studio-canvas').focus();
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await images(page)).length).toBe(0);
    await page.keyboard.press('Control+s');
    await saved(page);
    await status(page).click();
    await page.getByRole('menuitem', { name: /Version history/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Version history' });
    await dialog
      .getByTestId('version-row')
      .nth(1)
      .getByRole('button', { name: /^Restore/ })
      .click();
    await page.getByRole('alertdialog', { name: 'Restore this version?' }).getByRole('button', { name: 'Restore' }).click();
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    expect((await images(page))[0]!.natural).toEqual([1200, 800]);
  });

  test('13 · a file this browser no longer has shows a placeholder, and can be replaced', async ({ page }) => {
    await open(page);
    await placePng(page);
    await saved(page);
    // Clear the stored file behind the Studio's back (as clearing site data would).
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
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect.poll(async () => (await images(page))[0]?.missing).toBe(true);
    await inspector(page)
      .getByRole('button', { name: /^team-photo\.png/ })
      .click();
    await expect(inspector(page).getByText('Image unavailable')).toBeVisible();
    await inspector(page).getByRole('button', { name: 'Retry' }).click();
    await expect(inspector(page).getByText('Image unavailable')).toBeVisible();
    await page.getByTestId('replace-input').setInputFiles({
      name: 'new-photo.png',
      mimeType: 'image/png',
      buffer: await makeImage(page, 'image/png', 900, 600),
    });
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    await expect(inspector(page).getByText('Image unavailable')).toHaveCount(0);
    await expect(inspector(page).getByText('new-photo.png', { exact: true }).first()).toBeVisible();
  });

  test('14 · autosave after placing an image; a reload restores it', async ({ page }) => {
    await open(page);
    await placePng(page);
    await saved(page); // autosave, no Save now
    await expect(page).toHaveURL(/\?design=design_/);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    await expect(status(page)).toHaveAttribute('data-status', 'saved');
  });

  test('a design saved before uploads existed (database version 1) still opens', async ({ page }) => {
    await open(page);
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Shapes' }).click();
    await page.getByRole('button', { name: 'Add star', exact: true }).click();
    await saved(page);
    const url = page.url();
    // Rebuild the database as M11 left it: version 1, designs and versions only.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const read = indexedDB.open('aaraprint-studio');
          read.onsuccess = () => {
            const tx = read.result.transaction(['designs', 'versions']);
            const designs = tx.objectStore('designs').getAll();
            const versions = tx.objectStore('versions').getAll();
            tx.oncomplete = () => {
              read.result.close();
              const del = indexedDB.deleteDatabase('aaraprint-studio');
              del.onsuccess = () => {
                const v1 = indexedDB.open('aaraprint-studio', 1);
                v1.onupgradeneeded = () => {
                  const d = v1.result.createObjectStore('designs', {
                    keyPath: 'designId',
                  });
                  d.createIndex('productSlug', 'productSlug');
                  d.createIndex('updatedAt', 'updatedAt');
                  const v = v1.result.createObjectStore('versions', {
                    keyPath: 'versionId',
                  });
                  v.createIndex('designId', 'designId');
                  v.createIndex('createdAt', 'createdAt');
                };
                v1.onsuccess = () => {
                  const put = v1.result.transaction(['designs', 'versions'], 'readwrite');
                  for (const r of designs.result) put.objectStore('designs').put(r);
                  for (const r of versions.result) put.objectStore('versions').put(r);
                  put.oncomplete = () => {
                    v1.result.close();
                    resolve();
                  };
                };
              };
              del.onblocked = () => reject(new Error('blocked'));
            };
          };
        }),
    );
    await page.goto('about:blank');
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas')?.querySelector('canvas') && st.findOne('.element'))));
    const db = await database(page);
    expect(db.version).toBe(2);
    expect(db.stores.sort()).toEqual(['assets', 'designs', 'versions']);
    expect(db.designs).toHaveLength(1);
    await placePng(page); // and uploads work in the upgraded database
  });

  test('18 · no console errors through upload, place, replace, side change and reload', async ({ page }) => {
    await open(page);
    await placePng(page);
    await page.getByTestId('replace-input').setInputFiles({
      name: 'square.webp',
      mimeType: 'image/webp',
      buffer: await makeImage(page, 'image/webp', 800, 800),
    });
    await expect.poll(async () => (await images(page))[0]?.natural).toEqual([800, 800]);
    const [square] = await images(page);
    expect(square!.width).toBeCloseTo(square!.height, 1); // replaced: same width, the new shape
    await page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: /^Back/ }).click();
    await page
      .getByRole('radiogroup', { name: 'Side' })
      .getByRole('radio', { name: /^Front/ })
      .click();
    await saved(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    // errors are checked after every test
  });
});

test.describe('phone: uploads', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone');

  test('15 · Uploads opens as a sheet; placing an image closes it and shows the image', async ({ page }) => {
    await open(page);
    await rail(page)
      .getByRole('button', { name: /^Uploads/ })
      .tap();
    const sheet = page.getByRole('dialog', { name: 'Uploads' });
    await expect(sheet.getByText('No uploaded images yet.')).toBeVisible();
    await expect(sheet.getByText('Or drop files here.')).toBeHidden(); // no drag and drop on touch
    const upload = sheet.getByRole('button', { name: 'Upload image' });
    expect((await upload.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await sheet.getByTestId('upload-input').setInputFiles({
      name: 'menu.png',
      mimeType: 'image/png',
      buffer: await makeImage(page, 'image/png', 1200, 800),
    });
    const add = addButton(page, 'menu.png');
    await expect(add).toBeVisible();
    expect((await sheet.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await add.tap();
    await expect(sheet).toHaveCount(0);
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    await expect(page.getByRole('toolbar', { name: /^Selected: menu\.png/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('tablet: uploads', () => {
  test.skip(({ hasTouch, isMobile }) => !hasTouch || isMobile, 'tablet');

  test('16 · the Uploads panel works by touch and gets out of the way once an image is placed', async ({ page }) => {
    await open(page);
    await rail(page).getByRole('button', { name: 'Uploads' }).tap();
    await expect(panel(page)).toBeVisible();
    await page.getByTestId('upload-input').setInputFiles({
      name: 'flyer.jpg',
      mimeType: 'image/jpeg',
      buffer: await makeImage(page, 'image/jpeg', 1600, 1200),
    });
    const add = addButton(page, 'flyer.jpg');
    expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await add.tap();
    await expect(panel(page)).toHaveCount(0);
    await expect.poll(async () => (await images(page))[0]?.loaded).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('every width', () => {
  test.skip(({ hasTouch, isMobile }) => hasTouch || isMobile, 'sizes set here');

  test('17 · no sideways scrolling from 1440 to 360 px, with an upload listed and placed', async ({ page }) => {
    await open(page);
    await placePng(page, 'a-rather-long-file-name-for-the-company-logo-final-v2.png');
    await openUploads(page);
    for (const width of [1440, 1280, 1024, 820, 768, 390, 360]) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await expect(page.locator('#studio-canvas')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${width}px`).toBeLessThanOrEqual(0);
    }
  });
});
