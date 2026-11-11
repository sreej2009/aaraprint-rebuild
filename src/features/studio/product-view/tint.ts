/**
 * Recolouring a product photo with its fabric mask (Phase 4 M3), pure and canvas-free.
 *
 * The model follows the original Studio's "natural tint" (read as text, not copied):
 *   1. The fabric is where the mask is white (red × alpha ≥ 128) and the photo isn't transparent.
 *      Its edges are softened with 5 × 5 binomial weights, so the colour fades in over a pixel or
 *      two instead of a hard step. Everything else is left exactly as it was.
 *   2. The fabric's brightness is measured (65th and 99th percentiles of luminance) and smoothed
 *      with an edge-preserving filter (7 taps across, then down, staying on the fabric).
 *   3. Each fabric pixel becomes the chosen colour × a shade factor from its smoothed brightness
 *      relative to the fabric's typical brightness, plus its fine detail (pixel − smoothed), with
 *      the brightest highlights blending towards white. So folds, shadows, seams and texture stay;
 *      a pixel at the typical brightness becomes the chosen colour exactly ("matte" finish).
 *   4. Light photos (typical brightness over 0.7, e.g. white or yellow fabric) get more relief, so
 *      their faint shading still reads once darkened.
 * The original also tidied mask noise and redrew a "frame" of the photo over the artwork; neither
 * is used here (the masks are clean black and white, and the artwork stays on top).
 */

/** RGBA pixels, like ImageData. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface TintStats {
  /** 65th percentile of the fabric's luminance (0–1). */
  base: number;
  /** 99th percentile. */
  p99: number;
}

/** Everything about a photo + mask that doesn't depend on the colour: computed once, reused per colour. */
export interface TintSource {
  width: number;
  height: number;
  /** 0–1 per pixel: how much of the tint it takes (0 off the fabric). */
  coverage: Float32Array;
  /** Edge-preserving smoothed luminance (0–1) per pixel. */
  smooth: Float32Array;
  stats: TintStats | null;
  /** The fabric's box (inclusive), or null when the mask has no fabric. */
  bounds: { x0: number; y0: number; x1: number; y1: number } | null;
}

export interface TintParams {
  rgb: [number, number, number];
  shade: Float32Array;
  white: Float32Array;
}

const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);
export const luminance = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const BINOMIAL = [1, 4, 6, 4, 1];
const SPATIAL = Array.from({ length: 7 }, (_, i) => Math.exp(-((i - 3) ** 2) / 8));
const RANGE = Float32Array.from({ length: 256 }, (_, d) => Math.exp(-((d / 255) ** 2) / 0.0072));

/** True where the mask marks fabric: white (red ≥ 128 once its own transparency is applied). */
export function isFabric(mask: Pixels, index: number): boolean {
  return (mask.data[index * 4]! * mask.data[index * 4 + 3]!) / 255 >= 128;
}

function percentile(histogram: Uint32Array, count: number, q: number): number {
  let sum = 0;
  for (let bin = 0; bin < 256; bin++) {
    sum += histogram[bin]!;
    if (sum >= count * q) return bin / 255;
  }
  return 1;
}

/** Prepare a photo and its mask (same size) for tinting in any colour. */
export function prepareTintSource(photo: Pixels, mask: Pixels): TintSource {
  const { width, height, data } = photo;
  if (mask.width !== width || mask.height !== height) throw new Error('The mask must be the size of the photo.');
  const total = width * height;
  const fabric = new Uint8Array(total);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (data[i * 4 + 3]! < 24 || !isFabric(mask, i)) continue;
      fabric[i] = 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const coverage = new Float32Array(total);
  const smooth = new Float32Array(total);
  const lum8 = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    lum8[i] = Math.round(255 * luminance(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!));
    smooth[i] = lum8[i]! / 255;
  }
  if (x1 < 0) return { width, height, coverage, smooth, stats: null, bounds: null };

  // Coverage: 1 inside, 0 outside, binomial-weighted near the edge (one pixel of feathering each way).
  const ex0 = Math.max(0, x0 - 2);
  const ey0 = Math.max(0, y0 - 2);
  const ex1 = Math.min(width - 1, x1 + 2);
  const ey1 = Math.min(height - 1, y1 + 2);
  for (let y = ey0; y <= ey1; y++) {
    for (let x = ex0; x <= ex1; x++) {
      let on = 0;
      let all = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const w = BINOMIAL[dx + 2]! * BINOMIAL[dy + 2]!;
          all += w;
          if (fabric[yy * width + xx]) on += w;
        }
      }
      const i = y * width + x;
      coverage[i] = data[i * 4 + 3] === 0 ? 0 : on / all;
    }
  }

  // Brightness statistics over the fabric (well-opaque pixels when there are enough of them).
  const opaque = new Uint32Array(256);
  const any = new Uint32Array(256);
  let opaqueCount = 0;
  let anyCount = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * width + x;
      const alpha = data[i * 4 + 3]!;
      if (!fabric[i] || alpha < 48) continue;
      any[lum8[i]!]!++;
      anyCount++;
      if (alpha >= 200) {
        opaque[lum8[i]!]!++;
        opaqueCount++;
      }
    }
  }
  const useOpaque = opaqueCount >= 40;
  const count = useOpaque ? opaqueCount : anyCount;
  const histogram = useOpaque ? opaque : any;
  const stats = count >= 40 ? { base: percentile(histogram, count, 0.65), p99: percentile(histogram, count, 0.99) } : null;

  // Edge-preserving smoothing on the fabric: 7 taps across, then 7 down.
  const across = new Float32Array(total);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * width + x;
      if (!fabric[i]) continue;
      const centre = lum8[i]!;
      let sum = 0;
      let weight = 0;
      for (let k = -3; k <= 3; k++) {
        const xx = x + k;
        if (xx < x0 || xx > x1 || !fabric[i + k]) continue;
        const value = lum8[i + k]!;
        const w = SPATIAL[k + 3]! * RANGE[Math.abs(value - centre)]!;
        sum += w * value;
        weight += w;
      }
      across[i] = sum / weight;
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * width + x;
      if (!fabric[i]) continue;
      const centre = across[i]!;
      let sum = 0;
      let weight = 0;
      for (let k = -3; k <= 3; k++) {
        const yy = y + k;
        const j = i + k * width;
        if (yy < y0 || yy > y1 || !fabric[j]) continue;
        const value = across[j]!;
        const w = SPATIAL[k + 3]! * RANGE[Math.min(255, Math.round(Math.abs(value - centre)))]!;
        sum += w * value;
        weight += w;
      }
      smooth[i] = sum / weight / 255;
    }
  }
  return { width, height, coverage, smooth, stats, bounds: { x0: ex0, y0: ey0, x1: ex1, y1: ey1 } };
}

/** The shading curves for one colour on one photo (the original's "matte" finish). */
export function tintParams(rgb: [number, number, number], stats: TintStats | null): TintParams {
  const base = Math.max(0.04, stats?.base ?? 0.5);
  const p99 = stats?.p99 ?? base;
  const relief = base > 0.7 ? 2.6 : 1;
  const lift = 0.02 + 0.06 * clamp((0.45 - base) / 0.35, 0, 1);
  // Above `start`, highlights blend towards white (only the very brightest on matte fabric).
  let start: number;
  let amount: number;
  let curve: number;
  if (base < 0.3) {
    start = Math.max(base + 0.35, 0.5);
    amount = 1;
    curve = 1;
  } else {
    start = Math.max(p99, base + 0.6 * (1 - base));
    amount = 0.15;
    curve = 1.5;
  }
  start = Math.min(start, 0.985);
  const gamma = (0.5 + 0.5 * clamp((base - 0.1) / 0.35, 0, 1)) * relief;
  const shade = new Float32Array(1024);
  const white = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const level = i / 1023;
    const ratio = (level + lift) / (base + lift);
    shade[i] = ratio <= 1 ? Math.pow(ratio, gamma) : 1 + Math.min(ratio - 1, 0.6) * 0.35;
    white[i] = Math.pow(clamp((level - start) / (1 - start), 0, 1), curve) * amount;
  }
  return { rgb, shade, white };
}

/** One fabric pixel in the new colour: colour × shade + detail, highlights towards white. */
export function tintPixel(params: TintParams, r: number, g: number, b: number, smoothLum: number, out: number[]): void {
  const lum = luminance(r, g, b);
  const shade = params.shade[Math.min(1023, Math.max(0, Math.round(1023 * smoothLum)))]!;
  const detail = (lum - smoothLum) * 255;
  const white = params.white[Math.min(1023, Math.max(0, Math.round(1023 * lum)))]!;
  for (let c = 0; c < 3; c++) out[c] = clamp(params.rgb[c]! * shade + detail, 0, 255) * (1 - white) + 255 * white;
}

export function hexToRgb(hex: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Not a colour: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** A tinted copy of the photo's pixels: fabric recoloured, everything else (and all alpha) unchanged. */
export function applyTint(photo: Pixels, source: TintSource, hex: string): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(photo.data.length);
  out.set(photo.data);
  if (!source.bounds) return out;
  const params = tintParams(hexToRgb(hex), source.stats);
  const { x0, y0, x1, y1 } = source.bounds;
  const tinted = [0, 0, 0];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * photo.width + x;
      const amount = source.coverage[i]!;
      if (amount <= 0) continue;
      const k = i * 4;
      const r = out[k]!;
      const g = out[k + 1]!;
      const b = out[k + 2]!;
      tintPixel(params, r, g, b, source.smooth[i]!, tinted);
      out[k] = r + (tinted[0]! - r) * amount;
      out[k + 1] = g + (tinted[1]! - g) * amount;
      out[k + 2] = b + (tinted[2]! - b) * amount;
    }
  }
  return out;
}
