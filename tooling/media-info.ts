/**
 * Reads basic facts about media files from their headers, without an image library:
 * pixel size of PNG / WebP / GIF images and the header of binary glTF (GLB) models.
 * Used by the Studio profile builder (scripts/studio) and its tests.
 */

export interface ImageInfo {
  format: 'png' | 'webp' | 'gif';
  width: number;
  height: number;
}

export interface GlbInfo {
  version: number;
  byteLength: number;
}

export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  return readPng(bytes) ?? readWebp(bytes) ?? readGif(bytes);
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPng(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 24 || !PNG_SIGNATURE.every((b, i) => bytes[i] === b) || ascii(bytes, 12, 4) !== 'IHDR') return null;
  const dv = view(bytes);
  return { format: 'png', width: dv.getUint32(16), height: dv.getUint32(20) };
}

function readWebp(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const dv = view(bytes);
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X') {
    // 24-bit canvas width/height minus one, little endian.
    const width = 1 + (dv.getUint16(24, true) | ((bytes[26] ?? 0) << 16));
    const height = 1 + (dv.getUint16(27, true) | ((bytes[29] ?? 0) << 16));
    return { format: 'webp', width, height };
  }
  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) return null;
    const bits = dv.getUint32(21, true);
    return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') {
    // Key frame start code 9d 01 2a, then 14-bit width and height.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return { format: 'webp', width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
  }
  return null;
}

function readGif(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 10 || !/^GIF8[79]a$/.test(ascii(bytes, 0, 6))) return null;
  const dv = view(bytes);
  return { format: 'gif', width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
}

/** Binary glTF header: magic "glTF", version, total length (all little endian). */
export function readGlbInfo(bytes: Uint8Array): GlbInfo | null {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'glTF') return null;
  const dv = view(bytes);
  return { version: dv.getUint32(4, true), byteLength: dv.getUint32(8, true) };
}
