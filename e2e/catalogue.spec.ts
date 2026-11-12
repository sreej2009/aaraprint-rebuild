import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

interface CategoryJson {
  slug: string;
  name: string;
  productCount: number;
}
interface ProductJson {
  slug: string;
  name: string;
  categorySlug: string;
  variants: { id: string; sku: string; priceCents: number }[];
}

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: paise % 100 ? 2 : 0 })}`;
const getJson = async <T>(request: APIRequestContext, url: string) => (await (await request.get(url)).json()) as T;

/** The price block shows "SKU <code>"; read it back and look the SKU up in the catalogue data. */
async function expectPriceMatchesSku(page: Page, product: ProductJson, sets = 1) {
  const skuText = (await page.getByText(/^SKU /).first().textContent())!.replace('SKU ', '').trim();
  const variant = product.variants.find((v) => v.sku === skuText);
  expect(variant, `${product.slug}: SKU ${skuText} exists`).toBeDefined();
  const priceBlock = page.locator('[aria-live="polite"]').filter({ hasText: 'Your price' });
  await expect(priceBlock).toContainText(inr(variant!.priceCents * sets));
  return variant!;
}

test.describe('category pages', () => {
  test('all 11 categories and "all products" list the right number of products', async ({ page, request }) => {
    test.setTimeout(120_000);
    const categories = await getJson<CategoryJson[]>(request, '/api/v1/catalogue/categories.json');
    expect(categories).toHaveLength(11);
    for (const category of [...categories, { slug: 'view-all', name: 'All products', productCount: 533 }]) {
      await page.goto(`/categories/${category.slug}`);
      await expect(page.getByRole('heading', { level: 1, name: category.name })).toBeVisible();
      await expect(page.getByText(new RegExp(`of ${category.productCount} products?$`))).toBeVisible();
      await expect(page.getByRole('region', { name: 'Products' }).getByRole('article')).toHaveCount(Math.min(24, category.productCount));
    }
  });

  test('type chips filter, and original ?type= links still work', async ({ page }) => {
    await page.goto('/categories/clothing-caps-bags');
    await page.getByRole('navigation', { name: 'Product types' }).getByRole('link', { name: /Caps/ }).click();
    await expect(page).toHaveURL(/type=caps/);
    await expect(page.getByText('Showing 1–11 of 11 products')).toBeVisible();
    await page.goto('/categories/clothing-caps-bags?type=bags');
    await expect(page.getByText('of 24 products')).toBeVisible();
  });

  test('option filters, active chips and clearing (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'sidebar filters');
    await page.goto('/categories/custom-polo-t-shirts');
    const filters = page.getByRole('complementary', { name: 'Filters' });
    await filters.getByRole('checkbox', { name: /^Navy/ }).click();
    await expect(page).toHaveURL(/colour=navy/);
    await expect(page.getByRole('button', { name: 'Remove filter: Navy' })).toBeVisible();
    const total = Number((await page.getByText(/^Showing/).textContent())!.match(/of (\d+)/)![1]);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(43);
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByText('of 43 products')).toBeVisible();
  });

  test('price filter and sorting by price', async ({ page }) => {
    await page.goto('/categories/pens?sort=price-asc');
    await expect(page.getByRole('combobox', { name: 'Sort products' })).toHaveValue('price-asc');
    const prices = await page.getByRole('region', { name: 'Products' }).getByRole('article').locator('.tabular-nums').allTextContents();
    const values = prices.map((p) => Number(p.replace(/[^\d.]/g, '')));
    expect(values).toEqual([...values].sort((a, b) => a - b));

    await page.goto('/categories/pens?min=300&max=500');
    await expect(page.getByRole('button', { name: 'Remove filter: From ₹300' })).toBeVisible();
    const filtered = await page.getByRole('region', { name: 'Products' }).getByRole('article').locator('.tabular-nums').allTextContents();
    for (const p of filtered) expect(Number(p.replace(/[^\d.]/g, ''))).toBeGreaterThanOrEqual(300);
  });

  test('sort control updates the URL', async ({ page }) => {
    await page.goto('/categories/drinkware');
    await page.waitForLoadState('networkidle'); // let the pre-rendered page hydrate first
    await page.getByRole('combobox', { name: 'Sort products' }).selectOption('name-asc');
    await expect(page).toHaveURL(/sort=name-asc/);
  });

  test('pagination', async ({ page }) => {
    await page.goto('/categories/clothing-caps-bags');
    await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Page 2' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Showing 25–48 of 65 products')).toBeVisible();
  });

  test('mobile filters open in a sheet', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile layout');
    await page.goto('/categories/drinkware');
    await page.getByRole('button', { name: /Filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await sheet.getByRole('checkbox', { name: 'Bestsellers' }).click();
    await sheet.getByRole('button', { name: /^Show \d+ products?$/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/show=bestsellers/);
  });

  test('a product card opens its product page', async ({ page }) => {
    await page.goto('/categories/stamps-and-ink');
    const first = page.getByRole('region', { name: 'Products' }).getByRole('article').first();
    const name = (await first.getByRole('heading').textContent())!.trim();
    await first.getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Stamps and Ink' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Stamps and Ink' })).toBeVisible();
  });
});

test.describe('product pages', () => {
  test('price always equals the selected SKU in the catalogue data (one product per category)', async ({ page, request }) => {
    test.setTimeout(180_000);
    const summaries = await getJson<ProductJson[]>(request, '/api/v1/catalogue/products.json');
    const sample = [...new Map(summaries.map((s) => [s.categorySlug, s.slug])).values()];
    expect(sample).toHaveLength(11);
    for (const slug of sample) {
      const product = await getJson<ProductJson>(request, `/api/v1/catalogue/products/${slug}.json`);
      await page.goto(`/products/${slug}`);
      await expect(page.getByRole('heading', { level: 1, name: product.name })).toBeVisible();
      await expectPriceMatchesSku(page, product);
      // Pick a different value in each catalogue option group and check again. (Studio-only
      // choices such as envelope sizes add a saved price adjustment — product-options.spec.ts.)
      for (const group of await page.locator('[data-option-source="catalogue"]').getByRole('radiogroup').all()) {
        const unchecked = group.locator('[role="radio"][aria-checked="false"]:not([aria-disabled="true"])').first();
        if (await unchecked.count()) {
          await unchecked.click();
          await expectPriceMatchesSku(page, product);
        }
      }
    }
  });

  test('classic visiting cards: tiers, ink, sets and the variant deep link', async ({ page, request }) => {
    const product = await getJson<ProductJson>(request, '/api/v1/catalogue/products/business-card-classic.json');
    await page.goto('/products/business-card-classic');
    await page.getByRole('radio', { name: /500 cards/ }).click();
    await page.getByRole('radio', { name: /Full Colour/ }).click();
    await page.getByRole('button', { name: 'Increase number of sets' }).click();
    const variant = await expectPriceMatchesSku(page, product, 2);
    expect(variant.sku).toBe('BUSINESS-CARD-CLASSIC-QTY-500-INK-FULL-COLOUR');
    await expect(page.getByText('1,000 units')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`variantId=${variant.id}`));

    await page.goto(`/products/business-card-classic?variantId=${variant.id}`);
    await expect(page.getByText(`SKU ${variant.sku}`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start designing' }).first()).toHaveAttribute('href', `/products/business-card-classic/design?variantId=${variant.id}`);
  });

  test('pre-rendered product HTML contains the product and structured data', async ({ request }) => {
    const html = await (await request.get('/products/apparel-polo-classic')).text();
    expect(html).toContain('<h1');
    expect(html).toContain('Classic Polo Shirt');
    expect(html).toContain('"@type":"Product"');
  });

  test('unknown products show a not-found page', async ({ page }) => {
    await page.goto('/products/does-not-exist');
    await expect(page.getByRole('heading', { level: 1, name: /couldn’t find that (product|page)/ })).toBeVisible();
  });
});

test.describe('search', () => {
  test('results page lists matching products', async ({ page }) => {
    await page.goto('/search?q=mug');
    await expect(page.getByRole('heading', { level: 1, name: 'Results for “mug”' })).toBeVisible();
    const cards = page.getByRole('region', { name: 'Products' }).getByRole('article');
    await expect(cards.first()).toContainText(/mug/i);
  });

  test('no results and empty states', async ({ page }) => {
    await page.goto('/search?q=zzqxv');
    await expect(page.getByRole('heading', { name: 'No products match “zzqxv”' })).toBeVisible();
    await page.goto('/search');
    await expect(page.getByRole('heading', { name: 'Popular right now' })).toBeVisible();
  });

  test('suggestions work with the keyboard', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('main').getByRole('combobox', { name: 'Search products' });
    await box.fill('bottle');
    await expect(page.getByRole('main').getByRole('option').first()).toBeVisible();
    await box.press('ArrowDown');
    await expect(box).toHaveAttribute('aria-activedescendant', /.+/);
    await box.press('Enter');
    await expect(page).toHaveURL(/\/categories\/drinkware/);
  });

  test('suggestion "see all" goes to the results page', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('main').getByRole('combobox', { name: 'Search products' });
    await box.fill('polo');
    await page.getByRole('main').getByRole('option', { name: /See all \d+ results for “polo”/ }).click();
    await expect(page).toHaveURL(/\/search\?q=polo/);
  });
});

test.describe('mega-menu', () => {
  test('switches categories and links to product types', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop navigation');
    await page.goto('/');
    await page.getByRole('button', { name: 'Products' }).click();
    await page.getByRole('tab', { name: 'Pens' }).hover();
    await expect(page.getByRole('tab', { name: 'Pens' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tabpanel').getByRole('link', { name: /Premium & gift pens/ }).click();
    await expect(page).toHaveURL(/\/categories\/pens\?type=premium-pens/);
    await expect(page.getByText(/of 23 products/)).toBeVisible();
  });
});

test.describe('content pages', () => {
  const pages = [
    ['/about', 'We make print feel personal again.'],
    ['/shipping', 'Delivered fast, made right.'],
    ['/refund-policy', 'If it\'s not right, we\'ll make it right.'],
    ['/privacy', 'Your data, handled with care.'],
    ['/terms', 'Clear terms, no surprises.'],
    ['/faq', 'Frequently asked questions'],
    ['/contact', 'We’d love to hear from you'],
    ['/credits', 'Photo and model credits'],
  ] as const;

  for (const [path, heading] of pages) {
    test(`${path} renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    });
  }

  test('policy table of contents jumps to sections', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop table of contents');
    await page.goto('/privacy');
    await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: /Your rights and choices/ }).last().click();
    await expect(page).toHaveURL(/#your-rights$/);
  });

  test('FAQ answers expand', async ({ page }) => {
    await page.goto('/faq');
    await page.getByRole('button', { name: 'Can I cancel my order?' }).click();
    await expect(page.getByText(/free of charge, while it's still Confirmed/)).toBeVisible();
  });
});
