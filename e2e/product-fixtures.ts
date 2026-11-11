import type { Page, Route } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';

/**
 * Cleared stand-ins for the "On the product" tests (Phase 4 M1 Preview, M2 workspace). Every real
 * product photo's rights are unconfirmed, so customers never see one: these tests serve the real
 * profile (same size, same placements) with its photos swapped for a generated 1122 × 1402 PNG,
 * by the test only — never added to the catalogue or the build.
 */

/** The original's boxes for the golf umbrella photos: [centerX, centerY, maxWidth, maxHeight]. */
export const BOXES = { front: [563, 374, 170, 227], back: [559, 308, 182, 243] } as const;
/** The umbrella's print area. */
export const PRINT = { width: 1800, height: 2400 };
export const PHOTO = { width: 1122, height: 1402 };
export const PHOTO_RGB = [200, 214, 192];
export const MARK_RGB = [32, 32, 32];
export const INDIGO = [0x2f, 0x2a, 0x7a];

/** An RGB PNG of the photo's size, pixel by pixel. */
function png(pixel: (x: number, y: number) => number[]): Buffer {
  const { width, height } = PHOTO;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), row + 1 + x * 3);
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const isMark = (x: number, y: number) => x < 100 && y < 100;
/** A plain photo: the photo colour, with a dark 100 × 100 px mark in its top-left corner. */
const PHOTO_PNG = png((x, y) => (isMark(x, y) ? MARK_RGB : PHOTO_RGB));

/**
 * Colour (M3): a grey "fabric" band (x 150–971, y 120–759) in three shades — shadow, midtone (the
 * widest: the fabric's typical brightness, and where the print area sits) and highlight — on the
 * plain photo. The front mask covers the whole band; the back mask only its left part (x < 560).
 */
export const FABRIC = { x0: 150, x1: 971, y0: 120, y1: 759, backX1: 559 };
export const SHADES = { shadow: [70, 70, 70], mid: [140, 140, 140], highlight: [215, 215, 215] };
const inFabric = (x: number, y: number) => x >= FABRIC.x0 && x <= FABRIC.x1 && y >= FABRIC.y0 && y <= FABRIC.y1;
export const shadeAt = (x: number) => (x < 420 ? SHADES.shadow : x < 700 ? SHADES.mid : SHADES.highlight);
const FABRIC_PNG = png((x, y) => (isMark(x, y) ? MARK_RGB : inFabric(x, y) ? shadeAt(x) : PHOTO_RGB));
const MASK_PNG = { front: png((x, y) => (inFabric(x, y) ? [255, 255, 255] : [0, 0, 0])), back: png((x, y) => (inFabric(x, y) && x <= FABRIC.backX1 ? [255, 255, 255] : [0, 0, 0])) };

/**
 * Serve `slug`'s real profile with its photos swapped for cleared stand-ins (placements untouched).
 * `photo: 'fabric'` serves the fabric photo; `mask: 'cleared'` adds cleared stand-in masks (front and
 * back differ). Without it the real masks stay in the profile, with their real (unconfirmed) rights.
 */
export async function clearedStandIn(page: Page, slug = 'umbrella-golf', { photo = 'ok' as 'ok' | 'fabric' | 'missing', mask = 'real' as 'real' | 'cleared' } = {}) {
  await page.route(`**/api/v1/studio/${slug}.json`, async (route: Route) => {
    const response = await route.fetch();
    const profile = await response.json();
    for (const side of profile.sides) {
      if (!side.mockup) continue;
      side.mockup = { ...side.mockup, ref: `studio-fixtures/${slug}-${side.id}.png`, format: 'png', rights: 'cleared' };
      if (mask === 'cleared') side.mockup.mask = { ref: `studio-fixtures/${slug}-${side.id}-mask.png`, width: PHOTO.width, height: PHOTO.height, rights: 'cleared' };
    }
    await route.fulfill({ response, json: profile });
  });
  await page.route('**/media/studio-fixtures/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    const masked = /-(front|back)-mask\.png$/.exec(name);
    if (masked) return route.fulfill({ status: 200, contentType: 'image/png', body: MASK_PNG[masked[1] as 'front' | 'back'] });
    if (photo === 'missing') return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'image/png', body: photo === 'fabric' ? FABRIC_PNG : PHOTO_PNG });
  });
}

/** Where the original places the artwork on a photo: fitted inside the box, centred. */
export function placed([cx, cy, w, h]: readonly number[], print = PRINT) {
  const scale = Math.min(w! / print.width, h! / print.height);
  return { x: cx! - (print.width * scale) / 2, y: cy! - (print.height * scale) / 2, width: print.width * scale, height: print.height * scale, scale };
}

export const near = (rgba: number[], rgb: number[]) => rgba[3] === 255 && rgb.every((c, i) => Math.abs(rgba[i]! - c) <= 3);
