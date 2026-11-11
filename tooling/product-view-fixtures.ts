import fs from 'node:fs';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

/**
 * Stand-in product photos and masks for development (served by local-media.ts under
 * /media/dev-fixtures/product-view/<slug>/<name>.png; see src/features/studio/product-view/dev-fixtures.ts).
 *
 * Drawn on request from the product's real Studio profile, so each stand-in has the real photo's
 * size, frame and placement: a plain neutral "product" (an umbrella dome, a garment, a bottle, a
 * pen barrel or a mug body) around the print box, with light shading so a colour tint shows its
 * depth, and orange-and-white stripes in the corner marking it as a stand-in. Masks are white over
 * the product. Deterministic, no recovered file is read, and nothing is written to disk.
 */

export const FIXTURE_PREFIX = 'dev-fixtures/product-view/';

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  radius: number;
  /** Upper half of an ellipse instead of a rounded box (umbrella canopy). */
  dome?: boolean;
}
interface Side {
  mockup: { ref: string; width: number; height: number; mask: { ref: string } | null } | null;
  placement?: { centerX: number; centerY: number; maxWidth: number; maxHeight: number } | null;
  photoFrame?: { crop: { x: number; y: number; width: number; height: number } | null; at: { x: number; y: number; width: number; height: number } } | null;
}

const BACKGROUND = [242, 241, 238];
const STRIPE = [240, 125, 40];
const SHAFT = [58, 61, 66];
const cache = new Map<string, Buffer | null>();

/** The stand-in for `ref`, or null when it isn't one (or the product has no such photo). */
export function productViewFixture(ref: string, studioDir: string): Buffer | null {
  if (cache.has(ref)) return cache.get(ref)!;
  const result = draw(ref, studioDir);
  cache.set(ref, result);
  return result;
}

function draw(ref: string, studioDir: string): Buffer | null {
  const match = /^dev-fixtures\/product-view\/([a-z0-9-]+)\/([a-z0-9][a-z0-9_-]*)\.png$/.exec(ref);
  if (!match) return null;
  const [, slug, name] = match;
  const file = path.join(studioDir, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  const profile = JSON.parse(fs.readFileSync(file, 'utf8')) as { productView?: string; sides: Side[] };
  const base = (r: string) =>
    r
      .split('/')
      .pop()!
      .replace(/\.(png|webp)$/i, '');
  const photoSides = profile.sides.filter((s) => s.mockup && base(s.mockup.ref) === name);
  const maskSides = profile.sides.filter((s) => s.mockup?.mask && base(s.mockup.mask.ref) === name);
  const sides = photoSides.length ? photoSides : maskSides;
  if (!sides.length || !profile.productView) return null;
  const { width, height } = sides[0]!.mockup!;
  const shapes = sides.flatMap((side) => shapesFor(profile.productView!, side));
  const mask = !photoSides.length;
  return png(width, height, (x, y) => {
    const on = shapes.find((s) => s.kind === 'body' && inside(s.box, x, y));
    if (mask) return on ? [255, 255, 255] : [0, 0, 0];
    if (x < 120 && y < 120) return Math.floor((x + y) / 20) % 2 ? STRIPE : [255, 255, 255];
    if (on) return shade(on.box, x, y);
    if (shapes.some((s) => s.kind === 'shaft' && inside(s.box, x, y))) return SHAFT;
    return BACKGROUND;
  });
}

/** The product's shapes in photo image px, from the side's print box (frame px) and frame. */
function shapesFor(kind: string, side: Side): { kind: 'body' | 'shaft'; box: Box }[] {
  const p = side.placement;
  const m = side.mockup;
  if (!p || !m) return [];
  const crop = side.photoFrame?.crop ?? { x: 0, y: 0, width: m.width, height: m.height };
  const at = side.photoFrame?.at ?? { x: 0, y: 0, width: m.width, height: m.height };
  const sx = crop.width / at.width;
  const sy = crop.height / at.height;
  const toImage = (b: Box): Box => ({
    x0: crop.x + (b.x0 - at.x) * sx,
    x1: crop.x + (b.x1 - at.x) * sx,
    y0: crop.y + (b.y0 - at.y) * sy,
    y1: crop.y + (b.y1 - at.y) * sy,
    radius: b.radius * sx,
    dome: b.dome,
  });
  const { centerX: cx, centerY: cy, maxWidth: w, maxHeight: h } = p;
  const around = (left: number, top: number, right: number, bottom: number, radius: number, dome = false): Box => ({
    x0: cx - w * left,
    y0: cy - h * top,
    x1: cx + w * right,
    y1: cy + h * bottom,
    radius,
    dome,
  });
  switch (kind) {
    case 'umbrella':
      return [
        { kind: 'body', box: toImage(around(2.6, 1.25, 2.6, 1.6, 0, true)) },
        { kind: 'shaft', box: toImage({ x0: cx - w * 0.03, x1: cx + w * 0.03, y0: cy + h * 0.6, y1: cy + h * 4.2, radius: 0 }) },
      ];
    case 'rainwear':
      return [{ kind: 'body', box: toImage(around(1.15, 1.3, 1.15, 2.3, w * 0.3)) }];
    case 'drinkware-wrap':
      return [{ kind: 'body', box: toImage(around(0.75, 1.9, 0.75, 1.6, w * 0.35)) }];
    case 'pen': {
      const frameWidth = at.width;
      return [{ kind: 'body', box: toImage({ x0: at.x + frameWidth * 0.04, x1: at.x + frameWidth * 0.96, y0: cy - h * 0.85, y1: cy + h * 0.85, radius: h * 0.85 }) }];
    }
    case 'mug':
      return [{ kind: 'body', box: toImage(around(0.62, 1.55, 0.62, 1.55, w * 0.06)) }];
    default:
      return [];
  }
}

function inside(b: Box, x: number, y: number): boolean {
  if (b.dome) {
    // The upper half of an ellipse whose centre is the bottom middle of the box.
    const rx = (b.x1 - b.x0) / 2;
    const ry = b.y1 - b.y0;
    const dx = (x - (b.x0 + rx)) / rx;
    const dy = (y - b.y1) / ry;
    return y <= b.y1 && dx * dx + dy * dy <= 1;
  }
  if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return false;
  const r = Math.min(b.radius, (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2);
  const nx = Math.max(b.x0 + r, Math.min(x, b.x1 - r));
  const ny = Math.max(b.y0 + r, Math.min(y, b.y1 - r));
  return (x - nx) ** 2 + (y - ny) ** 2 <= r * r;
}

/** A neutral grey with a soft top light and a vertical highlight, so tints keep visible depth. */
function shade(b: Box, x: number, y: number): number[] {
  const u = (x - b.x0) / Math.max(1, b.x1 - b.x0);
  const v = (y - b.y0) / Math.max(1, b.y1 - b.y0);
  const level = 150 + 30 * (1 - v) - 25 * Math.abs(u - 0.35) * 2 + 25 * Math.exp(-(((u - 0.3) / 0.06) ** 2));
  const g = Math.max(0, Math.min(255, Math.round(level)));
  return [g, g, g];
}

function png(width: number, height: number, pixel: (x: number, y: number) => number[]): Buffer {
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
