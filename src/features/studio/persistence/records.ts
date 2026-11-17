/**
 * What the Studio keeps in this browser (Plan M11). Two kinds of record:
 * - a design record: the latest saved copy of one design (one per design id, many per product);
 * - version records: snapshots of a design the customer can go back to.
 *
 * Both hold the application design document (schema v2, `aaraprint.design`) as plain JSON —
 * never the Konva stage, images, editor state, selection, zoom or undo history. Storage versions
 * (the IndexedDB database version) and design schema versions are separate on purpose.
 */

export const DB_NAME = 'aaraprint-studio';
/** IndexedDB structure version — not the design schema version. 1: designs, versions (M11). 2: + assets (M12). */
export const DB_VERSION = 2;
export const DESIGNS_STORE = 'designs';
export const VERSIONS_STORE = 'versions';
export const ASSETS_STORE = 'assets';

/** Quiet time after the last edit before autosave writes (ms). */
export const AUTOSAVE_DELAY_MS = 1000;
/** An autosave keeps a version when the newest one is at least this old (ms). */
export const AUTOSAVE_VERSION_INTERVAL_MS = 10 * 60 * 1000;
/** Versions kept per design; the oldest go first. */
export const VERSION_LIMIT = 20;

export type VersionReason = 'initial' | 'manual' | 'autosave' | 'before-restore' | 'restored' | 'approved';

export const VERSION_LABELS: Record<VersionReason, string> = {
  initial: 'Initial save',
  manual: 'Manual save',
  autosave: 'Autosave',
  'before-restore': 'Before restore',
  restored: 'Restored version',
  approved: 'Approved',
};

/**
 * The customer's approval of a design (Phase 4 M5): "Approve and continue" in Review keeps the
 * approved content as a version (reason `approved`, never pruned) and records it here, on the
 * design record. Whether it is still current is derived, never stored: the design's fingerprint
 * must equal `fingerprint`. Any edit after approving makes it stale; undoing back makes it current.
 */
export interface DesignApproval {
  /** The `approved` version holding exactly what was approved (artwork and product choices). */
  versionId: string;
  /** Content fingerprint of the approved design. */
  fingerprint: string;
  /** ms since the epoch. */
  approvedAt: number;
  /** What is ordered with it, as approved. */
  variantId: string | null;
  sku: string | null;
  quantity: number;
}

/** A stored approval checked field by field (records are untrusted until read); null when absent or damaged. */
export function readApproval(value: unknown): DesignApproval | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 200;
  if (!text(a.versionId) || !text(a.fingerprint) || typeof a.approvedAt !== 'number' || !Number.isFinite(a.approvedAt)) return null;
  if (!(a.variantId === null || text(a.variantId)) || !(a.sku === null || text(a.sku))) return null;
  if (typeof a.quantity !== 'number' || !Number.isInteger(a.quantity) || a.quantity < 1) return null;
  return { versionId: a.versionId as string, fingerprint: a.fingerprint as string, approvedAt: a.approvedAt, variantId: a.variantId as string | null, sku: a.sku as string | null, quantity: a.quantity };
}

export interface DesignRecord {
  designId: string;
  productSlug: string;
  productId: string;
  variantId: string | null;
  name: string;
  /** Design schema version of `document`. */
  schemaVersion: number;
  /** ms since the epoch. */
  createdAt: number;
  updatedAt: number;
  /** Goes up on every save; a save based on an older revision is refused (another tab). */
  revision: number;
  /** Content fingerprint of `document` (dirty checks, version de-duplication). */
  fingerprint: string;
  currentVersionId: string | null;
  /** The design document as stored. Unknown until parsed and validated on restore. */
  document: unknown;
  /** The customer's approval (Phase 4 M5), if any; read it with `readApproval`. */
  approval?: unknown;
}

export interface VersionRecord {
  versionId: string;
  designId: string;
  createdAt: number;
  reason: VersionReason;
  schemaVersion: number;
  fingerprint: string;
  document: unknown;
  /** A small PNG data URL of the design as approved (`approved` versions only, Phase 4 M5). */
  thumbnail?: string | null;
}

/**
 * An uploaded image on this device (M12): the original file and a small thumbnail, with the facts
 * designs need. Designs refer to it by `assetId` (their `assets` map holds the same metadata and
 * `storage: { kind: 'local', blobId: assetId }`) — never the bytes themselves.
 */
export interface AssetRecord {
  assetId: string;
  /** Display name (the original file name, tidied). Never used as a key or a path. */
  name: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: number;
  /** As displayed (camera orientation applied). */
  naturalWidth: number;
  naturalHeight: number;
  createdAt: number;
  blob: Blob;
  /** About 240 px on the long side, for the Uploads panel. */
  thumbnail: Blob | null;
}

/** An asset without its file, for lists. */
export type AssetSummary = Omit<AssetRecord, 'blob'>;

/** A version without its document, for lists. */
export type VersionSummary = Omit<VersionRecord, 'document' | 'thumbnail'>;

export function summarise(version: VersionRecord): VersionSummary {
  const { document: _document, thumbnail: _thumbnail, ...summary } = version;
  return summary;
}

/** Approved versions are what the cart refers to: they are never pruned (Phase 4 M5). */
export const prunable = (version: Pick<VersionRecord, 'reason'>) => version.reason !== 'approved';

/** Storage isn't usable (private mode, disabled, blocked, quota…). The editor carries on in memory. */
export class StorageError extends Error {
  readonly kind: 'unavailable' | 'quota' | 'failed';
  constructor(kind: StorageError['kind'], message: string) {
    super(message);
    this.name = 'StorageError';
    this.kind = kind;
  }
}

export function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'QuotaExceededError') return new StorageError('quota', 'This browser is out of storage space for designs.');
  if (name === 'InvalidStateError' || name === 'SecurityError') return new StorageError('unavailable', 'This browser can’t store designs right now.');
  return new StorageError('failed', error instanceof Error ? error.message : 'Saving failed.');
}
