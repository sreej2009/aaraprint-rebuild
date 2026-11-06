import { createId } from '../ids';
import type { AssetRecord } from '../persistence/records';
import type { DesignAsset } from '../schema/types';

/**
 * Uploaded images (Plan M12): checking, decoding and preparing a file before it's stored.
 * Uploads are untrusted: the bytes decide the type (not the name or the browser's guess), only
 * JPEG, PNG and WebP are accepted (SVG stays with the rights-checked graphics library, M9), and
 * the image must really decode. Nothing here touches the DOM beyond an off-screen canvas.
 */

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type UploadMime = (typeof UPLOAD_MIME)[number];
/** The file picker's filter (also checked again after picking). */
export const UPLOAD_ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
/** Thumbnails for the Uploads panel: this many px on the long side. */
export const THUMBNAIL_SIZE = 240;

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

/** The image type from the file's first bytes — its real content. */
export function sniffImageType(bytes: Uint8Array): UploadMime | null {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** A readable name for lists and layers: no path, no control characters, at most 120 characters. */
export function displayName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return (clean || 'Image').slice(0, 120);
}

export interface DecodedImage {
  width: number;
  height: number;
  /** A small preview, or null where the browser can't make one. */
  thumbnail: Blob | null;
}

/** Decode in the browser with camera orientation applied (EXIF), and make a thumbnail. */
export async function decodeInBrowser(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap !== 'function') throw new UploadError('This browser can’t read images.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new UploadError('This file couldn’t be read as an image. It may be damaged.');
  }
  const { width, height } = bitmap;
  let thumbnail: Blob | null = null;
  try {
    const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
    thumbnail = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  } catch {
    thumbnail = null; // the list shows a plain image icon instead
  } finally {
    bitmap.close();
  }
  return { width, height, thumbnail };
}

export type UploadPhase = 'reading' | 'processing';

export interface PrepareOptions {
  decode?: (blob: Blob) => Promise<DecodedImage>;
  onPhase?: (phase: UploadPhase) => void;
  newId?: (prefix?: string) => string;
  now?: () => number;
}

/** Check, decode and describe an upload. Throws an UploadError with a message for the customer. */
export async function prepareUpload(file: File, options: PrepareOptions = {}): Promise<AssetRecord> {
  const decode = options.decode ?? decodeInBrowser;
  if (file.size === 0) throw new UploadError('This file is empty.');
  if (file.size > UPLOAD_MAX_BYTES) throw new UploadError('Image is too large. Maximum file size is 10 MB.');
  options.onPhase?.('reading');
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime = sniffImageType(head);
  if (!mime) {
    const svg = /svg/i.test(file.type) || /\.svg$/i.test(file.name);
    throw new UploadError(svg ? 'SVG files can’t be uploaded. Use a PNG, JPEG or WebP image.' : 'This file type isn’t supported. Use a PNG, JPEG or WebP image.');
  }
  const blob = file.type === mime ? file : new Blob([file], { type: mime });
  options.onPhase?.('processing');
  const decoded = await decode(blob);
  if (!(decoded.width > 0 && decoded.height > 0) || !Number.isFinite(decoded.width) || !Number.isFinite(decoded.height)) {
    throw new UploadError('This file couldn’t be read as an image. It may be damaged.');
  }
  return {
    assetId: (options.newId ?? createId)('asset'),
    name: displayName(file.name),
    mime,
    bytes: file.size,
    naturalWidth: Math.round(decoded.width),
    naturalHeight: Math.round(decoded.height),
    createdAt: (options.now ?? Date.now)(),
    blob,
    thumbnail: decoded.thumbnail,
  };
}

/** The design document's description of an upload (its `assets` map). Never the bytes. */
export function designAssetFor(asset: Pick<AssetRecord, 'assetId' | 'name' | 'mime' | 'bytes' | 'naturalWidth' | 'naturalHeight'>): DesignAsset {
  return {
    id: asset.assetId,
    kind: 'upload',
    name: asset.name,
    mime: asset.mime,
    bytes: asset.bytes,
    naturalWidth: asset.naturalWidth,
    naturalHeight: asset.naturalHeight,
    storage: { kind: 'local', blobId: asset.assetId },
  };
}

/** "2.4 MB", "640 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
