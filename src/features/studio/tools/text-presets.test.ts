import { describe, expect, it } from 'vitest';
import { printBoxes } from '../geometry/boxes';
import { mmToPx, pxToPt } from '../geometry/units';
import type { SurfacePrint } from '../schema/types';
import { sequentialIds } from '../testing/fixtures';
import { presetById, presetElements, presetFontSize, TEXT_PRESETS } from './text-presets';

const card: SurfacePrint = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
const banner: SurfacePrint = { widthPx: 7087, heightPx: 3543, dpi: 100, bleedPx: 0, safeZonePx: 79, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
const inside = (outer: { x: number; y: number; width: number; height: number }, inner: { x: number; y: number; width: number; height: number }) =>
  inner.x >= outer.x - 0.01 && inner.y >= outer.y - 0.01 && inner.x + inner.width <= outer.x + outer.width + 0.01 && inner.y + inner.height <= outer.y + outer.height + 0.01;

describe('text presets', () => {
  it('offers heading, subheading, body and name + title in the Studio typefaces', () => {
    expect(TEXT_PRESETS.map((p) => p.id)).toEqual(['heading', 'subheading', 'body', 'name-title']);
    expect(presetById('heading').lines[0]).toMatchObject({ fontFamily: 'Fraunces', fontWeight: 600 });
    expect(presetById('body').lines[0]).toMatchObject({ fontFamily: 'Plus Jakarta Sans', fontWeight: 400 });
  });

  it('size text to the product in half points, never below 5 pt', () => {
    const heading = presetById('heading').lines[0]!;
    const cardPt = pxToPt(presetFontSize(heading, card), card.dpi);
    expect(cardPt).toBeCloseTo(13, 1); // a card heading
    expect(Math.abs(cardPt * 2 - Math.round(cardPt * 2))).toBeLessThan(0.01); // whole or half points (px are stored to 0.01)
    // At 150 DPI the same piece gets the same physical size.
    const card150 = { ...card, widthPx: 525, heightPx: 300, dpi: 150, safeZonePx: 12 };
    expect(pxToPt(presetFontSize(heading, card150), 150)).toBeCloseTo(cardPt, 1);
    expect(pxToPt(presetFontSize(heading, banner), banner.dpi)).toBeGreaterThan(200); // a banner heading
    const tiny = { ...card, widthPx: 120, heightPx: 60, safeZonePx: 2 };
    expect(pxToPt(presetFontSize(presetById('body').lines[0]!, tiny), 300)).toBeCloseTo(5, 1);
  });

  it('land centred inside the safe area as selected-to-replace sample text', () => {
    for (const print of [card, banner]) {
      const safe = printBoxes(print).safe;
      for (const preset of TEXT_PRESETS) {
        const elements = presetElements(preset, print, [], sequentialIds());
        for (const e of elements) {
          expect(inside(safe, e), `${preset.id} on ${print.widthPx}`).toBe(true);
          expect(e).toMatchObject({ type: 'text', align: 'center', placeholder: true, rotation: 0 });
        }
        const first = elements[0]!;
        expect(first.x + first.width / 2).toBeCloseTo(safe.x + safe.width / 2, 1);
        const last = elements.at(-1)!;
        expect((first.y + last.y + last.height) / 2).toBeCloseTo(safe.y + safe.height / 2, 0);
      }
    }
  });

  it('stack name and title as two layers', () => {
    const [name, title] = presetElements(presetById('name-title'), card, [], sequentialIds());
    expect(name).toMatchObject({ text: 'Your Name', fontFamily: 'Fraunces' });
    expect(title).toMatchObject({ text: 'Job title', letterSpacing: 0.04 });
    expect(title!.y).toBeGreaterThan(name!.y + name!.height);
    expect(title!.fontSize).toBeLessThan(name!.fontSize);
  });

  it('step down and right instead of covering text added earlier', () => {
    const ids = sequentialIds();
    const first = presetElements(presetById('heading'), card, [], ids);
    const second = presetElements(presetById('heading'), card, first, ids);
    const step = mmToPx(3, 300);
    expect(second[0]!.x - first[0]!.x).toBeCloseTo(step, 1);
    expect(second[0]!.y - first[0]!.y).toBeCloseTo(step, 1);
    expect(second[0]!.id).not.toBe(first[0]!.id);
  });
});
