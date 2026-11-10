import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test, settleAnimations } from './fixtures';

/** Design Studio page and layouts (Phase 3 M4). Runs on desktop, tablet (820 × 1180) and phone. */

const STUDIO = '/products/business-card-classic/design';
const layoutOf = (info: TestInfo) => info.project.name as 'desktop' | 'tablet' | 'mobile';
const nbsp = (text: string) => text.replaceAll(String.fromCharCode(0xa0), ' ');

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

test.describe('opening the Studio', () => {
  test('from the product page, with the chosen options, and back again', async ({ page }) => {
    await page.goto('/products/business-card-classic');
    await page.getByRole('radio', { name: /500 cards/ }).click();
    const start = page.getByRole('link', { name: 'Start designing' }).first();
    const href = (await start.getAttribute('href')) ?? '';
    const variantId = new URL(href, 'http://x').searchParams.get('variantId');
    expect(variantId).toBeTruthy();
    await start.click();

    await expect(page).toHaveURL(new RegExp(`/products/business-card-classic/design\\?variantId=${variantId}`));
    await expect(page.getByRole('heading', { level: 1, name: 'Design Studio: Classic Visiting Cards' })).toBeAttached();
    await expect(page.getByRole('region', { name: /^Design canvas: Front, 88\.9.×.50\.8.mm$/ })).toBeVisible();
    await expect(page).toHaveTitle('Design your Classic Visiting Cards · Aaraprint');

    await page.getByRole('link', { name: 'Back to product' }).click();
    await expect(page).toHaveURL(`/products/business-card-classic?variantId=${variantId}`);
    await expect(page.getByRole('radio', { name: /500 cards/ })).toBeChecked();
  });

  test('is kept out of search engines and loads only on the Studio page', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (r) => r.resourceType() === 'script' && scripts.push(r.url()));
    await page.goto('/');
    await page.goto('/categories/visiting-cards');
    expect(scripts.filter((url) => /\/studio[-.]/.test(url))).toEqual([]);
    await page.goto(STUDIO);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    expect(scripts.some((url) => /\/studio[-.]/.test(url))).toBe(true);
  });

  test('explains products that need no design, and unknown products', async ({ page }) => {
    await page.goto('/products/card-accessory-metal-holder/design');
    await expect(page.getByRole('heading', { level: 1, name: 'This product doesn’t need a design' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the product' })).toHaveAttribute('href', '/products/card-accessory-metal-holder');
    await page.goto('/products/no-such-product/design');
    await expect(page.getByRole('heading', { level: 1, name: 'We couldn’t find that product' })).toBeVisible();
  });

  test('opens every kind of product: apparel and wrap on their flat print area (decision D4)', async ({ page }) => {
    for (const [slug, size] of [
      ['apparel-polo-classic', '15.2 × 15.2 cm'],
      ['mug-classic-photo', null],
      ['pen-ballpoint-classic', '10.2 × 2 cm'],
      ['business-card-circle', '59.3 × 59.3 mm'],
    ] as const) {
      await page.goto(`/products/${slug}/design`);
      const canvas = page.getByRole('region', { name: /^Design canvas:/ });
      await expect(canvas).toBeVisible();
      if (size) expect(nbsp((await canvas.getAttribute('aria-label')) ?? '')).toContain(size);
    }
    // The round card's canvas shows its finished diameter (shape clipping: studio-canvas.spec.ts).
    await expect(page.getByTestId('measure-width')).toHaveText(/59\.3.mm/);
  });
});

test.describe('sides', () => {
  test('switch with the side control, follow the URL and survive a reload', async ({ page }, info) => {
    await page.goto(STUDIO);
    await page.getByRole('radio', { name: 'Back, 0 items' }).click();
    await expect(page.getByRole('region', { name: /^Design canvas: Back/ })).toBeVisible();
    await expect(page).toHaveURL(/side=back/);
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Back, 0 items' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('region', { name: /^Design canvas: Back/ })).toBeVisible();
    if (layoutOf(info) === 'mobile') {
      // Phones show the switcher under the top bar, full width.
      await expect(page.getByRole('banner').getByRole('radiogroup', { name: 'Side' })).toHaveCount(0);
    }
  });

  test('polos use the original placement names', async ({ page }) => {
    await page.goto('/products/apparel-polo-classic/design?side=back');
    await expect(page.getByRole('region', { name: /^Design canvas: Upper back/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Left chest, 0 items' })).toBeVisible();
  });
});

test.describe('tools and panels', () => {
  test('“Upload your design” opens the Uploads tool', async ({ page }, info) => {
    await page.goto('/products/business-card-classic');
    await page.getByRole('link', { name: /Upload/ }).first().click();
    await expect(page).toHaveURL(/mode=upload/);
    if (layoutOf(info) === 'mobile') await expect(page.getByRole('dialog', { name: 'Uploads' })).toBeVisible();
    else await expect(page.getByRole('complementary', { name: 'Uploads' })).toBeVisible();
  });

  test('desktop: rail toggles a docked panel; layers and properties are docked', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'desktop', 'desktop layout');
    await page.goto(STUDIO);
    await expect(page.getByRole('complementary', { name: 'Templates' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Layers and properties' })).toBeVisible();
    await page.getByRole('button', { name: 'Product', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Product and print size' });
    expect(nbsp((await panel.textContent()) ?? '')).toContain('91.9 × 53.8 mm');
    await page.getByRole('button', { name: 'Product', exact: true }).click();
    await expect(panel).toHaveCount(0);
  });

  test('laptop (1100 px): docked panel, layers and properties in a drawer', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'desktop', 'resized desktop');
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto(STUDIO);
    await expect(page.getByRole('complementary', { name: 'Layers and properties' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Layers and properties' }).click();
    await expect(page.getByRole('dialog', { name: 'Layers and properties' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Layers and properties' })).toHaveCount(0);
  });

  test('tablet: panels float over the canvas and close with Escape', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'tablet', 'tablet layout');
    await page.goto(STUDIO);
    await expect(page.getByRole('complementary', { name: 'Templates' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Help' }).click();
    const panel = page.getByRole('complementary', { name: 'Print tips' });
    await expect(panel).toBeVisible();
    const canvasBox = (await page.getByRole('region', { name: /^Design canvas/ }).boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.x).toBeLessThan(canvasBox.x + 1); // over the canvas, not beside it
    expect(panelBox.x + panelBox.width).toBeGreaterThan(canvasBox.x);
    await panel.getByRole('button', { name: 'Close panel' }).focus();
    await expect(page.getByRole('tooltip').first()).toBeVisible();
    await page.keyboard.press('Escape'); // closes the tooltip…
    await expect(page.getByRole('tooltip')).toHaveCount(0); // …once its exit animation ends
    await page.keyboard.press('Escape'); // closes the panel
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Help' })).toBeFocused();
  });

  test('phone: bottom toolbar, tool sheets that expand, and More', async ({ page }, info) => {
    test.skip(layoutOf(info) !== 'mobile', 'phone layout');
    await page.goto(STUDIO);
    const toolbar = page.getByRole('navigation', { name: 'Design tools' });
    await expect(toolbar.getByRole('button')).toHaveText(['Templates', 'Text', 'Uploads', 'Graphics', 'More']);
    await toolbar.getByRole('button', { name: 'Text' }).click();
    const sheet = page.getByRole('dialog', { name: 'Text' });
    await expect(sheet).toBeVisible();
    const before = (await sheet.boundingBox())!.height;
    await sheet.getByRole('button', { name: 'Show more' }).click();
    await expect.poll(async () => (await sheet.boundingBox())!.height).toBeGreaterThan(before + 100);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    await toolbar.getByRole('button', { name: 'More' }).click();
    await page.getByRole('dialog', { name: 'More tools' }).getByRole('button', { name: /Product and print size/ }).click();
    await expect(page.getByRole('dialog', { name: 'Product and print size' })).toBeVisible();
  });
});

test.describe('keyboard and accessibility', () => {
  test('the skip link jumps to the canvas; the top bar and rail come first in tab order', async ({ page }, info) => {
    test.skip(layoutOf(info) === 'mobile', 'keyboard');
    await page.goto(STUDIO);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Back to product' })).toBeFocused();
    // Not built yet: focusable, announced as unavailable, and says why.
    const coming = page.getByRole('button', { name: 'Continue' });
    await expect(coming).toHaveAttribute('aria-disabled', 'true');
    await expect(coming).toHaveAccessibleDescription(/coming soon/);
  });

  test('no detectable WCAG 2.2 AA violations with panels and sheets open', async ({ page }, info) => {
    await page.goto(`${STUDIO}?tool=product`);
    await page.getByText('Classic Visiting Cards design').waitFor();
    await settleAnimations(page);
    expect(await axe(page)).toEqual([]);
    if (layoutOf(info) === 'mobile') {
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'More' }).click();
    } else {
      await page.getByRole('button', { name: layoutOf(info) === 'desktop' ? 'Help' : 'Layers and properties' }).click();
    }
    await settleAnimations(page);
    expect(await axe(page)).toEqual([]);
  });
});
