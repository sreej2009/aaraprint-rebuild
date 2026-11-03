import type { MetaDescriptor } from 'react-router';

export const SITE_NAME = 'Aaraprint';
const SITE_URL = (import.meta.env.VITE_SITE_URL ?? '').replace(/\/+$/, '');
const DEFAULT_DESCRIPTION =
  'Design and order visiting cards, stationery, signage, apparel, mugs and gifts online. Print-checked files, pay on delivery and free shipping across India over ₹1,999.';

export interface SeoInput {
  /** Page title without the site name. Omit for the home page. */
  title?: string;
  description?: string;
  /** Path for the canonical URL, e.g. "/categories/pens". Only emitted when VITE_SITE_URL is set. */
  path?: string;
  /** Keep the page out of search results (internal or placeholder pages). */
  noindex?: boolean;
}

/** Route `meta` helper: one consistent set of title, description, Open Graph and robots tags. */
export function seo({ title, description = DEFAULT_DESCRIPTION, path, noindex }: SeoInput = {}): MetaDescriptor[] {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — Custom printing, designed by you`;
  const tags: MetaDescriptor[] = [
    { title: fullTitle },
    { name: 'description', content: description },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: fullTitle },
    { property: 'og:description', content: description },
  ];
  if (noindex) tags.push({ name: 'robots', content: 'noindex' });
  if (SITE_URL && path) {
    tags.push({ tagName: 'link', rel: 'canonical', href: `${SITE_URL}${path}` });
    tags.push({ property: 'og:url', content: `${SITE_URL}${path}` });
  }
  return tags;
}
