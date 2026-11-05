import { describe, expect, it } from 'vitest';
import { announcementFor } from '../canvas/announcements';
import { createViewportStore } from '../canvas/viewport-store';
import { demoDesign } from '../demo/demo-design';
import { createBlankDesign, createImageElement, createShapeElement, createTextElement } from '../schema/create';
import type { DesignDocument, TextElement } from '../schema/types';
import { parseDesign, validateDesign } from '../schema/validate';
import { createStudioStore, selectActiveSurface, type StudioStore } from '../store';
import { cardProfile, sequentialIds } from '../testing/fixtures';
import { describeContents, frontToBackPlan, hasSides, isSurfaceEmpty } from './side-rules';

/**
 * Front/back (M10): sides stay independent, copy and clear are single undo steps, undo follows
 * the side it changes, and each side keeps its own view. Demo card: front has 8 elements, back 5.
 */

function store(document: DesignDocument = demoDesign(), surfaceId?: string): StudioStore {
  let n = 0;
  return createStudioStore({ document, clock: () => (n += 1000), newId: sequentialIds(), ...(surfaceId ? { surfaceId } : {}) });
}
const surface = (s: StudioStore, id: string) => s.getState().document.surfaces.find((x) => x.id === id)!;
const active = (s: StudioStore) => s.getState().editor.activeSurfaceId;

describe('side rules', () => {
  it('know what is empty, what can be copied and how to describe it', () => {
    const blank = createBlankDesign(cardProfile);
    expect(isSurfaceEmpty(blank.surfaces[0]!)).toBe(true);
    expect(hasSides(blank)).toBe(true);
    expect(frontToBackPlan(blank)).toBeNull(); // nothing on the front to copy
    const demo = demoDesign();
    expect(frontToBackPlan(demo)).toMatchObject({ from: { id: 'front' }, to: { id: 'back' }, needsChoice: true });
    expect(describeContents(demo.surfaces[1]!)).toBe('5 items and a background colour');
    const withBg = { ...blank.surfaces[1]!, background: { color: '#2f2a7a' } };
    expect(isSurfaceEmpty(withBg)).toBe(false);
    expect(describeContents(withBg)).toBe('a background colour');
    expect(hasSides({ ...blank, surfaces: [blank.surfaces[0]!] })).toBe(false);
    expect(frontToBackPlan({ ...demo, surfaces: [demo.surfaces[0]!] })).toBeNull();
  });
});

describe('switching sides', () => {
  it('clears selection, hover and text editing; never touches either side', () => {
    const s = store();
    const before = s.getState().document;
    s.getState().actions.setEditingText('el_name');
    s.getState().actions.setHovered('el_star');
    s.getState().actions.setActiveSurface('back');
    expect(s.getState().editor).toEqual({ activeSurfaceId: 'back', selectedIds: [], hoveredId: null, editingTextId: null });
    expect(s.getState().document).toBe(before);
    expect(s.getState().history.past).toHaveLength(0);
    s.getState().actions.setActiveSurface('inside'); // unknown sides are ignored
    expect(active(s)).toBe('back');
  });

  it('open on the side asked for, or the front for an unknown one', () => {
    expect(active(store(demoDesign(), 'back'))).toBe('back');
    expect(active(store(demoDesign(), 'nope'))).toBe('front');
  });

  it('keep backgrounds and elements per side', () => {
    const s = store(createBlankDesign(cardProfile));
    s.getState().actions.setBackground('#f4f1ea');
    s.getState().actions.addElement(createTextElement({ x: 0, y: 0, width: 100, height: 20 }, { id: 'el_front' }));
    s.getState().actions.setActiveSurface('back');
    expect(selectActiveSurface(s.getState())).toMatchObject({ id: 'back', elements: [], background: { color: null } });
    s.getState().actions.setBackground('#1b1f27');
    expect(surface(s, 'front').background.color).toBe('#f4f1ea');
    expect(surface(s, 'back').background.color).toBe('#1b1f27');
  });
});

describe('undo and redo across sides', () => {
  it('follow the global history and take you to the side they change', () => {
    const s = store();
    const a = s.getState().actions;
    a.updateElement('el_name', { x: 100 }); // front edit
    a.setActiveSurface('back');
    a.updateElement('el_thanks', { y: 400 }); // back edit
    a.setActiveSurface('front');

    const prev = s.getState();
    a.undo(); // the back edit, which takes you to the back
    expect(active(s)).toBe('back');
    expect(announcementFor(prev, s.getState())).toMatch(/^Undone: .*Now on the back\./);
    expect(surface(s, 'back').elements.find((e) => e.id === 'el_thanks')!.y).toBe(460);
    expect(surface(s, 'front').elements.find((e) => e.id === 'el_name')!.x).toBe(100); // the front is untouched

    a.undo(); // the front edit
    expect(active(s)).toBe('front');
    expect(surface(s, 'front').elements.find((e) => e.id === 'el_name')!.x).toBe(70);
    a.redo();
    a.redo();
    expect(active(s)).toBe('back');
    expect(surface(s, 'back').elements.find((e) => e.id === 'el_thanks')!.y).toBe(400);
    a.setActiveSurface('front');
    expect(surface(s, 'front').elements.find((e) => e.id === 'el_name')!.x).toBe(100);
    expect(s.getState().editor.selectedIds).toEqual([]); // no stale selection from the other side
  });
});

describe('copy front to back', () => {
  it('replaces the back with new ids, keeps graphic references, leaves the front alone — one undo step', () => {
    const doc = demoDesign();
    doc.surfaces[0]!.elements.push(createImageElement({ kind: 'graphic', graphicId: 'verified-seal' }, { x: 10, y: 10, width: 50, height: 50 }, { id: 'el_seal' }));
    const s = store(doc);
    const front = surface(s, 'front');
    s.getState().actions.select(['el_name']);
    expect(s.getState().actions.copySurface('front', 'back', 'replace')).toBe(true);
    const back = surface(s, 'back');
    expect(active(s)).toBe('back');
    expect(s.getState().editor.selectedIds).toEqual([]);
    expect(surface(s, 'front')).toBe(front);
    expect(back.elements).toHaveLength(front.elements.length);
    const frontIds = new Set(front.elements.map((e) => e.id));
    expect(back.elements.some((e) => frontIds.has(e.id))).toBe(false);
    expect(back.elements.at(-1)).toMatchObject({ type: 'image', source: { kind: 'graphic', graphicId: 'verified-seal' } });
    expect(back.background).toEqual(front.background);
    expect((back.elements[1] as TextElement).text).toBe('Riya Sharma');
    expect(validateDesign(s.getState().document)).toEqual([]);
    expect(JSON.stringify(s.getState().document)).not.toMatch(/data:|base64/);
    expect(s.getState().history.past).toHaveLength(1);
    s.getState().actions.undo();
    expect(surface(s, 'back').elements.map((e) => e.id)).toEqual(['el_ring', 'el_triangle', 'el_rule', 'el_arrow', 'el_thanks']);
  });

  it('keep both adds the copy on top of the back’s own artwork and keeps its background', () => {
    const s = store();
    s.getState().actions.copySurface('front', 'back', 'append');
    const back = surface(s, 'back');
    expect(back.elements).toHaveLength(5 + 8);
    expect(back.elements.slice(0, 5).map((e) => e.id)).toEqual(['el_ring', 'el_triangle', 'el_rule', 'el_arrow', 'el_thanks']);
    expect(back.background.color).toBe('#2f2a7a');
  });
});

describe('clear side', () => {
  it('clears only the side asked for, in one undo step; an empty side records nothing', () => {
    const s = store();
    const front = surface(s, 'front');
    s.getState().actions.setActiveSurface('back');
    expect(s.getState().actions.clearSurface('back')).toBe(true);
    expect(surface(s, 'back')).toMatchObject({ elements: [], background: { color: null } });
    expect(surface(s, 'front')).toBe(front);
    expect(s.getState().actions.clearSurface('back')).toBe(false);
    expect(s.getState().history.past).toHaveLength(1);
    s.getState().actions.undo();
    expect(surface(s, 'back').elements).toHaveLength(5);
  });
});

describe('each side keeps its own view', () => {
  const content = { x: -18, y: -18, width: 1086, height: 636 };

  it('restores a zoomed or panned side, fits a side seen for the first time', () => {
    const v = createViewportStore({ showGuides: true });
    const a = v.getState().actions;
    a.setArea({ width: 1000, height: 700 });
    a.showSurface('front', content, 300);
    const fitted = v.getState().viewport;
    a.zoomTo(150);
    a.panBy(-40, 10);
    const frontView = v.getState().viewport;
    a.showSurface('back', content, 300);
    expect(v.getState().viewport).toEqual(fitted); // first visit to the back: fit
    expect(v.getState().mode).toBe('fit');
    a.zoomTo(75);
    const backView = v.getState().viewport;
    a.showSurface('front', content, 300);
    expect(v.getState().viewport).toEqual(frontView);
    a.showSurface('back', content, 300);
    expect(v.getState().viewport).toEqual(backView);
  });

  it('keeps the centre point when the window resized meanwhile, and re-fits a side whose size changed', () => {
    const v = createViewportStore({ showGuides: true });
    const a = v.getState().actions;
    a.setArea({ width: 1000, height: 700 });
    a.showSurface('front', content, 300);
    a.zoomTo(200);
    const frontView = v.getState().viewport;
    a.showSurface('back', content, 300);
    a.setArea({ width: 1200, height: 700 });
    a.showSurface('front', content, 300);
    expect(v.getState().viewport.x).toBeCloseTo(frontView.x + 100, 6);
    a.showSurface('back', { ...content, width: 2000 }, 300);
    expect(v.getState().mode).toBe('fit');
  });
});

describe('older designs', () => {
  it('open with both sides, text, shapes and graphics intact', () => {
    const doc = demoDesign();
    doc.surfaces[1]!.elements.push(createShapeElement('star', { x: 0, y: 0, width: 50, height: 50 }, { id: 'el_old_star' }));
    const raw = JSON.parse(JSON.stringify(doc));
    for (const e of raw.surfaces[1].elements) if (e.type === 'shape') delete e.innerRadius;
    const parsed = parseDesign(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.surfaces.map((x) => [x.id, x.elements.length])).toEqual([
      ['front', 8],
      ['back', 6],
    ]);
    expect(validateDesign(parsed.document)).toEqual([]);
  });
});
