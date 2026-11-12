import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/catalogue/types';
import { createBlankDesign, createTextElement } from '../schema/create';
import type { DesignDocument } from '../schema/types';
import { createStudioStore, type StudioStore } from '../store';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { sequentialIds } from '../testing/fixtures';
import { designFingerprint, toStoredDocument } from './fingerprint';
import type { DesignRecord } from './records';
import { createMemoryRepository, type MemoryRepository } from './repository';
import { openSavedDesign } from './restore';
import { createSaveController, type SaveController } from './save-controller';

/**
 * Product choices (schema v3) are part of the saved design: autosave writes them, versions keep
 * them, restore brings them back — and designs saved as schema v2 still open.
 */

const SLUG = 'apparel-tshirt-classic-cotton';
let now = 1_700_000_000_000;
let repo: MemoryRepository;
let studio: StudioStore;
let controller: SaveController;
let product: Product;

const value = (groupName: string, label: string) => product.optionGroups.find((g) => g.name === groupName)!.values.find((v) => v.label === label)!.id;
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};
async function advance(ms: number) {
  now += ms;
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
}

function blank(): DesignDocument {
  const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0]!;
  const doc = createBlankDesign(readProfile(SLUG), { variantId: variant.id, catalogue: product, newId: () => 'design_1', now: new Date(now) });
  doc.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 300, height: 60 }, { id: 'el_1', text: 'Team' }));
  return doc;
}

/** Like studio-app: create the store, follow the variant (restored designs), then start saving. */
function setup(document: DesignDocument = blank(), restored: { record: DesignRecord; variantId: string | null } | null = null) {
  studio = createStudioStore({ document, catalogue: product, clock: () => now, measureText: null });
  if (restored) studio.getState().actions.syncProductVariant(restored.variantId);
  controller = createSaveController({ studio, repository: repo, productSlug: SLUG, productId: product.id, clock: () => now, newId: sequentialIds(), record: restored?.record ?? null });
  controller.start();
}

const storedProduct = () => (repo.designs.get('design_1')!.document as DesignDocument).product;

beforeEach(() => {
  vi.useFakeTimers();
  repo = createMemoryRepository();
  product = readProduct(SLUG);
});

afterEach(() => {
  controller?.stop();
  vi.useRealTimers();
});

describe('product choices are saved like any edit', () => {
  it('autosave writes the chosen options, variant, SKU and quantity', async () => {
    setup();
    studio.getState().actions.setProductSize({ valueId: value('Size', 'XL') });
    studio.getState().actions.setOrderQuantity(5);
    await advance(1500);
    const saved = storedProduct();
    const variant = product.variants.find((v) => v.id === saved.variantId)!;
    expect(variant.optionValueIds).toContain(value('Size', 'XL'));
    expect(saved).toMatchObject({ familyId: 'apparel', sku: variant.sku, configuration: { quantity: 5 } });
    expect(repo.designs.get('design_1')!.schemaVersion).toBe(3);
  });

  it('opening the saved design restores the product configuration exactly', async () => {
    setup();
    studio.getState().actions.setProductColour(value('Colour', 'Navy'));
    studio.getState().actions.setStudioChoice('custom-product-colour', { type: 'colour', valueId: null, hex: '#22305a' });
    await advance(1500);
    const expected = studio.getState().document.product;
    const opened = await openSavedDesign(repo, { productSlug: SLUG, designId: null });
    expect(opened.kind).toBe('restored');
    expect(opened.kind === 'restored' && opened.document.product).toEqual(expected);
  });

  it('a version keeps its product choices, and restoring it brings them back (one undo step)', async () => {
    setup();
    studio.getState().actions.setProductSize({ valueId: value('Size', 'XL') });
    await controller.saveNow();
    const xl = studio.getState().document.product;
    const [version] = await repo.listVersions('design_1');
    studio.getState().actions.setProductSize({ valueId: value('Size', 'M') });
    await advance(1500);
    expect(storedProduct().configuration.options).not.toEqual(xl.configuration.options);

    expect(await controller.restoreVersion(version!.versionId)).toBe(true);
    expect(studio.getState().document.product).toEqual(xl);
    studio.getState().actions.undo();
    expect(studio.getState().document.product.configuration.options).toMatchObject({ [product.optionGroups.find((g) => g.name === 'Size')!.id]: value('Size', 'M') });
  });
});

describe('designs saved as schema v2', () => {
  function storeV2(document: DesignDocument) {
    const { familyId: _f, sku: _s, configuration: _c, ...v2Product } = document.product;
    const stored = { ...(toStoredDocument(document, document.meta) as Record<string, unknown>), schemaVersion: 2, product: v2Product };
    repo.designs.set(document.id, {
      designId: document.id,
      productSlug: SLUG,
      productId: document.product.productId,
      variantId: document.product.variantId,
      name: document.name,
      schemaVersion: 2,
      createdAt: 1,
      updatedAt: now,
      revision: 1,
      fingerprint: designFingerprint(document),
      currentVersionId: null,
      document: stored,
    });
    return stored;
  }

  it('open with their artwork untouched, then gain the saved variant’s options and SKU', async () => {
    const original = blank();
    const stored = storeV2(original);
    const opened = await openSavedDesign(repo, { productSlug: SLUG, designId: null });
    expect(opened.kind).toBe('restored');
    if (opened.kind !== 'restored') return;
    expect(opened.document.surfaces).toEqual((stored as unknown as DesignDocument).surfaces);
    expect(opened.document.product.configuration.options).toEqual({});

    // As the Studio does on opening (studio-app): follow the saved variant — not an undo step.
    // v2 never recorded the same-design switch, so it stays unknown rather than invented.
    const upgraded = { ...original.product, configuration: { ...original.product.configuration, sameDesignBothSides: null } };
    setup(opened.document, { record: opened.record, variantId: opened.document.product.variantId });
    expect(studio.getState().document.product).toEqual(upgraded);
    expect(studio.getState().history.past).toHaveLength(0);

    await advance(1500);
    expect(repo.designs.get('design_1')!.schemaVersion).toBe(3);
    expect(storedProduct()).toEqual(upgraded);
  });

  it('restoring a v2 version keeps the current product choices instead of wiping them', async () => {
    setup();
    studio.getState().actions.setProductSize({ valueId: value('Size', 'L') });
    const current = studio.getState().document;
    const { familyId: _f, sku: _s, configuration: _c, ...v2Product } = current.product;
    const v2: Record<string, unknown> = { ...(toStoredDocument(current, current.meta) as Record<string, unknown>), schemaVersion: 2, product: v2Product };
    (v2.surfaces as DesignDocument['surfaces'])[0]!.elements = [];
    await repo.addVersion({ versionId: 'version_v2', designId: 'design_1', createdAt: now - 1000, reason: 'manual', schemaVersion: 2, fingerprint: 'old', document: v2 }, 20);

    expect(await controller.restoreVersion('version_v2')).toBe(true);
    expect(studio.getState().document.surfaces[0]!.elements).toEqual([]);
    expect(studio.getState().document.product).toEqual(current.product);
  });
});
