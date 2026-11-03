import { type RouteConfig, index, layout, prefix, route } from '@react-router/dev/routes';

/**
 * URL structure mirrors the original site (AARAPRINT_RECONNAISSANCE.md §3) so existing
 * links and search rankings keep working. Pages scheduled for later phases render the
 * shared `planned` module; each gets a stable route id used for its copy.
 */
const planned = (path: string, id: string) => route(path, 'routes/planned.tsx', { id });
const content = (path: string) => route(path, 'routes/content-page.tsx', { id: `content-${path}` });

export default [
  layout('routes/storefront-layout.tsx', [
    index('routes/home.tsx'),

    // Catalogue — Phase 2 (`/categories/view-all` lists every product)
    route('categories/:categorySlug', 'routes/category.tsx'),
    route('products/:productSlug', 'routes/product.tsx'),
    route('search', 'routes/search.tsx'),

    // Content — Phase 2
    content('about'),
    content('shipping'),
    content('refund-policy'),
    content('privacy'),
    content('terms'),
    route('faq', 'routes/faq.tsx'),
    route('contact', 'routes/contact.tsx'),
    route('credits', 'routes/credits.tsx'),

    // Commerce — Phase 6
    planned('cart', 'cart'),
    planned('checkout', 'checkout'),
    planned('track-order', 'track-order'),
    planned('account', 'account'),
    ...prefix('account', [
      planned('orders', 'account-orders'),
      planned('designs', 'account-designs'),
      planned('addresses', 'account-addresses'),
      planned('settings', 'account-settings'),
    ]),
    planned('login', 'login'),
    planned('signup', 'signup'),
    planned('forgot-password', 'forgot-password'),

    // Internal component reference (noindex)
    route('design-system', 'routes/design-system.tsx'),

    route('*', 'routes/not-found.tsx'),
  ]),

  // Design Studio is full-screen, without storefront chrome — Phases 3–5
  route('products/:productSlug/design', 'routes/studio-planned.tsx'),
] satisfies RouteConfig;
