/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readProduct } from '@/features/studio/testing/catalogue-fixtures';
import type { ProductSummary } from '@/lib/catalogue/types';
import { emptyConfiguration, initialConfiguration, type ProductConfiguration } from './configuration';
import { applyEntryDraft, draftIssues, entryDraftFrom, entryIssues, entryRequirements, needsEntry, nonEntryIssues } from './entry';
import { familyIdForSlug, productWorkflow } from './registry';
import { PRODUCT_FAMILY_IDS } from './types';

const catalogue = JSON.parse(fs.readFileSync(path.resolve('public/api/v1/catalogue/products.json'), 'utf8')) as ProductSummary[];
const survey = JSON.parse(fs.readFileSync(path.resolve('scripts/studio/data/original-studio-survey.json'), 'utf8')) as {
  products: Record<string, { designIt: boolean; entryQuantityTiers?: number }>;
};

/** A new design on the product page: the default variant, no orientation chosen yet. */
function fresh(slug: string): ProductConfiguration {
  const product = readProduct(slug);
  const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0]!;
  return initialConfiguration({ workflow: productWorkflow(slug), catalogue: product, variant });
}

describe('entry requirements match the original’s "Design it" dialog (audit §3.2, live)', () => {
  it('every customisable product asks orientation; quantity exactly where the original’s dialog had tiers', () => {
    const families = new Set<string>();
    const designable = catalogue.filter(({ slug }) => survey.products[slug]!.designIt);
    expect(designable).toHaveLength(532);
    for (const { slug } of designable) {
      const product = readProduct(slug);
      const requirements = entryRequirements(productWorkflow(slug)!, product);
      const observed = survey.products[slug]!;
      families.add(familyIdForSlug(slug)!);
      expect(requirements.map((r) => r.option.id)[0], slug).toBe('orientation');
      const quantity = requirements.find((r) => r.kind === 'catalogue');
      expect(quantity ? quantity.group.values.length : 0, slug).toBe(observed.entryQuantityTiers);
      // Nothing else is asked at entry: no colour, size or material is made mandatory here.
      expect(requirements.length, slug).toBe(quantity ? 2 : 1);
    }
    expect([...families].sort()).toEqual([...PRODUCT_FAMILY_IDS].sort());
  });

  it('asks nothing for the product ordered without a design', () => {
    expect(entryRequirements(productWorkflow('card-accessory-metal-holder')!, readProduct('card-accessory-metal-holder'))).toEqual([]);
  });
});

describe('when the entry step is needed', () => {
  it('a new design needs it (no orientation yet); a configuration with one does not', () => {
    const product = readProduct('business-card-classic');
    const workflow = productWorkflow('business-card-classic')!;
    expect(needsEntry(product, workflow, fresh('business-card-classic'))).toBe(true);
    expect(entryIssues(product, workflow, fresh('business-card-classic')).map((i) => i.optionId)).toEqual(['orientation']);
    expect(needsEntry(product, workflow, { ...fresh('business-card-classic'), orientation: 'vertical' })).toBe(false);
  });

  it('an invalid quantity tier (e.g. a retired one in an old design) is asked again', () => {
    const product = readProduct('business-card-classic');
    const workflow = productWorkflow('business-card-classic')!;
    const tier = product.optionGroups.find((g) => g.name === 'Quantity')!;
    const old = { ...fresh('business-card-classic'), orientation: 'horizontal' as const, options: { ...fresh('business-card-classic').options, [tier.id]: 'retired-tier' } };
    expect(entryIssues(product, workflow, old).map((i) => i.optionId)).toEqual(['quantity-tier']);
    expect(nonEntryIssues(product, workflow, old)).toEqual([]);
  });

  it('other missing options are not entry questions: they stay on the product page', () => {
    const product = readProduct('apparel-tshirt-classic-cotton');
    const workflow = productWorkflow('apparel-tshirt-classic-cotton')!;
    const size = product.optionGroups.find((g) => g.name === 'Size')!;
    const { [size.id]: _gone, ...rest } = fresh('apparel-tshirt-classic-cotton').options;
    const config = { ...fresh('apparel-tshirt-classic-cotton'), orientation: 'horizontal' as const, options: rest };
    expect(needsEntry(product, workflow, config)).toBe(false);
    expect(nonEntryIssues(product, workflow, config).map((i) => i.optionId)).toEqual(['size']);
  });

  it('products ordered without a design have no entry step', () => {
    const product = readProduct('card-accessory-metal-holder');
    expect(needsEntry(product, productWorkflow('card-accessory-metal-holder')!, emptyConfiguration())).toBe(false);
  });
});

describe('entry drafts', () => {
  it('start from the design’s valid choices and leave out invalid ones', () => {
    const product = readProduct('business-card-classic');
    const requirements = entryRequirements(productWorkflow('business-card-classic')!, product);
    const tier = product.optionGroups.find((g) => g.name === 'Quantity')!;
    expect(entryDraftFrom({ ...fresh('business-card-classic'), orientation: 'vertical' }, requirements)).toEqual({ orientation: 'vertical', options: { [tier.id]: fresh('business-card-classic').options[tier.id] } });
    expect(entryDraftFrom({ ...fresh('business-card-classic'), options: { [tier.id]: 'retired' } }, requirements)).toEqual({ orientation: null, options: {} });
  });

  it('are validated as they would be applied: missing orientation, then valid', () => {
    const product = readProduct('umbrella-golf');
    const workflow = productWorkflow('umbrella-golf')!;
    const config = fresh('umbrella-golf');
    expect(draftIssues(product, workflow, config, { orientation: null, options: {} }).map((i) => i.message)).toEqual(['Choose an orientation.']);
    expect(draftIssues(product, workflow, config, { orientation: 'horizontal', options: {} })).toEqual([]);
    expect(applyEntryDraft(config, { orientation: 'vertical', options: {} })).toEqual({ ...config, orientation: 'vertical' });
  });

  it('a draft naming a combination with no variant cannot be confirmed', () => {
    const product = readProduct('business-card-classic');
    const tier = product.optionGroups.find((g) => g.name === 'Quantity')!;
    const thousand = tier.values.find((v) => v.quantity === 1000)!;
    const without = { ...product, variants: product.variants.filter((v) => !(v.optionValueIds.includes(thousand.id) && v.sku.endsWith('CLASSIC-BLACK'))) };
    const issues = draftIssues(without, productWorkflow('business-card-classic')!, fresh('business-card-classic'), { orientation: 'horizontal', options: { [tier.id]: thousand.id } });
    expect(issues.map((i) => i.kind)).toEqual(['no-variant']);
  });
});
