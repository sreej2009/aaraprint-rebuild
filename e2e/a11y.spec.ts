import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { settleAnimations } from './fixtures';

/** Automated WCAG 2.2 AA checks. They catch roughly a third of issues; manual screen-reader passes are still planned. */
const pages = [
  { name: 'home', path: '/' },
  { name: 'design system', path: '/design-system', ready: 'Live data: Classic Visiting Cards' },
  { name: 'category', path: '/categories/visiting-cards' },
  { name: 'filtered category', path: '/categories/custom-polo-t-shirts?colour=navy&sort=price-asc&page=1' },
  { name: 'all products', path: '/categories/view-all' },
  { name: 'product (tiers)', path: '/products/business-card-classic' },
  { name: 'product (swatches)', path: '/products/apparel-polo-classic' },
  { name: 'product (no image)', path: '/products/card-accessory-metal-holder' },
  { name: 'search results', path: '/search?q=bottle' },
  { name: 'privacy', path: '/privacy' },
  { name: 'refund policy', path: '/refund-policy' },
  { name: 'faq', path: '/faq' },
  { name: 'contact', path: '/contact' },
  { name: 'credits', path: '/credits' },
  { name: 'commerce placeholder', path: '/cart' },
  { name: 'not found', path: '/no-such-page' },
  { name: 'studio', path: '/products/business-card-classic/design', ready: 'Classic Visiting Cards design' },
  { name: 'studio (product panel, round card)', path: '/products/business-card-circle/design?tool=product&side=back', ready: 'Circle Visiting Cards design' },
  { name: 'studio (product without a design)', path: '/products/card-accessory-metal-holder/design', ready: 'This product doesn’t need a design' },
  { name: 'studio (unknown product)', path: '/products/no-such-product/design', ready: 'We couldn’t find that product' },
];

// Full-page axe scans take seconds each; on a busy machine running all workers they need more than 30 s.
test.describe.configure({ timeout: 60_000 });

for (const { name, path, ready } of pages) {
  test(`${name} has no detectable WCAG 2.2 AA violations`, async ({ page }) => {
    await page.goto(path);
    if (ready) await page.getByText(ready).waitFor();
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
    expect(summary).toEqual([]);
  });
}

test('open dialog and menu sheet have no violations', async ({ page, isMobile }) => {
  await page.goto(isMobile ? '/' : '/design-system');
  if (isMobile) {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('dialog', { name: 'Menu' }).waitFor();
  } else {
    await page.getByRole('button', { name: 'Rename design' }).click();
    await page.getByRole('dialog', { name: 'Rename design' }).waitFor();
  }
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
