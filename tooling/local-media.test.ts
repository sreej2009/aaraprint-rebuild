import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mediaCandidates, resolveMediaFile } from './local-media';

describe('mediaCandidates', () => {
  it('maps server paths to the first crawl’s folder layout', () => {
    expect(mediaCandidates('products/pens-2d/classic-front.png')).toEqual(['products/pens-2d/classic-front.png', 'pens-2d/classic-front.png']);
    expect(mediaCandidates('products/polo/front.png')).toEqual(['products/polo/front.png', 'apparel-polo/front.png']);
    expect(mediaCandidates('product-media/visiting-cards/x/1.jpg')).toEqual(['product-media/visiting-cards/x/1.jpg']);
  });

  it('refuses paths that escape the root', () => {
    expect(mediaCandidates('../package.json')).toEqual([]);
    expect(mediaCandidates('products/../../secret')).toEqual([]);
  });
});

describe('resolveMediaFile', () => {
  let additional: string;
  let recovered: string;

  beforeAll(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'));
    additional = path.join(base, 'recovered-additional');
    recovered = path.join(base, 'recovered');
    fs.mkdirSync(path.join(additional, 'products', 'pens-2d'), { recursive: true });
    fs.mkdirSync(path.join(recovered, 'apparel-polo'), { recursive: true });
    fs.mkdirSync(path.join(recovered, 'pens-2d'), { recursive: true });
    fs.writeFileSync(path.join(additional, 'products', 'pens-2d', 'gel-front.png'), 'new');
    fs.writeFileSync(path.join(recovered, 'pens-2d', 'classic-front.png'), 'old');
    fs.writeFileSync(path.join(recovered, 'apparel-polo', 'front.png'), 'polo');
    fs.writeFileSync(path.join(base, 'outside.txt'), 'secret');
  });

  afterAll(() => fs.rmSync(path.dirname(additional), { recursive: true, force: true }));

  it('prefers recovered-additional, then falls back to recovered', () => {
    expect(resolveMediaFile('products/pens-2d/gel-front.png', [additional, recovered])).toBe(path.join(additional, 'products', 'pens-2d', 'gel-front.png'));
    expect(resolveMediaFile('products/pens-2d/classic-front.png', [additional, recovered])).toBe(path.join(recovered, 'pens-2d', 'classic-front.png'));
    expect(resolveMediaFile('products/polo/front.png', [additional, recovered])).toBe(path.join(recovered, 'apparel-polo', 'front.png'));
  });

  it('returns null for missing files and traversal attempts', () => {
    expect(resolveMediaFile('products/pens-2d/none.png', [additional, recovered])).toBeNull();
    expect(resolveMediaFile('../outside.txt', [additional, recovered])).toBeNull();
  });
});
