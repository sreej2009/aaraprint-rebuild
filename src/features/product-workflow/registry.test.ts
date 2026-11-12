/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProductSummary } from '@/lib/catalogue/types';
import { readProduct } from '@/features/studio/testing/catalogue-fixtures';
import { PRODUCT_FAMILIES } from './families';
import { applicableOptions, bindCatalogueOptions, catalogueGroupForRole, familyIdForSlug, listFamilies, productWorkflow, registeredSlugs } from './registry';
import { PRODUCT_FAMILY_IDS, type ProductFamilyId } from './types';

const catalogue = JSON.parse(fs.readFileSync(path.resolve('public/api/v1/catalogue/products.json'), 'utf8')) as ProductSummary[];
const survey = JSON.parse(fs.readFileSync(path.resolve('scripts/studio/data/original-studio-survey.json'), 'utf8')) as {
  products: Record<string, { designIt: boolean; workspace?: string; tool?: string; surfaces?: string[]; preview3d?: boolean; sameDesignSwitch?: boolean; entryQuantityTiers?: number }>;
};

const customisable = catalogue.filter((p) => p.isCustomizable);

describe('product-family registry: coverage', () => {
  it('assigns every catalogue product (by slug, the catalogue key) to exactly one family', () => {
    expect(registeredSlugs().sort()).toEqual(catalogue.map((p) => p.slug).sort());
    for (const product of catalogue) {
      const workflow = productWorkflow(product.slug);
      expect(workflow, product.slug).not.toBeNull();
      expect(workflow!.slug).toBe(product.slug);
      expect(familyIdForSlug(product.slug)).toBe(workflow!.family.id);
    }
  });

  it('has a definition for every family id, and every family has products', () => {
    expect(Object.keys(PRODUCT_FAMILIES).sort()).toEqual([...PRODUCT_FAMILY_IDS].sort());
    const members = new Map<ProductFamilyId, number>();
    for (const slug of registeredSlugs()) members.set(familyIdForSlug(slug)!, (members.get(familyIdForSlug(slug)!) ?? 0) + 1);
    for (const family of listFamilies()) {
      expect(PRODUCT_FAMILIES[family.id].id).toBe(family.id);
      expect(members.get(family.id) ?? 0, family.id).toBeGreaterThan(0);
    }
  });

  it('covers every family the brief names', () => {
    const required: ProductFamilyId[] = ['visiting-card', 'stationery', 'mug', 'drinkware', 'pen', 'umbrella', 'rainwear', 'apparel', 'polo', 'bag', 'cap', 'sign', 'poster', 'label', 'packaging', 'gift', 'stamp', 'mouse-pad', 'envelope'];
    for (const id of required) expect(PRODUCT_FAMILY_IDS).toContain(id);
  });

  it('never assigns a product it does not know', () => {
    expect(familyIdForSlug('not-a-real-product')).toBeNull();
    expect(productWorkflow('not-a-real-product')).toBeNull();
    expect(familyIdForSlug('')).toBeNull();
  });

  it('marks the one non-customisable product as such', () => {
    const notCustomisable = catalogue.filter((p) => !p.isCustomizable).map((p) => p.slug);
    expect(notCustomisable).toEqual(['card-accessory-metal-holder']);
    expect(productWorkflow('card-accessory-metal-holder')!.customizable).toBe(false);
    expect(customisable.every((p) => productWorkflow(p.slug)!.customizable)).toBe(true);
  });
});

describe('product-family registry: agrees with the live original (audit §7)', () => {
  const workspaceOf = (observed: string | undefined) => (observed === 'perspective-seal' ? 'perspective' : observed);

  it('opens every product on the workspace and tool the original did', () => {
    for (const product of customisable) {
      const observed = survey.products[product.slug]!;
      const workflow = productWorkflow(product.slug)!;
      expect(workflow.initialStudio.workspace, product.slug).toBe(workspaceOf(observed.workspace));
      expect(workflow.initialStudio.tool, product.slug).toBe(observed.tool);
    }
  });

  it('opens 455 of 532 customisable products on Product options', () => {
    const tools = customisable.map((p) => productWorkflow(p.slug)!.initialStudio.tool);
    expect(tools.length).toBe(532);
    expect(tools.filter((t) => t === 'product-options').length).toBe(455);
    expect(tools.filter((t) => t === 'text').length).toBe(73);
    expect(tools.filter((t) => t === 'uploads').length).toBe(4);
  });

  it('has the same-design switch exactly where the original had it, on by default', () => {
    const withSwitch = customisable.filter((p) => productWorkflow(p.slug)!.sameDesignBothSides.available);
    expect(withSwitch.length).toBe(187);
    for (const product of withSwitch) expect(productWorkflow(product.slug)!.sameDesignBothSides.defaultOn).toBe(true);
    expect(new Set(withSwitch.map((p) => familyIdForSlug(p.slug)))).toEqual(new Set(['sign', 'poster', 'marketing-print', 'label', 'packaging', 'apparel', 'cap', 'bag']));
  });

  it('records 3D preview and quantity tiers per product as observed', () => {
    for (const product of customisable) {
      const observed = survey.products[product.slug]!;
      const workflow = productWorkflow(product.slug)!;
      expect(workflow.preview3d, product.slug).toBe(observed.preview3d);
      expect(workflow.entry.quantityTiers, product.slug).toBe(observed.entryQuantityTiers);
    }
  });

  it('describes printable surfaces: covers, flaps, pockets and single-surface products', () => {
    expect(productWorkflow('stationery-envelope-dl')!.surfaces.map((s) => s.id)).toEqual(['front', 'back', 'flap']);
    expect(productWorkflow('stationery-notebook-a4')!.surfaces.map((s) => s.id)).toEqual(['cover-front', 'cover-back', 'inside-page']);
    expect(productWorkflow('stationery-notebook-hardcover')!.surfaces.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `outside-cover-${n}`));
    expect(productWorkflow('stationery-presentation-folder')!.surfaces.map((s) => s.id)).toEqual(['cover-front', 'cover-back', 'pocket-inside']);
    expect(productWorkflow('announcement-engagement')!.surfaces.map((s) => s.id)).toEqual(['front', 'back', 'inside']);
    expect(productWorkflow('stationery-letterhead')!.surfaces.map((s) => s.id)).toEqual(['front']);
    expect(productWorkflow('sign-foam-board')!.surfaces.map((s) => s.id)).toEqual(['front']);
    expect(productWorkflow('umbrella-golf')!.surfaces).toEqual([
      { id: 'front', label: 'Canopy panel' },
      { id: 'back', label: 'Inside panel' },
    ]);
    // Stamps show Front View / Back View photo tabs; their printable surfaces are front and back.
    expect(productWorkflow('stamp-date')!.surfaces.map((s) => s.id)).toEqual(['front', 'back']);
  });

  it('keeps curved text to stamps', () => {
    for (const family of listFamilies()) expect(family.capabilities.curvedText, family.id).toBe(family.id === 'stamp');
  });
});

describe('product-family registry: option definitions', () => {
  it('gives every product orientation, quantity tier and order quantity, with unique option ids', () => {
    for (const product of catalogue) {
      const options = productWorkflow(product.slug)!.options;
      const ids = options.map((o) => o.id);
      expect(new Set(ids).size, `${product.slug}: ${ids.join(', ')}`).toBe(ids.length);
      expect(ids).toEqual(expect.arrayContaining(['orientation', 'quantity-tier', 'order-quantity']));
    }
  });

  it('restricts product-specific options to real members of the family', () => {
    for (const family of listFamilies()) {
      for (const option of family.options) {
        for (const slug of option.products ?? []) expect(familyIdForSlug(slug), `${family.id}/${option.id}: ${slug}`).toBe(family.id);
      }
    }
  });

  it('lists the audited envelope sizes and prices only for the DL envelope', () => {
    const size = productWorkflow('stationery-envelope-dl')!.options.find((o) => o.id === 'envelope-size');
    expect(size?.source).toBe('studio');
    expect(size?.source === 'studio' && size.values.status === 'known' && size.values.values.map((v) => [v.label, v.priceDeltaCents])).toEqual([
      ['DL (22 cm × 11 cm)', 0],
      ['#10 (24.1 cm × 10.5 cm)', 4200],
      ['C5 (22.9 cm × 16.2 cm)', 6300],
      ['19 cm × 12 cm', 0],
      ['14.6 cm × 11 cm', 0],
    ]);
    expect(productWorkflow('stationery-envelopes-standard')!.options.some((o) => o.id === 'envelope-size')).toBe(false);
  });

  it('marks values the audit could not establish as unknown instead of inventing them', () => {
    const format = productWorkflow('invite-party-invitations')!.options.find((o) => o.id === 'format-size');
    expect(format?.source === 'studio' && format.values.status).toBe('unknown');
    const drinkColours = productWorkflow('drinkware-bottle-aluminium')!.options.find((o) => o.id === 'part-colour');
    expect(drinkColours?.source === 'studio' && drinkColours.values.status).toBe('unknown');
  });

  it('binds catalogue options to each product’s own option groups, every group exactly once', () => {
    for (const summary of customisable) {
      const product = readProduct(summary.slug);
      const bound = bindCatalogueOptions(productWorkflow(summary.slug)!, product);
      expect(bound.map((b) => b.group.id).sort(), summary.slug).toEqual(product.optionGroups.map((g) => g.id).sort());
    }
  });

  it('finds the product colour, size and lid where the original Studio offered them', () => {
    const umbrella = readProduct('umbrella-golf');
    expect(catalogueGroupForRole(productWorkflow('umbrella-golf')!, umbrella, 'product-colour')?.name).toBe('Canopy Colour');
    const shirt = readProduct('apparel-tshirt-classic-cotton');
    const shirtFlow = productWorkflow('apparel-tshirt-classic-cotton')!;
    expect(catalogueGroupForRole(shirtFlow, shirt, 'size')?.name).toBe('Size');
    expect(catalogueGroupForRole(shirtFlow, shirt, 'print-placement')?.name).toBe('Print Placement');
    const bottle = readProduct('drinkware-bottle-aluminium');
    expect(catalogueGroupForRole(productWorkflow('drinkware-bottle-aluminium')!, bottle, 'lid-type')?.name).toBe('Lid Type');
    const quantity = catalogueGroupForRole(productWorkflow('business-card-classic')!, readProduct('business-card-classic'), 'quantity-tier');
    expect(quantity?.name).toBe('Quantity');
  });

  it('only lets sign/poster-group products change every catalogue option in the Studio', () => {
    const shirt = productWorkflow('apparel-tshirt-classic-cotton')!.options.find((o) => o.id === 'catalogue-other');
    const card = productWorkflow('business-card-classic')!.options.find((o) => o.id === 'catalogue-other');
    expect(shirt?.behaviour.editableInStudio).toBe(true);
    expect(card?.behaviour.editableInStudio).toBe(false);
  });

  it('offers the substrate colour without a catalogue colour, the custom colour with one (live: jute tote vs backpack)', () => {
    const ids = (slug: string) => applicableOptions(productWorkflow(slug)!, readProduct(slug)).map((o) => o.id);
    expect(ids('bag-jute-tote')).toContain('substrate-colour');
    expect(ids('bag-jute-tote')).not.toContain('custom-product-colour');
    expect(ids('bag-backpack-american-tourister')).toContain('custom-product-colour');
    expect(ids('bag-backpack-american-tourister')).not.toContain('substrate-colour');
    expect(ids('apparel-tshirt-classic-cotton')).toContain('custom-product-colour');
    expect(ids('sign-poster-standard')).toContain('substrate-colour');
  });
});
