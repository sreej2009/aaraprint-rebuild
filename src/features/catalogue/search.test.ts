import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import navigation from '@/data/generated/navigation.json';
import type { CategorySummary, ProductSummary } from '@/lib/catalogue/types';
import { buildSearchIndex, normalize, searchProducts, suggest, tokenize } from './search';

const products = JSON.parse(fs.readFileSync(path.resolve('public/api/v1/catalogue/products.json'), 'utf8')) as ProductSummary[];
const index = buildSearchIndex(products, navigation as CategorySummary[]);

describe('text normalisation', () => {
  it('unifies t-shirt spellings and strips punctuation', () => {
    expect(normalize('T-Shirts & Tees!')).toBe('tshirt and tshirt');
    expect(tokenize('Visiting Cards')).toEqual(['visiting', 'card']);
  });
});

describe('searchProducts', () => {
  it('finds mugs, with mug products first', () => {
    const results = searchProducts(index, 'mug');
    expect(results.length).toBeGreaterThan(5);
    expect(results.slice(0, 5).every((p) => /mug/i.test(p.name))).toBe(true);
  });

  it('treats "business card" and "visiting card" as the same thing', () => {
    const business = searchProducts(index, 'business cards').map((p) => p.slug);
    expect(business).toContain('business-card-classic');
    expect(searchProducts(index, 'visiting card').map((p) => p.slug)).toContain('business-card-classic');
  });

  it('requires every word to match', () => {
    const results = searchProducts(index, 'navy polo');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.categorySlug === 'custom-polo-t-shirts' || /polo/i.test(p.name))).toBe(true);
  });

  it('matches prefixes while typing', () => {
    expect(searchProducts(index, 'umbr').every((p) => p.categorySlug === 'umbrellas-rainwear')).toBe(true);
  });

  it('returns nothing for gibberish or empty queries', () => {
    expect(searchProducts(index, 'zzqxv')).toEqual([]);
    expect(searchProducts(index, '   ')).toEqual([]);
  });
});

describe('suggest', () => {
  it('returns matching categories and up to six products', () => {
    const s = suggest(index, 'bottle');
    expect(s.categories.map((c) => c.slug)).toContain('drinkware');
    expect(s.products.length).toBe(6);
    expect(s.total).toBeGreaterThan(6);
  });
});
