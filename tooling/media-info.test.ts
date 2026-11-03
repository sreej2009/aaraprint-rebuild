import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readGlbInfo, readImageInfo } from './media-info';

function bytes(...parts: (number[] | string)[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
}
const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n: number) => u32be(n).reverse();
const u16le = (n: number) => [n & 255, (n >>> 8) & 255];
const u24le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];

describe('readImageInfo', () => {
  it('reads PNG dimensions from IHDR', () => {
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32be(13), 'IHDR', u32be(1254), u32be(1402), [8, 6, 0, 0, 0]);
    expect(readImageInfo(png)).toEqual({ format: 'png', width: 1254, height: 1402 });
  });

  it('reads extended, lossless and lossy WebP', () => {
    const vp8x = bytes('RIFF', u32le(100), 'WEBP', 'VP8X', u32le(10), [0, 0, 0, 0], u24le(1121), u24le(1401));
    expect(readImageInfo(vp8x)).toEqual({ format: 'webp', width: 1122, height: 1402 });

    const bits = (800 - 1) | ((600 - 1) << 14);
    const vp8l = bytes('RIFF', u32le(100), 'WEBP', 'VP8L', u32le(10), [0x2f], u32le(bits), [0, 0, 0, 0, 0]);
    expect(readImageInfo(vp8l)).toEqual({ format: 'webp', width: 800, height: 600 });

    const vp8 = bytes('RIFF', u32le(100), 'WEBP', 'VP8 ', u32le(10), [0, 0, 0], [0x9d, 0x01, 0x2a], u16le(640), u16le(480));
    expect(readImageInfo(vp8)).toEqual({ format: 'webp', width: 640, height: 480 });
  });

  it('reads GIF dimensions and rejects other data', () => {
    expect(readImageInfo(bytes('GIF89a', u16le(32), u16le(16)))).toEqual({ format: 'gif', width: 32, height: 16 });
    expect(readImageInfo(bytes('not an image at all, just text'))).toBeNull();
    expect(readImageInfo(new Uint8Array())).toBeNull();
  });
});

describe('readGlbInfo', () => {
  it('reads the binary glTF header', () => {
    expect(readGlbInfo(bytes('glTF', u32le(2), u32le(649420)))).toEqual({ version: 2, byteLength: 649420 });
    expect(readGlbInfo(bytes('{"asset":{}}'))).toBeNull();
  });

  const polo = path.resolve('../recovered-additional/models/polo-shirt.glb');
  it.skipIf(!fs.existsSync(polo))('validates the recovered polo model', () => {
    const file = fs.readFileSync(polo);
    expect(readGlbInfo(new Uint8Array(file))).toEqual({ version: 2, byteLength: file.byteLength });
  });
});
