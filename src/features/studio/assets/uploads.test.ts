import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printBoxes } from '../geometry/boxes';
import { designFingerprint } from '../persistence/fingerprint';
import type { AssetRecord } from '../persistence/records';
import { createMemoryRepository, type MemoryRepository } from '../persistence/repository';
import { createSaveController } from '../persistence/save-controller';
import { createBlankDesign, createImageElement } from '../schema/create';
import type { DesignDocument, SurfacePrint } from '../schema/types';
import { parseDesign, validateDesign } from '../schema/validate';
import { createStudioStore } from '../store';
import { cardProfile, sequentialIds } from '../testing/fixtures';
import { createUploadLibrary, releaseAsset, resetAssetUrlsForTests, setAssetSource, thumbnailUrl } from './asset-library';
import { DPI_ACCEPTABLE, DPI_GOOD, effectiveDpi, imagePlacement, PLACEMENT_MAX_SHARE, replacementBox, resolutionLevel } from './image-placement';
import { designAssetFor, displayName, formatBytes, prepareUpload, sniffImageType, UPLOAD_MAX_BYTES, UploadError } from './uploads';

/**
 * Uploaded images (M12): checking files by their content, placing them by their pixels, judging
 * their print resolution, storing them apart from designs, and the rules for removing them.
 * jsdom has no image decoder, so decoding is injected; the browser tests use the real one.
 */

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const WEBP = Uint8Array.from(
  [...'RIFF']
    .map((c) => c.charCodeAt(0))
    .concat(
      [0, 0, 0, 0],
      [...'WEBPVP8 '].map((c) => c.charCodeAt(0)),
    ),
);
const file = (bytes: Uint8Array<ArrayBuffer>, name: string, type: string, size?: number) => {
  const body = size ? new Uint8Array(size).map((_, i) => bytes[i] ?? 0) : bytes;
  return new File([body], name, { type });
};
const decode = (width = 1200, height = 800) =>
  vi.fn<(blob: Blob) => Promise<{ width: number; height: number; thumbnail: Blob | null }>>(async () => ({
    width,
    height,
    thumbnail: new Blob(['thumb'], { type: 'image/webp' }),
  }));
const card: SurfacePrint = {
  widthPx: 1050,
  heightPx: 600,
  dpi: 300,
  bleedPx: 18,
  safeZonePx: 24,
  trim: { shape: 'rectangle', cornerRadiusPx: 0 },
};

beforeEach(() => {
  let n = 0;
  resetAssetUrlsForTests({
    create: () => `blob:test/${(n += 1)}`,
    revoke: vi.fn<(url: string) => void>(),
  });
});
afterEach(() => resetAssetUrlsForTests());

describe('checking uploads', () => {
  it('reads the type from the bytes, not the name or the browser’s guess', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(WEBP)).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });

  it('accepts PNG, JPEG and WebP that decode; stores the real type even under another name', async () => {
    const asset = await prepareUpload(file(JPEG, 'holiday.png', 'image/png'), {
      decode: decode(),
      newId: () => 'asset_1',
      now: () => 5,
    });
    expect(asset).toMatchObject({
      assetId: 'asset_1',
      name: 'holiday.png',
      mime: 'image/jpeg',
      naturalWidth: 1200,
      naturalHeight: 800,
      createdAt: 5,
    });
    expect(asset.blob.type).toBe('image/jpeg');
    expect(asset.thumbnail).toBeInstanceOf(Blob);
    await expect(prepareUpload(file(WEBP, 'a.webp', 'image/webp'), { decode: decode() })).resolves.toMatchObject({ mime: 'image/webp' });
  });

  it('refuses SVG, other files, empty files, oversized files and images that don’t decode', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(
      prepareUpload(file(svg, 'logo.svg', 'image/svg+xml'), {
        decode: decode(),
      }),
    ).rejects.toThrow('SVG files can’t be uploaded. Use a PNG, JPEG or WebP image.');
    await expect(prepareUpload(file(new TextEncoder().encode('<html>'), 'page.png', 'image/png'), { decode: decode() })).rejects.toThrow('This file type isn’t supported.');
    await expect(
      prepareUpload(file(new Uint8Array(), 'empty.png', 'image/png'), {
        decode: decode(),
      }),
    ).rejects.toThrow('This file is empty.');
    const big = decode();
    await expect(
      prepareUpload(file(PNG, 'huge.png', 'image/png', UPLOAD_MAX_BYTES + 1), {
        decode: big,
      }),
    ).rejects.toThrow('Image is too large. Maximum file size is 10 MB.');
    expect(big).not.toHaveBeenCalled(); // refused before decoding
    const broken = vi.fn<(blob: Blob) => Promise<never>>(async () => Promise.reject(new UploadError('This file couldn’t be read as an image. It may be damaged.')));
    await expect(prepareUpload(file(PNG, 'broken.png', 'image/png'), { decode: broken })).rejects.toThrow(/damaged/);
    await expect(
      prepareUpload(file(PNG, 'zero.png', 'image/png'), {
        decode: decode(0, 0),
      }),
    ).rejects.toThrow(/damaged/);
  });

  it('keeps names readable and harmless; ids never come from names', async () => {
    expect(displayName('C:\\Users\\riya\\Pictures\\logo final.png')).toBe('logo final.png');
    expect(displayName('../../etc/passwd')).toBe('passwd');
    expect(displayName('\u0000\u0007')).toBe('Image');
    expect(displayName(`${'x'.repeat(200)}.png`)).toHaveLength(120);
    const asset = await prepareUpload(file(PNG, '<img onerror=alert(1)>.png', 'image/png'), { decode: decode() });
    expect(asset.assetId).toMatch(/^asset_[0-9a-f-]{36}$/);
    expect(formatBytes(2_500_000)).toBe('2.4 MB');
    expect(formatBytes(21_000)).toBe('21 KB');
  });

  it('describe uploads in the design by reference only', async () => {
    const asset = await prepareUpload(file(PNG, 'logo.png', 'image/png'), {
      decode: decode(),
      newId: () => 'asset_logo',
    });
    const meta = designAssetFor(asset);
    expect(meta).toEqual({
      id: 'asset_logo',
      kind: 'upload',
      name: 'logo.png',
      mime: 'image/png',
      bytes: PNG.length,
      naturalWidth: 1200,
      naturalHeight: 800,
      storage: { kind: 'local', blobId: 'asset_logo' },
    });
    expect(JSON.stringify(meta)).not.toMatch(/data:|base64|blob:/);
  });
});

describe('placing and resolution', () => {
  it('sizes new images from their pixels at 150 DPI, capped at 35 % of the trim, centred in the safe area', () => {
    const safe = printBoxes(card).safe;
    const big = imagePlacement({ naturalWidth: 3000, naturalHeight: 2000 }, card);
    expect(big.width).toBeCloseTo(card.widthPx * PLACEMENT_MAX_SHARE, 1);
    expect(big.width / big.height).toBeCloseTo(1.5, 3);
    expect(big.x + big.width / 2).toBeCloseTo(safe.x + safe.width / 2, 1);
    // A small logo isn't blown up: 150 px at 150 DPI is one inch = 300 print px here.
    const small = imagePlacement({ naturalWidth: 150, naturalHeight: 150 }, card);
    expect(small).toMatchObject({ width: 300, height: 300 });
    // A tall image is fitted to the safe area's height.
    const tall = imagePlacement({ naturalWidth: 1000, naturalHeight: 5000 }, card);
    expect(tall.height).toBeCloseTo(safe.height, 1);
    expect(tall.width / tall.height).toBeCloseTo(0.2, 3);
    const next = imagePlacement({ naturalWidth: 150, naturalHeight: 150 }, card, [{ ...small, id: 'el' } as never]);
    expect(next.x).toBeGreaterThan(small.x);
  });

  it('works out the effective DPI at the current size, with named thresholds', () => {
    const asset = { naturalWidth: 1500, naturalHeight: 1000 };
    expect(effectiveDpi({ width: 5 * 300, height: (10 / 3) * 300 }, asset, card)).toBe(300); // 5 inches wide
    expect(effectiveDpi({ width: 10 * 300, height: (20 / 3) * 300 }, asset, card)).toBe(150);
    expect(effectiveDpi({ width: 0, height: 0 }, asset, card)).toBe(0);
    expect([DPI_GOOD, DPI_GOOD - 1, DPI_ACCEPTABLE, DPI_ACCEPTABLE - 1].map(resolutionLevel)).toEqual(['good', 'acceptable', 'acceptable', 'low']);
  });

  it('keeps the width and fixes the height in proportion when replacing', () => {
    expect(replacementBox({ width: 300, height: 200 }, { naturalWidth: 1000, naturalHeight: 1000 })).toEqual({ width: 300, height: 300 });
  });
});

describe('the uploads library', () => {
  let repo: MemoryRepository;
  const blankDoc = (): DesignDocument => createBlankDesign(cardProfile, { newId: () => 'design_1' });

  beforeEach(() => {
    repo = createMemoryRepository();
    setAssetSource(repo);
  });

  it('stores the file (and only then lists it) — no design change', async () => {
    const library = createUploadLibrary(repo, {
      decode: decode(),
      newId: sequentialIds(),
    });
    const phases: string[] = [];
    library.state.subscribe((s) => phases.push(s.phase));
    const [stored] = await library.upload([file(PNG, 'logo.png', 'image/png')]);
    expect(repo.assets.get(stored!.assetId)?.blob).toBeInstanceOf(Blob);
    expect(library.state.getState().items.map((i) => i.name)).toEqual(['logo.png']);
    expect([...new Set(phases)]).toEqual(['idle', 'reading', 'processing', 'saving']);
    expect(library.state.getState().phase).toBe('idle');
  });

  it('reports a bad file and keeps going with the rest', async () => {
    const library = createUploadLibrary(repo, { decode: decode() });
    const stored = await library.upload([file(new TextEncoder().encode('nope'), 'a.gif', 'image/gif'), file(PNG, 'b.png', 'image/png')]);
    expect(stored).toHaveLength(1);
    expect(library.state.getState().error).toBe('a.gif: This file type isn’t supported. Use a PNG, JPEG or WebP image.');
  });

  it('removes an upload only when no open, saved or versioned design uses it', async () => {
    const library = createUploadLibrary(repo, {
      decode: decode(),
      newId: sequentialIds(),
    });
    const [asset] = await library.upload([file(PNG, 'logo.png', 'image/png')]);
    const id = asset!.assetId;
    const doc = blankDoc();
    const withImage: DesignDocument = {
      ...doc,
      assets: { [id]: designAssetFor(asset!) },
      surfaces: doc.surfaces.map((s, i) =>
        i === 0
          ? {
              ...s,
              elements: [createImageElement({ kind: 'asset', assetId: id }, { x: 0, y: 0, width: 10, height: 10 }, { id: 'el_img' })],
            }
          : s,
      ),
    };
    expect(await library.remove(id, withImage)).toBe(false);
    expect(library.state.getState().error).toMatch(/used in a design/);
    // Saved only in an old version: still kept.
    repo.versions.set('v1', {
      versionId: 'v1',
      designId: 'd',
      createdAt: 1,
      reason: 'manual',
      schemaVersion: 2,
      fingerprint: 'x',
      document: withImage,
    });
    expect(await library.remove(id, doc)).toBe(false);
    repo.versions.clear();
    const revoke = vi.fn<(url: string) => void>();
    resetAssetUrlsForTests({ create: () => 'blob:thumb', revoke });
    setAssetSource(repo);
    thumbnailUrl(repo.assets.get(id)!);
    expect(await library.remove(id, doc)).toBe(true);
    expect(repo.assets.has(id)).toBe(false);
    expect(revoke).toHaveBeenCalledWith('blob:thumb'); // its URL is released too
  });
});

describe('object URLs', () => {
  it('are created once per asset and released when the asset goes', () => {
    const create = vi.fn<(blob: Blob) => string>(() => 'blob:one');
    const revoke = vi.fn<(url: string) => void>();
    resetAssetUrlsForTests({ create, revoke });
    const asset = { assetId: 'asset_a', thumbnail: new Blob(['x']) };
    expect(thumbnailUrl(asset)).toBe('blob:one');
    thumbnailUrl(asset);
    thumbnailUrl(asset);
    expect(create).toHaveBeenCalledTimes(1);
    releaseAsset('asset_a');
    expect(revoke).toHaveBeenCalledWith('blob:one');
    expect(thumbnailUrl({ assetId: 'asset_b', thumbnail: null })).toBeNull();
  });
});

describe('saving designs with images (M11)', () => {
  it('stores the reference, never the file; the same upload can be used on both sides', async () => {
    vi.useFakeTimers();
    const repo = createMemoryRepository();
    const asset: AssetRecord = {
      assetId: 'asset_photo',
      name: 'photo.jpg',
      mime: 'image/jpeg',
      bytes: 1000,
      naturalWidth: 1200,
      naturalHeight: 800,
      createdAt: 1,
      blob: new Blob(['jpeg bytes']),
      thumbnail: null,
    };
    await repo.putAsset(asset);
    const studio = createStudioStore({
      document: createBlankDesign(cardProfile, { newId: () => 'design_1' }),
    });
    const controller = createSaveController({
      studio,
      repository: repo,
      productSlug: cardProfile.slug,
      productId: 'p',
      newId: sequentialIds(),
    });
    controller.start();
    const meta = designAssetFor(asset);
    const a = studio.getState().actions;
    a.addImage(meta, createImageElement({ kind: 'asset', assetId: 'asset_photo' }, imagePlacement(asset, card), { id: 'el_front' }));
    a.setActiveSurface('back');
    a.addImage(meta, createImageElement({ kind: 'asset', assetId: 'asset_photo' }, imagePlacement(asset, card), { id: 'el_back' }));
    await controller.saveNow();
    const record = repo.designs.get('design_1')!;
    const json = JSON.stringify(record);
    expect(json).not.toMatch(/jpeg bytes|data:|base64|blob:/);
    const doc = record.document as DesignDocument;
    expect(Object.keys(doc.assets)).toEqual(['asset_photo']);
    expect(doc.surfaces.map((s) => s.elements.map((e) => e.type === 'image' && e.source))).toEqual([[{ kind: 'asset', assetId: 'asset_photo' }], [{ kind: 'asset', assetId: 'asset_photo' }]]);
    expect(repo.assets.size).toBe(1);
    expect(parseDesign(doc)).toMatchObject({ ok: true });
    expect(validateDesign(studio.getState().document)).toEqual([]);

    // Moving the image saves the design again, not the file.
    const put = vi.spyOn(repo, 'putAsset');
    a.updateElement('el_back', { x: 10 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(put).not.toHaveBeenCalled();
    expect(designFingerprint(studio.getState().document)).toBe(repo.designs.get('design_1')!.fingerprint);
    controller.stop();
    vi.useRealTimers();
  });

  it('a restored version keeps its image references', async () => {
    const repo = createMemoryRepository();
    const studio = createStudioStore({
      document: createBlankDesign(cardProfile, { newId: () => 'design_1' }),
    });
    const controller = createSaveController({
      studio,
      repository: repo,
      productSlug: cardProfile.slug,
      productId: 'p',
      newId: sequentialIds(),
    });
    controller.start();
    const meta = designAssetFor({
      assetId: 'asset_x',
      name: 'x.png',
      mime: 'image/png',
      bytes: 5,
      naturalWidth: 10,
      naturalHeight: 10,
    });
    studio.getState().actions.addImage(meta, createImageElement({ kind: 'asset', assetId: 'asset_x' }, { x: 0, y: 0, width: 50, height: 50 }, { id: 'el_x' }));
    await controller.saveNow();
    const [version] = await repo.listVersions('design_1');
    studio.getState().actions.removeElements(['el_x']);
    await controller.saveNow();
    expect(await controller.restoreVersion(version!.versionId)).toBe(true);
    const restored = studio.getState().document;
    expect(restored.surfaces[0]!.elements[0]).toMatchObject({
      id: 'el_x',
      source: { kind: 'asset', assetId: 'asset_x' },
    });
    expect(restored.assets.asset_x).toEqual(meta);
    controller.stop();
  });
});
