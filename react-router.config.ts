import type { Config } from '@react-router/dev/config';

/**
 * Public, indexable pages rendered to static HTML at build time.
 * Phase 2 adds every `/categories/:slug` and `/products/:slug` path from the catalogue data.
 * Everything else (Studio, cart, checkout, account) is served by the SPA fallback.
 */
const prerenderPaths = ['/', '/about', '/contact', '/faq', '/shipping', '/refund-policy', '/privacy', '/terms', '/credits'];

export default {
  appDirectory: 'src',
  ssr: false,
  prerender: prerenderPaths,
} satisfies Config;
