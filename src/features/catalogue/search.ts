import type { CategorySummary, ProductSummary } from '@/lib/catalogue/types';

/**
 * Client-side product search over the catalogue summaries (533 products — small enough
 * to search in the browser). When a backend search API exists it can replace `searchProducts`
 * behind the same interface.
 */

/** Words customers use for the same thing. Matching any alternative counts as a match. */
const SYNONYMS: Record<string, string[]> = {
  business: ['visiting'],
  visiting: ['business'],
  tshirt: ['tee', 'polo'],
  tee: ['tshirt'],
  bottle: ['flask', 'sipper'],
  flask: ['bottle'],
  cup: ['mug', 'tumbler'],
  mug: ['cup'],
  sticker: ['label', 'decal'],
  label: ['sticker'],
  banner: ['standee', 'flag'],
  invite: ['invitation'],
  invitation: ['invite'],
  umbrella: ['umbrellas'],
  diary: ['notebook', 'diaries'],
  notebook: ['diary'],
  card: ['cards'],
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/t[\s-]?shirts?|\btees\b/g, 'tshirt')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('es') && /(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .map(stem);
}

const STOP_WORDS = new Set(['and', 'for', 'the', 'with', 'of', 'a', 'an', 'in', 'custom', 'customised', 'customized', 'personalised', 'printed']);

interface IndexedProduct {
  product: ProductSummary;
  fields: { words: string[]; weight: number }[];
}

export interface SearchIndex {
  entries: IndexedProduct[];
  categories: { category: CategorySummary; words: string[] }[];
}

export function buildSearchIndex(products: ProductSummary[], categories: readonly CategorySummary[]): SearchIndex {
  const categoryName = new Map(categories.map((c) => [c.slug, c.name]));
  const typeName = new Map(categories.flatMap((c) => c.types.map((t) => [`${c.slug}/${t.slug}`, t.name] as const)));
  return {
    entries: products.map((product) => ({
      product,
      fields: [
        { words: tokenize(product.name), weight: 6 },
        { words: tokenize(typeName.get(`${product.categorySlug}/${product.typeSlug}`) ?? ''), weight: 4 },
        { words: tokenize(categoryName.get(product.categorySlug ?? '') ?? ''), weight: 3 },
        { words: tokenize(product.shortDescription), weight: 2 },
        { words: tokenize(Object.values(product.options).flat().join(' ')), weight: 1 },
      ],
    })),
    categories: categories.map((category) => ({ category, words: tokenize(`${category.name} ${category.types.map((t) => t.name).join(' ')}`) })),
  };
}

/** A query word matches a field word that starts with it (or with one of its synonyms). */
function alternatives(token: string): string[] {
  return [token, ...(SYNONYMS[token] ?? []).map(stem)];
}

function tokenScore(token: string, fields: IndexedProduct['fields']): number {
  const alts = alternatives(token);
  let best = 0;
  for (const field of fields) {
    for (const word of field.words) {
      for (const alt of alts) {
        if (word === alt) best = Math.max(best, field.weight * (alt === token ? 1.5 : 1.2));
        else if (alt.length >= 2 && word.startsWith(alt)) best = Math.max(best, field.weight * (alt === token ? 1 : 0.8));
      }
    }
  }
  return best;
}

/** Products matching every query word, best first. */
export function searchProducts(index: SearchIndex, query: string): ProductSummary[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const scored: { product: ProductSummary; score: number }[] = [];
  for (const entry of index.entries) {
    let score = 0;
    let matched = true;
    for (const token of tokens) {
      const s = tokenScore(token, entry.fields);
      if (s === 0) {
        matched = false;
        break;
      }
      score += s;
    }
    if (!matched) continue;
    const name = normalize(entry.product.name);
    if (name.startsWith(normalize(query))) score += 5;
    if (entry.product.isFeatured) score += 0.5;
    scored.push({ product: entry.product, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name)).map((s) => s.product);
}

export interface Suggestions {
  categories: CategorySummary[];
  products: ProductSummary[];
  total: number;
}

/** Autocomplete: up to 3 matching categories and 6 products. */
export function suggest(index: SearchIndex, query: string): Suggestions {
  const tokens = tokenize(query);
  if (!tokens.length) return { categories: [], products: [], total: 0 };
  const categories = index.categories
    .filter(({ words }) => tokens.every((t) => alternatives(t).some((alt) => words.some((w) => w.startsWith(alt)))))
    .map(({ category }) => category)
    .slice(0, 3);
  const products = searchProducts(index, query);
  return { categories, products: products.slice(0, 6), total: products.length };
}
