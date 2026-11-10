import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AssetRecord, AssetSummary } from '../persistence/records';
import type { DesignRepository } from '../persistence/repository';
import { referencedAssetIds } from '../schema/assets';
import type { DesignDocument } from '../schema/types';
import { requestImage, retryImage, useImage, type ImageState } from './image-cache';
import { prepareUpload, UploadError, type DecodedImage } from './uploads';

/**
 * Uploaded images at runtime (Plan M12). The files live in IndexedDB (persistence/repository);
 * here they become object URLs — one per asset, created when something first needs it, shared by
 * the canvas and the Uploads panel through the M9 image cache, and revoked when the asset is
 * removed. Nothing in this module is ever saved into a design.
 */

// ------------------------------------------------------------ Object URLs

/** The repository the open Studio uses. Canvas nodes render outside React's context, so it's shared here. */
let source: DesignRepository | null = null;

export function setAssetSource(repository: DesignRepository | null): void {
  if (source === repository) return;
  source = repository;
  // Look up afresh from the new source (and wake anything that asked before it was set).
  urls.forEach((state, id) => state.status !== 'ready' && urls.delete(id));
  notify();
}

type UrlState = { status: 'resolving' } | { status: 'ready'; url: string } | { status: 'missing' };
const urls = new Map<string, UrlState>();
const thumbs = new Map<string, string>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
const WAITING: UrlState = { status: 'resolving' };

let createUrl = (blob: Blob) => URL.createObjectURL(blob);
let revokeUrl = (url: string) => URL.revokeObjectURL(url);

function resolve(assetId: string): UrlState {
  const known = urls.get(assetId);
  if (known) return known;
  const repository = source;
  if (!repository) return WAITING; // not cached: asked again once the Studio sets its storage
  const resolving: UrlState = { status: 'resolving' };
  urls.set(assetId, resolving);
  void repository
    .getAsset(assetId)
    .then(
      (record) => (record ? ({ status: 'ready', url: createUrl(record.blob) } as const) : ({ status: 'missing' } as const)),
      () => ({ status: 'missing' }) as const,
    )
    .then((state) => {
      urls.set(assetId, state);
      notify();
    });
  return resolving;
}

/** The decoded image for an uploaded asset: 'missing' when this device doesn't have the file. */
export function useAssetImage(assetId: string | null): ImageState | { status: 'missing' } | null {
  const state = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (assetId ? resolve(assetId) : null),
    () => (assetId ? ({ status: 'resolving' } as UrlState) : null),
  );
  const image = useImage(state?.status === 'ready' ? state.url : null);
  if (!state) return null;
  if (state.status === 'missing') return { status: 'missing' };
  if (state.status === 'resolving') return { status: 'loading' };
  return image;
}

/** Whether an uploaded image is done loading — shown, missing or failed (the preview waits for this). */
export function assetSettled(assetId: string): boolean {
  const state = resolve(assetId);
  if (state.status === 'resolving') return false;
  if (state.status === 'missing') return true;
  return requestImage(state.url).status !== 'loading';
}

/** An uploaded image's file: drawn, missing (or failed to decode), or still loading (print checks). */
export function assetAvailability(assetId: string): 'available' | 'missing' | 'loading' {
  const state = resolve(assetId);
  if (state.status === 'resolving') return 'loading';
  if (state.status === 'missing') return 'missing';
  const image = requestImage(state.url).status;
  return image === 'loaded' ? 'available' : image === 'error' ? 'missing' : 'loading';
}

/** Called when an uploaded image's file is found or found missing. */
export function subscribeAssets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Look again (the file may be back, or the decode may have been a hiccup). */
export function retryAsset(assetId: string): void {
  const state = urls.get(assetId);
  if (state?.status === 'ready') {
    retryImage(state.url);
    return;
  }
  urls.delete(assetId);
  notify();
}

/** A thumbnail URL for the Uploads panel (created once per asset). */
export function thumbnailUrl(asset: Pick<AssetSummary, 'assetId' | 'thumbnail'>): string | null {
  if (!asset.thumbnail) return null;
  let url = thumbs.get(asset.assetId);
  if (!url) {
    url = createUrl(asset.thumbnail);
    thumbs.set(asset.assetId, url);
  }
  return url;
}

/** Forget an asset's URLs (it was removed from this device). */
export function releaseAsset(assetId: string): void {
  const state = urls.get(assetId);
  if (state?.status === 'ready') revokeUrl(state.url);
  urls.delete(assetId);
  const thumb = thumbs.get(assetId);
  if (thumb) revokeUrl(thumb);
  thumbs.delete(assetId);
  notify();
}

/** Tests: swap URL creation and clear everything. */
export function resetAssetUrlsForTests(fns: { create?: (blob: Blob) => string; revoke?: (url: string) => void } = {}): void {
  createUrl = fns.create ?? ((blob) => URL.createObjectURL(blob));
  revokeUrl = fns.revoke ?? ((url) => URL.revokeObjectURL(url));
  urls.clear();
  thumbs.clear();
  source = null;
}

// ---------------------------------------------------------------- Library

export type UploadPhaseState = 'idle' | 'reading' | 'processing' | 'saving';

export interface UploadLibraryState {
  items: AssetSummary[];
  loaded: boolean;
  phase: UploadPhaseState;
  /** The last problem, for the customer (an upload that failed, or a removal that wasn't allowed). */
  error: string | null;
  /** The last upload that finished (for announcements and focus). */
  lastAdded: AssetSummary | null;
}

export interface UploadLibrary {
  state: StoreApi<UploadLibraryState>;
  refresh(): Promise<void>;
  /** Store files in this device's uploads. Resolves with what was stored (failures set `error`). */
  upload(files: readonly File[]): Promise<AssetRecord[]>;
  /** Remove an upload — only when no design (open, saved or in a version) uses it. */
  remove(assetId: string, openDocument: DesignDocument): Promise<boolean>;
  dismissError(): void;
}

export interface UploadLibraryOptions {
  decode?: (blob: Blob) => Promise<DecodedImage>;
  newId?: (prefix?: string) => string;
  now?: () => number;
}

export function createUploadLibrary(repository: DesignRepository, options: UploadLibraryOptions = {}): UploadLibrary {
  const state = createStore<UploadLibraryState>()(() => ({ items: [], loaded: false, phase: 'idle', error: null, lastAdded: null }));

  const refresh = async () => {
    try {
      state.setState({ items: await repository.listAssets(), loaded: true });
    } catch {
      state.setState({ loaded: true });
    }
  };

  return {
    state,
    refresh,
    async upload(files) {
      const stored: AssetRecord[] = [];
      state.setState({ error: null });
      for (const file of files) {
        try {
          const record = await prepareUpload(file, { ...options, onPhase: (phase) => state.setState({ phase }) });
          state.setState({ phase: 'saving' });
          // Stored before anything can refer to it: a design never points at a file that isn't saved.
          await repository.putAsset(record);
          stored.push(record);
          const { blob: _blob, ...summary } = record;
          state.setState({ lastAdded: summary });
        } catch (error) {
          const message =
            error instanceof UploadError ? error.message : (error as { name?: string })?.name === 'QuotaExceededError' ? 'There’s no room left in this browser for more images.' : 'The image couldn’t be saved in this browser.';
          state.setState({ error: files.length > 1 ? `${file.name}: ${message}` : message });
        }
      }
      state.setState({ phase: 'idle' });
      await refresh();
      return stored;
    },
    async remove(assetId, openDocument) {
      const inOpenDesign = assetId in openDocument.assets || referencedAssetIds(openDocument).has(assetId);
      let inSaved = true;
      try {
        inSaved = await repository.isAssetReferenced(assetId);
      } catch {
        inSaved = true; // if we can't check, keep it
      }
      if (inOpenDesign || inSaved) {
        state.setState({ error: 'This image is used in a design (or one of its saved versions), so it stays in My uploads.' });
        return false;
      }
      try {
        await repository.deleteAsset(assetId);
      } catch {
        state.setState({ error: 'The image couldn’t be removed. Try again.' });
        return false;
      }
      releaseAsset(assetId);
      state.setState({ error: null });
      await refresh();
      return true;
    },
    dismissError() {
      state.setState({ error: null });
    },
  };
}

export const UploadLibraryContext = createContext<UploadLibrary | null>(null);

export function useUploadLibrary(): UploadLibrary | null {
  return useContext(UploadLibraryContext);
}

/** Load the list once the panel shows. */
export function useUploadList(library: UploadLibrary | null): void {
  useEffect(() => {
    if (library && !library.state.getState().loaded) void library.refresh();
  }, [library]);
}
