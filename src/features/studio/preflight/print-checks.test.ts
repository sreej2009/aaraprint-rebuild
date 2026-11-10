import { describe, expect, it } from 'vitest';
import { createBlankDesign, createImageElement, createShapeElement, createTextElement } from '../schema/create';
import type { DesignDocument, SurfacePrint } from '../schema/types';
import { cardProfile, deepFreeze, uploadAsset } from '../testing/fixtures';
import { evaluatePrintChecks, type PrintCheckInputs, type ResourceState } from './print-checks';
import { PROOF_MAX_EDGE, PROOF_MAX_PIXELS, proofFileName, proofLayout } from './proof-layout';
import { proofTexts } from './proof-texts';

/**
 * Print checks and proof layout (M15): advice computed from the design and the product's print
 * geometry — the editor's own safe-zone/trim rule and the M12 DPI bands — and the proof size.
 */

const CARD: SurfacePrint = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
const available = (): ResourceState => 'available';

function design(build: (doc: DesignDocument) => void): DesignDocument {
  const doc = createBlankDesign(cardProfile, { newId: () => 'design_1' });
  build(doc);
  return deepFreeze(doc);
}

const check = (doc: DesignDocument, inputs: Partial<PrintCheckInputs> = {}) => evaluatePrintChecks({ document: doc, imageState: available, graphicState: available, ...inputs });
const kinds = (doc: DesignDocument, inputs: Partial<PrintCheckInputs> = {}) => check(doc, inputs).sides.map((s) => s.issues.map((i) => `${i.kind}:${i.elementId ?? '-'}`));

describe('safe zone and trim', () => {
  it('flags only what crosses: the safe zone as a warning, the trim as a stronger one — and never changes the design', () => {
    const doc = design((d) => {
      d.surfaces[0]!.elements.push(
        createTextElement({ x: 100, y: 100, width: 400, height: 60 }, { id: 'inside', text: 'Inside' }),
        createTextElement({ x: 10, y: 100, width: 400, height: 60 }, { id: 'near-edge', text: 'Near the edge' }),
        createShapeElement('rect', { x: -18, y: 500, width: 1086, height: 118 }, { id: 'band', name: 'Band' }),
        // Inside its own box, but turned so a corner crosses the trim.
        createShapeElement('rect', { x: 900, y: 40, width: 140, height: 140 }, { id: 'turned', rotation: 45 }),
        createTextElement({ x: -500, y: 100, width: 400, height: 60 }, { id: 'hidden-off', text: 'Hidden', hidden: true }),
      );
    });
    const report = check(doc);
    const front = report.sides[0]!;
    expect(front.issues.map((i) => [i.kind, i.level, i.elementId])).toEqual([
      ['outside-trim', 'serious', 'turned'],
      ['outside-trim', 'serious', 'band'],
      ['outside-safe', 'warning', 'near-edge'],
    ]);
    expect(front.issues[1]).toMatchObject({ title: 'Past the trim edge', subject: 'Band', surfaceId: 'front' });
    expect(front.issues[2]!.detail).toBe('Part of “Near the edge” is outside the safe zone and may be trimmed. Keep it at least 2 mm from the edge.');
    expect(front.passed).toEqual(['All fonts are available']);
    expect(report.warnings).toBe(3);
  });

  it('a design that stays inside passes, side by side', () => {
    const doc = design((d) => d.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 400, height: 60 }, { text: 'Hello' })));
    const report = check(doc);
    expect(report.warnings).toBe(0);
    expect(report.sides[0]!.passed).toEqual(['Nothing is past the trim edge', 'Everything is inside the safe zone', 'All fonts are available']);
    expect(report.sides[1]).toMatchObject({ empty: true, issues: [{ kind: 'empty-side', level: 'notice', title: 'No artwork on this side', detail: 'The back prints blank.' }], passed: [] });
  });

  it('round and rounded trims use their own shape', () => {
    const round: SurfacePrint = { ...CARD, widthPx: 700, heightPx: 700, trim: { shape: 'ellipse', cornerRadiusPx: 0 } };
    const doc = design((d) => {
      d.surfaces[0] = { ...d.surfaces[0]!, print: round, elements: [createShapeElement('rect', { x: 10, y: 10, width: 60, height: 60 }, { id: 'corner' })] };
    });
    // Inside the square box, but outside the circle.
    expect(kinds(doc)[0]).toEqual(['outside-trim:corner']);
  });
});

describe('images, graphics and fonts', () => {
  const withImage = (box: { width: number; height: number }, natural: [number, number] = [600, 400]) =>
    design((d) => {
      d.assets.asset_photo = uploadAsset('asset_photo', { name: 'photo.jpg', naturalWidth: natural[0], naturalHeight: natural[1] });
      d.surfaces[0]!.elements.push(createImageElement({ kind: 'asset', assetId: 'asset_photo' }, { x: 50, y: 100, ...box }, { id: 'photo' }));
    });

  it('uses the M12 bands: ≥ 300 good, 150–299 acceptable (a note), below 150 low (a warning) — the image is never changed', () => {
    // 600 px across 2 in (600 print px) = 300 DPI.
    expect(kinds(withImage({ width: 600, height: 400 }))[0]).toEqual([]);
    expect(check(withImage({ width: 600, height: 400 })).sides[0]!.passed).toContain('Images are sharp enough to print (150 DPI or more)');
    // 600 px over 3 in = 200 DPI (the narrower axis decides).
    const acceptable = check(withImage({ width: 900, height: 100 })).sides[0]!.issues;
    expect(acceptable).toMatchObject([{ kind: 'acceptable-resolution', level: 'notice', title: 'Acceptable resolution — 200 DPI' }]);
    // 200 px over 1.67 in = 120 DPI.
    const low = withImage({ width: 500, height: 250 }, [200, 100]);
    const issues = check(low).sides[0]!.issues.filter((i) => i.kind === 'low-resolution');
    expect(issues).toMatchObject([{ level: 'warning', title: 'Low resolution image — 120 DPI', subject: 'photo.jpg' }]);
    expect(issues[0]!.detail).toMatch(/Use a higher-resolution image/);
    expect(low.surfaces[0]!.elements[0]).toMatchObject({ width: 500, height: 250 });
  });

  it('an image or graphic this browser can’t show is “unavailable”, never removed; a font the Studio lacks is flagged', () => {
    const doc = design((d) => {
      d.assets.asset_gone = uploadAsset('asset_gone', { name: 'logo.png' });
      d.surfaces[0]!.elements.push(
        createImageElement({ kind: 'asset', assetId: 'asset_gone' }, { x: 100, y: 100, width: 200, height: 200 }, { id: 'logo' }),
        createImageElement({ kind: 'asset', assetId: 'asset_unknown' }, { x: 400, y: 100, width: 200, height: 200 }, { id: 'stray' }),
        createImageElement({ kind: 'graphic', graphicId: 'withheld-seal' }, { x: 700, y: 100, width: 200, height: 200 }, { id: 'seal' }),
        createTextElement({ x: 100, y: 400, width: 400, height: 60 }, { id: 'odd-font', text: 'Hello', fontFamily: 'Comic Sans MS' }),
      );
    });
    const report = check(doc, { imageState: (id) => (id === 'asset_gone' ? 'missing' : 'available'), graphicState: () => 'missing' });
    expect(report.sides[0]!.issues.map((i) => `${i.kind}:${i.elementId}`)).toEqual(['font-unavailable:odd-font', 'graphic-unavailable:seal', 'image-unavailable:stray', 'image-unavailable:logo']);
    expect(report.sides[0]!.issues.find((i) => i.elementId === 'logo')).toMatchObject({
      title: 'Image unavailable',
      detail: '“logo.png” isn’t in this browser, so it can’t be shown or printed. Replace it or delete it.',
    });
    expect(report.sides[0]!.passed).toEqual(['Nothing is past the trim edge', 'Everything is inside the safe zone']);
    // Still loading: not reported as missing (an image with no file record at all still is).
    expect(check(doc, { imageState: () => 'loading', graphicState: () => 'loading' }).sides[0]!.issues.map((i) => `${i.kind}:${i.elementId}`)).toEqual([
      'font-unavailable:odd-font',
      'image-unavailable:stray',
    ]);
  });
});

describe('empty designs and the report', () => {
  it('an empty design is one warning; nothing per side', () => {
    const report = check(design(() => {}));
    expect(report).toMatchObject({ empty: true, warnings: 1, issues: [{ kind: 'empty-design', title: 'Your design is empty' }] });
    expect(report.sides.map((s) => s.issues)).toEqual([[], []]);
  });

  it('a background colour alone isn’t empty; a one-sided design has no empty-side note', () => {
    const coloured = check(design((d) => (d.surfaces[1]!.background.color = '#2f2a7a')));
    expect(coloured.empty).toBe(false);
    expect(coloured.sides[1]!.empty).toBe(false);
    const oneSided = design((d) => {
      d.surfaces.splice(1, 1);
      d.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 400, height: 60 }, { text: 'Hello' }));
    });
    expect(check(oneSided).sides).toHaveLength(1);
  });
});

describe('proof layout', () => {
  it('a card, both sides, at full resolution: the formula', () => {
    const layout = proofLayout([CARD, CARD]);
    // L = 1086; margin 65, label 87, footer 130.
    expect(layout).toMatchObject({ width: 2 * 65 + 1086 * 2 + 65, height: 2 * 65 + 87 + 636 + 130, scale: 1, scaled: false });
    expect(layout.panels.map((p) => [p.x, p.y, p.width, p.height])).toEqual([
      [65, 152, 1086, 636],
      [65 + 1086 + 65, 152, 1086, 636],
    ]);
    expect(layout.panels[0]!.trim).toEqual({ x: 18, y: 18, width: 1050, height: 600 });
    expect(proofLayout([CARD]).width).toBe(2 * 65 + 1086);
  });

  it('the 30 MP canopy tent is scaled to 16 MP; no edge passes 16 384 px', () => {
    const tent: SurfacePrint = { widthPx: 9000, heightPx: 3358, dpi: 150, bleedPx: 30, safeZonePx: 50, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
    const layout = proofLayout([tent, tent]);
    expect(layout.scaled).toBe(true);
    expect(layout.width * layout.height).toBeLessThanOrEqual(PROOF_MAX_PIXELS);
    expect(layout.width * layout.height).toBeGreaterThan(PROOF_MAX_PIXELS * 0.99);
    expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(PROOF_MAX_EDGE);
    expect(layout.panels[0]!.width).toBeCloseTo(9060 * layout.scale, 5);
    // A long thin print is held by the edge limit.
    const strip: SurfacePrint = { ...tent, widthPx: 30_000, heightPx: 300, bleedPx: 0 };
    expect(proofLayout([strip]).width).toBeLessThanOrEqual(PROOF_MAX_EDGE);
  });

  it('rounded corners scale with the proof; no bleed means no bleed band', () => {
    const rounded: SurfacePrint = { ...CARD, widthPx: 12_000, heightPx: 8000, trim: { shape: 'rounded-rectangle', cornerRadiusPx: 350 } };
    const layout = proofLayout([rounded]);
    expect(layout.panels[0]!.shape).toEqual({ kind: 'rounded-rectangle', radius: 350 * layout.scale });
    expect(proofLayout([{ ...CARD, bleedPx: 0 }]).panels[0]!.bleed).toBe(0);
  });

  it('names the file after the design and the sides in it', () => {
    expect(proofFileName('Riya’s Visiting Card', 'all')).toBe('riyas-visiting-card-proof.png');
    expect(proofFileName('Café menu', ['Back'])).toBe('cafe-menu-back-proof.png');
    expect(proofFileName('***', 'all')).toBe('design-proof.png');
  });

  it('says what it is: a proof, not a print-ready file; scaled or not; the warnings', () => {
    const doc = design((d) => d.surfaces[0]!.elements.push(createTextElement({ x: 100, y: 100, width: 400, height: 60 }, { text: 'Hello' })));
    const texts = proofTexts(doc, 'Classic Visiting Cards', [doc.surfaces[0]!], proofLayout([CARD]), 2);
    expect(texts.sides).toEqual([{ label: 'Front', note: '88.9 × 50.8 mm · 1.5 mm bleed' }]);
    expect(texts.lines).toEqual([
      'Proof only — not a print-ready file. Colours on screen and in print can differ.',
      'The dark line is the trim: the tinted edge outside it (bleed) is cut off.',
      'At full print resolution (300 DPI).',
      'Print check: 2 warnings — see the Studio’s print check.',
    ]);
  });
});
