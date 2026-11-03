import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Category, ProductSummary } from '@/lib/catalogue/types';
import { applyListing, clearFilters, optionFacetGroups, PAGE_SIZE, pageWindow, parseListingQuery, setParam, slugify, sortProducts, toggleParam } from './listing';

const root = path.resolve('public/api/v1/catalogue');
const summaries = JSON.parse(fs.readFileSync(path.join(root, 'products.json'), 'utf8')) as ProductSummary[];
const categories = JSON.parse(fs.readFileSync(path.join(root, 'categories.json'), 'utf8')) as Category[];

function listCategory(slug: string, search = '') {
  const category = categories.find((c) => c.slug === slug)!;
  const products = summaries.filter((p) => p.categorySlug === slug);
  const query = parseListingQuery(new URLSearchParams(search), 'type');
  return { products, result: applyListing(products, query, { groupField: 'typeSlug', groupOptions: category.types }) };
}

describe('parseListingQuery', () => {
  it('reads types, options, price, badges, sort and page', () => {
    const q = parseListingQuery(new URLSearchParams('type=caps&type=bags&colour=navy&min=200&max=900&show=new&sort=price-asc&page=2'), 'type');
    expect(q).toEqual({ groups: ['caps', 'bags'], options: { colour: ['navy'] }, minRupees: 200, maxRupees: 900, show: ['new'], sort: 'price-asc', page: 2 });
  });

  it('falls back safely on bad input', () => {
    const q = parseListingQuery(new URLSearchParams('sort=cheapest&page=-3&min=abc&show=everything'), 'type');
    expect(q).toMatchObject({ sort: 'recommended', page: 1, minRupees: null, show: [] });
  });
});

describe('applyListing on real categories', () => {
  it('lists every product of each category across pages', () => {
    for (const category of categories) {
      const { result } = listCategory(category.slug);
      expect(result.total, category.slug).toBe(category.productCount);
      expect(result.pageCount).toBe(Math.max(1, Math.ceil(category.productCount / PAGE_SIZE)));
      expect(result.items.length).toBe(Math.min(PAGE_SIZE, category.productCount));
    }
  });

  it('filters by product type, including original ?type= links', () => {
    const { result } = listCategory('clothing-caps-bags', 'type=caps');
    expect(result.total).toBe(11);
    expect(result.items.every((p) => p.typeSlug === 'caps')).toBe(true);
    // Type facet counts ignore the type filter itself, so other types stay visible.
    expect(result.groupFacet.find((g) => g.value === 'bags')?.count).toBe(24);
  });

  it('builds option filters from product data and applies them (OR within, AND across)', () => {
    const base = listCategory('custom-polo-t-shirts');
    const colour = base.result.optionFacets.find((f) => f.name === 'Colour');
    expect(colour?.values.length).toBeGreaterThan(3);

    const navy = listCategory('custom-polo-t-shirts', 'colour=navy');
    expect(navy.result.items.every((p) => p.options.Colour?.includes('Navy'))).toBe(true);
    expect(navy.result.total).toBe(base.products.filter((p) => p.options.Colour?.includes('Navy')).length);

    const navyOrBlack = listCategory('custom-polo-t-shirts', 'colour=navy&colour=black');
    expect(navyOrBlack.result.total).toBeGreaterThanOrEqual(navy.result.total);

    const navyXxl = listCategory('custom-polo-t-shirts', 'colour=navy&size=xxl');
    expect(navyXxl.result.items.every((p) => p.options.Colour?.includes('Navy') && p.options.Size?.includes('XXL'))).toBe(true);
  });

  it('never offers quantity as a filter', () => {
    for (const category of categories) {
      const groups = optionFacetGroups(summaries.filter((p) => p.categorySlug === category.slug));
      expect(groups.map((g) => g.name)).not.toContain('Quantity');
    }
  });

  it('filters by starting price in rupees', () => {
    const { result } = listCategory('pens', 'min=100&max=300');
    expect(result.total).toBeGreaterThan(0);
    for (const p of result.items) {
      expect(p.fromPriceCents).toBeGreaterThanOrEqual(10000);
      expect(p.fromPriceCents).toBeLessThanOrEqual(30000);
    }
  });

  it('ignores unknown filter keys instead of emptying the page', () => {
    expect(listCategory('pens', 'flavour=mint').result.total).toBe(49);
  });

  it('shows only bestsellers or new products when asked', () => {
    expect(listCategory('drinkware', 'show=bestsellers').result.items.every((p) => p.isFeatured)).toBe(true);
  });

  it('clamps the page to the last page', () => {
    const { result } = listCategory('stamps-and-ink', 'page=9');
    expect(result.page).toBe(1);
  });
});

describe('sortProducts', () => {
  const pens = summaries.filter((p) => p.categorySlug === 'pens');
  it('sorts by price both ways', () => {
    const asc = sortProducts(pens, 'price-asc').map((p) => p.fromPriceCents);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = sortProducts(pens, 'price-desc').map((p) => p.fromPriceCents);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });
  it('sorts by name and puts bestsellers first for recommended', () => {
    const names = sortProducts(pens, 'name-asc').map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    const recommended = sortProducts(pens, 'recommended');
    const firstNonFeatured = recommended.findIndex((p) => !p.isFeatured);
    expect(recommended.slice(firstNonFeatured).some((p) => p.isFeatured)).toBe(false);
  });
  it('keeps relevance order when asked', () => {
    expect(sortProducts(pens, 'recommended', true)).toEqual(pens);
  });
});

describe('URL helpers', () => {
  it('toggles values and resets the page', () => {
    const params = new URLSearchParams('colour=navy&page=3');
    expect(toggleParam(params, 'colour', 'black').toString()).toBe('colour=navy&colour=black');
    expect(toggleParam(params, 'colour', 'navy').toString()).toBe('');
    expect(setParam(params, 'sort', 'price-asc').toString()).toBe('colour=navy&sort=price-asc');
    expect(clearFilters(new URLSearchParams('q=mug&colour=red&sort=name-asc')).toString()).toBe('q=mug&sort=name-asc');
  });

  it('slugifies labels', () => {
    expect(slugify('Navy & White')).toBe('navy-and-white');
    expect(slugify('One Size (Adjustable)')).toBe('one-size-adjustable');
  });

  it('builds a compact page window', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
  });
});
