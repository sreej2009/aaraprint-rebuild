import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRAPHICS, graphicId } from '../../../../scripts/studio/graphics-register.mjs';
import { printBoxes } from '../geometry/boxes';
import type { SurfacePrint } from '../schema/types';
import { graphicBox, graphicById, searchGraphics, usableLibrary, type GraphicEntry } from './graphics';
import { imageState, requestImage, retryImage, setImageLoaderForTests } from './image-cache';
import { sanitiseSvg, SvgError } from './svg-sanitise';

const entry = (id: string, fields: Partial<GraphicEntry> = {}): GraphicEntry => ({
  id,
  name: id.replace(/-/g, ' '),
  group: 'Icons',
  tags: [],
  width: 100,
  height: 100,
  url: `/studio/graphics/${id}.svg`,
  rights: 'cleared',
  ...fields,
});
const card: SurfacePrint = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };

afterEach(() => setImageLoaderForTests(null));

describe('graphics library', () => {
  it('only ever offers graphics whose rights are confirmed', () => {
    const library = usableLibrary({
      graphics: [entry('phone'), entry('crest', { rights: 'unconfirmed' }), entry('mail', { rights: 'attribution-required', attribution: 'by someone' }), entry('Bad Id!'), entry('flat', { height: 0 })],
      withheld: 30,
    });
    expect(library.graphics.map((g) => g.id)).toEqual(['phone', 'mail']);
    expect(library.withheld).toBe(33);
    expect(graphicById({ status: 'ready', library }, 'crest')).toBeNull();
    expect(graphicById({ status: 'ready', library }, 'phone')?.name).toBe('phone');
    expect(graphicById({ status: 'loading' }, 'phone')).toBeNull();
  });

  it('ships no graphic until the business confirms the rights (decision D5)', () => {
    const shipped = JSON.parse(readFileSync('public/api/v1/graphics.json', 'utf8')) as { graphics: unknown[]; withheld: number };
    expect(shipped).toEqual({ graphics: [], withheld: 33 });
    const audit = JSON.parse(readFileSync('src/data/generated/studio/graphics-meta.json', 'utf8')) as { total: number; included: number; graphics: { rights: string; included: boolean; removed: string[] }[] };
    expect(audit).toMatchObject({ total: 33, included: 0 });
    expect(audit.graphics.every((g) => g.rights === 'unconfirmed' && !g.included && g.removed.length === 0)).toBe(true);
  });

  it('lists the 33 original graphics in four groups, with ids the designs use', () => {
    expect(GRAPHICS).toHaveLength(33);
    expect(new Set(GRAPHICS.map((g) => g.group))).toEqual(new Set(['Backgrounds', 'Icons', 'Illustrations', 'Badges']));
    expect(graphicId('Business growth')).toBe('business-growth');
    expect(new Set(GRAPHICS.map((g) => graphicId(g.name))).size).toBe(33);
  });

  it('searches names, groups and tags locally; every word must match', () => {
    const graphics = [entry('phone', { name: 'Phone', tags: ['call', 'contact'] }), entry('email', { name: 'Email', tags: ['mail', 'contact'] }), entry('crest', { name: 'Premium crest', group: 'Badges', tags: ['luxury'] })];
    expect(searchGraphics(graphics, 'contact').map((g) => g.id)).toEqual(['phone', 'email']);
    expect(searchGraphics(graphics, '  PHONE ').map((g) => g.id)).toEqual(['phone']);
    expect(searchGraphics(graphics, 'badges luxury').map((g) => g.id)).toEqual(['crest']);
    expect(searchGraphics(graphics, 'contact luxury')).toEqual([]);
    expect(searchGraphics(graphics, '')).toHaveLength(3);
  });

  it('places graphics at 30 % of the trim width, in proportion, inside and centred in the safe area', () => {
    const safe = printBoxes(card).safe;
    const square = graphicBox({ width: 240, height: 240 }, card);
    expect(square.width).toBe(315);
    expect(square.height).toBe(315);
    expect(square.x + square.width / 2).toBeCloseTo(safe.x + safe.width / 2, 1);
    // Tall artwork is shrunk to fit the safe area's height.
    const tall = graphicBox({ width: 100, height: 400 }, card);
    expect(tall.height).toBeCloseTo(safe.height, 1);
    expect(tall.width).toBeCloseTo(safe.height / 4, 1);
    const next = graphicBox({ width: 240, height: 240 }, card, [{ ...square, id: 'a' } as never]);
    expect(next.x).toBeGreaterThan(square.x);
  });
});

describe('image cache', () => {
  it('loads each URL once and shares it', async () => {
    const image = {} as HTMLImageElement;
    const loader = vi.fn<(url: string) => Promise<HTMLImageElement>>(async () => image);
    setImageLoaderForTests(loader);
    expect(requestImage('/a.svg')).toEqual({ status: 'loading' });
    requestImage('/a.svg');
    await vi.waitFor(() => expect(imageState('/a.svg')).toEqual({ status: 'loaded', image }));
    requestImage('/a.svg');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('remembers failures, and tries again when asked', async () => {
    let fail = true;
    const loader = vi.fn<(url: string) => Promise<HTMLImageElement>>(async () => {
      if (fail) throw new Error('404');
      return {} as HTMLImageElement;
    });
    setImageLoaderForTests(loader);
    requestImage('/b.svg');
    await vi.waitFor(() => expect(imageState('/b.svg').status).toBe('error'));
    requestImage('/b.svg');
    expect(loader).toHaveBeenCalledTimes(1);
    fail = false;
    retryImage('/b.svg');
    await vi.waitFor(() => expect(imageState('/b.svg').status).toBe('loaded'));
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('SVG sanitiser', () => {
  it('removes scripts, foreignObject, event handlers and outside references', () => {
    const result = sanitiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" onload="alert(1)">
        <script>alert(1)</script>
        <foreignObject><div>hi</div></foreignObject>
        <a href="javascript:alert(1)"><circle r="4" onclick="x()"/></a>
        <image xlink:href="https://evil.example/track.png" width="5" height="5"/>
        <style>@import url(https://evil.example/x.css);</style>
        <rect width="10" height="10" fill="url(#g)" style="fill: url(https://evil.example/p)"/>
        <use href="#shape"/>
      </svg>`,
    );
    expect(result.svg).not.toMatch(/script|foreignObject|onload|onclick|javascript:|evil\.example|@import/);
    expect(result.svg).toContain('fill="url(#g)"');
    expect(result.svg).toContain('href="#shape"');
    expect(result.removed).toEqual(expect.arrayContaining(['<script>', '<foreignObject>', '<style>', 'svg@onload', 'circle@onclick', 'a@href', 'image@xlink:href', 'rect@style']));
  });

  it('keeps valid artwork and reads its size from width/height or the viewBox', () => {
    const clean = sanitiseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 240"><rect width="300" height="240" rx="24" fill="#eef6ff"/></svg>');
    expect(clean).toMatchObject({ width: 300, height: 240, removed: [] });
    expect(clean.svg).toContain('width="300"');
    expect(sanitiseSvg('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64"><path d="M0 0h1"/></svg>')).toMatchObject({ width: 128, height: 64 });
  });

  it('rejects files that aren’t SVG or have no size', () => {
    expect(() => sanitiseSvg('<html><body/></html>')).toThrow(SvgError);
    expect(() => sanitiseSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')).toThrow(/no size/);
    expect(() => sanitiseSvg('not xml')).toThrow(SvgError);
  });
});
