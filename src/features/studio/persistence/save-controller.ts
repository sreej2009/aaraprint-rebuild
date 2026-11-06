import { createStore, type StoreApi } from 'zustand/vanilla';
import { createId } from '../ids';
import type { DesignDocument } from '../schema/types';
import { parseDesign, validateDesign } from '../schema/validate';
import type { StudioStore } from '../store';
import { designFingerprint, toStoredDocument } from './fingerprint';
import {
  AUTOSAVE_DELAY_MS,
  AUTOSAVE_VERSION_INTERVAL_MS,
  StorageError,
  toStorageError,
  VERSION_LIMIT,
  type DesignRecord,
  type VersionReason,
  type VersionRecord,
  type VersionSummary,
} from './records';
import type { DesignRepository } from './repository';

/**
 * Saving a design in this browser (Plan M11). The Studio store stays the only source of truth:
 * the controller watches its document and writes copies — it never edits the design, the
 * selection, the side, the view or the undo history (only restoring a version is an edit, and
 * it's one undo step).
 *
 * - Autosave writes 1 s after the last change. Gestures and typing already merge into single
 *   document updates as they finish, and the timer restarts with each, so a drag is one write.
 * - Dirty state compares content (a fingerprint), not history length: undoing back to what was
 *   saved is "saved" again.
 * - Writes in this tab run one at a time, newest content last; every write carries the revision it
 *   was based on, so a stale tab can't overwrite a newer save ('conflict').
 * - Versions are snapshots for going back later: the first save, each manual save that changed
 *   something, an autosave when the newest version is 10 minutes old, and around restores.
 */

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict' | 'sample';

export interface SaveState {
  status: SaveStatus;
  /** ms since the epoch of the last successful write. */
  lastSavedAt: number | null;
  /** What went wrong (error / conflict), in customer words. */
  message: string | null;
  /** This design has been written at least once (it has a record, and an id in the URL). */
  persisted: boolean;
  versions: VersionSummary[];
  /** Fingerprint of what's saved, to mark the matching version as current. */
  savedFingerprint: string | null;
}

export interface SaveController {
  state: StoreApi<SaveState>;
  /** Write now (Save button, Ctrl S). Resolves when done; never throws. */
  saveNow(): Promise<void>;
  /** Overwrite a newer save from another tab with this one. */
  saveAnyway(): Promise<void>;
  /** Replace the design with a version (one undo step), keeping a safety copy first. */
  restoreVersion(versionId: string): Promise<boolean>;
  refreshVersions(): Promise<void>;
  /** Pending changes written as soon as possible (leaving the page, closing the Studio). */
  flush(): Promise<void>;
  /** Start watching the design (and the page closing). Safe to call again after `stop`. */
  start(): () => void;
  /** Stop watching; anything still waiting is written first. */
  stop(): void;
  /** Same as `stop`. */
  dispose(): void;
}

export interface SaveControllerOptions {
  studio: StudioStore;
  repository: DesignRepository;
  productSlug: string;
  productId: string;
  /** The record this design was restored from, if any. */
  record?: Pick<DesignRecord, 'revision' | 'fingerprint' | 'createdAt' | 'updatedAt' | 'currentVersionId'> | null;
  /** Sample designs (`?sample=1`) aren't saved until the customer saves one on purpose. */
  sample?: boolean;
  /** An error from opening storage: start in the error state. */
  storageError?: string;
  delayMs?: number;
  versionIntervalMs?: number;
  versionLimit?: number;
  clock?: () => number;
  newId?: (prefix?: string) => string;
}

const UNSAVED_MESSAGE = 'Unable to save locally. Your changes are still in this session.';

export function createSaveController(options: SaveControllerOptions): SaveController {
  const { studio, repository, productSlug, productId } = options;
  const clock = options.clock ?? (() => Date.now());
  const newId = options.newId ?? createId;
  const delay = options.delayMs ?? AUTOSAVE_DELAY_MS;
  const versionInterval = options.versionIntervalMs ?? AUTOSAVE_VERSION_INTERVAL_MS;
  const versionLimit = options.versionLimit ?? VERSION_LIMIT;

  let sample = options.sample ?? false;
  let revision: number | null = options.record?.revision ?? null;
  let createdAt = options.record?.createdAt ?? clock();
  let currentVersionId = options.record?.currentVersionId ?? null;
  let savedFingerprint: string | null = options.record?.fingerprint ?? null;
  // The restored design may already differ from what was saved (options changed on the product page).
  const startsSaved = Boolean(options.record) && designFingerprint(studio.getState().document) === savedFingerprint;
  let savedDocument: DesignDocument | null = startsSaved ? studio.getState().document : null;
  let newestVersion: { fingerprint: string; at: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;
  let again = false;
  let disposed = false;

  const state = createStore<SaveState>()(() => ({
    status: sample ? 'sample' : options.storageError ? 'error' : options.record ? (startsSaved ? 'saved' : 'dirty') : 'idle',
    lastSavedAt: options.record?.updatedAt ?? null,
    message: options.storageError ? UNSAVED_MESSAGE : null,
    persisted: Boolean(options.record),
    versions: [],
    savedFingerprint,
  }));
  const set = (partial: Partial<SaveState>) => {
    if (!disposed) state.setState(partial);
  };

  const isSaved = (document: DesignDocument) => document === savedDocument || (savedFingerprint !== null && designFingerprint(document) === savedFingerprint);

  // ----------------------------------------------------------- Versions

  const refreshVersions = async () => {
    try {
      const versions = await repository.listVersions(studio.getState().document.id);
      const [newest] = versions;
      newestVersion = newest ? { fingerprint: newest.fingerprint, at: newest.createdAt } : null;
      set({ versions });
    } catch {
      /* the list stays as it was; saving reports storage problems */
    }
  };

  const addVersion = async (document: DesignDocument, fingerprint: string, reason: VersionReason, meta: DesignDocument['meta']) => {
    const version: VersionRecord = {
      versionId: newId('version'),
      designId: document.id,
      createdAt: clock(),
      reason,
      schemaVersion: document.schemaVersion,
      fingerprint,
      document: toStoredDocument(document, meta),
    };
    await repository.addVersion(version, versionLimit);
    newestVersion = { fingerprint, at: version.createdAt };
    currentVersionId = version.versionId;
    return version;
  };

  /** Which version (if any) a successful write keeps. */
  const versionFor = (reason: 'manual' | 'autosave' | 'restored', fingerprint: string): VersionReason | null => {
    if (newestVersion?.fingerprint === fingerprint) return null; // nothing new since the last one
    if (!newestVersion) return reason === 'autosave' ? 'initial' : reason;
    if (reason === 'autosave') return clock() - newestVersion.at >= versionInterval ? 'autosave' : null;
    return reason;
  };

  // -------------------------------------------------------------- Writing

  const write = async (reason: 'manual' | 'autosave' | 'restored', force = false): Promise<void> => {
    const document = studio.getState().document;
    const fingerprint = designFingerprint(document);
    const issues = validateDesign(document);
    if (issues.length > 0) {
      // Never store a design the Studio itself couldn't open again.
      set({ status: 'error', message: 'This design couldn’t be checked, so it wasn’t saved. Your changes are still in this session.' });
      return;
    }
    const unchanged = fingerprint === savedFingerprint && revision !== null;
    const keep = versionFor(reason, fingerprint);
    if (unchanged && !keep && !force) {
      savedDocument = document;
      set({ status: 'saved', message: null });
      return;
    }
    set({ status: 'saving', message: null });
    const now = clock();
    const meta = { createdAt: new Date(createdAt).toISOString(), updatedAt: new Date(now).toISOString(), revision: (revision ?? 0) + 1 };
    try {
      let versionId = currentVersionId;
      if (keep) versionId = (await addVersion(document, fingerprint, keep, meta)).versionId;
      const record: DesignRecord = {
        designId: document.id,
        productSlug,
        productId,
        variantId: document.product.variantId,
        name: document.name,
        schemaVersion: document.schemaVersion,
        createdAt,
        updatedAt: now,
        revision: meta.revision,
        fingerprint,
        currentVersionId: versionId,
        document: toStoredDocument(document, meta),
      };
      const result = await repository.saveDesign(record, { expectedRevision: revision, force });
      if (result === 'conflict') {
        set({ status: 'conflict', message: 'This design was saved in another tab after you opened it. Saving here would replace that.' });
        return;
      }
      revision = record.revision;
      savedDocument = document;
      savedFingerprint = fingerprint;
      set({ lastSavedAt: now, persisted: true, savedFingerprint: fingerprint, message: null, status: isSaved(studio.getState().document) ? 'saved' : 'dirty' });
      if (keep) void refreshVersions();
    } catch (error) {
      const storage = error instanceof StorageError ? error : toStorageError(error);
      set({ status: 'error', message: storage.kind === 'quota' ? `${storage.message} Your changes are still in this session.` : UNSAVED_MESSAGE });
    }
  };

  /** One write at a time; a request while one runs queues one more with the newest content. */
  const run = (reason: 'manual' | 'autosave' | 'restored', force = false): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (running) {
      again = true;
      return running.then(() => (again ? run(reason, force) : undefined));
    }
    again = false;
    running = write(reason, force).finally(() => {
      running = null;
    });
    return running;
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void run('autosave');
    }, delay);
  };

  // --------------------------------------------------------------- Watching

  const onChange = (next: { document: DesignDocument }, prev: { document: DesignDocument }) => {
    if (next.document === prev.document || disposed) return;
    if (sample) return; // a sample is saved only on purpose
    if (isSavedQuick(next.document)) {
      clearTimeout(timer);
      if (state.getState().status === 'dirty') set({ status: 'saved' });
      return;
    }
    if (state.getState().status !== 'error' && state.getState().status !== 'conflict') set({ status: 'dirty' });
    schedule();
  };
  // Undo back to the saved document object is "saved" without hashing anything.
  const isSavedQuick = (document: DesignDocument) => document === savedDocument;

  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  const onPageHide = () => void flush();
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    // Only when changes really can't be kept: saving failed or another tab saved over them.
    const { status } = state.getState();
    if ((status === 'error' || status === 'conflict') && !isSaved(studio.getState().document)) event.preventDefault();
  };
  let unsubscribe: (() => void) | null = null;
  const start = () => {
    if (!unsubscribe) {
      disposed = false;
      unsubscribe = studio.subscribe(onChange);
      if (typeof window !== 'undefined') {
        window.addEventListener('pagehide', onPageHide);
        window.addEventListener('beforeunload', onBeforeUnload);
        document.addEventListener('visibilitychange', onHide);
      }
      void refreshVersions();
      if (options.record && !startsSaved && !sample && !isSaved(studio.getState().document)) schedule();
    }
    return stop;
  };
  const stop = () => {
    if (!unsubscribe) return;
    // Keep anything still waiting before going.
    if (timer && !sample) void run('autosave');
    clearTimeout(timer);
    disposed = true;
    unsubscribe();
    unsubscribe = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onHide);
    }
  };

  const flush = async () => {
    if (sample || disposed) return;
    if (timer || state.getState().status === 'dirty') await run('autosave');
    else if (running) await running;
  };

  return {
    state,
    async saveNow() {
      sample = false; // saving a sample on purpose makes it a design of its own
      await run('manual');
    },
    async saveAnyway() {
      await run('manual', true);
    },
    refreshVersions,
    flush,

    async restoreVersion(versionId) {
      let version: VersionRecord | null;
      try {
        version = await repository.getVersion(versionId);
      } catch {
        set({ status: 'error', message: UNSAVED_MESSAGE });
        return false;
      }
      const current = studio.getState().document;
      if (!version || version.designId !== current.id) return false;
      const parsed = parseDesign(version.document);
      if (!parsed.ok) {
        set({ status: 'error', message: 'That version can’t be opened: its saved data is damaged.' });
        return false;
      }
      // A safety copy of what's here now, unless the newest version already is exactly that.
      const currentFingerprint = designFingerprint(current);
      try {
        if (newestVersion?.fingerprint !== currentFingerprint && validateDesign(current).length === 0) {
          await addVersion(current, currentFingerprint, 'before-restore', current.meta);
        }
      } catch {
        set({ status: 'error', message: UNSAVED_MESSAGE });
        return false;
      }
      const { actions } = studio.getState();
      actions.setEditingText(null);
      const restored: DesignDocument = { ...parsed.document, id: current.id, product: current.product, meta: current.meta };
      const when = new Date(version.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      const surfaceId = restored.surfaces.some((s) => s.id === studio.getState().editor.activeSurfaceId) ? studio.getState().editor.activeSurfaceId : (restored.surfaces[0]?.id ?? '');
      actions.execute(`Restore version from ${when}`, () => restored, { surfaceId, select: [] });
      await run('restored');
      await refreshVersions();
      return true;
    },

    start,
    stop,
    dispose: stop,
  };
}
