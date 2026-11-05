import { DUPLICATE_OFFSET_MM } from '../canvas/transform-rules';
import { printBoxes } from '../geometry/boxes';
import { mmToPx, ptToPx, pxToPt } from '../geometry/units';
import { createId, type IdFactory } from '../ids';
import { createShapeElement } from '../schema/create';
import type { DesignElement, ShapeElement, ShapeKind, SurfacePrint } from '../schema/types';

/**
 * Shapes the Shapes tool adds (Plan §18.5). Sizes follow the product: a share of the safe area's
 * shorter side, so a business card gets a small shape and a banner a proportionally large one.
 * New shapes land centred in the safe area, fully inside it.
 */

export type ShapePresetId = 'rect' | 'rounded-rect' | 'circle' | 'ellipse' | 'triangle' | 'star' | 'polygon' | 'line' | 'arrow';

export interface ShapePreset {
  id: ShapePresetId;
  shape: ShapeKind;
  /** "Rectangle" → button "Add rectangle". */
  label: string;
  /** Box proportions (width ÷ height); lines use their own rule. */
  ratio: number;
}

export const SHAPE_PRESETS: readonly ShapePreset[] = [
  { id: 'rect', shape: 'rect', label: 'Rectangle', ratio: 1.5 },
  { id: 'rounded-rect', shape: 'rect', label: 'Rounded rectangle', ratio: 1.5 },
  { id: 'circle', shape: 'circle', label: 'Circle', ratio: 1 },
  { id: 'ellipse', shape: 'ellipse', label: 'Ellipse', ratio: 1.5 },
  { id: 'triangle', shape: 'triangle', label: 'Triangle', ratio: 1.15 },
  { id: 'star', shape: 'star', label: 'Star', ratio: 1 },
  { id: 'polygon', shape: 'polygon', label: 'Hexagon', ratio: 1 },
  { id: 'line', shape: 'line', label: 'Line', ratio: 0 },
  { id: 'arrow', shape: 'arrow', label: 'Arrow', ratio: 3 },
];

/** Share of the safe area's shorter side a new shape's height takes. */
const SIZE = 0.4;
/** Line thickness as a share of the shape size (≈ 1.5 pt on a business card). */
const LINE_WIDTH = 0.028;
/** Brand-neutral defaults that print well. */
export const SHAPE_FILL = '#2f5bd3';
export const LINE_COLOUR = '#1b1f27';

const round2 = (value: number) => Math.round(value * 100) / 100 || 0;

/** A thickness in whole quarter points, never thinner than ½ pt (a hairline that still prints). */
export function presetLineWidth(sizePx: number, dpi: number): number {
  const pt = Math.max(0.5, Math.round(pxToPt(sizePx * LINE_WIDTH, dpi) * 4) / 4);
  return round2(ptToPx(pt, dpi));
}

export function presetById(id: ShapePresetId): ShapePreset {
  const preset = SHAPE_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown shape preset "${id}"`);
  return preset;
}

/** The new shape for `preset` on this print, stepping past one already in exactly that spot. */
export function presetShape(preset: ShapePreset, print: SurfacePrint, existing: readonly DesignElement[] = [], newId: IdFactory = createId): ShapeElement {
  const { safe } = printBoxes(print);
  const size = Math.min(safe.width, safe.height) * SIZE;
  let width: number;
  let height: number;
  const fields: Partial<ShapeElement> = {};
  if (preset.shape === 'line') {
    const thickness = presetLineWidth(size, print.dpi);
    width = Math.min(safe.width * 0.6, size * 2);
    height = thickness;
    Object.assign(fields, { stroke: LINE_COLOUR, strokeWidth: thickness, fill: null });
  } else if (preset.shape === 'arrow') {
    height = size * 0.35;
    width = Math.min(safe.width * 0.9, height * preset.ratio);
    Object.assign(fields, { stroke: LINE_COLOUR, strokeWidth: presetLineWidth(size, print.dpi), fill: null });
  } else {
    height = size;
    width = Math.min(safe.width * 0.9, size * preset.ratio);
    Object.assign(fields, { fill: SHAPE_FILL, stroke: null, strokeWidth: 0 });
    if (preset.id === 'rounded-rect') fields.cornerRadius = round2(height * 0.2);
    if (preset.shape === 'polygon') fields.points = 6;
  }
  const x = safe.x + (safe.width - width) / 2;
  const y = safe.y + (safe.height - height) / 2;
  const step = mmToPx(DUPLICATE_OFFSET_MM, print.dpi);
  let offset = 0;
  for (let i = 0; i < 20 && existing.some((e) => Math.abs(e.x - (x + offset)) < 0.5 && Math.abs(e.y - (y + offset)) < 0.5); i += 1) offset += step;
  return createShapeElement(preset.shape, { x: round2(x + offset), y: round2(y + offset), width: round2(width), height: round2(height) }, fields, newId);
}
