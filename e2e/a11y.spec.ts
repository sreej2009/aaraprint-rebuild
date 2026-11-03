import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Automated WCAG 2.2 AA checks. They catch roughly a third of issues; manual screen-reader passes are still planned. */
const pages = [
  { name: 'home', path: '/' },
  { name: 'design system', path: '/design-system', ready: 'Live data: Classic Visiting Cards' },
  { name: 'category placeholder', path: '/categories/visiting-cards' },
  { name: 'content placeholder', path: '/about' },
  { name: 'not found', path: '/no-such-page' },
  { name: 'studio placeholder', path: '/products/business-card-classic/design' },
];

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
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
