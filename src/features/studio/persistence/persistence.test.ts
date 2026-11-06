import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoDesign } from '../demo/demo-design';
import { createBlankDesign, createImageElement, createTextElement } from '../schema/create';
import type { DesignDocument, TextElement } from '../schema/types';
import { createStudioStore, type StudioStore } from '../store';
import { cardProfile, sequentialIds } from '../testing/fixtures';
import { canonicalJson, designFingerprint, toStoredDocument } from './fingerprint';
import { StorageError, VERSION_LIMIT, type DesignRecord } from './records';
import { createMemoryRepository, type MemoryRepository } from './repository';
import { openSavedDesign, readRecord } from './restore';
import { formatVersionTime, saveLabel } from './save-labels';
import { createSaveController, type SaveController } from './save-controller';

/**
 * Saving designs in this browser (M11), against the in-memory repository (same contract as the
 * IndexedDB one, which the browser tests exercise). Timers are faked: autosave waits 1 s.
 */

const SLUG = 'business-card-classic';
let now = 1_700_000_000_000;
let repo: MemoryRepository;
let studio: StudioStore;
let controller: SaveController;

function setup(document: DesignDocument = blank(), extra: Partial<Parameters<typeof createSaveController>[0]> = {}) {
  repo ??= createMemoryRepository();
  studio = createStudioStore({ document, clock: () => now });
  controller = createSaveController({ studio, repository: repo, productSlug: SLUG, productId: 'p1', clock: () => now, newId: sequentialIds(), ...extra });
  controller.start();
  return controller;
}

function blank(): DesignDocument {
  const doc = createBlankDesign({ ...cardProfile, slug: SLUG }, { newId: () => 'design_1', now: new Date(now) });
  return doc;
}

const status = () => controller.state.getState().status;
const record = (id = 'design_1') => repo.designs.get(id)!;
const addText = (text = 'Hello') => studio.getState().actions.addElement(createTextElement({ x: 100, y: 100, width: 300, height: 60 }, { id: `el_${text.replace(/\W/g, '')}`, text }));
/** Let queued promises (the in-memory repository) settle. */
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};
async function advance(ms: number) {
  now += ms;
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  repo = createMemoryRepository();
});

afterEach(() => {
  controller?.stop();
  vi.useRealTimers();
});

describe('fingerprints', () => {
  it('ignore key order, metadata and editor state; see every design change', () => {
    const doc = demoDesign();
    const reordered = JSON.parse(canonicalJson(doc)) as DesignDocument;
    expect(designFingerprint(reordered)).toBe(designFingerprint(doc));
    expect(designFingerprint({ ...doc, meta: { ...doc.meta, revision: 9 } })).toBe(designFingerprint(doc));
    const moved = { ...doc, surfaces: doc.surfaces.map((s, i) => (i === 0 ? { ...s, background: { color: '#000000' } } : s)) };
    expect(designFingerprint(moved)).not.toBe(designFingerprint(doc));
  });

  it('store plain JSON with no shared objects', () => {
    const doc = demoDesign();
    const stored = toStoredDocument(doc, doc.meta) as DesignDocument;
    expect(stored).toEqual(doc);
    expect(stored.surfaces).not.toBe(doc.surfaces);
  });
});

describe('autosave', () => {
  it('waits for a quiet second after the last change, then writes once — no undo step, nothing else changes', async () => {
    setup();
    expect(status()).toBe('idle');
    addText('One');
    expect(status()).toBe('dirty');
    await advance(600);
    addText('Two'); // restarts the wait
    await advance(600);
    expect(repo.designs.size).toBe(0);
    const before = studio.getState();
    await advance(500);
    expect(status()).toBe('saved');
    expect(record()).toMatchObject({ designId: 'design_1', productSlug: SLUG, revision: 1, variantId: null });
    expect(studio.getState().document).toBe(before.document);
    expect(studio.getState().history).toBe(before.history);
    expect(studio.getState().editor).toBe(before.editor);
    expect(controller.state.getState().persisted).toBe(true);
  });

  it('keeps only design data: no selection, view, editing or history', async () => {
    setup();
    addText();
    studio.getState().actions.select(['el_Hello']);
    studio.getState().actions.setActiveSurface('back');
    await advance(1000);
    const stored = record();
    expect(Object.keys(stored).sort()).toEqual(['createdAt', 'currentVersionId', 'designId', 'document', 'fingerprint', 'name', 'productId', 'productSlug', 'revision', 'schemaVersion', 'updatedAt', 'variantId']);
    expect(JSON.stringify(stored)).not.toMatch(/selectedIds|editingTextId|viewport|history|hovered/);
    expect((stored.document as DesignDocument).meta.revision).toBe(1);
  });

  it('is "saved" again after undoing back to what was saved, without writing', async () => {
    setup();
    addText();
    await advance(1000);
    studio.getState().actions.updateElement('el_Hello', { x: 400 });
    expect(status()).toBe('dirty');
    studio.getState().actions.undo();
    expect(status()).toBe('saved');
    await advance(2000);
    expect(record().revision).toBe(1);
  });

  it('writes one at a time, newest content last (no stale write wins)', async () => {
    let release: (() => void) | null = null;
    const slow = createMemoryRepository();
    const save = slow.saveDesign.bind(slow);
    slow.saveDesign = (r, o) => new Promise((resolve) => {
      release = () => void save(r, o).then(resolve);
    });
    repo = slow;
    setup();
    addText('A');
    await advance(1000); // write A starts and hangs
    expect(status()).toBe('saving');
    addText('B');
    await advance(1000); // B waits for A
    release!();
    await settle();
    release!(); // B goes now
    await settle();
    const doc = record().document as DesignDocument;
    expect(doc.surfaces[0]!.elements.map((e) => e.id)).toEqual(['el_A', 'el_B']);
    expect(record().revision).toBe(2);
    expect(status()).toBe('saved');
  });
});

describe('manual save and versions', () => {
  it('Save now writes at once and keeps a version; saving again with no change keeps no new one', async () => {
    setup();
    addText();
    await controller.saveNow();
    expect(status()).toBe('saved');
    expect(await repo.listVersions('design_1')).toMatchObject([{ reason: 'manual' }]);
    await controller.saveNow();
    await controller.saveNow();
    expect(await repo.listVersions('design_1')).toHaveLength(1);
    expect(record().revision).toBe(1);
  });

  it('keeps the first autosave as "Initial save", then one autosave version per 10 minutes of work', async () => {
    setup();
    addText('One');
    await advance(1000);
    addText('Two');
    await advance(1000);
    expect((await repo.listVersions('design_1')).map((v) => v.reason)).toEqual(['initial']);
    await advance(10 * 60 * 1000);
    addText('Three');
    await advance(1000);
    expect((await repo.listVersions('design_1')).map((v) => v.reason)).toEqual(['autosave', 'initial']);
  });

  it(`keeps the newest ${VERSION_LIMIT} versions`, async () => {
    setup();
    for (let i = 0; i < VERSION_LIMIT + 5; i += 1) {
      addText(`T${i}`);
      now += 1000;
      await controller.saveNow();
    }
    const versions = await repo.listVersions('design_1');
    expect(versions).toHaveLength(VERSION_LIMIT);
    expect(versions[0]!.createdAt).toBeGreaterThan(versions.at(-1)!.createdAt);
    expect(repo.designs.size).toBe(1); // the design record itself is never pruned
  });

  it('restores a version as one undo step, after a safety copy; undo and redo move between them', async () => {
    setup();
    addText('First');
    await controller.saveNow();
    const [first] = await repo.listVersions('design_1');
    addText('Second');
    studio.getState().actions.setActiveSurface('back');
    studio.getState().actions.setBackground('#2f2a7a');
    expect(await controller.restoreVersion(first!.versionId)).toBe(true);
    const ids = () => studio.getState().document.surfaces[0]!.elements.map((e) => e.id);
    expect(ids()).toEqual(['el_First']);
    expect(studio.getState().document.surfaces[1]!.background.color).toBeNull();
    expect(studio.getState().editor.selectedIds).toEqual([]);
    expect(studio.getState().history.past.at(-1)!.label).toMatch(/^Restore version from /);
    expect((await repo.listVersions('design_1')).map((v) => v.reason)).toEqual(['restored', 'before-restore', 'manual']);
    studio.getState().actions.undo();
    expect(ids()).toEqual(['el_First', 'el_Second']);
    studio.getState().actions.redo();
    expect(ids()).toEqual(['el_First']);
    expect(await repo.getVersion(first!.versionId)).not.toBeNull(); // the chosen version stays
  });
});

describe('failures', () => {
  it('keep editing in memory, say so, and recover on retry', async () => {
    setup();
    repo.failWrites(Object.assign(new Error('full'), { name: 'QuotaExceededError' }));
    addText();
    await advance(1000);
    expect(status()).toBe('error');
    expect(controller.state.getState().message).toMatch(/out of storage space.*still in this session/);
    expect(studio.getState().document.surfaces[0]!.elements).toHaveLength(1);
    repo.failWrites(null);
    await controller.saveNow();
    expect(status()).toBe('saved');
  });

  it('never write a design that fails validation', async () => {
    setup();
    addText();
    // Simulate a broken in-memory design (a store bug): the write is refused, not stored.
    studio.setState({ document: { ...studio.getState().document, name: '' } });
    await controller.saveNow();
    expect(status()).toBe('error');
    expect(repo.designs.size).toBe(0);
  });

  it('refuse to overwrite a newer save from another tab, unless asked', async () => {
    setup();
    addText();
    await controller.saveNow();
    // Another tab saves revision 2 meanwhile.
    repo.designs.set('design_1', { ...record(), revision: 2, updatedAt: now + 1 });
    addText('Mine');
    await advance(1000);
    expect(status()).toBe('conflict');
    expect(record().revision).toBe(2);
    await controller.saveAnyway();
    expect(status()).toBe('saved');
    expect((record().document as DesignDocument).surfaces[0]!.elements.map((e) => e.id)).toContain('el_Mine');
  });

  it('report storage that could not be opened', () => {
    setup(blank(), { storageError: 'blocked' });
    expect(status()).toBe('error');
    expect(controller.state.getState().message).toBe('Unable to save locally. Your changes are still in this session.');
  });
});

describe('samples', () => {
  it('aren’t saved until saved on purpose, then become a design of their own', async () => {
    setup(blank(), { sample: true });
    expect(status()).toBe('sample');
    addText();
    await advance(5000);
    expect(repo.designs.size).toBe(0);
    await controller.saveNow();
    expect(repo.designs.size).toBe(1);
    addText('Later');
    await advance(1000);
    expect(record().revision).toBe(2);
  });
});

describe('restoring on open', () => {
  async function saved(document: DesignDocument = blank()): Promise<DesignRecord> {
    setup(document);
    await controller.saveNow();
    controller.stop();
    return record(document.id);
  }

  it('reopens the latest design for the product, or exactly the one asked for', async () => {
    const one = await saved();
    now += 1000;
    const other = { ...blank(), id: 'design_2' };
    await saved(other);
    expect(await openSavedDesign(repo, { productSlug: SLUG, designId: null })).toMatchObject({ kind: 'restored', record: { designId: 'design_2' } });
    expect(await openSavedDesign(repo, { productSlug: SLUG, designId: one.designId })).toMatchObject({ kind: 'restored', record: { designId: 'design_1' } });
    expect(await openSavedDesign(repo, { productSlug: SLUG, designId: 'design_404' })).toEqual({ kind: 'missing', designId: 'design_404' });
    expect(await openSavedDesign(createMemoryRepository(), { productSlug: SLUG, designId: null })).toEqual({ kind: 'new' });
  });

  it('keeps front, back, backgrounds, text, shapes, graphics, locks and rotations', async () => {
    const doc = { ...demoDesign(), id: 'design_demo', product: { ...demoDesign().product, slug: SLUG } };
    doc.surfaces[1]!.elements.push(createImageElement({ kind: 'graphic', graphicId: 'verified-seal' }, { x: 1, y: 1, width: 50, height: 50 }, { id: 'el_seal', rotation: 33 }));
    const rec = await saved(doc);
    const opened = readRecord(rec, SLUG);
    expect(opened.kind).toBe('restored');
    if (opened.kind !== 'restored') return;
    // Everything but the save metadata (time and revision move on when saving).
    expect({ ...opened.document, meta: null }).toEqual({ ...doc, meta: null });
    expect(opened.document.meta.revision).toBe(1);
    expect(JSON.stringify(rec)).not.toMatch(/data:|base64|<svg/);
  });

  it('never opens damaged data or another product’s design, and leaves them stored', async () => {
    const rec = await saved();
    const damaged = { ...rec, document: { ...(rec.document as object), surfaces: 'oops' } };
    expect(readRecord(damaged, SLUG)).toMatchObject({ kind: 'corrupt', designId: 'design_1' });
    expect(readRecord({ ...rec, document: '{not json' }, SLUG)).toMatchObject({ kind: 'corrupt' });
    expect(readRecord({ ...rec, document: { ...(rec.document as object), schemaVersion: 99 } }, SLUG)).toMatchObject({ kind: 'corrupt', reason: expect.stringMatching(/newer version/) });
    expect(readRecord(rec, 'flyer-a4-standard')).toMatchObject({ kind: 'mismatch', productSlug: SLUG });
    repo.designs.set('design_1', damaged);
    expect(await openSavedDesign(repo, { productSlug: SLUG, designId: 'design_1' })).toMatchObject({ kind: 'corrupt' });
    expect(repo.designs.get('design_1')).toBe(damaged);
  });

  it('opens a new design (and says so) when storage can’t be read', async () => {
    const broken = { ...createMemoryRepository(), latestForProduct: () => Promise.reject(new StorageError('unavailable', 'blocked')) };
    expect(await openSavedDesign(broken, { productSlug: SLUG, designId: null })).toEqual({ kind: 'new', storageError: 'blocked' });
  });

  it('a restored design that differs from its saved copy starts unsaved and autosaves', async () => {
    const rec = await saved();
    const opened = readRecord(rec, SLUG);
    if (opened.kind !== 'restored') throw new Error('expected restored');
    const changed: DesignDocument = { ...opened.document, product: { ...opened.document.product, variantId: 'variant_2' } };
    setup(changed, { record: rec });
    expect(status()).toBe('dirty');
    await advance(1000);
    expect(record().variantId).toBe('variant_2');
  });
});

describe('labels', () => {
  it('say how the design is saved — locally, never "synced"', () => {
    const at = Date.UTC(2026, 10, 6, 10, 30);
    expect(saveLabel({ status: 'idle', lastSavedAt: null }, at)).toBe('Not saved yet');
    expect(saveLabel({ status: 'dirty', lastSavedAt: at }, at)).toBe('Unsaved changes');
    expect(saveLabel({ status: 'saving', lastSavedAt: at }, at)).toBe('Saving…');
    expect(saveLabel({ status: 'saved', lastSavedAt: at }, at + 20_000)).toBe('Saved just now');
    expect(saveLabel({ status: 'saved', lastSavedAt: at }, at + 12 * 60_000)).toBe('Saved 12 min ago');
    expect(saveLabel({ status: 'saved', lastSavedAt: at }, at + 3 * 3_600_000)).toMatch(/^Saved \d/);
    expect(saveLabel({ status: 'error', lastSavedAt: null }, at)).toBe('Save failed');
    expect(saveLabel({ status: 'conflict', lastSavedAt: null }, at)).toBe('Saved in another tab');
    expect(saveLabel({ status: 'sample', lastSavedAt: null }, at)).toBe('Sample · not saved');
    expect(formatVersionTime(at, at + 1000)).toMatch(/^Today, /);
    expect(formatVersionTime(at - 3 * 86_400_000, at)).not.toMatch(/^Today/);
  });
});

describe('design ids', () => {
  it('stay the same across saves; a new design gets a new one', async () => {
    setup();
    addText();
    await controller.saveNow();
    addText('More');
    await controller.saveNow();
    expect([...repo.designs.keys()]).toEqual(['design_1']);
    const fresh = createBlankDesign(cardProfile);
    expect(fresh.id).not.toBe('design_1');
    expect((studio.getState().document.surfaces[0]!.elements[0] as TextElement).text).toBe('Hello');
  });
});
