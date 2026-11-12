import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type KonvaNamespace from 'konva';
import { expect, settleAnimations, test, confirmEntry } from './fixtures';
import { clearedStandIn, INDIGO, near, PEN_RGB, PHOTO_RGB, placed } from './product-fixtures';

/**
 * The product view as a customer reaches it (corrective fix): from the product page, "Start
 * designing", the Studio's Flat / On the product choice, front and back, the Preview, and back to
 * the Studio — on the real routes. Real photos are rights-blocked, so these serve cleared stand-ins
 * for the product's own profile (product-fixtures.ts); the rights test checks the real routes.
 */
declare global {
  interface Window {
    Konva: typeof KonvaNamespace;
  }
}

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
type Box = { centerX: number; centerY: number; maxWidth: number; maxHeight: number };
const profileOf = (slug: string) => JSON.parse(readFileSync(`public/api/v1/studio/${slug}.json`, 'utf8')) as { print: { widthPx: number; heightPx: number }; sides: { placement: Box }[] };
const boxOf = (b: Box) => [b.centerX, b.centerY, b.maxWidth, b.maxHeight];

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

const region = (page: Page) => page.getByRole('region', { name: /^Design canvas: / });
const canvasChoice = (page: Page) => page.getByRole('radiogroup', { name: 'Canvas view' });
const studioSide = (page: Page, name: 'Front' | 'Back') => page.getByRole('radiogroup', { name: 'Side' }).getByRole('radio', { name: new RegExp(`^${name}`) });

/** The product page, then "Start designing", as a customer does. */
async function startDesigning(page: Page, slug: string, press: 'click' | 'tap' = 'click') {
  await page.goto(`/products/${slug}`);
  const link = page.getByRole('link', { name: /Start designing/ }).first();
  await link.scrollIntoViewIfNeeded();
  await link[press]();
  await confirmEntry(page, { press });
  await expect(page).toHaveURL(new RegExp(`/products/${slug}/design`));
  await page.waitForFunction(() => Boolean(window.Konva?.stages.some((st) => st.container().closest('#studio-canvas'))));
}

/** Pixels from the editor's layers at design points, and the photo node. */
async function editor(page: Page, points: [number, number][] = []) {
  return page.evaluate((at) => {
    const st = window.Konva.stages.find((s) => s.container().closest('#studio-canvas'))!;
    const sample = (name: string, [x, y]: [number, number]) => {
      const canvas = st
        .getLayers()
        .find((l) => l.name() === name)!
        .getCanvas();
      const ratio = canvas.getPixelRatio();
      return [...canvas.getContext()._context.getImageData(Math.round((st.x() + x * st.scaleX()) * ratio), Math.round((st.y() + y * st.scaleY()) * ratio), 1, 1).data];
    };
    const photo = st.findOne<KonvaNamespace.Image>('.product-mockup');
    return {
      scale: st.scaleX(),
      photo: photo ? { x: photo.x(), y: photo.y(), width: photo.width(), height: photo.height() } : null,
      workspace: at.map((p) => sample('workspace', p)),
      artwork: at.map((p) => sample('artwork', p)),
      elements: st.find('.element').map((n) => `${n.id()}@${Math.round(n.x())},${Math.round(n.y())}`),
      background: String(st.findOne('.background')?.getAttr('fill') ?? ''),
    };
  }, points);
}

/** A frame point (photo px of the side's frame) in design px. */
const designPoint = ([fx, fy]: number[], box: number[], print: { width: number; height: number }) => {
  const p = placed(box, print);
  return [(fx! - p.x) / p.scale, (fy! - p.y) / p.scale] as [number, number];
};

async function flow(page: Page, slug: string, photo: 'ok' | 'pen', expectPhoto: { front: number[]; back: number[] }, awayFromPrint: number[]) {
  const profile = profileOf(slug);
  const print = { width: profile.print.widthPx, height: profile.print.heightPx };
  const [frontBox, backBox] = profile.sides.map((s) => boxOf(s.placement));
  await clearedStandIn(page, slug, { photo });
  await startDesigning(page, slug);
  // 3 · on the product only (Phase 4 M4-C): the Studio opens on the product, with no Flat switch.
  await expect(region(page)).toHaveAttribute('data-view', 'product');
  await expect(canvasChoice(page)).toHaveCount(0);
  // Some artwork: a background colour on the front.
  await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Background' }).click();
  await page.getByRole('complementary', { name: 'Background' }).getByRole('button', { name: 'Deep indigo' }).click();
  const flat = await editor(page); // the artwork as designed (print px), to compare after the Preview
  // 4–6 · On the product: the photo behind, the artwork exactly over the print area.
  await expect(region(page)).toHaveAttribute('data-view', 'product');
  await page.waitForFunction(() =>
    Boolean(
      window.Konva.stages
        .find((s) => s.container().closest('#studio-canvas'))
        ?.findOne<KonvaNamespace.Image>('.product-mockup')
        ?.image(),
    ),
  );
  const inset = 3 / (await editor(page)).scale;
  const front = await editor(page, [
    designPoint(awayFromPrint, frontBox!, print),
    [inset, inset],
    [print.width - inset, print.height - inset],
    [-inset, print.height / 2],
    [print.width + inset, print.height / 2],
  ]);
  expect(near(front.workspace[0]!, expectPhoto.front), `photo ${front.workspace[0]}`).toBe(true);
  for (const inside of front.artwork.slice(1, 3)) expect(near(inside, INDIGO), `artwork ${inside}`).toBe(true);
  for (const outside of front.artwork.slice(3)) expect(outside[3]).toBe(0);
  const frontPhoto = front.photo!;
  // 7–8 · the back: its own photo and placement.
  await studioSide(page, 'Back').click();
  await expect(region(page)).toHaveAccessibleName(/^Design canvas: Back, .+, on the product$/);
  await expect.poll(async () => near((await editor(page, [designPoint(awayFromPrint, backBox!, print)])).workspace[0]!, expectPhoto.back)).toBe(true);
  if (frontBox!.join() !== backBox!.join()) expect((await editor(page)).photo).not.toEqual(frontPhoto);
  // 9–10 · the Preview: the same photo and placement.
  await page.getByTestId('preview-button').click();
  const dialog = page.getByRole('dialog', { name: 'Preview' });
  await expect(dialog.getByRole('radiogroup', { name: 'Preview view' })).toHaveCount(0);
  await expect(dialog.getByTestId('preview-area')).toHaveAttribute('data-view', 'product');
  await page.waitForFunction(() => window.Konva.stages.some((s) => s.container().classList.contains('studio-product-stage')));
  const inPreview = await page.evaluate(() => {
    const st = window.Konva.stages.find((s) => s.container().classList.contains('studio-product-stage'))!;
    const group = st.findOne('.artwork-clip')!.getParent()!;
    return { x: group.x(), y: group.y(), scale: group.scaleX(), photo: Boolean((st.findOne<KonvaNamespace.Image>('Image')!.image() as HTMLImageElement).naturalWidth) };
  });
  const back = placed(backBox!, print);
  expect(inPreview.photo).toBe(true);
  expect(inPreview.x).toBeCloseTo(back.x, 6);
  expect(inPreview.y).toBeCloseTo(back.y, 6);
  expect(inPreview.scale).toBeCloseTo(back.scale, 12);
  await settleAnimations(page);
  const axe = await new AxeBuilder({ page }).include('[data-testid="studio-preview"]').withTags(TAGS).analyze();
  expect(axe.violations.map((v) => `preview ${v.id}`)).toEqual([]);
  // 11–12 · back in the Studio: the artwork is unchanged.
  await page.keyboard.press('Escape');
  await studioSide(page, 'Front').click();
  const after = await editor(page);
  expect(after.elements).toEqual(flat.elements);
  expect(after.background).toBe(flat.background);
  expect(after.photo).toEqual(frontPhoto);
  await settleAnimations(page);
  const studioAxe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(studioAxe.violations.map((v) => `studio ${v.id}`)).toEqual([]);
}

test.describe('desktop: the product view from the product page', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse and keyboard');

  test('1 · Custom Photo Umbrella: Start designing → On the product → front and back → Preview → back, artwork unchanged (pixels)', async ({ page }) => {
    test.setTimeout(60_000); // the product page, the Studio, both sides, the Preview and two axe scans
    await flow(page, 'umbrella-photo-custom', 'ok', { front: PHOTO_RGB, back: PHOTO_RGB }, [100, 1350]);
  });

  test('2 · Customized Pen: Start designing → On the product → front and back → Preview → back, artwork unchanged (pixels)', async ({ page }) => {
    test.setTimeout(60_000);
    await flow(page, 'pen-customized-basic', 'pen', { front: PEN_RGB.front, back: PEN_RGB.back }, [1800, 600]);
  });

  test('3 · rights: the real umbrella and pen (photos unconfirmed) stay flat, with no choice, and the Studio requests no product photo', async ({ page }) => {
    for (const slug of ['umbrella-photo-custom', 'pen-customized-basic']) {
      await startDesigning(page, slug);
      const before = mediaRequests.length;
      await expect(region(page), slug).toHaveAttribute('data-view', 'flat');
      await expect(canvasChoice(page), slug).toHaveCount(0);
      await page.getByTestId('preview-button').click();
      const dialog = page.getByRole('dialog', { name: 'Preview' });
      await expect(dialog.getByRole('radiogroup', { name: 'Preview view' }), slug).toHaveCount(0);
      await expect(dialog.getByTestId('preview-area'), slug).toHaveAttribute('data-view', 'flat');
      await page.keyboard.press('Escape');
      expect(
        mediaRequests.slice(before).filter((p) => /\/products\/(umbrellas-rainwear|pens)-2d\//.test(p)),
        slug,
      ).toEqual([]);
    }
  });
});

test.describe('tablet and phone: the product view from the product page', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'touch layouts');

  test('umbrella and pen by touch: Start designing opens on the product; the photo draws; axe; no sideways scroll', async ({ page }) => {
    test.setTimeout(60_000);
    for (const [slug, photo] of [
      ['umbrella-photo-custom', 'ok'],
      ['pen-customized-basic', 'pen'],
    ] as const) {
      await clearedStandIn(page, slug, { photo });
      await startDesigning(page, slug, 'tap');
      await expect(canvasChoice(page), slug).toHaveCount(0); // on the product only (M4-C)
      await expect(region(page), slug).toHaveAttribute('data-view', 'product');
      await page.waitForFunction(() =>
        Boolean(
          window.Konva.stages
            .find((s) => s.container().closest('#studio-canvas'))
            ?.findOne<KonvaNamespace.Image>('.product-mockup')
            ?.image(),
        ),
      );
      await settleAnimations(page);
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(results.violations.map((v) => `${slug} ${v.id}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), slug).toBe(true);
    }
  });
});
