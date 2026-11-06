import { test } from '@playwright/test';

/** Studio screenshots for design review (not assertions). SCREENSHOTS=1 npx playwright test studio-visual */
const shots = [
  { name: 'studio', path: '/products/business-card-classic/design' },
  { name: 'studio-product-panel', path: '/products/business-card-classic/design?tool=product' },
  { name: 'studio-round-back', path: '/products/business-card-circle/design?side=back' },
  { name: 'studio-polo', path: '/products/apparel-polo-classic/design?tool=help' },
  { name: 'studio-unsupported', path: '/products/card-accessory-metal-holder/design' },
  { name: 'studio-banner', path: '/products/flyer-canopy-tent/design' },
];

for (const { name, path } of shots) {
  test(`screenshot ${name}`, async ({ page }, info) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `review-screens/${info.project.name}-${name}.png` });
  });
}

test('screenshot canvas demo (sample design)', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'reference page');
  await page.goto('/design-system#canvas-demo');
  await page.waitForFunction(() => Boolean((window as unknown as { Konva?: { stages: unknown[] } }).Konva?.stages.length));
  await page.waitForTimeout(600);
  await page.locator('#canvas-demo').screenshot({ path: `review-screens/${info.project.name}-studio-canvas-demo.png` });
});

/** M6: the sample card with a selection. Element positions are print px on the 88.9 × 50.8 mm card. */
async function samplePoint(page: import('@playwright/test').Page, x: number, y: number) {
  await page.waitForFunction(() => Boolean((window as unknown as { Konva?: { stages: { findOne(s: string): unknown }[] } }).Konva?.stages.some((st) => st.findOne('.element'))));
  const area = (await page.getByTestId('canvas-area').boundingBox())!;
  const s = await page.evaluate(() => {
    const st = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva.stages[0]!;
    return { scale: st.scaleX(), x: st.x(), y: st.y() };
  });
  return { x: area.x + s.x + x * s.scale, y: area.y + s.y + y * s.scale, scale: s.scale };
}

test('screenshot sample card with a selection', async ({ page, hasTouch }, info) => {
  await page.goto('/products/business-card-classic/design?sample=1');
  const logo = await samplePoint(page, 900, 150);
  if (hasTouch) await page.touchscreen.tap(logo.x, logo.y);
  else await page.mouse.click(logo.x, logo.y);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-selected.png` });
});

test('screenshot safe-area warning and live rotation', async ({ page, hasTouch }, info) => {
  test.skip(hasTouch, 'mouse');
  await page.goto('/products/business-card-classic/design?sample=1');
  const star = await samplePoint(page, 905, 325);
  await page.mouse.move(star.x, star.y);
  await page.mouse.down();
  await page.mouse.move(star.x + 70 * star.scale, star.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-warning.png` });

  const name = await samplePoint(page, 200, 110);
  await page.mouse.click(name.x, name.y);
  const rotate = (await page.locator('[data-handle="rotate"]').boundingBox())!;
  const centre = await samplePoint(page, 380, 115);
  await page.mouse.move(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2);
  await page.mouse.down();
  await page.mouse.move(centre.x + 120, centre.y - 260, { steps: 6 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-rotating.png` });
  await page.mouse.up();
});

/** M7: the inspector with a selection — docked on desktop, the drawer on tablets, the sheet on phones. */
test('screenshot inspector and layers', async ({ page, hasTouch, isMobile }, info) => {
  await page.goto('/products/business-card-classic/design?sample=1');
  const star = await samplePoint(page, 905, 325);
  if (hasTouch) await page.touchscreen.tap(star.x, star.y);
  else await page.mouse.click(star.x, star.y);
  if (hasTouch) await page.getByRole('toolbar', { name: 'Selected: Star' }).getByRole('button', { name: 'Properties' }).click();
  const scope = hasTouch ? page.getByRole('dialog', { name: 'Layers and properties' }) : page.getByRole('complementary', { name: 'Layers and properties' });
  await scope.getByRole('button', { name: 'Keep proportions' }).click();
  await scope.getByRole('textbox', { name: 'Opacity' }).fill('80');
  await scope.getByRole('textbox', { name: 'Opacity' }).press('Enter');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-inspector.png` });
  if (isMobile || hasTouch) {
    // The layers further down the sheet / drawer.
    await scope.getByRole('list', { name: 'Layers' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `review-screens/${info.project.name}-studio-layers.png` });
  }
});

/** M8: adding a heading and typing into it, then its text properties. */
test('screenshot text editing and text properties', async ({ page, hasTouch, isMobile }, info) => {
  await page.goto('/products/business-card-classic/design?sample=1');
  await samplePoint(page, 0, 0);
  const tools = page.getByRole('navigation', { name: 'Design tools' });
  await (hasTouch ? tools.getByRole('button', { name: 'Text', exact: true }).tap() : tools.getByRole('button', { name: 'Text', exact: true }).click());
  if (!hasTouch && !isMobile) await page.screenshot({ path: `review-screens/${info.project.name}-studio-text-tool.png` });
  await page.getByRole('button', { name: 'Add subheading' }).click();
  await page.keyboard.type('Design & Print Studio');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-text-editing.png` });
  if (isMobile) await page.getByRole('dialog', { name: 'Edit text' }).getByRole('button', { name: 'Done' }).click();
  else await page.keyboard.press('Control+Enter');
  if (hasTouch) await page.getByRole('toolbar', { name: /^Selected:/ }).getByRole('button', { name: 'Properties' }).click();
  const scope = hasTouch ? page.getByRole('dialog', { name: 'Layers and properties' }) : page.getByRole('complementary', { name: 'Layers and properties' });
  await scope.getByRole('button', { name: 'Marigold' }).click();
  await scope.getByRole('textbox', { name: 'Text content' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-text-properties.png` });
  await scope.getByRole('textbox', { name: 'Letter spacing' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-text-style.png` });
});

/** M9: shapes on the card, the shape properties, and the graphics panel (empty until rights are confirmed). */
test('screenshot shapes and graphics', async ({ page, hasTouch, isMobile }, info) => {
  await page.goto('/products/business-card-classic/design?sample=1');
  await samplePoint(page, 0, 0);
  const openTool = async (name: string) => {
    if (isMobile) {
      if (name === 'Graphics') await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name }).click();
      else {
        await page.getByRole('button', { name: 'More' }).click();
        await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
      }
    } else await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name, exact: true }).click();
  };
  await openTool('Shapes');
  await page.waitForTimeout(300);
  if (!isMobile) await page.screenshot({ path: `review-screens/${info.project.name}-studio-shapes-tool.png` });
  await page.getByRole('button', { name: 'Add star', exact: true }).click();
  if (!hasTouch && !isMobile) {
    await page.getByRole('button', { name: 'Add circle', exact: true }).click();
    await page.getByRole('button', { name: 'Add line', exact: true }).click();
  }
  if (hasTouch || isMobile) await page.getByRole('toolbar', { name: /^Selected:/ }).getByRole('button', { name: 'Properties' }).click();
  const scope = hasTouch || isMobile ? page.getByRole('dialog', { name: 'Layers and properties' }) : page.getByRole('complementary', { name: 'Layers and properties' });
  if (!hasTouch && !isMobile) await scope.getByRole('list', { name: 'Layers' }).getByRole('button', { name: /^Star,/ }).first().click(); // the new one, top first
  await scope.getByRole('list', { name: 'Fill colour presets' }).getByRole('button', { name: 'Marigold' }).click();
  await scope.getByRole('list', { name: 'Border colour presets' }).getByRole('button', { name: 'Ink' }).click();
  await scope.getByRole('textbox', { name: 'Star points' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-shape-properties.png` });
  if (hasTouch || isMobile) await page.keyboard.press('Escape');
  await openTool('Graphics');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-graphics.png` });
});

/** M10: an empty back, the copy choice, the clear confirmation and the side menu. */
test('screenshot front and back', async ({ page }, info) => {
  await page.goto('/products/business-card-classic/design?sample=1&side=back');
  await samplePoint(page, 0, 0);
  await page.getByRole('button', { name: 'Side options' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-side-menu.png` });
  await page.getByRole('menuitem', { name: /Clear back/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-clear-side.png` });
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear back' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-empty-back.png` });
  await page.getByRole('button', { name: 'Copy front to back' }).click();
  await page.getByRole('button', { name: 'Side options' }).click();
  await page.getByRole('menuitem', { name: /Copy front to back/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-copy-side.png` });
});

/** M11: saving state, saved state, version history and the restore confirmation. */
test('screenshot saving and versions', async ({ page, hasTouch, isMobile }, info) => {
  await page.goto('/products/business-card-classic/design');
  await page.waitForFunction(() => Boolean((window as unknown as { Konva?: { stages: unknown[] } }).Konva?.stages.length));
  const status = page.getByTestId('save-status');
  if (isMobile) {
    await page.getByRole('button', { name: 'Add shape' }).click();
    await page.getByRole('dialog', { name: 'Shapes' }).getByRole('button', { name: 'Add circle' }).click();
  } else {
    await page.getByRole('navigation', { name: 'Design tools' }).getByRole('button', { name: 'Shapes' }).click();
    await page.getByRole('button', { name: 'Add circle', exact: true }).click();
  }
  if (!hasTouch && !isMobile) await page.screenshot({ path: `review-screens/${info.project.name}-studio-saving.png` });
  await page.waitForFunction(() => document.querySelector('[data-testid="save-status"]')?.getAttribute('data-status') === 'saved');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-saved.png` });
  await status.click();
  await page.getByRole('menuitem', { name: /Version history/ }).click();
  await page.getByRole('dialog', { name: 'Version history' }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `review-screens/${info.project.name}-studio-version-history.png` });
  if (!hasTouch || isMobile) {
    await page.getByRole('dialog', { name: 'Version history' }).getByRole('button', { name: /^Restore/ }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `review-screens/${info.project.name}-studio-restore-confirm.png` });
  }
});
