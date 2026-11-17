import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { approvalStatus } from '../approval/approval-status';
import { createBlankDesign, createTextElement } from '../schema/create';
import type { DesignDocument } from '../schema/types';
import { createStudioStore, type StudioStore } from '../store';
import { cardProfile, sequentialIds } from '../testing/fixtures';
import { designFingerprint } from './fingerprint';
import { readApproval, type DesignRecord } from './records';
import { createMemoryRepository, type MemoryRepository } from './repository';
import { openSavedDesign } from './restore';
import { createSaveController, type SaveController } from './save-controller';

/**
 * Approving a design (Phase 4 M5) through the save controller, against the in-memory repository:
 * the approved content is kept as an `approved` version and recorded on the design record; it is
 * restored with the record, goes stale on any change, is never pruned, and adds no undo step.
 */

const SLUG = 'business-card-classic';
let now = 1_700_000_000_000;
let repo: MemoryRepository;
let studio: StudioStore;
let controller: SaveController;
let ids: (prefix?: string) => string;

function setup(document: DesignDocument = blank(), record: DesignRecord | null = null) {
  studio = createStudioStore({ document, clock: () => now });
  controller = createSaveController({ studio, repository: repo, productSlug: SLUG, productId: 'p1', clock: () => now, newId: ids, record });
  controller.start();
}
const blank = () => createBlankDesign({ ...cardProfile, slug: SLUG }, { newId: () => 'design_1', now: new Date(now) });
const addText = (text: string) => studio.getState().actions.addElement(createTextElement({ x: 100, y: 100, width: 300, height: 60 }, { id: `el_${text}`, text }));
const record = () => repo.designs.get('design_1')!;
const versionsOf = () => [...repo.versions.values()].filter((v) => v.designId === 'design_1');

beforeEach(() => {
  vi.useFakeTimers();
  repo = createMemoryRepository();
  ids = sequentialIds(); // one sequence per test, shared by every controller in it
});
afterEach(() => {
  controller?.stop();
  vi.useRealTimers();
});

describe('approve', () => {
  it('saves the design, keeps exactly it as an `approved` version (with its thumbnail) and records the approval — no undo step', async () => {
    setup();
    addText('Hello');
    const undoBefore = studio.getState().history.past.length;
    const result = await controller.approve({ thumbnail: 'data:image/png;base64,AAAA' });
    expect(result.ok).toBe(true);
    const doc = studio.getState().document;
    const approval = readApproval(record().approval)!;
    expect(approval).toEqual({ versionId: expect.any(String), fingerprint: designFingerprint(doc), approvedAt: now, variantId: doc.product.variantId, sku: doc.product.sku, quantity: doc.product.configuration.quantity });
    const version = repo.versions.get(approval.versionId)!;
    expect([version.reason, version.fingerprint, version.thumbnail]).toEqual(['approved', designFingerprint(doc), 'data:image/png;base64,AAAA']);
    expect(controller.state.getState()).toMatchObject({ status: 'saved', approval });
    expect(studio.getState().history.past).toHaveLength(undoBefore);
    expect(approvalStatus(approval, doc)).toBe('approved');
  });

  it('approving the same content again changes nothing: one approval, one approved version', async () => {
    setup();
    addText('Hello');
    const first = await controller.approve();
    const second = await controller.approve();
    expect(first.ok && second.ok && second.approval).toEqual(first.ok && first.approval);
    expect(versionsOf().filter((v) => v.reason === 'approved')).toHaveLength(1);
  });

  it('goes stale on any change (artwork or product choices) and is current again after undo', async () => {
    setup();
    addText('Hello');
    await controller.approve();
    const approval = controller.state.getState().approval;
    addText('Changed');
    expect(approvalStatus(approval, studio.getState().document)).toBe('changed');
    studio.getState().actions.undo();
    expect(approvalStatus(approval, studio.getState().document)).toBe('approved');
    studio.getState().actions.setOrderQuantity(5);
    expect(approvalStatus(approval, studio.getState().document)).toBe('changed');
  });

  it('is kept by later saves, comes back with the record, and a new approval replaces it', async () => {
    setup();
    addText('Hello');
    await controller.approve();
    const approved = readApproval(record().approval)!;
    addText('More');
    await controller.saveNow();
    expect(readApproval(record().approval)).toEqual(approved); // kept, though now stale
    controller.stop();

    const opened = await openSavedDesign(repo, { productSlug: SLUG, designId: 'design_1' });
    expect(opened.kind).toBe('restored');
    if (opened.kind !== 'restored') return;
    setup(opened.document, opened.record);
    expect(controller.state.getState().approval).toEqual(approved);
    expect(approvalStatus(approved, studio.getState().document)).toBe('changed');
    now += 1000;
    const again = await controller.approve();
    expect(again.ok && again.approval.versionId).not.toBe(approved.versionId);
    expect(again.ok && again.approval.approvedAt).toBe(now);
  });

  it('detaching forgets the approval; the design and its approved version stay', async () => {
    setup();
    addText('Hello');
    await controller.approve();
    const { versionId } = readApproval(record().approval)!;
    expect(await controller.clearApproval()).toBe(true);
    expect(record().approval).toBeUndefined();
    expect(controller.state.getState().approval).toBeNull();
    expect(repo.versions.has(versionId)).toBe(true);
  });

  it('approved versions are never pruned, however many saves follow', async () => {
    setup();
    addText('Hello');
    await controller.approve();
    const { versionId } = readApproval(record().approval)!;
    for (let i = 0; i < 25; i += 1) {
      addText(`n${i}`);
      await controller.saveNow();
    }
    expect(repo.versions.has(versionId)).toBe(true);
    expect(versionsOf().filter((v) => v.reason !== 'approved').length).toBeLessThanOrEqual(20);
  });

  it('a design that can’t be saved can’t be approved, and says why', async () => {
    setup();
    addText('Hello');
    repo.failWrites(new Error('quota'));
    const result = await controller.approve();
    expect(result.ok).toBe(false);
    expect(record()).toBeUndefined();
  });

  it('a damaged stored approval is ignored, never trusted', () => {
    expect(readApproval({ versionId: 'v', fingerprint: 'f', approvedAt: 'yesterday', variantId: null, sku: null, quantity: 1 })).toBeNull();
    expect(readApproval({ versionId: '', fingerprint: 'f', approvedAt: 1, variantId: null, sku: null, quantity: 1 })).toBeNull();
    expect(readApproval({ versionId: 'v', fingerprint: 'f', approvedAt: 1, variantId: null, sku: null, quantity: 0 })).toBeNull();
    expect(readApproval(null)).toBeNull();
  });
});
