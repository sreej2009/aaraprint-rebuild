/// <reference types="node" />
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Category, Collection, Product, ProductSummary } from './types';

/**
 * Build-time (pre-render) access to the catalogue. Route `loader`s use this; the browser
 * uses the same JSON through lib/api/catalogue.ts. `.server` modules never reach the client bundle.
 */
const ROOT = path.resolve('public/api/v1/catalogue');
const cache = new Map<string, Promise<unknown>>();

function readJson<T>(file: string): Promise<T> {
  let entry = cache.get(file);
  if (!entry) {
    entry = fs.readFile(path.join(ROOT, file), 'utf8').then((text) => JSON.parse(text) as T);
    cache.set(file, entry);
  }
  return entry as Promise<T>;
}

export const getCategories = () => readJson<Category[]>('categories.json');
export const getCollections = () => readJson<Collection[]>('collections.json');
export const getProductSummaries = () => readJson<ProductSummary[]>('products.json');

export async function getCategory(slug: string): Promise<Category | null> {
  return (await getCategories()).find((c) => c.slug === slug) ?? null;
}

export async function getProduct(slug: string): Promise<Product | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    return await readJson<Product>(`products/${slug}.json`);
  } catch {
    return null;
  }
}
