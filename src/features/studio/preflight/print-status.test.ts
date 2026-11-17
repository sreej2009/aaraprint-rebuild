import { describe, expect, it } from 'vitest';
import { productWorkflow } from '@/features/product-workflow/registry';
import { approvalBlockers } from '../approval/approval';
import { createBlankDesign, createImageElement, createShapeElement, createTextElement } from '../schema/create';
import type { DesignDocument, SurfacePrint } from '../schema/types';
import { readProduct, readProfile } from '../testing/catalogue-fixtures';
import { uploadAsset } from '../testing/fixtures';
import { artworkPlacement, coversPiece, evaluatePrintChecks, type ResourceState } from './print-checks';
import { describeArtwork, printFactNotes, printFacts, printReadiness } from './print-status';

/**
 * Print check (Phase 4 M6): print facts from the products' real print configurations, where each
 * element sits against safe zone, trim and bleed, resolution only where it can be worked out, and
 * the status — Ready, Warning, or Needs attention exactly when M5 approval is blocked.
 */

const NBSP = String.fromCharCode(0xa0);
const n = (text: string) => text.replaceAll(NBSP, ' ');
const available = (): ResourceState => 'available';
const facts = (print: SurfacePrint) => Object.fromEntries(printFacts(print).map((f) => [f.term, n(f.value)]));

/** A design for a real product, from its profile (print configuration copied per side, as the Studio does). */
function designFor(slug: string, build: (doc: DesignDocument) => void = () => {}): DesignDocument {
  const product = readProduct(slug);
  const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0]!;
  const doc = createBlankDesign(readProfile(slug), { newId: () => `design_${slug}`, variantId: variant.id, catalogue: product });
  doc.product.configuration.orientation = 'horizontal';
  build(doc);
  return doc;
}
const check = (doc: DesignDocument, imageState: (id: string) => ResourceState = available, graphicState: (id: string) => ResourceState = available) =>
  evaluatePrintChecks({ document: doc, imageState, graphicState });

describe('print facts come from the product’s print configuration (never estimated)', () => {
  it('visiting card: trim, bleed, safe zone, DPI and print px', () => {
    const doc = designFor('business-card-classic');
    expect(facts(doc.surfaces[0]!.print)).toEqual({
      'Print size (trim)': '88.9 × 50.8 mm',
      'With bleed': '91.9 × 53.8 mm',
      Bleed: '1.5 mm each side',
      'Safe zone': '2 mm inside the trim',
      'Print resolution': '300 DPI',
      'Print area': '1050 × 600 px (1086 × 636 px with bleed)',
      Shape: 'Rectangle',
    });
  });

  it('photo-frame and wrap families without bleed say “No bleed”, not a made-up one', () => {
    expect(facts(designFor('umbrella-golf').surfaces[0]!.print)).toMatchObject({ 'Print size (trim)': '15.2 × 20.3 cm', 'With bleed': 'No bleed', Bleed: 'None', 'Safe zone': '5.1 mm inside the trim', 'Print area': '1800 × 2400 px' });
    expect(facts(designFor('pen-gold-click').surfaces[0]!.print)).toMatchObject({ 'Print size (trim)': '10.2 × 2 cm', Bleed: 'None', 'Print resolution': '300 DPI' });
    expect(facts(designFor('gift-mug-custom-black').surfaces[0]!.print)).toMatchObject({ 'Print size (trim)': '22.9 × 8.9 cm', Bleed: 'None' });
    expect(facts(designFor('business-card-circle').surfaces[0]!.print)).toMatchObject({ Shape: 'Round' });
  });

  it('a product whose printed size follows a choice says that size isn’t available here', () => {
    expect(facts(designFor('banner-vinyl-standard').surfaces[0]!.print)).toMatchObject({ 'Print resolution': '100 DPI', Bleed: '5.1 mm each side' });
    expect(printFactNotes(readProfile('banner-vinyl-standard'))).toEqual(['The printed size for your size choice isn’t available here: these figures are this product’s design area.']);
    expect(printFactNotes(readProfile('business-card-classic'))).toEqual([]);
  });
});

describe('safe zone, trim and bleed', () => {
  const card = designFor('business-card-classic').surfaces[0]!.print;
  const pen = designFor('pen-gold-click').surfaces[0]!.print;
  const rect = (x: number, y: number, width: number, height: number, rotation = 0) => createShapeElement('rect', { x, y, width, height }, { rotation });

  it('inside, past the safe zone, into the bleed, past the bleed, off the print area', () => {
    expect(artworkPlacement(rect(100, 100, 200, 100), card)).toBe('inside');
    expect(artworkPlacement(rect(10, 100, 200, 100), card)).toBe('outside-safe');
    expect(artworkPlacement(rect(-10, 100, 200, 100), card)).toBe('into-bleed');
    expect(artworkPlacement(rect(-18, 100, 200, 100), card)).toBe('into-bleed'); // exactly to the bleed edge
    expect(artworkPlacement(rect(-40, 100, 200, 100), card)).toBe('past-bleed');
    expect(artworkPlacement(rect(-400, 100, 200, 100), card)).toBe('off-print');
    expect(artworkPlacement(rect(950, 20, 140, 140, 45), card)).toBe('past-bleed'); // rotated corners count
  });

  it('with no bleed (pens), anything past the trim is past the edge of the print area', () => {
    expect(artworkPlacement(rect(-5, 50, 200, 100), pen)).toBe('past-bleed');
    const doc = designFor('pen-gold-click', (d) => d.surfaces[0]!.elements.push({ ...rect(-5, 50, 200, 100), id: 'over' }));
    expect(check(doc).sides[0]!.issues[0]).toMatchObject({ kind: 'outside-trim', level: 'serious', title: 'Past the edge of the print area' });
  });

  it('a background covering the whole piece is a note, not a warning; a band in the bleed still is a warning (M15 rule)', () => {
    const doc = designFor('business-card-classic', (d) =>
      d.surfaces[0]!.elements.push(
        createShapeElement('rect', { x: -18, y: -18, width: 1086, height: 636 }, { id: 'bg', fill: '#2f2a7a' }),
        createShapeElement('rect', { x: -18, y: 470, width: 1086, height: 148 }, { id: 'band', fill: '#ffffff' }),
        createShapeElement('rect', { x: -30, y: -30, width: 1110, height: 660 }, { id: 'outline', fill: null, stroke: '#000000', strokeWidth: 4 }),
      ),
    );
    expect(coversPiece(doc.surfaces[0]!.elements[0]!, card)).toBe(true);
    const issues = check(doc).sides[0]!.issues.map((i) => `${i.kind}:${i.level}:${i.elementId}`);
    expect(issues).toEqual(['outside-trim:serious:outline', 'outside-trim:serious:band', 'bleed-background:notice:bg']);
    expect(check(doc).warnings).toBe(2);
    // Beyond the bleed is said more strongly.
    expect(check(doc).sides[0]!.issues[0]).toMatchObject({ title: 'Past the trim edge and the bleed' });
  });

  it('the checks never change the design', () => {
    const doc = designFor('business-card-classic', (d) => d.surfaces[0]!.elements.push({ ...rect(-40, 100, 200, 100), id: 'over' }));
    const before = JSON.stringify(doc);
    check(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('resolution', () => {
  const withImage = (natural: [number, number], box: { width: number; height: number }, mime: 'image/png' | 'image/svg+xml' = 'image/png') =>
    designFor('business-card-classic', (d) => {
      d.assets['asset_photo'] = { ...uploadAsset('asset_photo'), mime, naturalWidth: natural[0], naturalHeight: natural[1] };
      d.surfaces[0]!.elements.push(createImageElement({ kind: 'asset', assetId: 'asset_photo' }, { x: 100, y: 100, ...box }, { id: 'photo' }));
    });
  const artwork = (doc: DesignDocument, imageState?: (id: string) => ResourceState) => check(doc, imageState).sides[0]!.artwork[0]!;

  it('an uploaded photo: its file’s pixels over its printed size (600 px over 2 in = 300 DPI)', () => {
    // 600 print px at 300 DPI = 2 in wide.
    expect(artwork(withImage([600, 400], { width: 600, height: 400 })).resolution).toEqual({ kind: 'raster', dpi: 300, level: 'good', sourcePx: { width: 600, height: 400 }, printedMm: { width: 50.8, height: 33.9 } });
    expect(artwork(withImage([300, 200], { width: 600, height: 400 })).resolution).toMatchObject({ dpi: 150, level: 'acceptable' });
    expect(artwork(withImage([100, 100], { width: 600, height: 600 })).resolution).toMatchObject({ dpi: 50, level: 'low' });
    expect(check(withImage([100, 100], { width: 600, height: 600 })).sides[0]!.issues.map((i) => i.kind)).toContain('low-resolution');
  });

  it('text, shapes, library graphics and SVG files are vectors: no DPI, never low resolution', () => {
    const doc = designFor('business-card-classic', (d) =>
      d.surfaces[0]!.elements.push(
        createTextElement({ x: 100, y: 100, width: 300, height: 60 }, { id: 'text', text: 'Riya' }),
        createShapeElement('star', { x: 500, y: 100, width: 60, height: 60 }, { id: 'star' }),
        createImageElement({ kind: 'graphic', graphicId: 'leaf' }, { x: 700, y: 100, width: 900, height: 900 }, { id: 'graphic' }),
      ),
    );
    const side = check(doc).sides[0]!;
    expect(side.artwork.map((a) => [a.elementId, a.type, a.resolution.kind])).toEqual([
      ['graphic', 'graphic', 'vector'],
      ['star', 'shape', 'vector'],
      ['text', 'text', 'vector'],
    ]);
    expect(side.issues.filter((i) => i.kind.includes('resolution'))).toEqual([]);
    expect(artwork(withImage([10, 10], { width: 900, height: 900 }, 'image/svg+xml')).resolution).toEqual({ kind: 'vector' });
    expect(describeArtwork(side.artwork[2]!, true).resolution).toBe('Vector text: sharp at any size');
  });

  it('unknown pixel size or a missing file: no DPI is made up', () => {
    const unknown = artwork(withImage([0, 0], { width: 600, height: 400 }));
    expect(unknown.resolution).toEqual({ kind: 'unknown' });
    expect(describeArtwork(unknown, true).resolution).toBe('Resolution can’t be determined: the file’s pixel size isn’t known');
    const missing = artwork(withImage([600, 400], { width: 600, height: 400 }), () => 'missing');
    expect(missing.resolution).toEqual({ kind: 'unavailable' });
    expect(describeArtwork(missing, true)).toMatchObject({ resolution: 'Not available: the file is missing', tone: 'warning' });
  });

  it('template sample text is a note (never a warning, never blocking)', () => {
    const doc = designFor('business-card-classic', (d) => d.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 300, height: 60 }, { id: 'sample', text: 'Your Name', placeholder: true })));
    expect(check(doc).sides[0]!.issues).toMatchObject([{ kind: 'sample-text', level: 'notice' }]);
    expect(check(doc).warnings).toBe(0);
  });
});

describe('status: Ready, Warning, Needs attention (exactly when M5 approval is blocked)', () => {
  const product = readProduct('business-card-classic');
  const workflow = productWorkflow('business-card-classic');
  const status = (doc: DesignDocument, imageState?: (id: string) => ResourceState) => {
    const report = check(doc, imageState);
    const blockers = approvalBlockers({ product, workflow, document: doc, report });
    return { readiness: printReadiness(report, blockers, doc.product.configuration.sameDesignBothSides), blockers };
  };

  it('Ready: nothing to fix; a blank back is “Blank”, not a problem', () => {
    const { readiness, blockers } = status(designFor('business-card-classic', (d) => d.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 300, height: 60 }, { text: 'Riya' }))));
    expect(blockers).toEqual([]);
    expect(readiness).toMatchObject({ overall: 'ready', summary: 'Ready to print: nothing to fix.' });
    expect(readiness.sides.map((s) => [s.label, s.status, s.detail])).toEqual([
      ['Front', 'ready', 'No warnings'],
      ['Back', 'blank', 'No artwork; prints blank'],
    ]);
  });

  it('Warning: worth checking, approval still allowed (as the original allowed)', () => {
    const { readiness, blockers } = status(designFor('business-card-classic', (d) => d.surfaces[1]!.elements.push(createTextElement({ x: 5, y: 100, width: 300, height: 60 }, { text: 'Near the edge' }))));
    expect(blockers).toEqual([]);
    expect(readiness).toMatchObject({ overall: 'warning', summary: '1 thing worth checking. You can still approve.' });
    expect(readiness.sides.map((s) => s.status)).toEqual(['blank', 'warning']);
  });

  it('Needs attention when approval is blocked: an empty design, a missing file', () => {
    const empty = status(designFor('business-card-classic'));
    expect(empty.blockers.map((b) => b.kind)).toEqual(['empty']);
    expect(empty.readiness.overall).toBe('blocked');
    expect(empty.readiness.sides.map((s) => s.status)).toEqual(['blocked', 'blocked']);

    const missing = status(
      designFor('business-card-classic', (d) => {
        d.assets['asset_logo'] = uploadAsset('asset_logo');
        d.surfaces[0]!.elements.push(createImageElement({ kind: 'asset', assetId: 'asset_logo' }, { x: 100, y: 100, width: 200, height: 200 }));
      }),
      () => 'missing',
    );
    expect(missing.blockers.map((b) => b.kind)).toEqual(['missing-file']);
    expect(missing.readiness).toMatchObject({ overall: 'blocked', summary: 'Needs attention: one thing has to be fixed before you can approve.' });
    expect(missing.readiness.sides[0]).toMatchObject({ status: 'blocked', detail: 'A file is missing' });
  });

  it('“Same design on both sides” is said on a blank side, nothing is drawn for it', () => {
    const { readiness } = status(
      designFor('business-card-classic', (d) => {
        d.product.configuration.sameDesignBothSides = true;
        d.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 300, height: 60 }, { text: 'Riya' }));
      }),
    );
    expect(readiness.sides[1]).toMatchObject({ status: 'blank', detail: 'No artwork of its own; “Same design on both sides” is on' });
  });

  it('a one-sided design has one status and no back', () => {
    const doc = designFor('business-card-classic', (d) => {
      d.surfaces.splice(1, 1);
      d.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 300, height: 60 }, { text: 'Riya' }));
    });
    const { readiness } = status(doc);
    expect(readiness.sides.map((s) => s.label)).toEqual(['Front']);
    expect(check(doc).sides[0]!.issues).toEqual([]);
  });

  it('each family is checked against its own print area: front and back independently', () => {
    for (const slug of ['umbrella-golf', 'rainwear-waterproof-jacket-standard', 'drinkware-bottle-aluminium', 'pen-gold-click', 'gift-mug-custom-black', 'apparel-tshirt-classic-cotton']) {
      const doc = designFor(slug, (d) => {
        const back = d.surfaces[1]!.print;
        d.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 200, height: 60 }, { id: 'inside', text: 'Logo' }));
        d.surfaces[1]!.elements.push(createShapeElement('rect', { x: back.widthPx - 50, y: 100, width: 200, height: 60 }, { id: 'over', fill: '#000000' }));
      });
      const report = check(doc);
      expect([slug, report.sides.map((s) => s.issues.filter((i) => i.level !== 'notice').map((i) => i.kind))]).toEqual([slug, [[], ['outside-trim']]]);
    }
  });
});
