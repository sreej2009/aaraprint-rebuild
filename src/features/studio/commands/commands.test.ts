import { describe, expect, it } from 'vitest';
import { mmToPx } from '../geometry/units';
import { createImageElement, createShapeElement, createTextElement } from '../schema/create';
import type { DesignDocument, ImageElement, ShapeElement, SurfacePrint, TextElement } from '../schema/types';
import { validateDesign } from '../schema/validate';
import { deepFreeze, sampleDesign, sequentialIds, uploadAsset } from '../testing/fixtures';
import {
  addAsset,
  addElement,
  arrangeElement,
  clearSurface,
  copySurface,
  DesignCommandError,
  duplicateElement,
  findElement,
  moveElementTo,
  removeAssets,
  removeElements,
  renameDesign,
  resizeSurface,
  setBackground,
  setVariant,
  updateElement,
} from './index';

/** Every test starts from a deeply frozen document: any mutation throws. */
const frozen = (): DesignDocument => deepFreeze(sampleDesign());
const ids = (doc: DesignDocument, surface = 0) => doc.surfaces[surface]?.elements.map((e) => e.id);
const front = (doc: DesignDocument) => doc.surfaces[0]!;
const back = (doc: DesignDocument) => doc.surfaces[1]!;
const box = { x: 100, y: 100, width: 200, height: 100 };

describe('element commands', () => {
  it('add elements on top or at an index, without touching other surfaces', () => {
    const doc = frozen();
    const star = createShapeElement('star', box, { id: 'el_star' });
    const next = addElement(doc, 'front', star);
    expect(ids(next)).toEqual(['el_band', 'el_name', 'el_logo', 'el_star']);
    expect(ids(addElement(doc, 'front', star, 0))).toEqual(['el_star', 'el_band', 'el_name', 'el_logo']);
    expect(ids(addElement(doc, 'front', star, 99))).toEqual(['el_band', 'el_name', 'el_logo', 'el_star']);
    expect(back(next)).toBe(back(doc));
    expect(validateDesign(next)).toEqual([]);
  });

  it('refuse duplicate ids, bad geometry and images without their asset', () => {
    const doc = frozen();
    expect(() => addElement(doc, 'back', createTextElement(box, { id: 'el_name' }))).toThrow(DesignCommandError);
    expect(() => addElement(doc, 'front', createTextElement({ ...box, width: 0 }, { id: 'el_x' }))).toThrow(/positive size/);
    expect(() => addElement(doc, 'front', createTextElement({ ...box, x: Number.NaN }, { id: 'el_y' }))).toThrow(/non-numeric/);
    expect(() => addElement(doc, 'front', createImageElement({ kind: 'asset', assetId: 'nope' }, box, { id: 'el_z' }))).toThrow(/asset/);
    expect(() => addElement(doc, 'inside', createTextElement(box, { id: 'el_w' }))).toThrow(/Unknown surface/);
  });

  it('update only what changed and return the same document for no-ops', () => {
    const doc = frozen();
    const moved = updateElement(doc, 'front', 'el_name', { x: 75, y: 64 });
    expect(front(moved).elements[1]).toMatchObject({ x: 75, y: 64, text: 'Riya Sharma' });
    // Untouched elements and surfaces keep their identity (cheap undo history).
    expect(front(moved).elements[0]).toBe(front(doc).elements[0]);
    expect(front(moved).elements[2]).toBe(front(doc).elements[2]);
    expect(back(moved)).toBe(back(doc));

    expect(updateElement(doc, 'front', 'el_name', { x: 60 })).toBe(doc);
    expect(updateElement(doc, 'front', 'el_name', {})).toBe(doc);
    expect(updateElement<ImageElement>(doc, 'front', 'el_logo', { source: { kind: 'asset', assetId: 'asset_logo' } })).toBe(doc);
  });

  it('update type-specific fields, visibility, locking and names', () => {
    const doc = frozen();
    const next = updateElement<TextElement>(doc, 'front', 'el_name', { fontWeight: 800, italic: true, hidden: true, locked: true, name: 'Name' });
    expect(front(next).elements[1]).toMatchObject({ fontWeight: 800, italic: true, hidden: true, locked: true, name: 'Name' });
    expect(validateDesign(next)).toEqual([]);
  });

  it('refuse to change identity, break geometry or point an image at an unknown asset', () => {
    const doc = frozen();
    expect(() => updateElement(doc, 'front', 'el_name', { id: 'other' } as never)).toThrow(/id and type/);
    expect(() => updateElement(doc, 'front', 'el_name', { width: -5 })).toThrow(/positive size/);
    expect(() => updateElement(doc, 'front', 'el_name', { opacity: 2 })).toThrow(/opacity/);
    expect(() => updateElement<ImageElement>(doc, 'front', 'el_logo', { source: { kind: 'asset', assetId: 'gone' } })).toThrow(/Unknown asset/);
    expect(() => updateElement(doc, 'front', 'el_missing', { x: 1 })).toThrow(/Unknown element/);
  });

  it('remove one or several elements', () => {
    const doc = frozen();
    expect(ids(removeElements(doc, 'front', ['el_name']))).toEqual(['el_band', 'el_logo']);
    expect(ids(removeElements(doc, 'front', ['el_band', 'el_logo']))).toEqual(['el_name']);
    expect(removeElements(doc, 'front', [])).toBe(doc);
    expect(() => removeElements(doc, 'front', ['el_missing'])).toThrow(DesignCommandError);
  });

  it('duplicate directly above the original, offset and unlocked', () => {
    const doc = updateElement(frozen(), 'front', 'el_name', { locked: true });
    const offset = mmToPx(3, 300);
    const next = duplicateElement(doc, 'front', 'el_name', 'el_copy', offset);
    expect(ids(next)).toEqual(['el_band', 'el_name', 'el_copy', 'el_logo']);
    expect(front(next).elements[2]).toMatchObject({ id: 'el_copy', text: 'Riya Sharma', x: 60 + offset, y: 60 + offset, locked: false });
    expect(() => duplicateElement(doc, 'front', 'el_name', 'el_logo', offset)).toThrow(/already in use/);
  });

  it('find an element on any surface', () => {
    const doc = frozen();
    expect(findElement(doc, 'el_logo')?.surface.id).toBe('front');
    expect(findElement(doc, 'nope')).toBeNull();
  });
});

describe('stacking order', () => {
  it('moves elements forward, backward, to the front and to the back', () => {
    const doc = frozen();
    expect(ids(arrangeElement(doc, 'front', 'el_band', 'forward'))).toEqual(['el_name', 'el_band', 'el_logo']);
    expect(ids(arrangeElement(doc, 'front', 'el_logo', 'backward'))).toEqual(['el_band', 'el_logo', 'el_name']);
    expect(ids(arrangeElement(doc, 'front', 'el_band', 'front'))).toEqual(['el_name', 'el_logo', 'el_band']);
    expect(ids(arrangeElement(doc, 'front', 'el_logo', 'back'))).toEqual(['el_logo', 'el_band', 'el_name']);
    expect(ids(moveElementTo(doc, 'front', 'el_logo', 1))).toEqual(['el_band', 'el_logo', 'el_name']);
  });

  it('is a no-op at the ends', () => {
    const doc = frozen();
    expect(arrangeElement(doc, 'front', 'el_logo', 'forward')).toBe(doc);
    expect(arrangeElement(doc, 'front', 'el_band', 'backward')).toBe(doc);
    expect(moveElementTo(doc, 'front', 'el_band', -4)).toBe(doc);
  });
});

describe('surface commands', () => {
  it('set and clear the background colour', () => {
    const doc = frozen();
    expect(back(setBackground(doc, 'back', '#1B1F27')).background.color).toBe('#1b1f27');
    expect(setBackground(doc, 'front', '#f4f1ea')).toBe(doc);
    expect(front(setBackground(doc, 'front', null)).background.color).toBeNull();
    expect(() => setBackground(doc, 'front', 'blue')).toThrow(/Invalid colour/);
  });

  it('clear a surface', () => {
    const doc = frozen();
    const cleared = clearSurface(doc, 'front');
    expect(front(cleared)).toMatchObject({ elements: [], background: { color: null } });
    expect(clearSurface(cleared, 'front')).toBe(cleared);
    expect(back(cleared)).toBe(back(doc));
  });

  it('copy front to back, replacing or keeping the back’s artwork, with new ids', () => {
    const doc = addElement(frozen(), 'back', createTextElement(box, { id: 'el_back_note', text: 'Thank you' }));
    const newId = sequentialIds();
    const replaced = copySurface(doc, 'front', 'back', 'replace', () => newId('el'));
    expect(ids(replaced, 1)).toEqual(['el_1', 'el_2', 'el_3']);
    expect(back(replaced).background.color).toBe('#f4f1ea');
    expect(back(replaced).elements[1]).toMatchObject({ text: 'Riya Sharma', x: 60, y: 60 });
    expect(front(replaced)).toBe(front(doc));
    expect(validateDesign(replaced)).toEqual([]);

    const kept = copySurface(doc, 'front', 'back', 'append', () => newId('el'));
    expect(ids(kept, 1)).toEqual(['el_back_note', 'el_4', 'el_5', 'el_6']);
    expect(back(kept).background.color).toBeNull();

    expect(() => copySurface(doc, 'front', 'front', 'replace', () => newId('el'))).toThrow(/two different/);
    expect(() => copySurface(doc, 'front', 'back', 'replace', () => 'el_name')).toThrow(/already in use/);
  });
});

describe('resizeSurface (size corrections and size-changing options)', () => {
  const card = (): DesignDocument => frozen();
  const print = (doc: DesignDocument): SurfacePrint => front(doc).print;

  it('fits the artwork to a new size, centred, scaling text and strokes', () => {
    const doc = card();
    // Same proportions, twice the size: everything doubles.
    const twice: SurfacePrint = { ...print(doc), widthPx: 2100, heightPx: 1200 };
    const next = resizeSurface(doc, 'front', twice, 'fit');
    expect(front(next).print).toEqual(twice);
    expect(front(next).elements[1]).toMatchObject({ x: 120, y: 120, width: 1200, height: 160, fontSize: 150 });
    expect(back(next)).toBe(back(doc)); // only the chosen surface changes

    // Wider canvas: scale by height, centre horizontally.
    const wide: SurfacePrint = { ...print(doc), widthPx: 1500, heightPx: 600 };
    const centred = resizeSurface(doc, 'front', wide, 'fit');
    expect(front(centred).elements[1]).toMatchObject({ x: 60 + 225, y: 60, width: 600, fontSize: 75 });
  });

  it('can keep physical sizes when only the resolution changes', () => {
    const doc = card();
    const at150: SurfacePrint = { ...print(doc), widthPx: 525, heightPx: 300, dpi: 150 };
    const next = resizeSurface(doc, 'front', at150, 'keep-size');
    const name = front(next).elements[1] as TextElement;
    expect(name).toMatchObject({ x: 30, y: 30, width: 300, height: 40, fontSize: 37.5 });
    const band = front(next).elements[0] as ShapeElement;
    expect(band.width).toBe(543);
  });

  it('is a no-op for the same geometry', () => {
    const doc = card();
    expect(resizeSurface(doc, 'front', { ...print(doc), trim: { ...print(doc).trim } }, 'fit')).toBe(doc);
  });

  it('fits copies to a surface of a different size', () => {
    const doc = resizeSurface(card(), 'back', { ...print(card()), widthPx: 2100, heightPx: 1200 }, 'fit');
    const newId = sequentialIds();
    const copied = copySurface(doc, 'front', 'back', 'replace', () => newId('el'));
    expect(back(copied).elements[1]).toMatchObject({ x: 120, y: 120, fontSize: 150 });
  });
});

describe('document commands', () => {
  it('rename, tidying whitespace and refusing empty names', () => {
    const doc = frozen();
    expect(renameDesign(doc, '  Riya’s   card ').name).toBe('Riya’s card');
    expect(renameDesign(doc, doc.name)).toBe(doc);
    expect(renameDesign(doc, 'x'.repeat(300)).name).toHaveLength(120);
    expect(() => renameDesign(doc, '   ')).toThrow(/needs a name/);
  });

  it('set the variant', () => {
    const doc = frozen();
    expect(setVariant(doc, 'variant_2').product.variantId).toBe('variant_2');
    expect(setVariant(doc, 'variant_1')).toBe(doc);
  });

  it('add and remove asset references (never file bytes)', () => {
    const doc = frozen();
    const asset = uploadAsset('asset_photo', { name: 'team.jpg', mime: 'image/jpeg' });
    const added = addAsset(doc, asset);
    expect(Object.keys(added.assets)).toEqual(['asset_logo', 'asset_photo']);
    expect(addAsset(added, { ...asset })).toBe(added);
    expect(() => addAsset(added, { ...asset, bytes: 1 })).toThrow(/already in use/);
    expect(Object.keys(removeAssets(added, ['asset_photo', 'unknown']).assets)).toEqual(['asset_logo']);
    expect(removeAssets(added, ['unknown'])).toBe(added);
    expect(JSON.stringify(added)).not.toMatch(/base64|data:/);
  });
});

describe('history friendliness', () => {
  it('100 edits share every unchanged object, so 100 undo steps stay cheap', () => {
    let doc = frozen();
    const history: DesignDocument[] = [doc];
    for (let i = 1; i <= 100; i += 1) {
      doc = updateElement(doc, 'front', 'el_name', { x: 60 + i });
      history.push(doc);
    }
    expect(history).toHaveLength(101);
    expect(new Set(history).size).toBe(101); // every step is a distinct, restorable state
    expect(history.every((d) => d.surfaces[1] === history[0]?.surfaces[1])).toBe(true);
    expect(history.every((d) => d.surfaces[0]?.elements[2] === history[0]?.surfaces[0]?.elements[2])).toBe(true);
    expect(history.every((d) => d.assets === history[0]?.assets)).toBe(true);
    expect(front(history[0]!).elements[1]).toMatchObject({ x: 60 });
    expect(front(history[100]!).elements[1]).toMatchObject({ x: 160 });
  });
});
