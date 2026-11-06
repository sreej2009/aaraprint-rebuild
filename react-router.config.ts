import fs from 'node:fs';
import type { Config } from '@react-router/dev/config';

/**
 * Public, indexable pages rendered to static HTML at build time: home, content pages,
 * every category (plus /categories/view-all) and all product pages, from the catalogue data.
 * Everything else (search, Studio, cart, checkout, account) is served by the SPA fallback.
 */
const catalogue = (file: string) => JSON.parse(fs.readFileSync(`public/api/v1/catalogue/${file}`, 'utf8')) as { slug: string }[];

/** "/" normally; "/aaraprint-rebuild/" for the GitHub Pages preview (see .github/workflows/pages.yml). */
const basename = process.env.PAGES_BASE ?? '/';

const contentPaths = ['/about', '/contact', '/faq', '/shipping', '/refund-policy', '/privacy', '/terms', '/credits'];

export default {
  appDirectory: 'src',
  basename,
  ssr: false,
  prerender: {
    paths: async () => [
      '/',
      ...contentPaths,
      '/categories/view-all',
      ...catalogue('categories.json').map((c) => `/categories/${c.slug}`),
      ...catalogue('products.json').map((p) => `/products/${p.slug}`),
    ],
    concurrency: 4,
  },
} satisfies Config;
