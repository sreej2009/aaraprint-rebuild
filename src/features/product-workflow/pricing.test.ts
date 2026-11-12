import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/catalogue/types';
import { readProduct } from '@/features/studio/testing/catalogue-fixtures';
import { clampQuantity, emptyConfiguration, initialConfiguration, selectionOfVariant, type ProductConfiguration } from './configuration';
import { ORIGINAL_PRICING_BEHAVIOURS } from './families';
import { resolvePrice, studioAdjustments } from './pricing';
import { productWorkflow } from './registry';

const groupId = (product: Product, name: string) => product.optionGroups.find((g) => g.name === name)!.id;
const valueId = (product: Product, group: string, label: string) => product.optionGroups.find((g) => g.name === group)!.values.find((v) => v.label === label)!.id;

const card = readProduct('business-card-classic');
const cardFlow = productWorkflow('business-card-classic');
const cardConfig = (quantityLabel: string, ink: string, quantity = 1): ProductConfiguration => ({
  ...emptyConfiguration(),
  quantity,
  options: { [groupId(card, 'Quantity')]: valueId(card, 'Quantity', quantityLabel), [groupId(card, 'Ink Style')]: valueId(card, 'Ink Style', ink) },
});

describe('resolvePrice', () => {
  it('prices the resolved variant, quantity tier included (not base price + deltas)', () => {
    const price = resolvePrice(card, cardFlow, cardConfig('500 cards', 'Classic Black'));
    expect(price.status).toBe('priced');
    if (price.status !== 'priced') return;
    // The original's Studio showed ₹229 for this ₹629 variant (decision B2); we show the variant.
    expect(price.variantPriceCents).toBe(62900);
    expect(price.unitPriceCents).toBe(62900);
    expect(price.sku).toBe('BUSINESS-CARD-CLASSIC-QTY-500-INK-CLASSIC-BLACK');
    expect(price.piecesPerUnit).toBe(500);
  });

  it('multiplies the unit price by the quantity (sets of the tier)', () => {
    const price = resolvePrice(card, cardFlow, cardConfig('100 cards', 'Classic Black', 2));
    expect(price.status === 'priced' && [price.unitPriceCents, price.quantity, price.totalPriceCents]).toEqual([22900, 2, 45800]);
  });

  it('adds saved Studio format prices, so the price always matches what is ordered', () => {
    const envelope = readProduct('stationery-envelope-dl');
    const flow = productWorkflow('stationery-envelope-dl');
    const configuration: ProductConfiguration = {
      ...initialConfiguration({ workflow: flow, catalogue: envelope, variant: envelope.variants.find((v) => v.isDefault)! }),
      studio: { 'envelope-size': { type: 'choice', valueId: 'number-10' } },
    };
    const price = resolvePrice(envelope, flow, configuration);
    expect(price.status === 'priced' && [price.variantPriceCents, price.adjustmentsCents, price.unitPriceCents]).toEqual([34900, 4200, 39100]);
    expect(price.adjustments).toEqual([{ optionId: 'envelope-size', label: 'Size: #10 (24.1 cm × 10.5 cm)', valueId: 'number-10', cents: 4200 }]);
  });

  it('ignores Studio choices without a price and options the product does not have', () => {
    const flow = productWorkflow('stationery-envelopes-standard');
    expect(studioAdjustments(flow, { 'envelope-size': { type: 'choice', valueId: 'c5' } })).toEqual([]);
    expect(studioAdjustments(productWorkflow('gift-mug-custom-black'), { 'part-colour:body': { type: 'colour', valueId: 'red', hex: '#dc2626' } })).toEqual([]);
    expect(studioAdjustments(null, { 'envelope-size': { type: 'choice', valueId: 'c5' } })).toEqual([]);
  });

  it('says "no variant" for an incomplete or impossible selection instead of guessing', () => {
    expect(resolvePrice(card, cardFlow, emptyConfiguration()).status).toBe('no-variant');
    const partial = { ...emptyConfiguration(), options: { [groupId(card, 'Quantity')]: valueId(card, 'Quantity', '100 cards') } };
    expect(resolvePrice(card, cardFlow, partial).status).toBe('no-variant');
    const impossible = { ...emptyConfiguration(), options: { [groupId(card, 'Quantity')]: 'not-a-value', [groupId(card, 'Ink Style')]: valueId(card, 'Ink Style', 'Two-Colour') } };
    expect(resolvePrice(card, cardFlow, impossible).status).toBe('no-variant');
  });

  it('documents the original pricing behaviours we deliberately do not copy', () => {
    expect(ORIGINAL_PRICING_BEHAVIOURS.map((b) => b.decision)).toEqual(['B2', 'B1']);
  });
});

describe('product configuration', () => {
  it('starts from the product page variant’s own option values', () => {
    const variant = card.variants.find((v) => v.sku === 'BUSINESS-CARD-CLASSIC-QTY-250-INK-TWO-COLOUR')!;
    const configuration = initialConfiguration({ workflow: cardFlow, catalogue: card, variant });
    expect(configuration.options).toEqual(selectionOfVariant(card, variant));
    expect(Object.keys(configuration.options)).toHaveLength(2);
    expect(configuration).toMatchObject({ quantity: 1, orientation: null, studio: {}, sameDesignBothSides: null });
  });

  it('turns the same-design switch on by default only where the product has it', () => {
    expect(initialConfiguration({ workflow: productWorkflow('apparel-tshirt-classic-cotton') }).sameDesignBothSides).toBe(true);
    expect(initialConfiguration({ workflow: productWorkflow('sign-foam-board') }).sameDesignBothSides).toBeNull();
    expect(initialConfiguration({ workflow: productWorkflow('gift-mug-custom-black') }).sameDesignBothSides).toBeNull();
    expect(initialConfiguration({ workflow: null }).sameDesignBothSides).toBeNull();
  });

  it('keeps the quantity a whole number from 1 to 99', () => {
    expect([clampQuantity(0), clampQuantity(1), clampQuantity(42.4), clampQuantity(500), clampQuantity(Number.NaN)]).toEqual([1, 1, 42, 99, 1]);
  });
});
