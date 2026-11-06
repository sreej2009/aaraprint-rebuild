import { DB_NAME, DB_VERSION, DESIGNS_STORE, StorageError, summarise, toStorageError, VERSIONS_STORE, type DesignRecord, type VersionRecord, type VersionSummary } from './records';

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
}

const newestFirst = (a: { createdAt: number; versionId: string }, b: { createdAt: number; versionId: string }) => b.createdAt - a.createdAt || (b.versionId > a.versionId ? 1 : -1);

// ------------------------------------------------------------------- Memory

export interface MemoryRepository extends DesignRepository {
  designs: Map<string, DesignRecord>;
  versions: Map<string, VersionRecord>;
  /** Make the next writes fail (quota, blocked…) — tests. */
  failWrites(error: Error | null): void;
}

/** In-memory repository: tests, and a stand-in that never claims to persist anything. */
export function createMemoryRepository(): MemoryRepository {
  const designs = new Map<string, DesignRecord>();
  const versions = new Map<string, VersionRecord>();
  let failure: Error | null = null;
  const clone = <T>(value: T): T => structuredClone(value);
  const writing = () => {
    if (failure) throw toStorageError(failure);
  };
  return {
    designs,
    versions,
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
  };
}

let shared: DesignRepository | null = null;

/** The repository the Studio uses in the browser. */
export function browserRepository(): DesignRepository {
  shared ??= createIdbRepository();
  return shared;
}
