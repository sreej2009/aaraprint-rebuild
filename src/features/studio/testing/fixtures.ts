import type { StudioProfile } from '../profile/types';
import { createBlankDesign, createImageElement, createShapeElement, createTextElement } from '../schema/create';
import type { DesignAsset, DesignDocument } from '../schema/types';

/** Test helpers for the Studio (not used by the app). */

/** Same geometry as public/api/v1/studio/business-card-classic.json. */
export const cardProfile: StudioProfile = {
  schemaVersion: 1,
  slug: 'business-card-classic',
  productId: '0d8c7d43-0d1c-4b1c-9b33-2d9a52b1f001',
  name: 'Classic Visiting Cards',
  mode: 'flat',
  family: 'visiting-card',
  print: { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, printAreaSizeMultiplier: 1 },
  trim: { shape: 'rectangle', cornerRadiusPx: 0, source: 'print-config' },
  sides: [
    { id: 'front', label: 'Front', mockup: null },
    { id: 'back', label: 'Back', mockup: null },
  ],
  model3d: null,
  sizeCheck: null,
  geometryOptions: [],
};

/** Deterministic ids: prefix_1, prefix_2, … */
export function sequentialIds() {
  let n = 0;
  return (prefix = 'id') => `${prefix}_${++n}`;
}

export const NOW = new Date('2026-11-03T10:00:00.000Z');

export function uploadAsset(id = 'asset_logo', overrides: Partial<DesignAsset> = {}): DesignAsset {
  return {
    id,
    kind: 'upload',
    name: 'logo.png',
    mime: 'image/png',
    bytes: 48_213,
    naturalWidth: 600,
    naturalHeight: 300,
    storage: { kind: 'local', blobId: `blob_${id}` },
    ...overrides,
  };
}

/** A card with a heading, a shape and an uploaded logo on the front; empty back. */
export function sampleDesign(): DesignDocument {
  const ids = sequentialIds();
  const blank = createBlankDesign(cardProfile, { variantId: 'variant_1', now: NOW, newId: ids });
  const asset = uploadAsset();
  const front = blank.surfaces[0]!;
  return {
    ...blank,
    assets: { [asset.id]: asset },
    surfaces: [
      {
        ...front,
        background: { color: '#f4f1ea' },
        elements: [
          createShapeElement('rect', { x: -18, y: 480, width: 1086, height: 138 }, { id: 'el_band', fill: '#2f5bd3' }),
          createTextElement({ x: 60, y: 60, width: 600, height: 80 }, { id: 'el_name', text: 'Riya Sharma', fontSize: 75, fontWeight: 700 }),
          createImageElement({ kind: 'asset', assetId: asset.id }, { x: 800, y: 60, width: 190, height: 95 }, { id: 'el_logo' }),
        ],
      },
      blank.surfaces[1]!,
    ],
  };
}

/** Freeze recursively so any accidental mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
