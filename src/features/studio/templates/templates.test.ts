import { describe, expect, it } from 'vitest';
import { printBoxes } from '../geometry/boxes';
import { createBlankDesign, createTextElement } from '../schema/create';
import type { DesignDocument, SurfacePrint } from '../schema/types';
import { validateDesign } from '../schema/validate';
import { createStudioStore } from '../store';
import { cardProfile, deepFreeze, sequentialIds } from '../testing/fixtures';
import { applyTemplate, placementTransform, templateTargets } from './apply';
import { templateFit } from './compat';
import { TEMPLATE_DEFINITIONS } from './data';
import { filterTemplates } from './registry';
import { isTwoSided, templateGraphicIds, type StudioTemplate } from './types';
import { buildCatalogue, checkTemplate } from './validate';

/**
 * Templates (M13): the shipped catalogue, checking definitions, compatibility with products,
 * search, and applying (fresh ids, replace and add, both sides, sizes, one undo step).
 */

const CARD: SurfacePrint = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
const catalogue = buildCatalogue(TEMPLATE_DEFINITIONS);
const byId = (id: string) => catalogue.templates.find((t) => t.id === id)!;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
/** A shipped template's raw definition, to break in one way. */
const raw = (id: string) => json(TEMPLATE_DEFINITIONS.find((t) => (t as { id: string }).id === id));
const blank = (): DesignDocument => createBlankDesign(cardProfile, { newId: () => 'design_1' });

describe('the shipped catalogue', () => {
  it('has 16 valid, cleared templates with unique ids, using only shapes, text and Studio fonts', () => {
    expect(catalogue.rejected).toEqual([]);
    expect(catalogue.templates).toHaveLength(16);
    expect(new Set(catalogue.templates.map((t) => t.id)).size).toBe(16);
    for (const template of catalogue.templates) {
      expect(template.rights).toBe('cleared');
      expect(templateGraphicIds(template)).toEqual([]);
      const elements = [...template.surfaces.front.elements, ...(template.surfaces.back?.elements ?? [])];
      expect(elements.every((e) => e.type !== 'image')).toBe(true);
      expect(JSON.stringify(template)).not.toMatch(/data:|base64|blob:|<svg|https?:/);
    }
    expect(catalogue.templates.filter(isTwoSided).map((t) => t.id)).toEqual(['card-minimal-centred', 'card-classic-emblem', 'invite-modern-wedding']);
  });

  it('keeps every text inside the safe area of the size it was laid out for', () => {
    for (const template of catalogue.templates) {
      for (const surface of [template.surfaces.front, template.surfaces.back]) {
        if (!surface) continue;
        const safe = printBoxes(surface.print).safe;
        for (const e of surface.elements.filter((el) => el.type === 'text')) {
          expect(e.x, `${template.id} ${e.id}`).toBeGreaterThanOrEqual(safe.x);
          expect(e.x + e.width, `${template.id} ${e.id}`).toBeLessThanOrEqual(safe.x + safe.width + 0.5);
          expect(e.y, `${template.id} ${e.id}`).toBeGreaterThanOrEqual(safe.y);
          expect(e.y + e.height, `${template.id} ${e.id}`).toBeLessThanOrEqual(safe.y + safe.height);
        }
      }
    }
  });

  it('marks template texts as sample copy (placeholders) to be replaced', () => {
    const texts = catalogue.templates.flatMap((t) => [...t.surfaces.front.elements, ...(t.surfaces.back?.elements ?? [])]).filter((e) => e.type === 'text');
    expect(texts.length).toBeGreaterThan(50);
    expect(texts.every((t) => t.type === 'text' && t.placeholder)).toBe(true);
  });
});

describe('checking definitions', () => {
  const reasonFor = (definition: unknown) => {
    const check = checkTemplate(definition);
    return check.ok ? 'ok' : `${check.reason}: ${check.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`;
  };

  it('accepts a good definition and rebuilds it from known fields only', () => {
    const definition = { ...raw('card-bold-left'), extra: '<script>' };
    const check = checkTemplate(definition);
    expect(check.ok).toBe(true);
    expect(check.ok && 'extra' in check.template).toBe(false);
  });

  it('rejects broken or unsafe definitions, each with a reason', () => {
    const t = raw('card-bold-left');
    const front = (t.surfaces as { front: { elements: Record<string, unknown>[]; print: Record<string, unknown> } }).front;
    expect(reasonFor({ ...t, id: 'Bad Id' })).toMatch(/^invalid: id/);
    expect(reasonFor({ ...t, name: '' })).toMatch(/name/);
    expect(reasonFor({ ...t, category: 'Holidays' })).toMatch(/category/);
    expect(reasonFor({ ...t, families: ['spaceships'] })).toMatch(/families/);
    expect(reasonFor({ ...t, tags: ['<b>'] })).toMatch(/tags/);
    expect(reasonFor({ ...t, surfaces: {} })).toMatch(/surfaces.front is required/);
    expect(reasonFor({ ...t, surfaces: { ...(t.surfaces as object), inside: {} } })).toMatch(/unknown sides: inside/);
    const withElement = (element: Record<string, unknown>) => ({ ...t, surfaces: { front: { ...front, elements: [...front.elements, element] } } });
    const text = json(front.elements[2]);
    expect(reasonFor(withElement({ ...text, id: 'x1', fontFamily: 'Comic Sans MS' }))).toMatch(/isn’t a Studio font/);
    expect(reasonFor(withElement({ ...text, id: 'x2', text: 'data:image/png;base64,AAAA' }))).toMatch(/embedded file data/);
    expect(reasonFor(withElement({ ...text, id: 'x3', x: 99_000 }))).toMatch(/printed area/);
    expect(reasonFor(withElement({ ...text, id: front.elements[0]!.id }))).toMatch(/invalid/);
    expect(
      reasonFor(
        withElement({ id: 'x4', type: 'image', name: null, x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, locked: false, hidden: false, source: { kind: 'asset', assetId: 'asset_1' } }),
      ),
    ).toMatch(/invalid/);
    expect(reasonFor(withElement({ ...text, id: 'x5', type: 'konva-node' }))).toMatch(/invalid/);
    const twoSided = raw('card-minimal-centred');
    const surfaces = twoSided.surfaces as { front: object; back: { print: Record<string, unknown> } };
    expect(reasonFor({ ...twoSided, surfaces: { ...surfaces, back: { ...surfaces.back, print: { ...surfaces.back.print, widthPx: 900 } } } })).toMatch(/must be the same size as the front/);
  });

  it('withholds templates whose rights aren’t confirmed', () => {
    expect(reasonFor({ ...raw('card-bold-left'), rights: 'unconfirmed' })).toBe('rights: rights usage rights aren’t confirmed');
  });

  it('a bad definition doesn’t stop the others; a repeated id is dropped', () => {
    const result = buildCatalogue([raw('card-bold-left'), { id: 'broken' }, 'nonsense', { ...raw('flyer-sale'), rights: 'unconfirmed' }, raw('card-bold-left'), raw('flyer-sale')]);
    expect(result.templates.map((t) => t.id)).toEqual(['card-bold-left', 'flyer-sale']);
    expect(result.rejected.map((r) => [r.id, r.reason])).toEqual([
      ['broken', 'invalid'],
      ['?', 'invalid'],
      ['flyer-sale', 'rights'],
      ['card-bold-left', 'invalid'],
    ]);
  });
});

describe('compatibility', () => {
  const card = byId('card-minimal-centred');
  it('exact on the size it was made for, fitted on similar sizes, not offered otherwise', () => {
    expect(templateFit(card, 'visiting-card', CARD)).toEqual({ level: 'exact', label: 'Fits this product' });
    // 85 × 55 mm: same family, 10 % different proportions.
    expect(templateFit(card, 'visiting-card', { ...CARD, widthPx: 1004, heightPx: 650 })).toEqual({ level: 'adapted', label: 'Fitted to 85 × 55 mm' });
    // Same size at another resolution is still exact.
    expect(templateFit(card, 'visiting-card', { ...CARD, widthPx: 525, heightPx: 300, dpi: 150 }).level).toBe('exact');
    expect(templateFit(card, 'pen', CARD)).toEqual({ level: 'none', label: 'Made for visiting cards' });
    expect(templateFit(card, 'visiting-card', { ...CARD, widthPx: 780, heightPx: 780 })).toEqual({ level: 'none', label: 'Made for a different shape (88.9 × 50.8 mm)' });
    expect(templateFit(card, 'visiting-card', { ...CARD, trim: { shape: 'ellipse', cornerRadiusPx: 0 } })).toEqual({ level: 'none', label: 'Made for products with straight edges' });
    expect(templateFit(card, 'visiting-card', { ...CARD, trim: { shape: 'rounded-rectangle', cornerRadiusPx: 35 } }).level).toBe('exact');
    expect(templateFit(byId('round-centred-badge'), 'visiting-card', CARD)).toEqual({ level: 'none', label: 'Made for round products' });
  });
});

describe('search and categories', () => {
  const all = catalogue.templates;
  const ids = (list: StudioTemplate[]) => list.map((t) => t.id);
  it('matches name, category and tags, case-insensitive, every word; combines with a category', () => {
    expect(ids(filterTemplates(all, 'WEDDING', null))).toEqual(['invite-modern-wedding']);
    expect(ids(filterTemplates(all, 'serif', null))).toEqual(['card-editorial-serif', 'flyer-editorial-notice', 'invite-modern-wedding']);
    expect(ids(filterTemplates(all, 'labels', null))).toEqual(['round-centred-badge', 'label-product', 'stamp-address']);
    expect(ids(filterTemplates(all, 'minimal card', null))).toEqual([]);
    expect(ids(filterTemplates(all, 'minimal', 'Stationery'))).toEqual(['letterhead-editorial-sidebar', 'envelope-minimal-corporate']);
    expect(ids(filterTemplates(all, '', 'Promotions'))).toEqual(['flyer-sale', 'pen-wordmark']);
    expect(filterTemplates(all, '   ', null)).toHaveLength(16);
    expect(filterTemplates(all, 'zzz', null)).toEqual([]);
  });
});

describe('applying', () => {
  const template = deepFreeze(byId('card-minimal-centred'));
  const bandTemplate = deepFreeze(byId('card-bold-left'));

  it('copies the template side with fresh ids, its background, order and positions; never changes the template', () => {
    const ids = sequentialIds();
    const doc = applyTemplate(blank(), template, [{ surfaceId: 'front', side: 'front' }], 'replace', () => ids('el'));
    const front = doc.surfaces[0]!;
    expect(front.elements.map((e) => e.id)).toEqual(['el_1', 'el_2', 'el_3']);
    expect(front.elements.map((e) => e.type)).toEqual(template.surfaces.front.elements.map((e) => e.type));
    expect(front.elements.map(({ id: _id, ...rest }) => rest)).toEqual(template.surfaces.front.elements.map(({ id: _id, ...rest }) => rest));
    expect(front.background).toEqual(template.surfaces.front.background);
    expect(doc.surfaces[1]!.elements).toEqual([]); // the back is untouched
    expect(validateDesign(doc)).toEqual([]);
  });

  it('applying the same template twice never repeats an id', () => {
    const ids = sequentialIds();
    let doc = applyTemplate(blank(), template, [{ surfaceId: 'front', side: 'front' }], 'add', () => ids('el'));
    doc = applyTemplate(doc, template, [{ surfaceId: 'front', side: 'front' }], 'add', () => ids('el'));
    const all = doc.surfaces[0]!.elements.map((e) => e.id);
    expect(all).toHaveLength(6);
    expect(new Set(all).size).toBe(6);
    expect(() => applyTemplate(doc, template, [{ surfaceId: 'front', side: 'front' }], 'add', () => 'el_1')).toThrow(/already in use/);
  });

  it('replace swaps a side’s artwork and background; add keeps them and puts the template on top', () => {
    const start = blank();
    start.surfaces[0] = { ...start.surfaces[0]!, background: { color: '#ffeedd' }, elements: [createTextElement({ x: 10, y: 10, width: 100, height: 20 }, { id: 'mine' })] };
    const ids = sequentialIds();
    const replaced = applyTemplate(start, bandTemplate, [{ surfaceId: 'front', side: 'front' }], 'replace', () => ids('el'));
    expect(replaced.surfaces[0]!.elements.some((e) => e.id === 'mine')).toBe(false);
    expect(replaced.surfaces[0]!.background.color).toBeNull();
    const added = applyTemplate(start, byId('card-classic-emblem'), [{ surfaceId: 'front', side: 'front' }], 'add', () => ids('el'));
    expect(added.surfaces[0]!.elements[0]!.id).toBe('mine');
    expect(added.surfaces[0]!.elements).toHaveLength(5);
    expect(added.surfaces[0]!.background.color).toBe('#ffeedd'); // the side's own background stays
    // On a side with no background, add brings the template's.
    const plain = applyTemplate(blank(), byId('card-classic-emblem'), [{ surfaceId: 'front', side: 'front' }], 'add', () => ids('el'));
    expect(plain.surfaces[0]!.background.color).toBe('#f6f3ec');
  });

  it('both sides: front to front and back to back; a one-sided template goes on whichever side is active', () => {
    const doc = blank();
    expect(templateTargets(template, doc, 'front', 'both')).toEqual([
      { surfaceId: 'front', side: 'front' },
      { surfaceId: 'back', side: 'back' },
    ]);
    expect(templateTargets(template, doc, 'back', 'side')).toEqual([{ surfaceId: 'back', side: 'back' }]);
    expect(templateTargets(bandTemplate, doc, 'back', 'both')).toEqual([{ surfaceId: 'back', side: 'front' }]);
    const ids = sequentialIds();
    const both = applyTemplate(doc, template, templateTargets(template, doc, 'front', 'both'), 'replace', () => ids('el'));
    expect(both.surfaces.map((s) => s.elements.length)).toEqual([3, 2]);
    expect(both.surfaces[1]!.background.color).toBe('#1b1f27');
  });

  it('same size at another DPI keeps millimetres; another size fits the safe area, bands still reach the edges', () => {
    const ids = sequentialIds();
    const at150 = { ...CARD, widthPx: 525, heightPx: 300, dpi: 150, bleedPx: 9, safeZonePx: 12 };
    const half = placementTransform(CARD, at150);
    expect(half).toMatchObject({ scale: 0.5, adapted: false });
    // 85 × 55 mm with its own bleed and safe area.
    const other: SurfacePrint = { ...CARD, widthPx: 1004, heightPx: 650, bleedPx: 24, safeZonePx: 36 };
    const doc = { ...blank(), surfaces: blank().surfaces.map((s) => ({ ...s, print: other })) };
    const placed = applyTemplate(doc, bandTemplate, [{ surfaceId: 'front', side: 'front' }], 'replace', () => ids('el')).surfaces[0]!.elements;
    const safe = printBoxes(other).safe;
    for (const e of placed.filter((el) => el.type === 'text')) {
      expect(e.x).toBeGreaterThanOrEqual(safe.x - 0.01);
      expect(e.x + e.width).toBeLessThanOrEqual(safe.x + safe.width + 0.01);
    }
    const band = placed.find((e) => e.name === 'Colour block')!;
    expect(band).toMatchObject({ x: -24, y: -24, height: 650 + 48 }); // still bleeds off three edges
    expect(band.width).toBeLessThan(other.widthPx / 2);
  });

  it('in the store: one undo step, nothing selected; undo and redo; history label', () => {
    const store = createStudioStore({ document: blank(), newId: sequentialIds(), measureText: null });
    const { actions } = store.getState();
    actions.addElement(createTextElement({ x: 10, y: 10, width: 100, height: 20 }, { id: 'mine' }));
    expect(actions.applyTemplate(template, 'both', 'replace')).toBe(true);
    let state = store.getState();
    expect(state.history.past.at(-1)!.label).toBe('Apply template “Minimal centred”');
    expect(state.editor.selectedIds).toEqual([]);
    expect(state.document.surfaces.map((s) => s.elements.length)).toEqual([3, 2]);
    expect(state.history.past).toHaveLength(2);
    actions.undo();
    state = store.getState();
    expect(state.document.surfaces.map((s) => s.elements.map((e) => e.id))).toEqual([['mine'], []]);
    actions.redo();
    expect(store.getState().document.surfaces.map((s) => s.elements.length)).toEqual([3, 2]);
  });
});
