import { test } from '@playwright/test';

/** Full-page screenshots of key pages for design review (not assertions). Run with SCREENSHOTS=1. */
const pages = [
  { name: 'home', path: '/' },
  { name: 'design-system', path: '/design-system', ready: 'text=Live data: Classic Visiting Cards' },
  { name: 'category-planned', path: '/categories/visiting-cards' },
  { name: 'not-found', path: '/no-such-page' },
  { name: 'studio-planned', path: '/products/business-card-classic/design' },
];

for (const { name, path, ready } of pages) {
  test(`screenshot ${name}`, async ({ page }, testInfo) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    if (ready) await page.locator(ready).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `review-screens/${testInfo.project.name}-${name}.png`, fullPage: true });
  });
}

test('screenshot products menu (desktop)', async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, 'desktop navigation only');
  await page.goto('/');
  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByRole('link', { name: /Visiting Cards/ }).first().waitFor();
  await page.screenshot({ path: `review-screens/${testInfo.project.name}-products-menu.png` });
});

test('screenshot mobile menu', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'mobile navigation only');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `review-screens/${testInfo.project.name}-menu.png` });
});

test('screenshot design-system sections', async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, 'desktop sections only');
  await page.goto('/design-system');
  await page.getByText('Live data: Classic Visiting Cards').waitFor();
  await page.waitForLoadState('networkidle');
  for (const id of ['colour', 'typography', 'buttons', 'forms', 'options', 'feedback', 'overlays', 'navigation']) {
    await page.locator(`#${id}`).screenshot({ path: `review-screens/section-${id}.png` });
  }
  void testInfo;
});
