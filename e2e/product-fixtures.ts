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

/** A plain PNG: the photo colour, with a dark 100 × 100 px mark in its top-left corner. */
function fixturePhoto(): Buffer {
  const { width, height } = PHOTO;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) raw.set(x < 100 && y < 100 ? MARK_RGB : PHOTO_RGB, row + 1 + x * 3);
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
const PHOTO_PNG = fixturePhoto();

/** Serve `slug`'s real profile with its photos swapped for cleared stand-ins (placements untouched). */
export async function clearedStandIn(page: Page, slug = 'umbrella-golf', { photo = 'ok' as 'ok' | 'missing' } = {}) {
  await page.route(`**/api/v1/studio/${slug}.json`, async (route: Route) => {
    const response = await route.fetch();
    const profile = await response.json();
    for (const side of profile.sides) {
      if (side.mockup) side.mockup = { ...side.mockup, ref: `studio-fixtures/${slug}-${side.id}.png`, format: 'png', rights: 'cleared' };
    }
    await route.fulfill({ response, json: profile });
  });
  await page.route('**/media/studio-fixtures/**', (route) => (photo === 'ok' ? route.fulfill({ status: 200, contentType: 'image/png', body: PHOTO_PNG }) : route.fulfill({ status: 404, body: '' })));
}

/** Where the original places the artwork on a photo: fitted inside the box, centred. */
export function placed([cx, cy, w, h]: readonly number[], print = PRINT) {
  const scale = Math.min(w! / print.width, h! / print.height);
  return { x: cx! - (print.width * scale) / 2, y: cy! - (print.height * scale) / 2, width: print.width * scale, height: print.height * scale, scale };
}

export const near = (rgba: number[], rgb: number[]) => rgba[3] === 255 && rgb.every((c, i) => Math.abs(rgba[i]! - c) <= 3);
