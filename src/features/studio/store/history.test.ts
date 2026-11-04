import { describe, expect, it } from 'vitest';
import { renameDesign, setVariant } from '../commands';
import type { DesignDocument } from '../schema/types';
import { sampleDesign } from '../testing/fixtures';
import { COALESCE_WINDOW_MS, emptyHistory, HISTORY_LIMIT, rebaseHistory, recordEntry, redoStep, sameContent, sealLatest, undoStep, type HistoryEntry, type HistoryState } from './history';

const base = sampleDesign();
const docs: DesignDocument[] = [base];
for (let i = 1; i <= 160; i += 1) docs.push(renameDesign(docs[i - 1]!, `Name ${i}`));

/** Entry i turns docs[i - 1] into docs[i]. */
function entry(i: number, at = i * 1000, coalesceKey: string | null = null): HistoryEntry {
  return {
    label: `Step ${i}`,
    coalesceKey,
    at,
    before: { document: docs[i - 1]!, surfaceId: 'front', selection: [] },
    after: { document: docs[i]!, surfaceId: 'front', selection: [] },
  };
}

function record(count: number, start = 1): HistoryState {
  let history = emptyHistory;
  for (let i = start; i < start + count; i += 1) history = recordEntry(history, entry(i));
  return history;
}

describe('history', () => {
  it('starts empty; undo and redo do nothing', () => {
    expect(emptyHistory).toEqual({ past: [], future: [] });
    expect(undoStep(emptyHistory)).toBeNull();
    expect(redoStep(emptyHistory)).toBeNull();
    expect(sealLatest(emptyHistory)).toBe(emptyHistory);
  });

  it('moves entries between past and future', () => {
    const history = record(3);
    const undone = undoStep(history)!;
    expect(undone.entry.label).toBe('Step 3');
    expect(undone.history.past.map((e) => e.label)).toEqual(['Step 1', 'Step 2']);
    expect(undone.history.future.map((e) => e.label)).toEqual(['Step 3']);
    const redone = redoStep(undone.history)!;
    expect(redone.entry.label).toBe('Step 3');
    expect(redone.history.past.map((e) => e.label)).toEqual(['Step 1', 'Step 2', 'Step 3']);
    expect(redone.history.future).toEqual([]);
  });

  it('clears the redo stack when a new edit is recorded', () => {
    const undone = undoStep(record(3))!.history;
    const next = recordEntry(undone, entry(4));
    expect(next.future).toEqual([]);
    expect(next.past.map((e) => e.label)).toEqual(['Step 1', 'Step 2', 'Step 4']);
  });

  it(`keeps at most ${HISTORY_LIMIT} entries, dropping the oldest`, () => {
    const history = record(150);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]?.label).toBe('Step 51');
    expect(history.past.at(-1)?.label).toBe('Step 150');
    expect(recordEntry(record(5), entry(6), { limit: 3 }).past.map((e) => e.label)).toEqual(['Step 4', 'Step 5', 'Step 6']);
  });

  it('merges edits with the same key inside the window into one step', () => {
    let history = recordEntry(emptyHistory, entry(1, 1000, 'typing'));
    history = recordEntry(history, entry(2, 1000 + COALESCE_WINDOW_MS, 'typing'));
    history = recordEntry(history, entry(3, 1000 + 2 * COALESCE_WINDOW_MS, 'typing')); // window slides
    expect(history.past).toHaveLength(1);
    expect(history.past[0]?.before.document).toBe(docs[0]);
    expect(history.past[0]?.after.document).toBe(docs[3]);
    expect(history.past[0]?.label).toBe('Step 3');
  });

  it('does not merge across a pause, a different key, a sealed entry or an undo', () => {
    const first = recordEntry(emptyHistory, entry(1, 1000, 'typing'));
    expect(recordEntry(first, entry(2, 1000 + COALESCE_WINDOW_MS + 1, 'typing')).past).toHaveLength(2);
    expect(recordEntry(first, entry(2, 1100, 'slider')).past).toHaveLength(2);
    expect(recordEntry(first, entry(2, 1100, null)).past).toHaveLength(2);
    expect(recordEntry(sealLatest(first), entry(2, 1100, 'typing')).past).toHaveLength(2);

    const twoSteps = recordEntry(recordEntry(emptyHistory, entry(1, 1000, 'nudge')), entry(2, 5000, 'nudge'));
    const undone = undoStep(twoSteps)!;
    expect(undone.history.future[0]?.coalesceKey).toBeNull();
    const redone = redoStep(undone.history)!.history;
    expect(recordEntry(redone, entry(3, 5100, 'nudge')).past).toHaveLength(3);
  });

  it('drops a merged entry whose edits cancel out', () => {
    const there: HistoryEntry = { ...entry(1, 1000, 'typing') };
    const back: HistoryEntry = { ...entry(2, 1200, 'typing'), before: there.after, after: there.before };
    const history = recordEntry(recordEntry(emptyHistory, there), back);
    expect(history.past).toEqual([]);
  });

  it('compares documents by content, cheaply', () => {
    const copy = JSON.parse(JSON.stringify(docs[1])) as DesignDocument;
    expect(sameContent(docs[1]!, copy)).toBe(true);
    expect(sameContent(docs[1]!, docs[2]!)).toBe(false);
    expect(sameContent(docs[1]!, { ...docs[1]!, surfaces: docs[1]!.surfaces.slice(0, 1) })).toBe(false);
  });

    it('rebases every stored document for changes that must not be undone', () => {
    const history = undoStep(record(3))!.history;
    const rebased = rebaseHistory(history, (d) => setVariant(d, 'variant_9'));
    const all = [...rebased.past, ...rebased.future].flatMap((e) => [e.before.document, e.after.document]);
    expect(all.every((d) => d.product.variantId === 'variant_9')).toBe(true);
    // A document shared by two entries is converted once and stays shared.
    expect(rebased.past[0]?.after.document).toBe(rebased.past[1]?.before.document);
  });
});
