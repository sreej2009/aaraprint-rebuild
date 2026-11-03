import type { Category, Collection, Product, ProductSummary } from '@/lib/catalogue/types';
import { ApiError, getJson } from './http';

/**
 * Catalogue API. Until the backend exists, it reads the static mock under
 * public/api/v1/catalogue (generated from the recovered site). The backend should
 * keep these response shapes so only the paths below change.
 */
export interface CatalogueApi {
  listCategories(signal?: AbortSignal): Promise<Category[]>;
  listCollections(signal?: AbortSignal): Promise<Collection[]>;
  listProducts(signal?: AbortSignal): Promise<ProductSummary[]>;
  getProduct(slug: string, signal?: AbortSignal): Promise<Product | null>;
}

export function createCatalogueApi(baseUrl: string): CatalogueApi {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    listCategories: (signal) => getJson<Category[]>(`${root}/catalogue/categories.json`, signal),
    listCollections: (signal) => getJson<Collection[]>(`${root}/catalogue/collections.json`, signal),
    listProducts: (signal) => getJson<ProductSummary[]>(`${root}/catalogue/products.json`, signal),
    async getProduct(slug, signal) {
      if (!/^[a-z0-9-]+$/.test(slug)) return null;
      try {
        return await getJson<Product>(`${root}/catalogue/products/${slug}.json`, signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  };
}

export const catalogueApi = createCatalogueApi(import.meta.env.VITE_API_BASE_URL ?? '/api/v1');
