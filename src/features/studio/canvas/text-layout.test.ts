import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureFonts, resetFontsForTests } from '../assets/fonts';
import { updateElement } from '../commands';
import { createShapeElement, createTextElement } from '../schema/create';
import type { DesignDocument, TextElement } from '../schema/types';
import { sampleDesign } from '../testing/fixtures';
import { fakeMeasure } from '../testing/text-measure';
import { layoutChanges, measuredHeight, type TextMeasurer, registerTextMeasurer, relayoutDocument, subscribeTextMeasurer, textMeasurer, withTextHeight } from './text-layout';

const text = (fields: Partial<TextElement> = {}) => createTextElement({ x: 100, y: 100, width: 300, height: 60 }, { text: 'Hello', fontSize: 50, lineHeight: 1.2, ...fields }, () => 'el_t');
const doc = (): DesignDocument => {
  const base = sampleDesign();
  return { ...base, surfaces: base.surfaces.map((s, i) => (i === 0 ? { ...s, elements: [...s.elements, text()] } : s)) };
};
const find = (d: DesignDocument, id = 'el_t') => d.surfaces[0]!.elements.find((e) => e.id === id) as TextElement;

afterEach(() => {
  registerTextMeasurer(null);
  resetFontsForTests();
});

describe('text heights', () => {
  it('measure one line per paragraph and re-flow at the box width', () => {
    expect(measuredHeight(text(), fakeMeasure)).toBe(60); // 1 line × 50 × 1.2
    expect(measuredHeight(text({ text: 'Riya\nSharma' }), fakeMeasure)).toBe(120); // multiline
    expect(measuredHeight(text({ text: 'Riya Sharma Design' }), fakeMeasure)).toBe(120); // wraps
    expect(measuredHeight(text({ text: '' }), fakeMeasure)).toBe(60); // an empty box still holds a line
  });

  it('never store zero or NaN heights', () => {
    expect(measuredHeight(text(), () => 0)).toBe(60);
    expect(measuredHeight(text(), () => Number.NaN)).toBe(60);
  });

  it('keep the top edge in place when the height changes, also when rotated', () => {
    const flat = withTextHeight(text(), 120);
    expect(flat).toMatchObject({ x: 100, y: 100, height: 120 });
    const turned = withTextHeight(text({ rotation: 90 }), 120);
    // Rotated a quarter turn the box's top edge is on the right: it stays put as the box grows.
    const rightEdge = (e: TextElement) => e.x + e.width / 2 + e.height / 2;
    expect(rightEdge(turned)).toBeCloseTo(rightEdge(text({ rotation: 90 })), 6);
    const same = text();
    expect(withTextHeight(same, 60.001)).toBe(same); // sub-pixel noise is no change
  });
});

describe('layoutChanges', () => {
  it('re-measures only text whose wrapping inputs changed, keeping everything else identical', () => {
    const before = doc();
    const wider = updateElement<TextElement>(before, 'front', 'el_t', { text: 'Riya Sharma Design Studio' });
    const laid = layoutChanges(before, wider, fakeMeasure);
    expect(find(laid).height).toBe(180); // three lines in a 300 px box
    expect(laid.surfaces[1]).toBe(before.surfaces[1]);
    expect(laid.surfaces[0]!.elements[0]).toBe(before.surfaces[0]!.elements[0]);

    // Colour, alignment and position don't re-flow: the stored height is left alone.
    const measure = vi.fn<TextMeasurer>(fakeMeasure);
    const recoloured = updateElement<TextElement>(before, 'front', 'el_t', { color: '#b91c1c', align: 'center', x: 5 });
    expect(layoutChanges(before, recoloured, measure)).toBe(recoloured);
    expect(measure).not.toHaveBeenCalled();
  });

  it('measures new text and every field that changes wrapping', () => {
    const before = doc();
    const fields: Partial<TextElement>[] = [{ fontSize: 100 }, { lineHeight: 2 }, { width: 100, text: 'Hi there' }, { letterSpacing: 0.5, text: 'Hello there' }, { fontFamily: 'Fraunces', text: 'Hello there friend', width: 400 }];
    for (const patch of fields) {
      const next = layoutChanges(before, updateElement(before, 'front', 'el_t', patch), fakeMeasure);
      expect(find(next).height, JSON.stringify(patch)).toBe(Math.round(fakeMeasure(find(next)) * 100) / 100);
      expect(find(next).height).not.toBe(60);
    }
    const added = { ...before, surfaces: before.surfaces.map((s, i) => (i === 1 ? { ...s, elements: [createTextElement({ x: 0, y: 0, width: 50, height: 1 }, { text: 'New words here', fontSize: 20 }, () => 'el_new')] } : s)) };
    expect(added.surfaces[1]!.elements[0]!.height).toBe(1);
    expect(layoutChanges(before, added, fakeMeasure).surfaces[1]!.elements[0]!.height).toBe(72); // 3 lines × 24
  });

  it('leaves shapes and images alone', () => {
    const before = doc();
    const star = createShapeElement('star', { x: 0, y: 0, width: 10, height: 10 }, {}, () => 'el_star');
    const next = { ...before, surfaces: before.surfaces.map((s, i) => (i === 0 ? { ...s, elements: [...s.elements, star] } : s)) };
    expect(layoutChanges(before, next, fakeMeasure)).toBe(next);
  });
});

describe('relayoutDocument and the measurer registry', () => {
  it('corrects every text element, and is a no-op once heights are right', () => {
    const stale = doc(); // the sample's own heights were never measured
    const laid = relayoutDocument(stale, fakeMeasure);
    expect(laid).not.toBe(stale);
    expect(relayoutDocument(laid, fakeMeasure)).toBe(laid);
  });

  it('announces the measurer when the canvas registers it', () => {
    const listener = vi.fn<() => void>();
    const off = subscribeTextMeasurer(listener);
    registerTextMeasurer(fakeMeasure);
    expect(textMeasurer()).toBe(fakeMeasure);
    expect(listener).toHaveBeenCalledTimes(1);
    registerTextMeasurer(fakeMeasure);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('measures again after a web font loads (wrapping changes with the real font)', async () => {
    const element = text({ text: 'Hello there' });
    let wide = false;
    const measure = vi.fn<TextMeasurer>((e) => (wide ? 2 : 1) * e.fontSize * e.lineHeight);
    expect(measuredHeight(element, measure)).toBe(60);
    expect(measuredHeight(element, measure)).toBe(60);
    expect(measure).toHaveBeenCalledTimes(1); // cached per element
    wide = true;
    await ensureFonts([{ family: 'Fraunces', weight: 600, italic: false, text: 'Hello' }], { check: () => false, load: async () => [{} as FontFace] });
    expect(measuredHeight(element, measure)).toBe(120);
  });
});
