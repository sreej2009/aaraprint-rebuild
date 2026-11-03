import { catalogueApi } from '@/lib/api/catalogue';
import { categories } from '@/lib/catalogue/navigation';
import type { ProductSummary } from '@/lib/catalogue/types';
import { buildSearchIndex, type SearchIndex } from './search';

let pending: Promise<{ products: ProductSummary[]; index: SearchIndex }> | null = null;

/** Loads the product summaries once per visit and builds the search index (browser only). */
export function loadSearchIndex() {
  pending ??= catalogueApi
    .listProducts()
    .then((products) => ({ products, index: buildSearchIndex(products, categories) }))
    .catch((error: unknown) => {
      pending = null; // allow a retry after a network error
      throw error;
    });
  return pending;
}
