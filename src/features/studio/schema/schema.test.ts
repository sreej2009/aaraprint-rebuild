import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SideId, StudioProfile } from '../profile/types';
import { cardProfile, NOW, sampleDesign, sequentialIds, uploadAsset } from '../testing/fixtures';
import { missingLocalAssets, referencedAssetIds, unusedAssetIds } from './assets';
import { compareWithProfile } from './compat';
import { createBlankDesign, createTextElement, surfacePrintFromProfile } from './create';
import { CURRENT_SCHEMA_VERSION, DESIGN_FORMAT, type DesignDocument } from './types';
import { MAX_DOCUMENT_CHARS, parseDesign, validateDesign, type Migration } from './validate';

const studioDir = path.resolve('public/api/v1/studio');
const profiles = fs.readdirSync(studioDir).map((f) => JSON.parse(fs.readFileSync(path.join(studioDir, f), 'utf8')) as StudioProfile);

/** A deep, mutable copy for building broken documents. */
// oxlint-disable-next-line typescript/no-explicit-any -- tests poke at arbitrary fields of broken documents
const clone = (doc: DesignDocument): Record<string, any> => JSON.parse(JSON.stringify(doc));
const errorsOf = (input: unknown) => {
  const result = parseDesign(input);
  return result.ok ? [] : result.errors;
};
const codes = (input: unknown) => errorsOf(input).map((e) => e.code);

describe('createBlankDesign', () => {
  it('builds a versioned document with one surface per profile side', () => {
    const doc = createBlankDesign(cardProfile, { variantId: 'variant_9', now: NOW, newId: sequentialIds() });
    expect(doc).toEqual({
      format: DESIGN_FORMAT,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: 'design_1',
      name: 'Classic Visiting Cards design',
      product: {
        slug: 'business-card-classic',
        productId: cardProfile.productId,
        familyId: 'visiting-card',
        variantId: 'variant_9',
        // Without the catalogue product the variant's options and SKU aren't known yet.
        sku: null,
        configuration: { options: {}, quantity: 1, orientation: null, studio: {}, sameDesignBothSides: null },
      },
      surfaces: [
        { id: 'front', label: 'Front', print: surfacePrintFromProfile(cardProfile), background: { color: null }, elements: [] },
        { id: 'back', label: 'Back', print: surfacePrintFromProfile(cardProfile), background: { color: null }, elements: [] },
      ],
      assets: {},
      meta: { createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), revision: 0 },
    });
  });

  it('keeps trim, bleed and safe zone explicit on every surface', () => {
    const [front] = createBlankDesign(cardProfile).surfaces;
    expect(front?.print).toEqual({ widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } });
  });

  it('produces a valid design for every one of the 532 Studio profiles, sized exactly as the profile', () => {
    expect(profiles).toHaveLength(532);
    for (const profile of profiles) {
      const doc = createBlankDesign(profile, { variantId: null });
      expect(validateDesign(doc), profile.slug).toEqual([]);
      for (const surface of doc.surfaces) {
        expect(surface.print, profile.slug).toEqual(surfacePrintFromProfile(profile));
      }
      expect(compareWithProfile(doc, profile), profile.slug).toEqual([]);
    }
  });

  it('gives surfaces separate print objects so one can be resized alone', () => {
    const doc = createBlankDesign(cardProfile);
    expect(doc.surfaces[0]?.print).not.toBe(doc.surfaces[1]?.print);
    expect(doc.surfaces[0]?.print.trim).not.toBe(doc.surfaces[1]?.print.trim);
  });
});

describe('parseDesign', () => {
  it('round-trips a design through JSON and returns a canonical copy', () => {
    const doc = sampleDesign();
    const result = parseDesign(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toEqual(doc);
    expect(result.migratedFrom).toBeNull();
    expect(validateDesign(doc)).toEqual([]);
  });

  it('drops unknown keys (for example leftover Konva attributes) instead of keeping them', () => {
    const raw = clone(sampleDesign());
    raw.konvaStage = { attrs: {}, className: 'Stage' };
    raw.surfaces[0].elements[1].draggable = true;
    const result = parseDesign(raw);
    expect(result.ok && 'konvaStage' in result.document).toBe(false);
    expect(result.ok && 'draggable' in (result.document.surfaces[0]?.elements[1] ?? {})).toBe(false);
  });

  it('normalises colours to lower case', () => {
    const raw = clone(sampleDesign());
    raw.surfaces[0].background.color = '#F4F1EA';
    const result = parseDesign(raw);
    expect(result.ok && result.document.surfaces[0]?.background.color).toBe('#f4f1ea');
  });

  it('supports any number of named surfaces for future multi-surface products', () => {
    const raw = clone(sampleDesign());
    raw.surfaces.push({ ...raw.surfaces[1], id: 'flap', label: 'Flap', elements: [] });
    raw.surfaces.push({ ...raw.surfaces[1], id: 'cover-front', label: 'Cover — Front', elements: [], print: { ...raw.surfaces[1].print, widthPx: 2480, heightPx: 3508 } });
    const result = parseDesign(raw);
    expect(result.ok && result.document.surfaces.map((s) => s.id)).toEqual(['front', 'back', 'flap', 'cover-front']);
  });

  it('rejects input that is not a design', () => {
    expect(codes('{not json')).toEqual(['invalid-json']);
    expect(codes(null)).toEqual(['not-a-design']);
    expect(codes([1, 2])).toEqual(['not-a-design']);
    expect(codes({ hello: 'world' })).toEqual(['not-a-design']);
    expect(codes({ ...sampleDesign(), format: 'konva.stage' })).toEqual(['not-a-design']);
  });

  it('refuses unsupported versions with a clear message', () => {
    const v1 = errorsOf({ schemaVersion: 1, productId: 'x', elements: [] });
    expect(v1).toEqual([expect.objectContaining({ code: 'unsupported-version', message: expect.stringContaining('previous Aaraprint site') })]);
    const newer = errorsOf({ ...sampleDesign(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    expect(newer).toEqual([expect.objectContaining({ code: 'unsupported-version', message: expect.stringContaining('newer version') })]);
    expect(codes({ ...sampleDesign(), schemaVersion: 2.5 })).toEqual(['not-a-design']);
  });

  it('upgrades older versions through registered migrations, in order', () => {
    const current = sampleDesign();
    const { schemaVersion: _version, name, ...rest } = current;
    const oldDoc = { ...rest, schemaVersion: 0, title: name };
    const steps: number[] = [];
    const renameTitle: Migration = (raw) => {
      steps.push(0);
      const { title, ...others } = raw;
      return { ...others, name: title };
    };
    const noop = (step: number): Migration => (raw) => {
      steps.push(step);
      return raw;
    };
    const migrations = new Map<number, Migration>([
      [0, renameTitle],
      [1, noop(1)],
      [2, noop(2)],
    ]);
    const result = parseDesign(oldDoc, { migrations });
    expect(steps).toEqual([0, 1, 2]);
    expect(result.ok && result.document).toEqual(current);
    expect(result.ok && result.migratedFrom).toBe(0);

    const gap = parseDesign(oldDoc, { migrations: new Map([[0, (raw: Record<string, unknown>) => raw]]) });
    expect(gap.ok ? [] : gap.errors.map((e) => e.code)).toEqual(['unsupported-version']);
  });

  it('refuses documents that embed file data instead of referencing assets', () => {
    const dataUrl = clone(sampleDesign());
    dataUrl.assets.asset_logo.preview = 'data:image/png;base64,iVBORw0KGgo=';
    expect(codes(dataUrl)).toEqual(['embedded-data']);

    const base64 = clone(sampleDesign());
    base64.assets.asset_logo.thumbnail = 'A'.repeat(2048);
    expect(codes(base64)).toEqual(['embedded-data']);

    const remote = clone(sampleDesign());
    remote.assets.asset_logo.storage = { kind: 'remote', path: 'data:image/png;base64,AAAA' };
    expect(errorsOf(remote)).toEqual([expect.objectContaining({ code: 'embedded-data', path: 'assets.asset_logo.storage.path' })]);

    const huge = JSON.stringify(sampleDesign()).replace('"Riya Sharma"', `"${'x'.repeat(MAX_DOCUMENT_CHARS)}"`);
    expect(codes(huge)).toEqual(['too-large']);
  });

  it('reports image elements whose uploaded file is missing from the design', () => {
    const raw = clone(sampleDesign());
    delete raw.assets.asset_logo;
    expect(errorsOf(raw)).toEqual([
      { code: 'missing-asset', path: 'surfaces[0].elements[2].source.assetId', message: expect.stringContaining('asset_logo') },
    ]);
  });

  it('reports duplicate ids', () => {
    const raw = clone(sampleDesign());
    raw.surfaces[1].elements = [raw.surfaces[0].elements[1]];
    expect(errorsOf(raw)).toEqual([expect.objectContaining({ code: 'duplicate-id', path: 'surfaces[1].elements[0].id' })]);
    const surfaces = clone(sampleDesign());
    surfaces.surfaces[1].id = 'front';
    expect(codes(surfaces)).toEqual(['duplicate-id']);
  });

  it('validates print geometry', () => {
    const cases: [string, unknown, string][] = [
      ['dpi', 20, 'surfaces[0].print.dpi'],
      ['widthPx', 1050.5, 'surfaces[0].print.widthPx'],
      ['bleedPx', -1, 'surfaces[0].print.bleedPx'],
      ['safeZonePx', 400, 'surfaces[0].print.safeZonePx'],
    ];
    for (const [field, value, expectedPath] of cases) {
      const raw = clone(sampleDesign());
      raw.surfaces[0].print[field] = value;
      expect(errorsOf(raw).map((e) => e.path), field).toEqual([expectedPath]);
    }
    const shape = clone(sampleDesign());
    shape.surfaces[0].print.trim.shape = 'hexagon';
    expect(errorsOf(shape).map((e) => e.path)).toEqual(['surfaces[0].print.trim.shape']);
  });

  it('validates every element field and reports precise paths', () => {
    const raw = clone(sampleDesign());
    raw.surfaces[0].elements[1].fontWeight = 650;
    raw.surfaces[0].elements[1].color = 'red';
    raw.surfaces[0].elements[0].width = 0;
    raw.surfaces[0].elements[0].opacity = 1.5;
    raw.surfaces[0].elements[2].source = { kind: 'url', href: 'https://example.com/logo.png' };
    expect(errorsOf(raw).map((e) => e.path).sort()).toEqual([
      'surfaces[0].elements[0].opacity',
      'surfaces[0].elements[0].width',
      'surfaces[0].elements[1].color',
      'surfaces[0].elements[1].fontWeight',
      'surfaces[0].elements[2].source.kind',
    ]);
  });

  it('requires at least one surface and a known element type', () => {
    const empty = clone(sampleDesign());
    empty.surfaces = [];
    expect(errorsOf(empty).map((e) => e.path)).toEqual(['surfaces']);
    const unknown = clone(sampleDesign());
    unknown.surfaces[0].elements[0].type = 'qr';
    expect(errorsOf(unknown).map((e) => e.path)).toEqual(['surfaces[0].elements[0].type']);
  });
});

describe('asset references', () => {
  it('lists referenced, missing and unused assets', () => {
    const doc = sampleDesign();
    const extra = uploadAsset('asset_old', { storage: { kind: 'remote', path: 'designs/u1/old.png' } });
    const withExtra = { ...doc, assets: { ...doc.assets, [extra.id]: extra } };
    expect([...referencedAssetIds(withExtra)]).toEqual(['asset_logo']);
    expect(unusedAssetIds(withExtra)).toEqual(['asset_old']);
    expect(unusedAssetIds(withExtra, ['asset_old'])).toEqual([]); // still needed by undo history
    expect(missingLocalAssets(withExtra, () => true)).toEqual([]);
    expect(missingLocalAssets(withExtra, (blobId) => blobId !== 'blob_asset_logo')).toEqual(['asset_logo']);
  });
});

describe('compareWithProfile', () => {
  it('flags print-size changes and surface differences instead of changing the design', () => {
    const doc = sampleDesign();
    const corrected: StudioProfile = { ...cardProfile, print: { ...cardProfile.print, widthPx: 1063, heightPx: 638 } };
    expect(compareWithProfile(doc, corrected).map((m) => [m.kind, m.surfaceId])).toEqual([
      ['print-changed', 'front'],
      ['print-changed', 'back'],
    ]);
    const single: StudioProfile = { ...cardProfile, sides: [cardProfile.sides[0]!] };
    expect(compareWithProfile(doc, single).map((m) => [m.kind, m.surfaceId])).toEqual([['surface-unknown', 'back']]);
    const withFlap: StudioProfile = { ...cardProfile, sides: [...cardProfile.sides, { id: 'flap' as SideId, label: 'Flap', mockup: null }] };
    expect(compareWithProfile(doc, withFlap).map((m) => [m.kind, m.surfaceId])).toEqual([['surface-missing', 'flap']]);
    expect(compareWithProfile(doc, cardProfile)).toEqual([]);
  });
});

describe('element factories', () => {
  it('create elements with defaults and fresh ids', () => {
    const ids = sequentialIds();
    const text = createTextElement({ x: 0, y: 0, width: 10, height: 10 }, {}, ids);
    expect(text).toMatchObject({ id: 'el_1', type: 'text', opacity: 1, hidden: false, locked: false, letterSpacing: 0, placeholder: false });
  });
});
