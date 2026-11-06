import { createShapeElement, createTextElement } from '../../schema/create';
import type { ShapeElement, ShapeKind, SurfacePrint, TextElement } from '../../schema/types';

/**
 * Helpers for writing template definitions in millimetres (from the trim's top-left corner) and
 * points, at 300 DPI. They only build plain M2 element data; the result is checked like any other
 * template data when it loads (templates/validate.ts). Template texts are sample copy, marked as
 * placeholders until the customer changes them.
 */

const DPI = 300;
const px = (mm: number) => Math.round((mm * DPI * 100) / 25.4) / 100;
const ptPx = (pt: number) => Math.round((pt * DPI * 100) / 72) / 100;

export function print(widthPx: number, heightPx: number, bleedPx: number, safeZonePx: number, shape: SurfacePrint['trim']['shape'] = 'rectangle', cornerRadiusPx = 0): SurfacePrint {
  return { widthPx, heightPx, dpi: DPI, bleedPx, safeZonePx, trim: { shape, cornerRadiusPx } };
}

type Box = [x: number, y: number, width: number];

interface TextFields {
  font?: 'Plus Jakarta Sans' | 'Fraunces' | 'Inter' | 'Manrope';
  size: number;
  weight?: TextElement['fontWeight'];
  italic?: boolean;
  color: string;
  align?: TextElement['align'];
  lineHeight?: number;
  letterSpacing?: number;
}

/** Text at [x, y, width] mm; its height follows the text (re-measured when applied). */
export function text(id: string, [x, y, width]: Box, content: string, f: TextFields): TextElement {
  const lineHeight = f.lineHeight ?? 1.2;
  const lines = content.split('\n').length;
  return createTextElement(
    { x: px(x), y: px(y), width: px(width), height: Math.round(ptPx(f.size) * lineHeight * lines * 100) / 100 },
    {
      id,
      text: content,
      fontFamily: f.font ?? 'Plus Jakarta Sans',
      fontSize: ptPx(f.size),
      fontWeight: f.weight ?? 400,
      italic: f.italic ?? false,
      color: f.color,
      align: f.align ?? 'left',
      lineHeight,
      letterSpacing: f.letterSpacing ?? 0,
      placeholder: true,
    },
  );
}

interface ShapeFields {
  name?: string;
  fill?: string | null;
  stroke?: string | null;
  /** mm */
  strokeWidth?: number;
  /** mm */
  cornerRadius?: number;
  rotation?: number;
  points?: number;
  innerRadius?: number;
  opacity?: number;
}

/** A shape in the box [x, y, width, height] mm. */
export function shape(id: string, kind: ShapeKind, [x, y, width, height]: [number, number, number, number], f: ShapeFields = {}): ShapeElement {
  return createShapeElement(
    kind,
    { x: px(x), y: px(y), width: px(width), height: px(height) },
    {
      id,
      name: f.name ?? null,
      fill: f.fill === undefined ? (kind === 'line' ? null : '#4b43d6') : f.fill,
      stroke: f.stroke ?? null,
      strokeWidth: f.strokeWidth === undefined ? 0 : px(f.strokeWidth),
      cornerRadius: f.cornerRadius ? px(f.cornerRadius) : 0,
      rotation: f.rotation ?? 0,
      opacity: f.opacity ?? 1,
      ...(f.points ? { points: f.points } : {}),
      ...(f.innerRadius ? { innerRadius: f.innerRadius } : {}),
    },
  );
}

/** A straight rule from x to x + length mm at height y, `thickness` mm thick. */
export function rule(id: string, x: number, y: number, length: number, thickness: number, color: string, name = 'Divider'): ShapeElement {
  return shape(id, 'line', [x, y - thickness / 2, length, thickness], { name, stroke: color, strokeWidth: thickness, fill: null });
}
