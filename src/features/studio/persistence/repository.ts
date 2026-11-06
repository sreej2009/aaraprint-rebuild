import { ASSETS_STORE, DB_NAME, DB_VERSION, DESIGNS_STORE, StorageError, summarise, toStorageError, VERSIONS_STORE, type AssetRecord, type AssetSummary, type DesignRecord, type VersionRecord, type VersionSummary } from './records';

/**
 * Where designs are kept. One contract, two implementations: IndexedDB in the browser, and an
 * in-memory one for tests. Records come back exactly as stored — the caller validates documents
 * before using them (persistence/restore.ts).
 */
export interface DesignRepository {
  getDesign(designId: string): Promise<DesignRecord | null>;
  /** The most recently saved design for a product, if any. */
  latestForProduct(productSlug: string): Promise<DesignRecord | null>;
  /**
   * Write the design record if the stored one is still at `expectedRevision` (null: none yet).
   * Otherwise another tab saved in between: 'conflict', and nothing is written — unless `force`.
   */
  saveDesign(record: DesignRecord, options: { expectedRevision: number | null; force?: boolean }): Promise<'saved' | 'conflict'>;
  /** Newest first. */
  listVersions(designId: string): Promise<VersionSummary[]>;
  getVersion(versionId: string): Promise<VersionRecord | null>;
  /** Add a version and drop the oldest beyond `limit` (the newest is always kept). */
  addVersion(version: VersionRecord, limit: number): Promise<void>;

  /** Uploaded images on this device (M12). */
  putAsset(asset: AssetRecord): Promise<void>;
  getAsset(assetId: string): Promise<AssetRecord | null>;
  /** Newest first, without the original files. */
  listAssets(): Promise<AssetSummary[]>;
  deleteAsset(assetId: string): Promise<void>;
  /** Whether any saved design or version still uses the asset. */
  isAssetReferenced(assetId: string): Promise<boolean>;
}

/** A stored document mentions the asset (its `assets` map or an element's source). */
function mentionsAsset(document: unknown, assetId: string): boolean {
  if (!document || typeof document !== 'object') return false;
  const assets = (document as { assets?: Record<string, unknown> }).assets;
  if (assets && typeof assets === 'object' && assetId in assets) return true;
  return JSON.stringify(document).includes(`"assetId":${JSON.stringify(assetId)}`);
}

const assetSummary = ({ blob: _blob, ...summary }: AssetRecord): AssetSummary => summary;

const newestFirst = (a: { createdAt: number; versionId: string }, b: { createdAt: number; versionId: string }) => b.createdAt - a.createdAt || (b.versionId > a.versionId ? 1 : -1);

// ------------------------------------------------------------------- Memory

export interface MemoryRepository extends DesignRepository {
  designs: Map<string, DesignRecord>;
  versions: Map<string, VersionRecord>;
  assets: Map<string, AssetRecord>;
  /** Make the next writes fail (quota, blocked…) — tests. */
  failWrites(error: Error | null): void;
}

/** In-memory repository: tests, and a stand-in that never claims to persist anything. */
export function createMemoryRepository(): MemoryRepository {
  const designs = new Map<string, DesignRecord>();
  const versions = new Map<string, VersionRecord>();
  const assets = new Map<string, AssetRecord>();
  let failure: Error | null = null;
  const clone = <T>(value: T): T => structuredClone(value);
  // Blobs are immutable: copy the record, share the file.
  const cloneAsset = (a: AssetRecord): AssetRecord => ({ ...a });
  const writing = () => {
    if (failure) throw toStorageError(failure);
  };
  return {
    designs,
    versions,
    assets,
    failWrites(error) {
      failure = error;
    },
    async getDesign(designId) {
      const record = designs.get(designId);
      return record ? clone(record) : null;
    },
    async latestForProduct(productSlug) {
      const matching = [...designs.values()].filter((d) => d.productSlug === productSlug).sort((a, b) => b.updatedAt - a.updatedAt);
      return matching[0] ? clone(matching[0]) : null;
    },
    async saveDesign(record, { expectedRevision, force = false }) {
      writing();
      const stored = designs.get(record.designId);
      if (!force && (stored?.revision ?? null) !== expectedRevision) return 'conflict';
      designs.set(record.designId, clone(record));
      return 'saved';
    },
    async listVersions(designId) {
      return [...versions.values()].filter((v) => v.designId === designId).sort(newestFirst).map(summarise);
    },
    async getVersion(versionId) {
      const version = versions.get(versionId);
      return version ? clone(version) : null;
    },
    async addVersion(version, limit) {
      writing();
      versions.set(version.versionId, clone(version));
      const mine = [...versions.values()].filter((v) => v.designId === version.designId).sort(newestFirst);
      for (const old of mine.slice(Math.max(1, limit))) versions.delete(old.versionId);
    },
    async putAsset(asset) {
      writing();
      assets.set(asset.assetId, cloneAsset(asset));
    },
    async getAsset(assetId) {
      const asset = assets.get(assetId);
      return asset ? cloneAsset(asset) : null;
    },
    async listAssets() {
      return [...assets.values()].sort((a, b) => b.createdAt - a.createdAt).map(assetSummary);
    },
    async deleteAsset(assetId) {
      writing();
      assets.delete(assetId);
    },
    async isAssetReferenced(assetId) {
      return [...designs.values(), ...versions.values()].some((r) => mentionsAsset(r.document, assetId));
    },
  };
}

// ---------------------------------------------------------------- IndexedDB

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(toStorageError(req.error));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toStorageError(tx.error));
    tx.onabort = () => reject(toStorageError(tx.error ?? new Error('The save was interrupted.')));
  });
}

/** Open (and create or upgrade) the Studio database. */
export function openStudioDatabase(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let open: IDBOpenDBRequest;
    try {
      if (!factory) throw new StorageError('unavailable', 'This browser can’t store designs.');
      open = factory.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(toStorageError(error));
      return;
    }
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(DESIGNS_STORE)) {
        const designs = db.createObjectStore(DESIGNS_STORE, { keyPath: 'designId' });
        designs.createIndex('productSlug', 'productSlug');
        designs.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(VERSIONS_STORE)) {
        const versions = db.createObjectStore(VERSIONS_STORE, { keyPath: 'versionId' });
        versions.createIndex('designId', 'designId');
        versions.createIndex('createdAt', 'createdAt');
      }
      // Version 2 (M12): uploaded images. Designs and versions saved by version 1 stay as they are.
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        const assets = db.createObjectStore(ASSETS_STORE, { keyPath: 'assetId' });
        assets.createIndex('createdAt', 'createdAt');
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      // Another tab upgrading the database: step aside rather than block it.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    open.onerror = () => reject(toStorageError(open.error));
    open.onblocked = () => reject(new StorageError('unavailable', 'Another Studio tab is updating saved designs. Close other tabs and try again.'));
  });
}

/** The browser repository. The database opens on first use; a failed open is retried next time. */
export function createIdbRepository(factory?: IDBFactory): DesignRepository {
  let db: Promise<IDBDatabase> | null = null;
  const database = () => {
    db ??= openStudioDatabase(factory).catch((error: unknown) => {
      db = null;
      throw error;
    });
    return db;
  };

  return {
    async getDesign(designId) {
      const tx = (await database()).transaction(DESIGNS_STORE, 'readonly');
      return ((await request(tx.objectStore(DESIGNS_STORE).get(designId))) as DesignRecord | undefined) ?? null;
    },

    async latestForProduct(productSlug) {
      const tx = (await database()).transaction(DESIGNS_STORE, 'readonly');
      const all = (await request(tx.objectStore(DESIGNS_STORE).index('productSlug').getAll(productSlug))) as DesignRecord[];
      return all.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    },

    async saveDesign(record, { expectedRevision, force = false }) {
      const tx = (await database()).transaction(DESIGNS_STORE, 'readwrite');
      const store = tx.objectStore(DESIGNS_STORE);
      const finished = done(tx);
      // Read and write in one transaction, so no other tab can slip a save in between.
      const stored = (await request(store.get(record.designId))) as DesignRecord | undefined;
      if (!force && (stored?.revision ?? null) !== expectedRevision) {
        tx.abort();
        await finished.catch(() => {});
        return 'conflict';
      }
      store.put(record);
      await finished;
      return 'saved';
    },

    async listVersions(designId) {
      const tx = (await database()).transaction(VERSIONS_STORE, 'readonly');
      const all = (await request(tx.objectStore(VERSIONS_STORE).index('designId').getAll(designId))) as VersionRecord[];
      return all.sort(newestFirst).map(summarise);
    },

    async getVersion(versionId) {
      const tx = (await database()).transaction(VERSIONS_STORE, 'readonly');
      return ((await request(tx.objectStore(VERSIONS_STORE).get(versionId))) as VersionRecord | undefined) ?? null;
    },

    async addVersion(version, limit) {
      const tx = (await database()).transaction(VERSIONS_STORE, 'readwrite');
      const store = tx.objectStore(VERSIONS_STORE);
      const finished = done(tx);
      store.put(version);
      const keys = (await request(store.index('designId').getAll(version.designId))) as VersionRecord[];
      for (const old of keys.sort(newestFirst).slice(Math.max(1, limit))) store.delete(old.versionId);
      await finished;
    },

    async putAsset(asset) {
      const tx = (await database()).transaction(ASSETS_STORE, 'readwrite');
      const finished = done(tx);
      tx.objectStore(ASSETS_STORE).put(asset);
      await finished;
    },

    async getAsset(assetId) {
      const tx = (await database()).transaction(ASSETS_STORE, 'readonly');
      return ((await request(tx.objectStore(ASSETS_STORE).get(assetId))) as AssetRecord | undefined) ?? null;
    },

    async listAssets() {
      const tx = (await database()).transaction(ASSETS_STORE, 'readonly');
      const all = (await request(tx.objectStore(ASSETS_STORE).getAll())) as AssetRecord[];
      return all.sort((a, b) => b.createdAt - a.createdAt).map(assetSummary);
    },

    async deleteAsset(assetId) {
      const tx = (await database()).transaction(ASSETS_STORE, 'readwrite');
      const finished = done(tx);
      tx.objectStore(ASSETS_STORE).delete(assetId);
      await finished;
    },

    async isAssetReferenced(assetId) {
      const tx = (await database()).transaction([DESIGNS_STORE, VERSIONS_STORE], 'readonly');
      const [designs, versions] = await Promise.all([request(tx.objectStore(DESIGNS_STORE).getAll()), request(tx.objectStore(VERSIONS_STORE).getAll())]);
      return [...(designs as DesignRecord[]), ...(versions as VersionRecord[])].some((r) => mentionsAsset(r.document, assetId));
    },
  };
}

let shared: DesignRepository | null = null;

/** The repository the Studio uses in the browser. */
export function browserRepository(): DesignRepository {
  shared ??= createIdbRepository();
  return shared;
}
