import { test } from '@playwright/test';

/** Studio screenshots for design review (not assertions). SCREENSHOTS=1 npx playwright test studio-visual */
const shots = [
  { name: 'studio', path: '/products/business-card-classic/design' },
  { name: 'studio-product-panel', path: '/products/business-card-classic/design?tool=product' },
  { name: 'studio-round-back', path: '/products/business-card-circle/design?side=back' },
  { name: 'studio-polo', path: '/products/apparel-polo-classic/design?tool=help' },
  { name: 'studio-unsupported', path: '/products/card-accessory-metal-holder/design' },
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
