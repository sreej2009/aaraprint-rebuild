import { expect, test } from './fixtures';

test.describe('pre-rendering and routing', () => {
  test('home page HTML is pre-rendered with content (works without JavaScript)', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toContain('Custom printing for your brand and big days');
    expect(html).toContain('Visiting Cards');
    expect(html).toMatch(/<title>Aaraprint — Custom printing, designed by you<\/title>/);
  });

  test('content routes are pre-rendered; app routes use the SPA fallback', async ({ request }) => {
    expect(await (await request.get('/about')).text()).toContain('About Aaraprint');
    const cart = await request.get('/cart');
    expect(cart.status()).toBe(200);
    expect(await cart.text()).toContain('Loading page');
  });

  test('original URLs resolve, including client-rendered ones', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.getByRole('heading', { level: 1, name: 'Your cart' })).toBeVisible();
    await expect(page).toHaveTitle('Your cart · Aaraprint');

    await page.goto('/track-order');
    await expect(page.getByRole('heading', { level: 1, name: 'Track your order' })).toBeVisible();
  });

  test('unknown pages show a helpful not-found page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByRole('heading', { level: 1, name: 'We couldn’t find that page' })).toBeVisible();
    await page.goto('/categories/not-a-category');
    await expect(page.getByRole('heading', { level: 1, name: /couldn’t find that (category|page)/ })).toBeVisible();
  });

  test('the Design Studio route is full-screen with a way back', async ({ page }) => {
    await page.goto('/products/business-card-classic/design');
    await expect(page.getByRole('heading', { level: 1, name: 'Design Studio: Classic Visiting Cards' })).toBeAttached();
    await expect(page.getByRole('link', { name: 'Back to product' })).toHaveAttribute('href', /^\/products\/business-card-classic\?variantId=/);
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0); // no storefront header
  });
});

test.describe('navigation', () => {
  test('skip link jumps to the main content', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard navigation');
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
  });

  test('Products menu opens with the keyboard and lists every category', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop navigation');
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Products' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByRole('navigation', { name: 'Main' });
    await expect(menu.getByRole('tab')).toHaveCount(11);
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('client-side navigation moves focus to the new page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop layout');
    await page.goto('/');
    await page.getByRole('main').getByRole('link', { name: /Drinkware/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Drinkware' })).toBeVisible();
    await expect(page.locator('#main-content')).toBeFocused();
    await expect(page).toHaveTitle('Drinkware · Aaraprint');
  });

  test('mobile menu opens as a sheet, navigates and closes', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile navigation');
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('link', { name: /Umbrellas & Rainwear/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Umbrellas & Rainwear' })).toBeVisible();
  });

  test('search submits to /search with the query', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('main').getByRole('combobox', { name: 'Search products' });
    await search.fill('mug');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=mug$/);
  });

  test('"/" focuses the header search on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard shortcut');
    await page.goto('/');
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('/');
    await expect(page.getByRole('banner').getByRole('combobox', { name: 'Search products' })).toBeFocused();
  });
});

test.describe('design system page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design-system');
    // The page loads catalogue data in the browser; wait until it has rendered.
    await page.getByText('Live data: Classic Visiting Cards').waitFor();
  });

  test('loads live catalogue data and reprices as options change', async ({ page }) => {
    const tiers = page.getByRole('radiogroup', { name: 'Quantity' });
    await expect(tiers.getByRole('radio', { name: /100 cards/ })).toBeChecked();
    await expect(page.getByText('BUSINESS-CARD-CLASSIC-QTY-100-INK-CLASSIC-BLACK')).toBeVisible();

    await tiers.getByRole('radio', { name: /500 cards/ }).click();
    await page.getByRole('radio', { name: /Full Colour/ }).click();
    await page.getByRole('button', { name: 'Increase number of sets' }).click();
    await expect(page.getByText('BUSINESS-CARD-CLASSIC-QTY-500-INK-FULL-COLOUR')).toBeVisible();
    await expect(page.getByText('₹1,294')).toBeVisible(); // ₹647 × 2 sets
  });

  test('radio groups support arrow keys and skip unavailable options', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard interaction');
    const finish = page.getByRole('radiogroup', { name: 'Finish' }).first();
    const radio = (name: RegExp) => finish.getByRole('radio', { name });
    // Radix moves focus just after keydown and checks the radio only while the arrow key is
    // still down, so hold each key until focus has moved (as a person does), then release.
    const arrowTo = async (name: RegExp) => {
      await page.keyboard.down('ArrowRight');
      await expect(radio(name)).toBeFocused();
      await page.keyboard.up('ArrowRight');
    };
    await radio(/^Matte/).focus();
    await arrowTo(/^Gloss/);
    await expect(radio(/^Gloss/)).toBeChecked();
    await arrowTo(/^Velvet touch/);
    await expect(radio(/^Velvet touch/)).toBeChecked();
    // Gold foil is unavailable: it can be focused (so its reason can be read) but not selected.
    await arrowTo(/^Gold foil/);
    await expect(radio(/^Gold foil/)).not.toBeChecked();
    await expect(radio(/^Velvet touch/)).toBeChecked();
  });

  test('dialogs trap focus, close on Escape and restore focus', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Rename design' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Rename design' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('toasts announce actions', async ({ page }) => {
    await page.getByRole('button', { name: 'Success', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Added to cart' })).toBeVisible();
  });
});

test('product media is served from the recovered assets', async ({ request }) => {
  const recovered = await request.get('/media/products/polo/front.png');
  expect(recovered.headers()['content-type']).toBe('image/png');
  const additional = await request.head('/media/models/polo-shirt.glb');
  expect(additional.status()).toBe(200);
});
