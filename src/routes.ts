import { type RouteConfig, index, layout, prefix, route } from '@react-router/dev/routes';

/**
 * URL structure mirrors the original site (AARAPRINT_RECONNAISSANCE.md §3) so existing
 * links and search rankings keep working. Pages scheduled for later phases render the
 * shared `planned` module; each gets a stable route id used for its copy.
 */
const planned = (path: string, id: string) => route(path, 'routes/planned.tsx', { id });

export default [
  layout('routes/storefront-layout.tsx', [
    index('routes/home.tsx'),

    // Catalogue — Phase 2
    planned('categories/:categorySlug', 'category'),
    planned('products/:productSlug', 'product'),
    planned('search', 'search'),

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

    // Content — Phase 2
    planned('about', 'about'),
    planned('contact', 'contact'),
    planned('faq', 'faq'),
    planned('shipping', 'shipping'),
    planned('refund-policy', 'refund-policy'),
    planned('privacy', 'privacy'),
    planned('terms', 'terms'),
    planned('credits', 'credits'),

    // Internal component reference (noindex)
    route('design-system', 'routes/design-system.tsx'),

    route('*', 'routes/not-found.tsx'),
  ]),

  // Design Studio is full-screen, without storefront chrome — Phases 3–5
  route('products/:productSlug/design', 'routes/studio-planned.tsx'),
] satisfies RouteConfig;
