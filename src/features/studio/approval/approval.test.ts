import { describe, expect, it } from 'vitest';
import { productWorkflow } from '@/features/product-workflow/registry';
import { cartLineFor } from '@/features/cart/line';
import { resolvePrice } from '@/features/product-workflow/pricing';
import { createCartStore } from './cart-store-fixture';
import { evaluatePrintChecks, type ResourceState } from '../preflight/print-checks';
import { createBlankDesign, createImageElement, createTextElement } from '../schema/create';
import type { DesignDocument } from '../schema/types';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { approvalBlockers, approvalStatus } from './approval';
import { designFingerprint } from '../persistence/fingerprint';
import type { DesignApproval } from '../persistence/records';

/** What can stop an approval (Phase 4 M5), and the cart line an approved design becomes. */

const card = readProduct('business-card-classic');
const cardProfile = readProfile('business-card-classic');
const workflow = productWorkflow('business-card-classic');
const available = (_id: string): ResourceState => 'available';
const report = (doc: DesignDocument, imageState: (id: string) => ResourceState = available) => evaluatePrintChecks({ document: doc, imageState, graphicState: available });

function cardDesign(withText = true): DesignDocument {
  const variant = card.variants.find((v) => v.isDefault) ?? card.variants[0]!;
  const doc = createBlankDesign(cardProfile, { newId: () => 'design_card', variantId: variant.id, catalogue: card });
  doc.product.configuration.orientation = 'horizontal';
  if (withText) doc.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 400, height: 60 }, { id: 'el_1', text: 'Riya Sharma' }));
  return doc;
}
const blockers = (doc: DesignDocument, imageState: (id: string) => ResourceState = available) => approvalBlockers({ product: card, workflow, document: doc, report: report(doc, imageState) }).map((b) => b.kind);

describe('approval blockers', () => {
  it('a finished design with valid choices can be approved', () => {
    expect(blockers(cardDesign())).toEqual([]);
  });

  it('an empty design can’t: it says what is missing', () => {
    const result = approvalBlockers({ product: card, workflow, document: cardDesign(false), report: report(cardDesign(false)) });
    expect(result.map((b) => b.kind)).toEqual(['empty']);
    expect(result[0]!.message).toMatch(/Your design is empty/);
  });

  it('a missing image file blocks; print warnings (low resolution, near the edge) don’t', () => {
    const doc = cardDesign();
    // Recorded in the design, but its file isn't on this device any more.
    doc.assets.asset_gone = { id: 'asset_gone', kind: 'upload', name: 'logo.png', mime: 'image/png', bytes: 100, naturalWidth: 400, naturalHeight: 400, storage: { kind: 'local', blobId: 'asset_gone' } };
    doc.surfaces[0]!.elements.push(createImageElement({ kind: 'asset', assetId: 'asset_gone' }, { x: 100, y: 100, width: 200, height: 200 }, { id: 'el_img' }));
    expect(blockers(doc, (id: string) => (id === 'asset_gone' ? 'missing' : 'available'))).toEqual(['missing-file']);
  });

  it('a combination with no variant blocks; an entry choice (orientation, asked before the Studio) doesn’t', () => {
    const noOrientation = cardDesign();
    noOrientation.product.configuration.orientation = null;
    expect(blockers(noOrientation)).toEqual([]);
    const impossible = cardDesign();
    impossible.product.configuration.options = { ...impossible.product.configuration.options, [card.optionGroups[0]!.id]: 'no-such-value' };
    expect(blockers(impossible)).toContain('no-variant');
  });
});

describe('approval status', () => {
  it('none without an approval; approved while unchanged; changed after any edit', () => {
    const doc = cardDesign();
    const approval: DesignApproval = { versionId: 'v1', fingerprint: designFingerprint(doc), approvedAt: 1, variantId: doc.product.variantId, sku: doc.product.sku, quantity: 1 };
    expect(approvalStatus(null, doc)).toBe('none');
    expect(approvalStatus(approval, doc)).toBe('approved');
    expect(approvalStatus(approval, { ...doc, name: 'Renamed' })).toBe('changed');
  });
});

describe('cart line', () => {
  const doc = cardDesign();
  const price = resolvePrice(card, workflow, doc.product.configuration);
  const approval: DesignApproval = {
    versionId: 'version_7',
    fingerprint: designFingerprint(doc),
    approvedAt: 1_700_000_000_000,
    variantId: doc.product.variantId,
    sku: doc.product.sku,
    quantity: doc.product.configuration.quantity,
  };

  it('refers to the approved version of the design; its id is design + version (no random id), with what is ordered as approved', () => {
    const built = cartLineFor({ product: card, document: doc, approval, price, optionsLabel: '100 cards', now: 5 });
    expect(built.ok).toBe(true);
    if (!built.ok || price.status !== 'priced') return;
    expect(built.line).toMatchObject({
      lineId: 'design_card:version_7',
      productSlug: 'business-card-classic',
      variantId: price.variantId,
      sku: price.sku,
      quantity: price.quantity,
      totalPriceCents: price.totalPriceCents,
      design: { designId: 'design_card', versionId: 'version_7', fingerprint: approval.fingerprint },
    });
    expect(built.line.configuration).toEqual(doc.product.configuration);
    expect(built.line.configuration).not.toBe(doc.product.configuration);
  });

  it('refuses choices that no longer match the approval (never adds an unapproved order)', () => {
    expect(cartLineFor({ product: card, document: doc, approval: { ...approval, sku: 'OTHER' }, price, optionsLabel: '', now: 5 }).ok).toBe(false);
    expect(cartLineFor({ product: card, document: doc, approval: { ...approval, quantity: 3 }, price, optionsLabel: '', now: 5 }).ok).toBe(false);
  });

  it('the same approval is added once; removing clears it', () => {
    const cart = createCartStore();
    const built = cartLineFor({ product: card, document: doc, approval, price, optionsLabel: '', now: 5 });
    if (!built.ok) throw new Error('no line');
    expect(cart.add(built.line)).toBe('added');
    expect(cart.add(built.line)).toBe('already-in-cart');
    expect(cart.lines()).toHaveLength(1);
    cart.remove(built.line.lineId);
    expect(cart.lines()).toHaveLength(0);
  });
});
