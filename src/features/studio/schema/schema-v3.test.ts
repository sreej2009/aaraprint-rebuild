import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../persistence/fingerprint';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { createBlankDesign, createTextElement } from './create';
import { CURRENT_SCHEMA_VERSION, type DesignDocument } from './types';
import { migrateV2ToV3, parseDesign } from './validate';

/** Schema v3 (Phase 4 M1): the product configuration, its validation and the v2 → v3 migration. */

const NOW = new Date('2026-11-12T10:00:00.000Z');

function v3Design(slug = 'apparel-tshirt-classic-cotton'): DesignDocument {
  const product = readProduct(slug);
  const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0]!;
  const doc = createBlankDesign(readProfile(slug), { variantId: variant.id, catalogue: product, now: NOW, newId: () => 'design_1' });
  doc.surfaces[0]!.elements.push(createTextElement({ x: 12.5, y: 40, width: 300, height: 60 }, { id: 'el_1', text: 'Front' }));
  doc.surfaces[1]!.elements.push(createTextElement({ x: 20, y: 30, width: 200, height: 50 }, { id: 'el_2', text: 'Back', rotation: 15 }));
  doc.product.configuration.studio['custom-product-colour'] = { type: 'colour', valueId: null, hex: '#123abc' };
  doc.product.configuration.quantity = 3;
  doc.product.configuration.orientation = 'vertical';
  return doc;
}

/** The same design as schema v2 stored it: product = { slug, productId, variantId }. */
function asV2(doc: DesignDocument): Record<string, unknown> {
  const { familyId: _f, sku: _s, configuration: _c, ...product } = doc.product;
  return JSON.parse(JSON.stringify({ ...doc, schemaVersion: 2, product })) as Record<string, unknown>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const errorsOf = (input: unknown) => {
  const result = parseDesign(input);
  return result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`);
};

describe('schema v3', () => {
  it('is the current version', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
    expect(v3Design().schemaVersion).toBe(3);
  });

  it('accepts a valid v3 document and round-trips it unchanged through JSON', () => {
    const doc = v3Design();
    const result = parseDesign(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBeNull();
    expect(result.document).toEqual(doc);
    expect(canonicalJson(result.document)).toBe(canonicalJson(doc));
    // Parsed again: still identical (canonical).
    const again = parseDesign(JSON.stringify(result.document));
    expect(again.ok && again.document).toEqual(doc);
  });

  it('keeps the product configuration apart from the artwork', () => {
    const doc = v3Design();
    expect(Object.keys(doc.product).sort()).toEqual(['configuration', 'familyId', 'productId', 'sku', 'slug', 'variantId']);
    expect(Object.keys(doc.product.configuration).sort()).toEqual(['options', 'orientation', 'quantity', 'sameDesignBothSides', 'studio']);
    expect(JSON.stringify(doc.product)).not.toMatch(/mockup|\.png|\.webp|selected|zoom/i);
  });

  it('rejects a document whose product configuration is missing', () => {
    const doc = clone(v3Design()) as unknown as { product: Record<string, unknown> };
    delete doc.product.configuration;
    expect(errorsOf(doc)).toEqual(['product.configuration: must be an object']);
  });

  it('rejects malformed product configuration, each with a path', () => {
    const cases: [string, (d: DesignDocument & Record<string, never>) => void, string][] = [
      ['unknown family', (d) => ((d.product as { familyId: string }).familyId = 'spaceships'), 'product.familyId: must be a known product family'],
      ['SKU without variant', (d) => (d.product.variantId = null), 'product.sku: needs a variant'],
      ['bad SKU', (d) => (d.product.sku = 'has spaces'), 'product.sku: has an invalid format'],
      ['quantity 0', (d) => (d.product.configuration.quantity = 0), 'product.configuration.quantity: must be between 1 and 99'],
      ['fractional quantity', (d) => (d.product.configuration.quantity = 1.5), 'product.configuration.quantity: must be a whole number'],
      ['orientation', (d) => ((d.product.configuration as { orientation: string }).orientation = 'diagonal'), 'product.configuration.orientation: must be one of horizontal, vertical'],
      ['switch', (d) => ((d.product.configuration as { sameDesignBothSides: unknown }).sameDesignBothSides = 'yes'), 'product.configuration.sameDesignBothSides: must be true or false'],
      ['option value', (d) => (d.product.configuration.options = { group_1: 'has spaces' }), 'product.configuration.options.group_1: has an invalid format'],
      ['studio key', (d) => (d.product.configuration.studio = { 'Bad Key': { type: 'choice', valueId: 'x' } }), 'product.configuration.studio: has an invalid option id "Bad Key"'],
      ['studio type', (d) => (d.product.configuration.studio = { size: { type: 'shape' } as never }), 'product.configuration.studio.size.type: must be one of choice, colour, dimensions'],
      ['colour hex', (d) => (d.product.configuration.studio = { 'part-colour:body': { type: 'colour', valueId: null, hex: 'red' } }), 'product.configuration.studio.part-colour:body.hex: must be a colour like #1b1f27'],
      ['dimensions', (d) => (d.product.configuration.studio = { size: { type: 'dimensions', widthMm: 2, heightMm: 100, presetId: null } }), 'product.configuration.studio.size.widthMm: must be between 10 and 1000'],
      ['embedded data', (d) => (d.product.configuration.studio = { size: { type: 'choice', valueId: 'data:image/png;base64,AAAA' } }), 'product.configuration.studio.size.valueId: must not contain embedded file data'],
    ];
    for (const [name, change, expected] of cases) {
      const doc = clone(v3Design()) as DesignDocument & Record<string, never>;
      change(doc);
      expect(errorsOf(doc), name).toEqual([expected]);
    }
  });

  it('drops unknown fields in the product block (canonical output)', () => {
    const doc = clone(v3Design()) as unknown as { product: { configuration: Record<string, unknown> } & Record<string, unknown> };
    doc.product.mockupUrl = 'products/x.png';
    doc.product.configuration.zoom = 2;
    const result = parseDesign(doc);
    expect(result.ok && Object.keys(result.document.product)).not.toContain('mockupUrl');
    expect(result.ok && Object.keys(result.document.product.configuration)).not.toContain('zoom');
  });
});

describe('v2 → v3 migration', () => {
  it('upgrades a v2 design: artwork exactly as saved, variant kept, nothing invented', () => {
    const v3 = v3Design();
    const v2 = asV2(v3);
    const result = parseDesign(v2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(2);
    const { document } = result;
    expect(document.schemaVersion).toBe(3);
    expect(document.surfaces).toEqual(v3.surfaces);
    expect(document.assets).toEqual(v3.assets);
    expect([document.id, document.name, document.meta]).toEqual([v3.id, v3.name, v3.meta]);
    expect(document.product).toEqual({
      slug: v3.product.slug,
      productId: v3.product.productId,
      familyId: 'apparel',
      variantId: v3.product.variantId,
      sku: null,
      configuration: { options: {}, quantity: 1, orientation: null, studio: {}, sameDesignBothSides: null },
    });
  });

  it('keeps an unknown product’s family unknown and a missing variant missing', () => {
    const v2 = asV2(v3Design());
    (v2.product as Record<string, unknown>).slug = 'retired-product';
    (v2.product as Record<string, unknown>).variantId = null;
    const result = parseDesign(v2);
    expect(result.ok && result.document.product).toMatchObject({ slug: 'retired-product', familyId: null, variantId: null, sku: null });
  });

  it('refuses a v2 design with no product information instead of making one up', () => {
    const v2 = asV2(v3Design());
    delete v2.product;
    expect(errorsOf(v2)).toEqual(['product: must be an object']);
    expect(migrateV2ToV3({ schemaVersion: 2 })).toEqual({ schemaVersion: 2 });
  });

  it('still refuses damaged v2 artwork after migrating', () => {
    const v2 = asV2(v3Design()) as { surfaces: { elements: { x: unknown }[] }[] };
    v2.surfaces[0]!.elements[0]!.x = 'left';
    expect(errorsOf(v2)).toEqual(['surfaces[0].elements[0].x: must be a number']);
  });
});
