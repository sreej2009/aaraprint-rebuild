import type { ProductSummary } from '@/lib/catalogue/types';

/**
 * Listing logic shared by category, "view all" and search pages. Everything is derived
 * from URL search params, so filtered views are shareable and survive reloads.
 *
 *   ?type=caps&type=bags        product type (category pages) or ?category= (all products / search)
 *   ?colour=navy&finish=matte   option filters (keys and values are slugs)
 *   ?min=200&max=900            "from" price in rupees
 *   ?show=bestsellers&show=new  badges
 *   ?sort=price-asc&page=2
 */

export const PAGE_SIZE = 24;

export const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' },
  { value: 'name-asc', label: 'Name: A to Z' },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]['value'];
export type ShowFilter = 'bestsellers' | 'new';

const RESERVED = new Set(['q', 'type', 'category', 'sort', 'page', 'min', 'max', 'show']);

/** Option groups that are about amounts or wording rather than what a product is like. */
const NON_FACET_GROUPS = new Set([
  'Quantity',
  'Pack Size',
  'Set Size',
  'Page Count',
  'Pages per Book',
  'Sheet Count',
  'Preset Text',
  'Kit Size',
  'Package Size',
  'Package',
  'Turnaround',
  'Envelopes',
  'QR Placement',
  'Spot UV Placement',
  'Insert Included',
  'String Included',
]);

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface ListingQuery {
  /** Values of the group facet: product types (category pages) or categories (all products, search). */
  groups: string[];
  options: Record<string, string[]>;
  minRupees: number | null;
  maxRupees: number | null;
  show: ShowFilter[];
  sort: SortKey;
  page: number;
}

export function parseListingQuery(params: URLSearchParams, groupParam: 'type' | 'category'): ListingQuery {
  const options: Record<string, string[]> = {};
  for (const [key, value] of params) {
    if (RESERVED.has(key) || !value) continue;
    (options[key] ??= []).push(value);
  }
  const number = (value: string | null) => {
    if (value === null || value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };
  const sort = params.get('sort');
  return {
    groups: params.getAll(groupParam).filter(Boolean),
    options,
    minRupees: number(params.get('min')),
    maxRupees: number(params.get('max')),
    show: params.getAll('show').filter((s): s is ShowFilter => s === 'bestsellers' || s === 'new'),
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as SortKey) : 'recommended',
    page: Math.max(1, Math.floor(Number(params.get('page')) || 1)),
  };
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export interface OptionFacet {
  key: string;
  name: string;
  values: FacetValue[];
}

export interface GroupOption {
  slug: string;
  name: string;
}

export interface ListingResult {
  items: ProductSummary[];
  total: number;
  page: number;
  pageCount: number;
  groupFacet: FacetValue[];
  optionFacets: OptionFacet[];
  priceBounds: { minRupees: number; maxRupees: number } | null;
  /** Number of active filters (not counting sort or page). */
  activeFilterCount: number;
}

interface Context {
  /** Which summary field the group facet reads. */
  groupField: 'typeSlug' | 'categorySlug';
  groupOptions: GroupOption[];
  /** Keep the incoming order for "recommended" (search results are already ranked by relevance). */
  preserveOrder?: boolean;
}

const optionSlugs = (product: ProductSummary, groupName: string) => (product.options[groupName] ?? []).map(slugify);

function matches(product: ProductSummary, query: ListingQuery, context: Context, facetKeyToName: Map<string, string>, skip?: string): boolean {
  if (skip !== '__group' && query.groups.length && !query.groups.includes(product[context.groupField] ?? '')) return false;
  if (skip !== '__price') {
    const rupees = product.fromPriceCents / 100;
    if (query.minRupees !== null && rupees < query.minRupees) return false;
    if (query.maxRupees !== null && rupees > query.maxRupees) return false;
  }
  if (skip !== '__show') {
    if (query.show.includes('bestsellers') && !product.isFeatured) return false;
    if (query.show.includes('new') && !product.isNew) return false;
  }
  for (const [key, wanted] of Object.entries(query.options)) {
    if (key === skip) continue;
    const groupName = facetKeyToName.get(key);
    if (!groupName) continue; // unknown keys are ignored rather than emptying the page
    const values = optionSlugs(product, groupName);
    if (!wanted.some((w) => values.includes(w))) return false;
  }
  return true;
}

/** Option groups worth filtering by in this set of products. */
export function optionFacetGroups(products: ProductSummary[], maxGroups = 4): { key: string; name: string }[] {
  const coverage = new Map<string, number>();
  for (const product of products) {
    for (const name of Object.keys(product.options)) {
      if (!NON_FACET_GROUPS.has(name)) coverage.set(name, (coverage.get(name) ?? 0) + 1);
    }
  }
  const minimum = Math.max(3, Math.ceil(products.length * 0.15));
  return [...coverage.entries()]
    .filter(([name, count]) => {
      if (count < minimum) return false;
      const values = new Map<string, number>();
      for (const p of products) for (const v of new Set(optionSlugs(p, name))) values.set(v, (values.get(v) ?? 0) + 1);
      return [...values.values()].filter((n) => n >= 2).length >= 2;
    })
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxGroups)
    .map(([name]) => ({ key: slugify(name), name }));
}

function rank(a: ProductSummary, b: ProductSummary, order: Map<string, number>) {
  return Number(b.isFeatured) - Number(a.isFeatured) || Number(b.isNew) - Number(a.isNew) || (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0);
}

export function sortProducts(products: ProductSummary[], sort: SortKey, preserveOrder = false): ProductSummary[] {
  const order = new Map(products.map((p, i) => [p.slug, i]));
  const sorted = [...products];
  if (sort === 'recommended' && preserveOrder) return sorted;
  switch (sort) {
    case 'price-asc':
      return sorted.sort((a, b) => a.fromPriceCents - b.fromPriceCents || rank(a, b, order));
    case 'price-desc':
      return sorted.sort((a, b) => b.fromPriceCents - a.fromPriceCents || rank(a, b, order));
    case 'newest':
      return sorted.sort((a, b) => Number(b.isNew) - Number(a.isNew) || rank(a, b, order));
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    default:
      return sorted.sort((a, b) => rank(a, b, order));
  }
}

/**
 * Filter, facet, sort and paginate. Facet counts are "disjunctive": each facet is counted
 * with every other filter applied, so you can see what choosing another value would give.
 */
export function applyListing(products: ProductSummary[], query: ListingQuery, context: Context): ListingResult {
  const groups = optionFacetGroups(products);
  const facetKeyToName = new Map(groups.map((g) => [g.key, g.name]));

  const filtered = products.filter((p) => matches(p, query, context, facetKeyToName));
  const sorted = sortProducts(filtered, query.sort, context.preserveOrder);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);

  const forGroup = products.filter((p) => matches(p, query, context, facetKeyToName, '__group'));
  const groupFacet = context.groupOptions
    .map((option) => ({ value: option.slug, label: option.name, count: forGroup.filter((p) => p[context.groupField] === option.slug).length }))
    .filter((v) => v.count > 0 || query.groups.includes(v.value));

  const optionFacets = groups.map(({ key, name }) => {
    const pool = products.filter((p) => matches(p, query, context, facetKeyToName, key));
    const counts = new Map<string, { label: string; count: number }>();
    for (const p of pool) {
      for (const label of new Set(p.options[name] ?? [])) {
        const value = slugify(label);
        const entry = counts.get(value) ?? { label, count: 0 };
        entry.count++;
        counts.set(value, entry);
      }
    }
    const values = [...counts.entries()]
      .map(([value, { label, count }]) => ({ value, label, count }))
      .filter((v) => v.count >= 2 || query.options[key]?.includes(v.value))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 14);
    return { key, name, values };
  });

  const prices = products.map((p) => p.fromPriceCents / 100);
  const activeFilterCount =
    query.groups.length +
    query.show.length +
    (query.minRupees !== null ? 1 : 0) +
    (query.maxRupees !== null ? 1 : 0) +
    Object.entries(query.options).reduce((n, [key, values]) => n + (facetKeyToName.has(key) ? values.length : 0), 0);

  return {
    items: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: sorted.length,
    page,
    pageCount,
    groupFacet,
    optionFacets: optionFacets.filter((f) => f.values.length >= 2),
    priceBounds: prices.length ? { minRupees: Math.floor(Math.min(...prices)), maxRupees: Math.ceil(Math.max(...prices)) } : null,
    activeFilterCount,
  };
}

/** Pages to show: first, last, current ±1, with gaps marked as null. */
export function pageWindow(page: number, pageCount: number): (number | null)[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}

// ------------------------------------------------------------ URL helpers

/** New params with `value` toggled for `key`; resets pagination. */
export function toggleParam(params: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  const values = next.getAll(key);
  next.delete(key);
  for (const v of values) if (v !== value) next.append(key, v);
  if (!values.includes(value)) next.append(key, value);
  next.delete('page');
  return next;
}

export function setParam(params: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === null || value === '') next.delete(key);
  else next.set(key, value);
  if (key !== 'page') next.delete('page');
  return next;
}

/** Keep only the search query (if any) — removes every filter. */
export function clearFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  const q = params.get('q');
  const sort = params.get('sort');
  if (q) next.set('q', q);
  if (sort) next.set('sort', sort);
  return next;
}
