import type { DesignDocument } from '../schema/types';

/**
 * Undo/redo history as a list of snapshots.
 *
 * Each entry keeps the document before and after one change, plus where the customer was (active
 * surface, selection) so undo puts them back there. Documents are immutable and M2 commands share
 * every unchanged surface and element, so an entry only adds the objects that actually changed —
 * 100 entries of a typical design cost a few hundred kilobytes at most.
 */

export const HISTORY_LIMIT = 100;
/** Edits with the same coalesce key this close together become one undo step (typing, dragging a slider). */
export const COALESCE_WINDOW_MS = 600;

export interface EditorSnapshot {
  document: DesignDocument;
  surfaceId: string;
  selection: readonly string[];
}

export interface HistoryEntry {
  /** Shown in tooltips: "Undo move heading". */
  label: string;
  /** null = never merges with the next edit. */
  coalesceKey: string | null;
  /** Time of the latest edit merged into this entry (ms). */
  at: number;
  before: EditorSnapshot;
  after: EditorSnapshot;
}

export interface HistoryState {
  past: readonly HistoryEntry[];
  future: readonly HistoryEntry[];
}

export const emptyHistory: HistoryState = { past: [], future: [] };

interface RecordOptions {
  limit?: number;
  windowMs?: number;
}

/**
 * Add an entry. Clears the redo stack. Merges into the previous entry when both share a coalesce
 * key within the window; if the merged edits cancel out (back to the starting document), the entry
 * is dropped. Keeps at most `limit` entries, dropping the oldest.
 */
export function recordEntry(history: HistoryState, entry: HistoryEntry, { limit = HISTORY_LIMIT, windowMs = COALESCE_WINDOW_MS }: RecordOptions = {}): HistoryState {
  const last = history.past.at(-1);
  if (last && entry.coalesceKey !== null && last.coalesceKey === entry.coalesceKey && entry.at - last.at <= windowMs && history.future.length === 0) {
    const merged: HistoryEntry = { ...last, label: entry.label, at: entry.at, after: entry.after };
    const past = history.past.slice(0, -1);
    return { past: sameContent(merged.before.document, merged.after.document) ? past : [...past, merged], future: [] };
  }
  const past = [...history.past, entry];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

/**
 * Whether two documents hold the same design. Shared objects compare by reference; only parts that
 * differ by reference (usually one surface) are compared by content, so this stays cheap.
 */
export function sameContent(a: DesignDocument, b: DesignDocument): boolean {
  if (a === b) return true;
  const same = (x: unknown, y: unknown) => x === y || JSON.stringify(x) === JSON.stringify(y);
  return (
    a.id === b.id &&
    a.name === b.name &&
    same(a.product, b.product) &&
    same(a.assets, b.assets) &&
    a.surfaces.length === b.surfaces.length &&
    a.surfaces.every((surface, i) => same(surface, b.surfaces[i]))
  );
}

/** Stop the latest entry from merging with the next edit (e.g. after selecting something else). */
export function sealLatest(history: HistoryState): HistoryState {
  const last = history.past.at(-1);
  if (!last || last.coalesceKey === null) return history;
  return { ...history, past: [...history.past.slice(0, -1), { ...last, coalesceKey: null }] };
}

export function undoStep(history: HistoryState): { history: HistoryState; entry: HistoryEntry } | null {
  const entry = history.past.at(-1);
  if (!entry) return null;
  // A redone entry must never merge with a later edit.
  const sealed = entry.coalesceKey === null ? entry : { ...entry, coalesceKey: null };
  return { entry, history: { past: history.past.slice(0, -1), future: [...history.future, sealed] } };
}

export function redoStep(history: HistoryState): { history: HistoryState; entry: HistoryEntry } | null {
  const entry = history.future.at(-1);
  if (!entry) return null;
  return { entry, history: { past: [...history.past, entry], future: history.future.slice(0, -1) } };
}

/**
 * Apply a change to every stored document — for document fields that must never be undone,
 * such as the product variant chosen on the product page.
 */
export function rebaseHistory(history: HistoryState, change: (document: DesignDocument) => DesignDocument): HistoryState {
  const cache = new Map<DesignDocument, DesignDocument>();
  const map = (doc: DesignDocument) => {
    let next = cache.get(doc);
    if (!next) {
      next = change(doc);
      cache.set(doc, next);
    }
    return next;
  };
  const rebase = (e: HistoryEntry): HistoryEntry => {
    const before = map(e.before.document);
    const after = map(e.after.document);
    if (before === e.before.document && after === e.after.document) return e;
    return { ...e, before: { ...e.before, document: before }, after: { ...e.after, document: after } };
  };
  const past = history.past.map(rebase);
  const future = history.future.map(rebase);
  // Unchanged history keeps its identity (cheap to compare, no needless re-renders).
  const same = (a: readonly HistoryEntry[], b: readonly HistoryEntry[]) => a.every((e, i) => e === b[i]);
  return same(past, history.past) && same(future, history.future) ? history : { past, future };
}
