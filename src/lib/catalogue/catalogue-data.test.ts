import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import navigation from '@/data/generated/navigation.json';
import { computedPriceCents } from '@/lib/pricing';
import type { Category, Product, ProductSummary } from './types';

/**
 * Integrity checks on the mock catalogue generated from the recovered site.
 * They lock in the business rules documented in AARAPRINT_RECONNAISSANCE.md §5–6.
 */
const root = path.resolve('public/api/v1/catalogue');
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as T;

const categories = readJson<Category[]>('categories.json');
const summaries = readJson<ProductSummary[]>('products.json');
const products = summaries.map((s) => readJson<Product>(`products/${s.slug}.json`));

describe('catalogue data', () => {
  it('has the 11 categories and 533 products found during research', () => {
    expect(categories).toHaveLength(11);
    expect(summaries).toHaveLength(533);
    expect(categories.reduce((n, c) => n + c.productCount, 0)).toBe(533);
    expect(products.reduce((n, p) => n + p.variants.length, 0)).toBe(5546);
  });

  it('keeps the bundled navigation in sync with the API', () => {
    expect(navigation.map((c) => [c.slug, c.productCount])).toEqual(categories.map((c) => [c.slug, c.productCount]));
  });

  it('assigns every product to a known category', () => {
    const slugs = new Set(categories.map((c) => c.slug));
    for (const product of products) expect(slugs.has(product.categorySlug ?? ''), product.slug).toBe(true);
  });

  it('prices every variant as base price plus option deltas', () => {
    for (const product of products) {
      for (const variant of product.variants) {
        const selection = Object.fromEntries(
          product.optionGroups.map((group) => [group.id, group.values.find((v) => variant.optionValueIds.includes(v.id))?.id ?? '']),
        );
        expect(computedPriceCents(product, selection), variant.sku).toBe(variant.priceCents);
      }
    }
  });

  it('gives every variant exactly one value from each option group', () => {
    for (const product of products) {
      const valueIds = new Set(product.optionGroups.flatMap((g) => g.values.map((v) => v.id)));
      for (const variant of product.variants) {
        expect(variant.optionValueIds, variant.sku).toHaveLength(product.optionGroups.length);
        for (const id of variant.optionValueIds) expect(valueIds.has(id), variant.sku).toBe(true);
      }
    }
  });

  it('has a print configuration for every customisable product', () => {
    const missing = products.filter((p) => p.isCustomizable && !p.print).map((p) => p.slug);
    expect(missing).toEqual([]);
  });

  it('matches the summary price range to the variants', () => {
    for (const product of products) {
      const prices = product.variants.map((v) => v.priceCents);
      expect(product.fromPriceCents, product.slug).toBe(Math.min(...prices));
      expect(product.toPriceCents, product.slug).toBe(Math.max(...prices));
    }
  });
});
