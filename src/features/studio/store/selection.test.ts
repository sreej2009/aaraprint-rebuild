import { describe, expect, it } from 'vitest';
import { removeElements, updateElement } from '../commands';
import { describeElements, elementDisplayName } from '../naming';
import { createImageElement, createShapeElement, createTextElement } from '../schema/create';
import { sampleDesign } from '../testing/fixtures';
import { isAllowedOnLocked, isPickable, nextSelection, pruneSelection } from './selection';

describe('nextSelection', () => {
  it('replaces, adds and toggles, keeping order and removing duplicates', () => {
    expect(nextSelection(['a', 'b'], ['c', 'c'], 'replace')).toEqual(['c']);
    expect(nextSelection(['a', 'b'], ['b', 'c'], 'add')).toEqual(['a', 'b', 'c']);
    expect(nextSelection(['a', 'b'], ['b', 'c'], 'toggle')).toEqual(['a', 'c']);
    expect(nextSelection(['a'], ['a'], 'toggle')).toEqual([]);
    expect(nextSelection([], [], 'replace')).toEqual([]);
  });
});

describe('pruneSelection', () => {
  it('keeps only ids on the given surface', () => {
    const doc = sampleDesign();
    expect(pruneSelection(['el_name', 'el_logo'], doc, 'front')).toEqual(['el_name', 'el_logo']);
    expect(pruneSelection(['el_name'], doc, 'back')).toEqual([]);
    expect(pruneSelection(['el_name'], removeElements(doc, 'front', ['el_name']), 'front')).toEqual([]);
    expect(pruneSelection(['el_name'], doc, 'nowhere')).toEqual([]);
    const same = ['el_name'];
    expect(pruneSelection(same, doc, 'front')).toBe(same); // unchanged selections keep identity
  });
});

describe('locking and visibility rules', () => {
  it('only visible, unlocked elements are pickable on the canvas', () => {
    const doc = updateElement(updateElement(sampleDesign(), 'front', 'el_band', { locked: true }), 'front', 'el_logo', { hidden: true });
    expect(doc.surfaces[0]?.elements.map(isPickable)).toEqual([false, true, false]);
  });

  it('a locked element still accepts unlocking, show/hide and renaming only', () => {
    expect(isAllowedOnLocked({ locked: false })).toBe(true);
    expect(isAllowedOnLocked({ hidden: true, name: 'Logo' })).toBe(true);
    expect(isAllowedOnLocked({ x: 10 })).toBe(false);
    expect(isAllowedOnLocked({ locked: false, x: 10 })).toBe(false);
  });
});

describe('layer names', () => {
  const box = { x: 0, y: 0, width: 10, height: 10 };
  it('use the custom name, then the content', () => {
    const doc = sampleDesign();
    expect(elementDisplayName(createTextElement(box, { text: '\n  Riya Sharma\nDesigner' }))).toBe('Riya Sharma');
    expect(elementDisplayName(createTextElement(box, { text: '   ' }))).toBe('Text');
    expect(elementDisplayName(createTextElement(box, { text: 'x'.repeat(50) }))).toHaveLength(32);
    expect(elementDisplayName(createShapeElement('star', box))).toBe('Star');
    expect(elementDisplayName(createImageElement({ kind: 'asset', assetId: 'asset_logo' }, box), doc)).toBe('logo.png');
    expect(elementDisplayName(createImageElement({ kind: 'graphic', graphicId: 'business-growth' }, box))).toBe('Business growth');
    expect(elementDisplayName(createShapeElement('rect', box, { name: 'Brand band' }))).toBe('Brand band');
  });

  it('describe one or several elements for undo labels', () => {
    const doc = sampleDesign();
    const [band, name] = doc.surfaces[0]!.elements;
    expect(describeElements([name!])).toBe('“Riya Sharma”');
    expect(describeElements([band!, name!])).toBe('2 items');
  });
});
