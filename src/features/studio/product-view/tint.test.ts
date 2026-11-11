import { describe, expect, it } from 'vitest';
import { applyTint, hexToRgb, isFabric, luminance, prepareTintSource, tintParams, tintPixel, type Pixels } from './tint';

/**
 * The masked tint (Phase 4 M3) on small, exact fixtures: what changes (the fabric), what doesn't
 * (everything else, all alpha), how edges blend, and that shading survives the new colour.
 */

type RGBA = [number, number, number, number];

function image(width: number, height: number, pixel: (x: number, y: number) => RGBA): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { data, width, height };
}
const at = (p: Pixels | { data: Uint8ClampedArray; width: number }, x: number, y: number) => [...p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)];

const W = 30;
const H = 20;
const GREY: RGBA = [128, 128, 128, 255];
const BACKGROUND: RGBA = [240, 240, 240, 255];
/** Fabric: the box x 8–21, y 4–15 (inclusive). */
const inBox = (x: number, y: number) => x >= 8 && x <= 21 && y >= 4 && y <= 15;
const MASK = image(W, H, (x, y) => (inBox(x, y) ? [255, 255, 255, 255] : [0, 0, 0, 255]));
const PHOTO = image(W, H, (x, y) => (inBox(x, y) ? GREY : BACKGROUND));
const RED = '#b0262d';

describe('the mask', () => {
  it('fabric is white (red × alpha ≥ 128); black, transparent and faint white are not', () => {
    const mask = image(
      4,
      1,
      (x) =>
        [
          [255, 255, 255, 255],
          [0, 0, 0, 255],
          [255, 255, 255, 0],
          [255, 255, 255, 100],
        ][x] as RGBA,
    );
    expect([0, 1, 2, 3].map((i) => isFabric(mask, i))).toEqual([true, false, false, false]);
  });

  it('must be the size of the photo', () => {
    expect(() =>
      prepareTintSource(
        PHOTO,
        image(10, 10, () => [255, 255, 255, 255]),
      ),
    ).toThrow('size of the photo');
  });
});

describe('tinting', () => {
  const source = prepareTintSource(PHOTO, MASK);
  const out = { data: applyTint(PHOTO, source, RED), width: W };

  it('turns the fabric (at its typical brightness) into exactly the chosen colour', () => {
    expect(source.stats!.base).toBeCloseTo(luminance(128, 128, 128), 2);
    for (const [x, y] of [
      [14, 10],
      [10, 6],
      [19, 13],
    ]) {
      expect(at(out, x!, y!)).toEqual([...hexToRgb(RED), 255]);
    }
  });

  it('leaves everything off the fabric exactly as it was, and never touches alpha', () => {
    for (const [x, y] of [
      [0, 0],
      [5, 10], // three pixels left of the fabric
      [25, 10],
      [14, 0],
      [14, 19],
    ]) {
      expect(at(out, x!, y!)).toEqual(at(PHOTO, x!, y!));
    }
    for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(255);
  });

  it('softens the edge over a pixel or two: partly tinted on both sides of the mask edge', () => {
    const red = hexToRgb(RED);
    const inside = at(out, 8, 10); // first fabric column
    const outside = at(out, 7, 10); // just off the fabric
    // Green channel: red 38 < grey 128 < background 240. Inside sits between the colour and the
    // fabric; outside between that and the background.
    expect(inside[1]).toBeGreaterThan(red[1]);
    expect(inside[1]).toBeLessThan(GREY[1]);
    expect(outside[1]).toBeGreaterThan(inside[1]!);
    expect(outside[1]).toBeLessThan(BACKGROUND[1]);
    expect(source.coverage[10 * W + 8]).toBeGreaterThan(0.5);
    expect(source.coverage[10 * W + 7]).toBeLessThan(0.5);
    expect(source.coverage[10 * W + 5]).toBe(0);
  });

  it('respects the photo’s transparency: transparent pixels are never fabric or recoloured', () => {
    const holey = image(W, H, (x, y) => (x === 14 && y === 10 ? [128, 128, 128, 0] : inBox(x, y) ? GREY : BACKGROUND));
    const tinted = { data: applyTint(holey, prepareTintSource(holey, MASK), RED), width: W };
    expect(at(tinted, 14, 10)).toEqual([128, 128, 128, 0]);
  });

  it('a mask without fabric changes nothing; a bad colour is refused', () => {
    const empty = prepareTintSource(
      PHOTO,
      image(W, H, () => [0, 0, 0, 255]),
    );
    expect(empty.bounds).toBeNull();
    expect([...applyTint(PHOTO, empty, RED)]).toEqual([...PHOTO.data]);
    expect(() => applyTint(PHOTO, source, 'red')).toThrow('Not a colour');
    expect(() => hexToRgb('#12345')).toThrow('Not a colour');
  });

  it('front and back each use their own mask', () => {
    const backMask = image(W, H, (x, y) => (x >= 2 && x <= 12 && y >= 2 && y <= 17 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    const back = { data: applyTint(PHOTO, prepareTintSource(PHOTO, backMask), RED), width: W };
    // (20, 10) is fabric on the front mask only; (4, 10) on the back mask only.
    expect(at(out, 20, 10)).not.toEqual(at(PHOTO, 20, 10));
    expect(at(back, 20, 10)).toEqual(at(PHOTO, 20, 10));
    expect(at(out, 4, 10)).toEqual(at(PHOTO, 4, 10));
    expect(at(back, 4, 10)).not.toEqual(at(PHOTO, 4, 10));
  });
});

describe('shading survives the new colour', () => {
  // Fabric in three wide bands: shadow, midtone, highlight (plus more midtone, so it's the typical brightness).
  const band = (x: number): RGBA => (x < 10 ? [60, 60, 60, 255] : x < 30 ? [130, 130, 130, 255] : [215, 215, 215, 255]);
  const photo = image(40, 12, (x) => band(x));
  const mask = image(40, 12, () => [255, 255, 255, 255]);
  const out = { data: applyTint(photo, prepareTintSource(photo, mask), '#1f56b0'), width: 40 };
  const lum = (p: number[]) => luminance(p[0]!, p[1]!, p[2]!);

  it('keeps shadow < midtone < highlight, and they stay distinct (not a flat colour)', () => {
    const shadow = lum(at(out, 4, 6));
    const mid = lum(at(out, 20, 6));
    const highlight = lum(at(out, 35, 6));
    expect(shadow).toBeLessThan(mid - 0.03);
    expect(mid).toBeLessThan(highlight - 0.03);
  });

  it('becomes the new hue: blue dominates every band', () => {
    for (const x of [4, 20, 35]) {
      const [r, g, b] = at(out, x, 6);
      expect(b).toBeGreaterThan(r!);
      expect(b).toBeGreaterThan(g!);
    }
  });

  it('the shade curve is 1 at the typical brightness, darker below and brighter above', () => {
    const typical = luminance(128, 128, 128);
    const params = tintParams([100, 150, 200], { base: typical, p99: 0.6 });
    const out = [0, 0, 0];
    tintPixel(params, 128, 128, 128, typical, out);
    out.forEach((value, i) => expect(Math.abs(value - [100, 150, 200][i]!)).toBeLessThan(0.6));
    expect(params.shade[Math.round(1023 * 0.2)]).toBeLessThan(1);
    expect(params.shade[Math.round(1023 * 0.7)]).toBeGreaterThan(1);
  });

  it('light photos (white or yellow fabric) get more relief, as the original', () => {
    const light = tintParams([43, 43, 45], { base: 0.8, p99: 0.95 });
    const plain = tintParams([43, 43, 45], { base: 0.69, p99: 0.95 });
    // Half the typical brightness comes out darker on the light photo.
    expect(light.shade[Math.round(1023 * 0.4)]).toBeLessThan(plain.shade[Math.round(1023 * 0.345)]!);
  });
});
