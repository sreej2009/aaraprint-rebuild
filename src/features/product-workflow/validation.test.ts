/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readProduct } from '@/features/studio/testing/catalogue-fixtures';
import type { ProductSummary } from '@/lib/catalogue/types';
import { emptyConfiguration, initialConfiguration, type ProductConfiguration } from './configuration';
import { productWorkflow } from './registry';
import { issuesFor, validateConfiguration } from './validation';

const catalogue = JSON.parse(fs.readFileSync(path.resolve('public/api/v1/catalogue/products.json'), 'utf8')) as ProductSummary[];

function startingConfiguration(slug: string): ProductConfiguration {
  const product = readProduct(slug);
  const workflow = productWorkflow(slug)!;
  const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0]!;
  return initialConfiguration({ workflow, catalogue: product, variant, orientation: workflow.entry.orientation.defaultValue });
}

describe('validateConfiguration', () => {
  it('accepts every product’s starting configuration (default variant, default orientation)', () => {
    for (const { slug } of catalogue) {
      const issues = validateConfiguration(readProduct(slug), productWorkflow(slug)!, startingConfiguration(slug));
      expect(issues, slug).toEqual([]);
    }
  });

  it('requires an orientation (the entry option) before designing', () => {
    const product = readProduct('umbrella-golf');
    const issues = validateConfiguration(product, productWorkflow('umbrella-golf')!, { ...startingConfiguration('umbrella-golf'), orientation: null });
    expect(issues).toEqual([{ kind: 'required', optionId: 'orientation', message: 'Choose an orientation.' }]);
  });

  it('requires every catalogue option, naming the one that is missing', () => {
    const product = readProduct('apparel-tshirt-classic-cotton');
    const size = product.optionGroups.find((g) => g.name === 'Size')!;
    const configuration = startingConfiguration('apparel-tshirt-classic-cotton');
    const { [size.id]: _dropped, ...rest } = configuration.options;
    const issues = validateConfiguration(product, productWorkflow('apparel-tshirt-classic-cotton')!, { ...configuration, options: rest });
    expect(issues).toEqual([{ kind: 'required', optionId: 'size', groupId: size.id, message: 'Choose the size.' }]);
    expect(issuesFor(issues, 'size', size.id)).toHaveLength(1);
    expect(issuesFor(issues, 'colour')).toHaveLength(0);
  });

  it('reports a combination the catalogue lacks as "no variant" instead of guessing one', () => {
    const product = readProduct('business-card-classic');
    const withoutOne = { ...product, variants: product.variants.filter((v) => v.sku !== 'BUSINESS-CARD-CLASSIC-QTY-100-INK-CLASSIC-BLACK') };
    const issues = validateConfiguration(withoutOne, productWorkflow('business-card-classic')!, startingConfiguration('business-card-classic'));
    expect(issues.map((i) => i.kind)).toEqual(['no-variant']);
  });

  it('flags a quantity outside 1–99', () => {
    const product = readProduct('business-card-classic');
    const issues = validateConfiguration(product, productWorkflow('business-card-classic')!, { ...startingConfiguration('business-card-classic'), quantity: 120 });
    expect(issues.map((i) => i.optionId)).toEqual(['order-quantity']);
  });

  it('an empty configuration needs everything', () => {
    const product = readProduct('business-card-classic');
    const issues = validateConfiguration(product, productWorkflow('business-card-classic')!, emptyConfiguration());
    expect(issues.map((i) => i.optionId)).toEqual(['orientation', 'quantity-tier', 'catalogue-other']);
  });
});
