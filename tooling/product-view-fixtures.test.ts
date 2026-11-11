/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { productViewFixture } from './product-view-fixtures';

/**
 * The development stand-in photos the dev media server draws (corrective fix): the real photo's
 * size, the product drawn around the real print box, masks over the product, the stand-in stripes,
 * and nothing served for anything else.
 */

const STUDIO = path.resolve('public/api/v1/studio');

/** Decode our own RGB PNGs (8-bit, filter 0 on every row). */
function decode(png: Buffer) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  let offset = 8;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const at = (x: number, y: number) => [...raw.subarray(y * (width * 3 + 1) + 1 + x * 3, y * (width * 3 + 1) + 4 + x * 3)];
  return { width, height, at };
}

const grey = (p: number[]) => p[0] === p[1] && p[1] === p[2] && p[0]! > 60 && p[0]! < 230;

describe('stand-in photos', () => {
  it('a pen: the real photo’s size, the barrel under the print box, background off it, stripes in the corner', () => {
    const png = productViewFixture('dev-fixtures/product-view/pen-customized-basic/classic-front.png', STUDIO)!;
    const image = decode(png);
    expect([image.width, image.height]).toEqual([2120, 742]);
    // The print box centre (1160, 350) in the 2000 × 700 frame is (1229.6, 371) in the photo.
    expect(grey(image.at(1230, 371))).toBe(true);
    expect(image.at(1230, 40)).toEqual([242, 241, 238]);
    // Diagonal stripes, 20 px wide, alternating white and orange from the corner.
    expect(image.at(2, 2)).toEqual([255, 255, 255]);
    expect(image.at(12, 12)).toEqual([240, 125, 40]);
  });

  it('an umbrella and its mask: the canopy covers the print box; the mask is white exactly there', () => {
    const photo = decode(productViewFixture('dev-fixtures/product-view/umbrella-photo-custom/umbrella-photo-custom-front.png', STUDIO)!);
    const mask = decode(productViewFixture('dev-fixtures/product-view/umbrella-photo-custom/umbrella-photo-custom-front-mask.png', STUDIO)!);
    expect([photo.width, photo.height, mask.width, mask.height]).toEqual([1122, 1402, 1122, 1402]);
    const profile = JSON.parse(fs.readFileSync(path.join(STUDIO, 'umbrella-photo-custom.json'), 'utf8'));
    const { centerX, centerY } = profile.sides[0].placement;
    expect(grey(photo.at(centerX, centerY))).toBe(true);
    expect(mask.at(centerX, centerY)).toEqual([255, 255, 255]);
    expect(mask.at(5, 1395)).toEqual([0, 0, 0]);
  });

  it('a mug’s paired photo: a body on each half, around each side’s box', () => {
    const image = decode(productViewFixture('dev-fixtures/product-view/gift-mug-custom-black/custom-black.png', STUDIO)!);
    expect([image.width, image.height]).toEqual([1448, 1086]);
    expect(grey(image.at(450, 515))).toBe(true); // front: frame x 450 in the left half
    expect(grey(image.at(724 + (450 - 176), 515))).toBe(true); // back: frame x 450 in the right half
    expect(image.at(724, 515)).toEqual([242, 241, 238]); // between the bodies
  });

  it('serves nothing for other paths, unknown products or names, or traversal', () => {
    for (const ref of [
      'dev-fixtures/product-view/pen-customized-basic/nope.png',
      'dev-fixtures/product-view/no-such-product/x.png',
      'dev-fixtures/product-view/../../package.json',
      'dev-fixtures/product-view/pen-customized-basic/classic-front.webp',
      'products/pens-2d/classic-front.png',
      'dev-fixtures/product-view/business-card-classic/x.png',
    ]) {
      expect(productViewFixture(ref, STUDIO)).toBeNull();
    }
  });
});
