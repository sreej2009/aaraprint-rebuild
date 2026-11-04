import { createImageElement, createShapeElement, createTextElement } from '../schema/create';
import { CURRENT_SCHEMA_VERSION, DESIGN_FORMAT, type DesignDocument, type SurfacePrint } from '../schema/types';

/**
 * A visiting card with every element type the canvas draws, on both sides. Used by the canvas
 * demo on /design-system and by the canvas tests; not shown to customers.
 */
const CARD: SurfacePrint = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };

export function demoDesign(): DesignDocument {
  const now = '2026-11-04T09:00:00.000Z';
  return {
    format: DESIGN_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'design_demo',
    name: 'Demo visiting card',
    product: { slug: 'business-card-classic', productId: 'demo', variantId: null },
    assets: {
      asset_logo: {
        id: 'asset_logo',
        kind: 'upload',
        name: 'logo.png',
        mime: 'image/png',
        bytes: 1024,
        naturalWidth: 600,
        naturalHeight: 600,
        storage: { kind: 'local', blobId: 'blob_demo_logo' },
      },
    },
    surfaces: [
      {
        id: 'front',
        label: 'Front',
        print: CARD,
        background: { color: '#f6f3ec' },
        elements: [
          // Runs into the bleed on three sides, as a background band should.
          createShapeElement('rect', { x: -18, y: 470, width: 1086, height: 148 }, { id: 'el_band', fill: '#2f2a7a' }),
          createTextElement({ x: 70, y: 70, width: 620, height: 90 }, { id: 'el_name', text: 'Riya Sharma', fontSize: 75, fontWeight: 700, color: '#171c26' }),
          createTextElement(
            { x: 70, y: 170, width: 620, height: 60 },
            { id: 'el_title', text: 'Brand designer', fontSize: 42, fontFamily: 'Manrope', italic: true, color: '#4b43d6', letterSpacing: 0.04 },
          ),
          createTextElement({ x: 70, y: 500, width: 700, height: 50 }, { id: 'el_contact', text: '+91 98765 43210 · riya@example.com', fontSize: 34, color: '#ffffff' }),
          createImageElement({ kind: 'asset', assetId: 'asset_logo' }, { x: 820, y: 70, width: 160, height: 160 }, { id: 'el_logo' }),
          createShapeElement('star', { x: 860, y: 280, width: 90, height: 90 }, { id: 'el_star', fill: '#e8930c', rotation: 12 }),
          createTextElement({ x: 70, y: 300, width: 300, height: 50 }, { id: 'el_hidden', text: 'Hidden layer', hidden: true }),
        ],
      },
      {
        id: 'back',
        label: 'Back',
        print: CARD,
        background: { color: '#2f2a7a' },
        elements: [
          createShapeElement('ellipse', { x: 380, y: 90, width: 290, height: 290 }, { id: 'el_ring', fill: null, stroke: '#ffffff', strokeWidth: 10 }),
          createShapeElement('triangle', { x: 470, y: 170, width: 110, height: 100 }, { id: 'el_triangle', fill: '#e8930c' }),
          createShapeElement('line', { x: 300, y: 430, width: 450, height: 6 }, { id: 'el_rule', stroke: '#ffffff', strokeWidth: 4 }),
          createShapeElement('arrow', { x: 820, y: 440, width: 160, height: 60 }, { id: 'el_arrow', stroke: '#ffffff', strokeWidth: 8 }),
          createTextElement(
            { x: 175, y: 460, width: 700, height: 70 },
            { id: 'el_thanks', text: 'Thank you', fontSize: 58, fontWeight: 600, align: 'center', color: '#ffffff' },
          ),
        ],
      },
    ],
    meta: { createdAt: now, updatedAt: now, revision: 0 },
  };
}

/** Print geometry for each trim shape the Studio supports, sized like real products. */
export const DEMO_SHAPES: { value: string; label: string; print: SurfacePrint }[] = [
  { value: 'rectangle', label: 'Rectangle', print: CARD },
  { value: 'rounded', label: 'Rounded', print: { ...CARD, trim: { shape: 'rounded-rectangle', cornerRadiusPx: 35 } } },
  { value: 'oval', label: 'Oval', print: { widthPx: 1080, heightPx: 660, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'ellipse', cornerRadiusPx: 0 } } },
  { value: 'circle', label: 'Circle', print: { widthPx: 700, heightPx: 700, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'ellipse', cornerRadiusPx: 0 } } },
];
