import { printBoxes, type Rect } from '../geometry/boxes';
import { offsetShape, type TrimShape } from '../geometry/shapes';
import type { DesignElement, FontWeight, ShapeElement, SurfacePrint, TextElement } from '../schema/types';

/**
 * Pure mapping from the design document to what the canvas draws. Kept free of Konva so it can be
 * unit-tested; canvas/canvas-stage.tsx turns these descriptions into Konva nodes.
 */

// ------------------------------------------------------------------ Elements

/** Every element is drawn in its own box (0..width, 0..height), rotated around the box centre. */
export interface ElementFrame {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  opacity: number;
}

export function elementFrame(element: DesignElement): ElementFrame {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
    offsetX: element.width / 2,
    offsetY: element.height / 2,
    rotation: element.rotation,
    opacity: element.opacity,
  };
}

export type Drawing =
  | {
      kind: 'text';
      text: string;
      width: number;
      fontFamily: string;
      fontSize: number;
      fontStyle: string;
      textDecoration: string;
      fill: string;
      align: TextElement['align'];
      lineHeight: number;
      letterSpacing: number;
    }
  | { kind: 'rect'; width: number; height: number; cornerRadius: number; fill: string | null; stroke: string | null; strokeWidth: number }
  | { kind: 'ellipse'; x: number; y: number; radiusX: number; radiusY: number; fill: string | null; stroke: string | null; strokeWidth: number }
  | { kind: 'polyline'; points: number[]; closed: boolean; fill: string | null; stroke: string | null; strokeWidth: number }
  | { kind: 'arrow'; points: number[]; pointerLength: number; pointerWidth: number; fill: string | null; stroke: string | null; strokeWidth: number }
  | { kind: 'image-placeholder'; width: number; height: number };

/** Families available to the canvas, mapped to the self-hosted web fonts. Extended in M8. */
const FONT_STACKS: Record<string, string> = {
  Inter: "'Inter Variable', Inter, sans-serif",
  Manrope: "'Manrope Variable', Manrope, sans-serif",
};

export function fontCss(family: string): string {
  return FONT_STACKS[family] ?? `'${family.replace(/'/g, '')}', sans-serif`;
}

/** Konva's fontStyle goes into the CSS `font` shorthand: "italic 700". */
export function fontStyleFor(weight: FontWeight, italic: boolean): string {
  return `${italic ? 'italic ' : ''}${weight}`;
}

/** Star outline inside a w × h box: alternating outer and inner points, first point at the top. */
export function starPoints(points: number, width: number, height: number, innerRatio = 0.5): number[] {
  const out: number[] = [];
  const rx = width / 2;
  const ry = height / 2;
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? 1 : innerRatio;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    out.push(rx + Math.cos(angle) * rx * r, ry + Math.sin(angle) * ry * r);
  }
  return out;
}

export function drawingFor(element: DesignElement): Drawing {
  const { width: w, height: h } = element;
  if (element.type === 'text') {
    return {
      kind: 'text',
      text: element.text,
      width: w,
      fontFamily: fontCss(element.fontFamily),
      fontSize: element.fontSize,
      fontStyle: fontStyleFor(element.fontWeight, element.italic),
      textDecoration: element.underline ? 'underline' : '',
      fill: element.color,
      align: element.align,
      lineHeight: element.lineHeight,
      // Stored in em so it scales with the text; Konva wants px.
      letterSpacing: element.letterSpacing * element.fontSize,
    };
  }
  if (element.type === 'image') return { kind: 'image-placeholder', width: w, height: h };
  return shapeDrawing(element);
}

function shapeDrawing(shape: ShapeElement): Drawing {
  const { width: w, height: h, fill, stroke, strokeWidth } = shape;
  const paint = { fill, stroke, strokeWidth };
  switch (shape.shape) {
    case 'rect':
      return { kind: 'rect', width: w, height: h, cornerRadius: Math.min(shape.cornerRadius, w / 2, h / 2), ...paint };
    case 'ellipse':
      return { kind: 'ellipse', x: w / 2, y: h / 2, radiusX: w / 2, radiusY: h / 2, ...paint };
    case 'line':
      return { kind: 'polyline', points: [0, h / 2, w, h / 2], closed: false, fill: null, stroke: stroke ?? fill, strokeWidth: strokeWidth || h };
    case 'triangle':
      return { kind: 'polyline', points: [w / 2, 0, w, h, 0, h], closed: true, ...paint };
    case 'star':
      return { kind: 'polyline', points: starPoints(shape.points, w, h), closed: true, ...paint };
    case 'arrow': {
      const pointerWidth = Math.min(h, w);
      return { kind: 'arrow', points: [0, h / 2, w, h / 2], pointerLength: Math.min(w * 0.35, pointerWidth), pointerWidth, fill: stroke ?? fill, stroke: stroke ?? fill, strokeWidth: strokeWidth || Math.max(1, h / 6) };
    }
  }
}

// -------------------------------------------------------------------- Guides

export interface GuideGeometry {
  bleed: Rect;
  trim: Rect;
  safe: Rect;
  bleedShape: TrimShape;
  trimShape: TrimShape;
  safeShape: TrimShape;
  hasBleed: boolean;
  hasSafe: boolean;
}

export function trimShapeFromPrint(print: SurfacePrint): TrimShape {
  if (print.trim.shape === 'ellipse') return { kind: 'ellipse' };
  if (print.trim.shape === 'rounded-rectangle') return { kind: 'rounded-rectangle', radius: print.trim.cornerRadiusPx };
  return { kind: 'rectangle' };
}

/** Bleed, trim and safe outlines for a surface, all derived from the M1 print boxes. */
export function guideGeometry(print: SurfacePrint): GuideGeometry {
  const boxes = printBoxes(print);
  const trimShape = trimShapeFromPrint(print);
  return {
    bleed: boxes.bleed,
    trim: boxes.trim,
    safe: boxes.safe,
    trimShape,
    bleedShape: offsetShape(trimShape, -print.bleedPx),
    safeShape: offsetShape(trimShape, boxes.safe.x - boxes.trim.x),
    hasBleed: print.bleedPx > 0,
    hasSafe: print.safeZonePx > 0,
  };
}
