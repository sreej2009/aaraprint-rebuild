import { describe, expect, it } from 'vitest';
import { productWorkflow } from '@/features/product-workflow/registry';
import type { Product } from '@/lib/catalogue/types';
import { createBlankDesign, createTextElement } from '../schema/create';
import type { DesignDocument } from '../schema/types';
import { createStudioStore } from '../store';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import {
  DesignCommandError,
  resolveProductVariant,
  setOrderQuantity,
  setOrientation,
  setProductColour,
  setProductOption,
  setProductOptions,
  setEntryOptions,
  setProductSize,
  setSameDesignBothSides,
  setStudioChoice,
  setVariant,
  syncProductVariant,
} from './index';

const group = (product: Product, name: string) => product.optionGroups.find((g) => g.name === name)!;
const value = (product: Product, groupName: string, label: string) => group(product, groupName).values.find((v) => v.label === label)!.id;

/** A design for a real product, from its product-page default variant, with one text element. */
function designFor(slug: string): { product: Product; doc: DesignDocument } {
  const product = readProduct(slug);
  const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0]!;
  const doc = createBlankDesign(readProfile(slug), { variantId: variant.id, catalogue: product, newId: () => 'design_1' });
  doc.surfaces[0]!.elements.push(createTextElement({ x: 10, y: 10, width: 200, height: 40 }, { id: 'el_1', text: 'Artwork' }));
  return { product, doc };
}

describe('product configuration commands', () => {
  it('records the product page variant, its options and SKU in a new design', () => {
    const { product, doc } = designFor('apparel-tshirt-classic-cotton');
    const variant = product.variants.find((v) => v.id === doc.product.variantId)!;
    expect(doc.product).toMatchObject({ familyId: 'apparel', sku: variant.sku });
    expect(Object.values(doc.product.configuration.options).sort()).toEqual([...variant.optionValueIds].sort());
    expect(doc.product.configuration.sameDesignBothSides).toBe(true);
  });

  it('choosing an option re-resolves the variant and SKU in the same step, leaving the artwork alone', () => {
    const { product, doc } = designFor('apparel-tshirt-classic-cotton');
    const xl = setProductOption(doc, product, group(product, 'Size').id, value(product, 'Size', 'XL'));
    const variant = product.variants.find((v) => v.id === xl.product.variantId)!;
    expect(variant.optionValueIds).toContain(value(product, 'Size', 'XL'));
    expect(xl.product.sku).toBe(variant.sku);
    expect(xl.surfaces).toBe(doc.surfaces);
    expect(xl.assets).toBe(doc.assets);
    expect(doc.product.configuration.options[group(product, 'Size').id]).toBe(value(product, 'Size', 'S')); // input untouched
  });

  it('sets several options as one change and returns the same document when nothing changes', () => {
    const { product, doc } = designFor('apparel-tshirt-classic-cotton');
    const both = setProductOptions(doc, product, {
      [group(product, 'Colour').id]: value(product, 'Colour', 'Black'),
      [group(product, 'Print Placement').id]: value(product, 'Print Placement', 'Front & Back'),
    });
    expect(product.variants.find((v) => v.id === both.product.variantId)!.sku).toMatch(/BLACK/);
    expect(setProductOptions(both, product, { [group(product, 'Colour').id]: value(product, 'Colour', 'Black') })).toBe(both);
  });

  it('refuses unknown groups, values and other products’ catalogues', () => {
    const { product, doc } = designFor('apparel-tshirt-classic-cotton');
    expect(() => setProductOption(doc, product, 'no-such-group', 'x')).toThrow(DesignCommandError);
    expect(() => setProductOption(doc, product, group(product, 'Size').id, 'no-such-value')).toThrow(DesignCommandError);
    expect(() => setProductOption(doc, readProduct('umbrella-golf'), 'g', 'v')).toThrow(/not "umbrella-golf"/);
  });

  it('never guesses a variant: a combination the catalogue lacks resolves to none', () => {
    const { product, doc } = designFor('apparel-tshirt-classic-cotton');
    const broken: DesignDocument = { ...doc, product: { ...doc.product, configuration: { ...doc.product.configuration, options: { [group(product, 'Size').id]: value(product, 'Size', 'XL') } } } };
    const resolved = resolveProductVariant(broken, product);
    expect(resolved.product.variantId).toBeNull();
    expect(resolved.product.sku).toBeNull();
  });

  it('sets the product colour and size through the family’s roles', () => {
    const umbrella = designFor('umbrella-golf');
    const red = setProductColour(umbrella.doc, umbrella.product, productWorkflow('umbrella-golf')!, value(umbrella.product, 'Canopy Colour', 'Red'));
    expect(umbrella.product.variants.find((v) => v.id === red.product.variantId)!.sku).toMatch(/RED/);

    const shirt = designFor('apparel-tshirt-classic-cotton');
    const xxl = setProductSize(shirt.doc, shirt.product, productWorkflow('apparel-tshirt-classic-cotton')!, { valueId: value(shirt.product, 'Size', 'XXL') });
    expect(shirt.product.variants.find((v) => v.id === xxl.product.variantId)!.sku).toMatch(/XXL/);

    const mug = designFor('gift-mug-custom-black');
    const bigger = setProductSize(mug.doc, mug.product, productWorkflow('gift-mug-custom-black')!, { widthMm: 254, heightMm: 89, presetId: '25.4x8.9' });
    expect(bigger.product.configuration.studio.size).toEqual({ type: 'dimensions', widthMm: 254, heightMm: 89, presetId: '25.4x8.9' });
    expect(bigger.product.variantId).toBe(mug.doc.product.variantId);

    expect(() => setProductColour(mug.doc, mug.product, productWorkflow('gift-mug-custom-black')!, 'x')).toThrow(/no product colour/);
    expect(() => setProductSize(umbrella.doc, umbrella.product, productWorkflow('umbrella-golf')!, { widthMm: 100, heightMm: 100 })).toThrow(/no Studio size/);
  });

  it('records quantity, orientation, the same-design switch and Studio choices', () => {
    const { doc } = designFor('stationery-envelope-dl');
    expect(setOrderQuantity(doc, 3).product.configuration.quantity).toBe(3);
    expect(setOrderQuantity(doc, 1)).toBe(doc);
    expect(() => setOrderQuantity(doc, 0)).toThrow(DesignCommandError);
    expect(() => setOrderQuantity(doc, 100)).toThrow(DesignCommandError);
    expect(() => setOrderQuantity(doc, 2.5)).toThrow(DesignCommandError);
    expect(setOrientation(doc, 'vertical').product.configuration.orientation).toBe('vertical');
    expect(setSameDesignBothSides(doc, true).product.configuration.sameDesignBothSides).toBe(true);

    const sized = setStudioChoice(doc, 'envelope-size', { type: 'choice', valueId: 'number-10' });
    expect(sized.product.configuration.studio).toEqual({ 'envelope-size': { type: 'choice', valueId: 'number-10' } });
    expect(setStudioChoice(sized, 'envelope-size', { type: 'choice', valueId: 'number-10' })).toBe(sized);
    expect(setStudioChoice(sized, 'envelope-size', null).product.configuration.studio).toEqual({});
    const coloured = setStudioChoice(doc, 'part-colour:handle', { type: 'colour', valueId: null, hex: '#123456' });
    expect(coloured.product.configuration.studio['part-colour:handle']).toEqual({ type: 'colour', valueId: null, hex: '#123456' });
    expect(() => setStudioChoice(doc, 'Bad Key', { type: 'choice', valueId: 'x' })).toThrow(DesignCommandError);
    expect(() => setStudioChoice(doc, 'part-colour:body', { type: 'colour', valueId: null, hex: 'red' })).toThrow(DesignCommandError);
    expect(() => setStudioChoice(doc, 'size', { type: 'dimensions', widthMm: 5, heightMm: 50, presetId: null })).toThrow(DesignCommandError);
  });

  it('follows a variant chosen on the product page: options, SKU and family', () => {
    const { product, doc } = designFor('business-card-classic');
    const other = product.variants.find((v) => v.sku === 'BUSINESS-CARD-CLASSIC-QTY-500-INK-FULL-COLOUR')!;
    const legacy: DesignDocument = { ...doc, product: { ...doc.product, familyId: null, sku: null, configuration: { ...doc.product.configuration, options: {} } } };
    const synced = syncProductVariant(legacy, product, other.id);
    expect(synced.product).toMatchObject({ familyId: 'visiting-card', variantId: other.id, sku: other.sku });
    expect(Object.values(synced.product.configuration.options).sort()).toEqual([...other.optionValueIds].sort());
    expect(syncProductVariant(synced, product, other.id)).toBe(synced);
    expect(syncProductVariant(synced, product, 'unknown-variant')).toBe(synced);
  });

  it('confirms the entry choices (orientation + quantity tier) as one change, resolving the variant', () => {
    const { product, doc } = designFor('business-card-classic');
    const tier = group(product, 'Quantity');
    const entered = setEntryOptions(doc, product, { orientation: 'vertical', options: { [tier.id]: value(product, 'Quantity', '500 cards') } });
    expect(entered.product.configuration.orientation).toBe('vertical');
    expect(entered.product.sku).toBe('BUSINESS-CARD-CLASSIC-QTY-500-INK-CLASSIC-BLACK');
    expect(entered.surfaces).toBe(doc.surfaces);
    expect(setEntryOptions(entered, product, { orientation: 'vertical', options: { [tier.id]: value(product, 'Quantity', '500 cards') } })).toBe(entered);
    expect(setEntryOptions(doc, product, { orientation: null, options: {} })).toBe(doc);
  });

  it('the low-level setVariant drops a SKU that belonged to another variant', () => {
    const { doc } = designFor('business-card-classic');
    expect(setVariant(doc, 'variant_other').product).toMatchObject({ variantId: 'variant_other', sku: null });
  });
});

describe('product configuration in the store', () => {
  function storeFor(slug: string) {
    const { product, doc } = designFor(slug);
    return { product, studio: createStudioStore({ document: doc, catalogue: product, clock: () => 0, measureText: null }) };
  }

  it('each change is one undo step; undo and redo restore the variant, SKU and options', () => {
    const { product, studio } = storeFor('apparel-tshirt-classic-cotton');
    const { actions } = studio.getState();
    const start = studio.getState().document.product;
    expect(actions.setProductSize({ valueId: value(product, 'Size', 'XL') })).toBe(true);
    const xl = studio.getState().document.product;
    expect(actions.setProductColour(value(product, 'Colour', 'Navy'))).toBe(true);
    const navy = studio.getState().document.product;
    expect(studio.getState().history.past.map((e) => e.label)).toEqual(['Change size', 'Change product colour']);

    actions.undo();
    expect(studio.getState().document.product).toEqual(xl);
    actions.undo();
    expect(studio.getState().document.product).toEqual(start);
    actions.redo();
    actions.redo();
    expect(studio.getState().document.product).toEqual(navy);
    expect(studio.getState().document.surfaces[0]!.elements.map((e) => e.id)).toEqual(['el_1']);
  });

  it('quantity, orientation, Studio choices and the switch are undoable too', () => {
    const { studio } = storeFor('stationery-envelope-dl');
    const { actions } = studio.getState();
    actions.setOrderQuantity(4);
    actions.setOrientation('vertical');
    actions.setStudioChoice('envelope-size', { type: 'choice', valueId: 'c5' });
    actions.setSameDesignBothSides(false);
    expect(studio.getState().document.product.configuration).toMatchObject({ quantity: 4, orientation: 'vertical', studio: { 'envelope-size': { valueId: 'c5' } }, sameDesignBothSides: false });
    actions.undo();
    actions.undo();
    actions.undo();
    actions.undo();
    expect(studio.getState().document.product.configuration).toMatchObject({ quantity: 1, orientation: null, studio: {}, sameDesignBothSides: null });
  });

  it('changes count as edits for autosave; no-ops and missing catalogues record nothing', () => {
    const { product, studio } = storeFor('umbrella-golf');
    const before = studio.getState().changeCount;
    expect(studio.getState().actions.setProductColour(value(product, 'Canopy Colour', 'Navy'))).toBe(true);
    expect(studio.getState().changeCount).toBe(before + 1);
    expect(studio.getState().actions.setProductColour(value(product, 'Canopy Colour', 'Navy'))).toBe(false);

    const bare = createStudioStore({ document: studio.getState().document, measureText: null });
    expect(bare.getState().actions.setProductOption('g', 'v')).toBe(false);
    expect(bare.getState().actions.setProductColour('v')).toBe(false);
    expect(bare.getState().history.past).toHaveLength(0);
  });

  it('confirming the entry step is a single undo step', () => {
    const { product, studio } = storeFor('business-card-classic');
    const before = studio.getState().document.product;
    studio.getState().actions.applyEntryOptions({ orientation: 'horizontal', options: { [group(product, 'Quantity').id]: value(product, 'Quantity', '250 cards') } });
    expect(studio.getState().history.past.map((e) => e.label)).toEqual(['Confirm design options']);
    studio.getState().actions.undo();
    expect(studio.getState().document.product).toEqual(before);
  });

  it('following the product page variant is a correction, not an undo step', () => {
    const { product, studio } = storeFor('business-card-classic');
    const other = product.variants.find((v) => v.sku === 'BUSINESS-CARD-CLASSIC-QTY-250-INK-TWO-COLOUR')!;
    studio.getState().actions.syncProductVariant(other.id);
    expect(studio.getState().document.product.variantId).toBe(other.id);
    expect(studio.getState().history.past).toHaveLength(0);
  });
});
