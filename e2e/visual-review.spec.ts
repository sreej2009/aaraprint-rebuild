import { test } from '@playwright/test';

/** Full-page screenshots of key pages for design review (not assertions). Run with SCREENSHOTS=1. */
const pages = [
  { name: 'home', path: '/' },
  { name: 'category', path: '/categories/clothing-caps-bags' },
  { name: 'category-filtered', path: '/categories/custom-polo-t-shirts?colour=navy&sort=price-asc' },
  { name: 'product-cards', path: '/products/business-card-classic' },
  { name: 'product-polo', path: '/products/apparel-polo-classic' },
  { name: 'product-bottle', path: '/products/drinkware-bottle-cello-swift' },
  { name: 'search', path: '/search?q=mug' },
  { name: 'privacy', path: '/privacy' },
  { name: 'faq', path: '/faq' },
  { name: 'contact', path: '/contact' },
  { name: 'design-system', path: '/design-system', ready: 'text=Live data: Classic Visiting Cards' },
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
  await page.getByRole('tab', { name: 'Drinkware' }).hover();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `review-screens/${testInfo.project.name}-products-menu.png` });
});

test('screenshot search suggestions', async ({ page }, testInfo) => {
  await page.goto('/');
  const box = page.getByRole('combobox', { name: 'Search products' }).first();
  await box.click();
  await box.fill('bottle');
  await page.getByRole('option').first().waitFor();
  await page.screenshot({ path: `review-screens/${testInfo.project.name}-suggestions.png` });
});

test('screenshot mobile filters', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'mobile only');
  await page.goto('/categories/drinkware');
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('dialog', { name: 'Filters' }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `review-screens/${testInfo.project.name}-filters.png` });
});
