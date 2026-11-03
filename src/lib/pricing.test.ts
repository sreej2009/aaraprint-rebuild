import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/catalogue/types';
import { defaultSelection, quantityTiers, resolveVariant } from './pricing';

const product = JSON.parse(fs.readFileSync(path.resolve('public/api/v1/catalogue/products/business-card-classic.json'), 'utf8')) as Product;
const group = (name: string) => product.optionGroups.find((g) => g.name === name)!;
const value = (groupName: string, label: string) => group(groupName).values.find((v) => v.label === label)!.id;

describe('pricing (Classic Visiting Cards, checked against the live site)', () => {
  it('starts from the default variant: 100 cards, classic black, ₹229', () => {
    const selection = defaultSelection(product);
    expect(resolveVariant(product, selection)?.priceCents).toBe(22900);
  });

  it('resolves a variant from one value per group', () => {
    const selection = { [group('Quantity').id]: value('Quantity', '250 cards'), [group('Ink Style').id]: value('Ink Style', 'Two-Colour') };
    const variant = resolveVariant(product, selection);
    expect(variant?.sku).toBe('BUSINESS-CARD-CLASSIC-QTY-250-INK-TWO-COLOUR');
    expect(variant?.priceCents).toBe(38700);
  });

  it('returns undefined for an incomplete selection', () => {
    expect(resolveVariant(product, { [group('Quantity').id]: value('Quantity', '100 cards') })).toBeUndefined();
  });

  it('prices every quantity tier with per-unit savings', () => {
    const tiers = quantityTiers(product, defaultSelection(product));
    expect(tiers.map((t) => [t.quantity, t.totalCents, t.savingsPercent])).toEqual([
      [100, 22900, 0],
      [250, 37900, 33],
      [500, 62900, 45],
      [1000, 97900, 57],
    ]);
  });

  it('reprices tiers when another option changes', () => {
    const selection = { ...defaultSelection(product), [group('Ink Style').id]: value('Ink Style', 'Full Colour') };
    expect(quantityTiers(product, selection).map((t) => t.totalCents)).toEqual([24700, 39700, 64700, 99700]);
  });
});
