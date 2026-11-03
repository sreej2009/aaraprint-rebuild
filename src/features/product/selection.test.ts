import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Product, ProductSummary } from '@/lib/catalogue/types';
import { defaultSelection, resolveVariant } from '@/lib/pricing';
import { galleryImages } from './gallery';
import { displayFor, priceSummary, printSpecs, selectionForVariant, unavailableReason, unitLabel } from './selection';

const root = path.resolve('public/api/v1/catalogue');
const load = (slug: string) => JSON.parse(fs.readFileSync(path.join(root, 'products', `${slug}.json`), 'utf8')) as Product;
const all = (JSON.parse(fs.readFileSync(path.join(root, 'products.json'), 'utf8')) as ProductSummary[]).map((s) => load(s.slug));

describe('every product page can be priced', () => {
  it('has a default selection that resolves to a SKU for all 533 products', () => {
    expect(all).toHaveLength(533);
    for (const product of all) {
      const variant = resolveVariant(product, defaultSelection(product));
      expect(variant, product.slug).toBeDefined();
    }
  });

  it('prices every SKU exactly: summary total = SKU price × sets', () => {
    for (const product of all) {
      for (const variant of product.variants) {
        const selection = selectionForVariant(product, variant.id)!;
        expect(priceSummary(product, selection, 1).totalCents, variant.sku).toBe(variant.priceCents);
        expect(priceSummary(product, selection, 3).totalCents, variant.sku).toBe(variant.priceCents * 3);
      }
    }
  });
});

describe('option display', () => {
  it('uses tiers for quantity, swatches for colours, chips otherwise', () => {
    const cards = load('business-card-classic');
    const polo = load('apparel-polo-classic');
    expect(displayFor(cards, cards.optionGroups.find((g) => g.name === 'Quantity')!)).toBe('tiers');
    expect(displayFor(cards, cards.optionGroups.find((g) => g.name === 'Ink Style')!)).toBe('chips');
    expect(displayFor(polo, polo.optionGroups.find((g) => g.name === 'Colour')!)).toBe('swatches');
  });

  it('derives the per-unit label from tier names', () => {
    expect(unitLabel(load('business-card-classic'))).toBe('card');
  });
});

describe('selection helpers', () => {
  const cards = load('business-card-classic');

  it('restores a selection from ?variantId=', () => {
    const variant = cards.variants.find((v) => v.sku === 'BUSINESS-CARD-CLASSIC-QTY-500-INK-FULL-COLOUR')!;
    const selection = selectionForVariant(cards, variant.id)!;
    expect(resolveVariant(cards, selection)?.id).toBe(variant.id);
    expect(selectionForVariant(cards, 'not-a-variant')).toBeNull();
  });

  it('computes per-unit price with sets', () => {
    const variant = cards.variants.find((v) => v.sku === 'BUSINESS-CARD-CLASSIC-QTY-250-INK-CLASSIC-BLACK')!;
    const summary = priceSummary(cards, selectionForVariant(cards, variant.id)!, 2);
    expect(summary).toMatchObject({ totalCents: 75800, units: 500 });
    expect(summary.unitCents).toBeCloseTo(151.6);
  });

  it('flags combinations that have no SKU', () => {
    const product = { ...cards, variants: cards.variants.filter((v) => !v.sku.endsWith('QTY-1000-INK-FULL-COLOUR')) };
    const qty = cards.optionGroups.find((g) => g.name === 'Quantity')!;
    const ink = cards.optionGroups.find((g) => g.name === 'Ink Style')!;
    const selection = { [qty.id]: qty.values.find((v) => v.quantity === 1000)!.id, [ink.id]: ink.values[0]!.id };
    expect(unavailableReason(product, selection, ink.id, ink.values.find((v) => v.label === 'Full Colour')!.id)).toBe('Not available with your other choices');
    expect(unavailableReason(product, selection, ink.id, ink.values[0]!.id)).toBeUndefined();
  });
});

describe('print specs', () => {
  it('turns pixels into customer-friendly sizes', () => {
    const specs = printSpecs(load('business-card-classic').print!);
    expect(specs.customer.find((r) => r.label === 'Finished size')?.value).toBe('88.9 mm × 50.8 mm');
    expect(specs.customer.find((r) => r.label === 'Bleed')?.value).toMatch(/^1\.5 mm/);
    expect(specs.designer.find((r) => r.label === 'Canvas')?.value).toBe('1050 × 600 px');
  });
});

describe('gallery', () => {
  it('adds Studio mockups and the shared polo mockup', () => {
    expect(galleryImages(load('drinkware-bottle-cello-swift')).some((i) => i.kind === 'mockup')).toBe(true);
    expect(galleryImages(load('apparel-polo-classic')).map((i) => i.src)).toContain('products/polo/front.png');
  });
});
