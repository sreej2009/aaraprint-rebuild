import { createStore, type StoreApi } from 'zustand/vanilla';
import { layoutChanges, relayoutDocument, textMeasurer, type TextMeasurer } from '../canvas/text-layout';
import * as cmd from '../commands';
import { createId, type IdFactory } from '../ids';
import { describeElements } from '../naming';
import type { DesignAsset, DesignDocument, DesignElement, ElementPatch, ImageElement, SurfaceDesign } from '../schema/types';
import { emptyHistory, HISTORY_LIMIT, rebaseHistory, recordEntry, redoStep, sealLatest, undoStep, type EditorSnapshot, type HistoryEntry, type HistoryState } from './history';
import { isAllowedOnLocked, isPickable, nextSelection, pruneSelection, type SelectMode } from './selection';

/**
 * The Studio store: one per editing session (created per product, provided through React context).
 *
 * - `document` is the only saved data. It changes only through `execute()` (and the actions built
 *   on it), which runs a pure M2 command and records one undo step.
 * - `editor` is session state — active surface, selection, hover, text being edited. It's never
 *   saved and never part of the document; undo restores it alongside the document.
 * - `history` holds up to 100 undo steps.
 * - `changeCount` goes up on every document change (edit, undo, redo, load); autosave watches it.
 * - Text heights follow the text: every text element a command adds or re-flows is re-measured
 *   (canvas/text-layout.ts) before the step is recorded, so the height change is part of it.
 *
 * Locked elements can't be moved, resized, edited, reordered or deleted through the store; they can
 * still be selected from the layers list, renamed, shown/hidden and unlocked.
 */

export interface EditorState {
  activeSurfaceId: string;
  /** In selection order. Always ids on the active surface. */
  selectedIds: readonly string[];
  hoveredId: string | null;
  editingTextId: string | null;
}

export interface ExecuteOptions {
  /** Surface the change happens on; becomes active. Defaults to the active surface. */
  surfaceId?: string;
  /** Selection after the change. Defaults to the current selection, minus removed elements. */
  select?: readonly string[];
  /** Consecutive edits with the same key within 600 ms merge into one undo step. */
  coalesceKey?: string;
  /**
   * Part of a pointer gesture (drag, resize, rotate): merges with the previous edit with the same
   * `coalesceKey` however long the pointer rests, so one gesture is one undo step. Call
   * `sealHistory()` when the gesture ends.
   */
  gesture?: boolean;
}

interface EditOptions {
  coalesceKey?: string;
  gesture?: boolean;
}

/** Positions are stored to 0.01 print px (far finer than any printer). */
const round2 = (value: number) => Math.round(value * 100) / 100 || 0;

/** Only the merge options that are set (keeps `exactOptionalPropertyTypes` happy). */
function mergeOptions(opts: EditOptions): Pick<ExecuteOptions, 'coalesceKey' | 'gesture'> {
  return { ...(opts.coalesceKey ? { coalesceKey: opts.coalesceKey } : {}), ...(opts.gesture ? { gesture: true } : {}) };
}

export interface StudioActions {
  /** Run a document command as one undo step. Returns false (and records nothing) for no-ops. */
  execute(label: string, command: (document: DesignDocument) => DesignDocument, options?: ExecuteOptions): boolean;

  addElement(element: DesignElement, options?: { surfaceId?: string; index?: number; select?: boolean }): boolean;
  /** Register an uploaded file and place it, as one undo step. */
  addImage(asset: DesignAsset, element: ImageElement, options?: { surfaceId?: string; select?: boolean }): boolean;
  updateElement<T extends DesignElement>(id: string, patch: ElementPatch<T>, options?: EditOptions & { label?: string }): boolean;
  updateElements(ids: readonly string[], patch: ElementPatch, options?: EditOptions & { label?: string }): boolean;
  moveElements(ids: readonly string[], dx: number, dy: number, options?: EditOptions): boolean;
  nudgeSelection(dx: number, dy: number): boolean;
  removeElements(ids: readonly string[]): boolean;
  removeSelection(): boolean;
  /** Copies go directly above their originals, offset by `offsetPx`, and become the selection. */
  duplicateElements(ids: readonly string[], offsetPx: number): boolean;
  duplicateSelection(offsetPx: number): boolean;
  arrangeElement(id: string, action: cmd.ArrangeAction): boolean;
  moveElementTo(id: string, index: number): boolean;
  setLocked(ids: readonly string[], locked: boolean): boolean;
  /** Hidden elements leave the selection, unless `keepSelection` (the inspector's own toggle). */
  setHidden(ids: readonly string[], hidden: boolean, options?: { keepSelection?: boolean }): boolean;
  renameElement(id: string, name: string | null): boolean;

  setBackground(color: string | null, options?: EditOptions & { surfaceId?: string }): boolean;
  copySurface(fromId: string, toId: string, mode: cmd.CopyMode): boolean;
  clearSurface(surfaceId?: string): boolean;
  renameDesign(name: string): boolean;
  /** Not undoable: the variant comes from the product options, so it's applied to every history step. */
  setVariant(variantId: string | null): void;
  /** Load a different document (restored draft, version). Clears history and selection. */
  replaceDocument(document: DesignDocument, surfaceId?: string): void;
  /**
   * Re-measure every text element (a web font finished loading, or the measurer just arrived).
   * Not undoable: it corrects stored heights, so it's applied to every history step too.
   */
  relayoutText(): boolean;

  select(ids: readonly string[], mode?: SelectMode): void;
  selectAll(): void;
  clearSelection(): void;
  setHovered(id: string | null): void;
  setEditingText(id: string | null): void;
  setActiveSurface(surfaceId: string): void;

  undo(): boolean;
  redo(): boolean;
  clearHistory(): void;
  /** End the current merge window, so the next edit is its own undo step. */
  sealHistory(): void;
}

export interface StudioState {
  document: DesignDocument;
  editor: EditorState;
  history: HistoryState;
  changeCount: number;
  /** Goes up when `relayoutText` corrects heights — a correction, not an edit (nothing to announce). */
  relayoutCount: number;
  actions: StudioActions;
}

export type StudioStore = StoreApi<StudioState>;

export interface CreateStudioStoreOptions {
  document: DesignDocument;
  surfaceId?: string;
  /** Milliseconds; injectable for tests. */
  clock?: () => number;
  newId?: IdFactory;
  historyLimit?: number;
  /**
   * Text measurement for automatic text heights. Defaults to the canvas's Konva measurer once it
   * has loaded (until then heights are left as they are and corrected by `relayoutText`); null
   * turns it off.
   */
  measureText?: TextMeasurer | null;
}

export function createStudioStore(options: CreateStudioStoreOptions): StudioStore {
  const clock = options.clock ?? (() => Date.now());
  const newId = options.newId ?? createId;
  const historyLimit = options.historyLimit ?? HISTORY_LIMIT;
  const measurer = (): TextMeasurer | null => (options.measureText === undefined ? textMeasurer() : options.measureText);

  return createStore<StudioState>()((set, get) => {
    const surface = (state: StudioState, surfaceId = state.editor.activeSurfaceId): SurfaceDesign | undefined =>
      state.document.surfaces.find((s) => s.id === surfaceId);
    const elementsOf = (state: StudioState, ids: readonly string[]): DesignElement[] => {
      const wanted = new Set(ids);
      return surface(state)?.elements.filter((e) => wanted.has(e.id)) ?? [];
    };
    const unlocked = (state: StudioState, ids: readonly string[]) => elementsOf(state, ids).filter((e) => !e.locked);
    const snapshot = (state: StudioState): EditorSnapshot => ({ document: state.document, surfaceId: state.editor.activeSurfaceId, selection: state.editor.selectedIds });

    const restore = (state: StudioState, snap: EditorSnapshot, history: HistoryState): Partial<StudioState> => ({
      document: snap.document,
      history,
      changeCount: state.changeCount + 1,
      editor: {
        activeSurfaceId: snap.surfaceId,
        selectedIds: pruneSelection(snap.selection, snap.document, snap.surfaceId),
        hoveredId: null,
        editingTextId: null,
      },
    });

    const actions: StudioActions = {
      execute(label, command, opts = {}) {
        const state = get();
        const changed = command(state.document);
        if (changed === state.document) return false;
        const measure = measurer();
        const next = measure ? layoutChanges(state.document, changed, measure) : changed;
        const surfaceId = opts.surfaceId ?? state.editor.activeSurfaceId;
        const carried = surfaceId === state.editor.activeSurfaceId ? state.editor.selectedIds : [];
        const selection = pruneSelection(opts.select ?? carried, next, surfaceId);
        const entry: HistoryEntry = {
          label,
          coalesceKey: opts.coalesceKey ?? null,
          at: clock(),
          before: snapshot(state),
          after: { document: next, surfaceId, selection },
        };
        const stillThere = (id: string | null) => (id && pruneSelection([id], next, surfaceId).length ? id : null);
        set({
          document: next,
          history: recordEntry(state.history, entry, { limit: historyLimit, ...(opts.gesture && opts.coalesceKey ? { windowMs: Number.POSITIVE_INFINITY } : {}) }),
          changeCount: state.changeCount + 1,
          editor: { activeSurfaceId: surfaceId, selectedIds: selection, hoveredId: stillThere(state.editor.hoveredId), editingTextId: stillThere(state.editor.editingTextId) },
        });
        return true;
      },

      addElement(element, opts = {}) {
        const surfaceId = opts.surfaceId ?? get().editor.activeSurfaceId;
        return actions.execute(`Add ${describeElements([element], get().document)}`, (d) => cmd.addElement(d, surfaceId, element, opts.index), {
          surfaceId,
          ...(opts.select === false ? {} : { select: [element.id] }),
        });
      },

      addImage(asset, element, opts = {}) {
        const surfaceId = opts.surfaceId ?? get().editor.activeSurfaceId;
        return actions.execute('Add image', (d) => cmd.addElement(cmd.addAsset(d, asset), surfaceId, element), {
          surfaceId,
          ...(opts.select === false ? {} : { select: [element.id] }),
        });
      },

      updateElement(id, patch, opts = {}) {
        const [element] = elementsOf(get(), [id]);
        if (!element || (element.locked && !isAllowedOnLocked(patch))) return false;
        const surfaceId = get().editor.activeSurfaceId;
        return actions.execute(opts.label ?? `Edit ${describeElements([element], get().document)}`, (d) => cmd.updateElement(d, surfaceId, id, patch), mergeOptions(opts));
      },

      updateElements(ids, patch, opts = {}) {
        const targets = elementsOf(get(), ids).filter((e) => !e.locked || isAllowedOnLocked(patch));
        if (targets.length === 0) return false;
        const surfaceId = get().editor.activeSurfaceId;
        return actions.execute(
          opts.label ?? `Edit ${describeElements(targets, get().document)}`,
          (d) => targets.reduce((doc, e) => cmd.updateElement(doc, surfaceId, e.id, patch), d),
          mergeOptions(opts),
        );
      },

      moveElements(ids, dx, dy, opts = {}) {
        const targets = unlocked(get(), ids);
        if (targets.length === 0 || (dx === 0 && dy === 0)) return false;
        const surfaceId = get().editor.activeSurfaceId;
        return actions.execute(
          `Move ${describeElements(targets, get().document)}`,
          (d) => targets.reduce((doc, e) => cmd.updateElement(doc, surfaceId, e.id, { x: round2(e.x + dx), y: round2(e.y + dy) }), d),
          mergeOptions(opts),
        );
      },

      nudgeSelection(dx, dy) {
        return actions.moveElements(get().editor.selectedIds, dx, dy, { coalesceKey: 'nudge' });
      },

      removeElements(ids) {
        const targets = unlocked(get(), ids);
        if (targets.length === 0) return false;
        const surfaceId = get().editor.activeSurfaceId;
        return actions.execute(`Delete ${describeElements(targets, get().document)}`, (d) => cmd.removeElements(d, surfaceId, targets.map((e) => e.id)));
      },

      removeSelection() {
        return actions.removeElements(get().editor.selectedIds);
      },

      duplicateElements(ids, offsetPx) {
        const targets = elementsOf(get(), ids);
        if (targets.length === 0) return false;
        const surfaceId = get().editor.activeSurfaceId;
        const copies = targets.map((e) => [e.id, newId('el')] as const);
        return actions.execute(
          `Duplicate ${describeElements(targets, get().document)}`,
          (d) => copies.reduce((doc, [from, to]) => cmd.duplicateElement(doc, surfaceId, from, to, offsetPx), d),
          { select: copies.map(([, to]) => to) },
        );
      },

      duplicateSelection(offsetPx) {
        return actions.duplicateElements(get().editor.selectedIds, offsetPx);
      },

      arrangeElement(id, action) {
        const [element] = unlocked(get(), [id]);
        if (!element) return false;
        const surfaceId = get().editor.activeSurfaceId;
        const verb = { forward: 'Bring forward', backward: 'Send backward', front: 'Bring to front', back: 'Send to back' }[action];
        return actions.execute(`${verb} ${describeElements([element], get().document)}`, (d) => cmd.arrangeElement(d, surfaceId, id, action));
      },

      moveElementTo(id, index) {
        const [element] = unlocked(get(), [id]);
        if (!element) return false;
        const surfaceId = get().editor.activeSurfaceId;
        return actions.execute(`Reorder ${describeElements([element], get().document)}`, (d) => cmd.moveElementTo(d, surfaceId, id, index));
      },

      setLocked(ids, locked) {
        const targets = elementsOf(get(), ids);
        if (targets.length === 0) return false;
        return actions.updateElements(
          targets.map((e) => e.id),
          { locked },
          { label: `${locked ? 'Lock' : 'Unlock'} ${describeElements(targets, get().document)}` },
        );
      },

      setHidden(ids, hidden, opts = {}) {
        const targets = elementsOf(get(), ids);
        if (targets.length === 0) return false;
        const hiddenIds = new Set(targets.map((e) => e.id));
        const surfaceId = get().editor.activeSurfaceId;
        return actions.execute(
          `${hidden ? 'Hide' : 'Show'} ${describeElements(targets, get().document)}`,
          (d) => targets.reduce((doc, e) => cmd.updateElement(doc, surfaceId, e.id, { hidden }), d),
          // Hidden elements leave the selection.
          hidden && !opts.keepSelection ? { select: get().editor.selectedIds.filter((id) => !hiddenIds.has(id)) } : {},
        );
      },

      renameElement(id, name) {
        const clean = name?.replace(/\s+/g, ' ').trim().slice(0, 80) || null;
        return actions.updateElement(id, { name: clean }, { label: 'Rename layer' });
      },

      setBackground(color, opts = {}) {
        const surfaceId = opts.surfaceId ?? get().editor.activeSurfaceId;
        return actions.execute('Change background', (d) => cmd.setBackground(d, surfaceId, color), { surfaceId, ...mergeOptions(opts) });
      },

      copySurface(fromId, toId, mode) {
        const label = `Copy ${surface(get(), fromId)?.label ?? fromId} to ${surface(get(), toId)?.label ?? toId}`;
        return actions.execute(label, (d) => cmd.copySurface(d, fromId, toId, mode, () => newId('el')), { surfaceId: toId, select: [] });
      },

      clearSurface(surfaceId = get().editor.activeSurfaceId) {
        return actions.execute(`Clear ${surface(get(), surfaceId)?.label ?? surfaceId}`, (d) => cmd.clearSurface(d, surfaceId), { surfaceId, select: [] });
      },

      renameDesign(name) {
        return actions.execute('Rename design', (d) => cmd.renameDesign(d, name));
      },

      setVariant(variantId) {
        const state = get();
        const document = cmd.setVariant(state.document, variantId);
        if (document === state.document) return;
        set({ document, history: rebaseHistory(state.history, (d) => cmd.setVariant(d, variantId)), changeCount: state.changeCount + 1 });
      },

      replaceDocument(document, surfaceId) {
        const target = surfaceId && document.surfaces.some((s) => s.id === surfaceId) ? surfaceId : (document.surfaces[0]?.id ?? '');
        set((state) => ({
          document,
          history: emptyHistory,
          changeCount: state.changeCount + 1,
          editor: { activeSurfaceId: target, selectedIds: [], hoveredId: null, editingTextId: null },
        }));
      },

      relayoutText() {
        const measure = measurer();
        if (!measure) return false;
        const state = get();
        const document = relayoutDocument(state.document, measure);
        const history = rebaseHistory(state.history, (d) => relayoutDocument(d, measure));
        if (document === state.document && history === state.history) return false;
        set({ document, history, relayoutCount: state.relayoutCount + 1, ...(document === state.document ? {} : { changeCount: state.changeCount + 1 }) });
        return document !== state.document;
      },

      select(ids, mode = 'replace') {
        set((state) => {
          const onSurface = pruneSelection(ids, state.document, state.editor.activeSurfaceId);
          const selectedIds = nextSelection(state.editor.selectedIds, onSurface, mode);
          const editingTextId = selectedIds.length === 1 && selectedIds[0] === state.editor.editingTextId ? state.editor.editingTextId : null;
          return { history: sealLatest(state.history), editor: { ...state.editor, selectedIds, editingTextId } };
        });
      },

      selectAll() {
        const ids = surface(get())?.elements.filter(isPickable).map((e) => e.id) ?? [];
        actions.select(ids);
      },

      clearSelection() {
        actions.select([]);
      },

      setHovered(id) {
        set((state) => {
          const hoveredId = id && elementsOf(state, [id]).length ? id : null;
          return hoveredId === state.editor.hoveredId ? state : { editor: { ...state.editor, hoveredId } };
        });
      },

      setEditingText(id) {
        set((state) => {
          if (id === null) return { history: sealLatest(state.history), editor: { ...state.editor, editingTextId: null } };
          const [element] = elementsOf(state, [id]);
          if (!element || element.type !== 'text' || element.locked || element.hidden) return state;
          return { history: sealLatest(state.history), editor: { ...state.editor, selectedIds: [id], editingTextId: id } };
        });
      },

      setActiveSurface(surfaceId) {
        set((state) => {
          if (surfaceId === state.editor.activeSurfaceId || !surface(state, surfaceId)) return state;
          return { history: sealLatest(state.history), editor: { activeSurfaceId: surfaceId, selectedIds: [], hoveredId: null, editingTextId: null } };
        });
      },

      undo() {
        const state = get();
        const step = undoStep(state.history);
        if (!step) return false;
        set(restore(state, step.entry.before, step.history));
        return true;
      },

      redo() {
        const state = get();
        const step = redoStep(state.history);
        if (!step) return false;
        set(restore(state, step.entry.after, step.history));
        return true;
      },

      clearHistory() {
        set({ history: emptyHistory });
      },

      sealHistory() {
        set((state) => ({ history: sealLatest(state.history) }));
      },
    };

    const initialSurface = options.surfaceId && options.document.surfaces.some((s) => s.id === options.surfaceId) ? options.surfaceId : (options.document.surfaces[0]?.id ?? '');
    return {
      document: options.document,
      editor: { activeSurfaceId: initialSurface, selectedIds: [], hoveredId: null, editingTextId: null },
      history: emptyHistory,
      changeCount: 0,
      relayoutCount: 0,
      actions,
    };
  });
}
