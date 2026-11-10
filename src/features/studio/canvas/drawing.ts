import { printBoxes, type Rect } from '../geometry/boxes';
import { fontCss } from '../assets/fonts';
import { offsetShape, type TrimShape } from '../geometry/shapes';
import type { DesignElement, FontWeight, LineCap, LineDash, ShapeElement, SurfacePrint, TextElement } from '../schema/types';

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
  | { kind: 'rect'; x: number; y: number; width: number; height: number; cornerRadius: number; fill: string | null; stroke: string | null; strokeWidth: number }
  | { kind: 'ellipse'; x: number; y: number; radiusX: number; radiusY: number; fill: string | null; stroke: string | null; strokeWidth: number }
  | { kind: 'polyline'; points: number[]; closed: boolean; fill: string | null; stroke: string | null; strokeWidth: number; lineCap?: LineCap; dash?: number[] }
  | { kind: 'arrow'; points: number[]; pointerLength: number; pointerWidth: number; fill: string | null; stroke: string | null; strokeWidth: number; lineCap: LineCap }
  | { kind: 'upload'; assetId: string; width: number; height: number }
  | { kind: 'graphic'; graphicId: string; width: number; height: number };

/** Families map to the self-hosted web fonts in assets/fonts.ts. */
export { fontCss };

/** Konva's fontStyle goes into the CSS `font` shorthand: "italic 700". */
export function fontStyleFor(weight: FontWeight, italic: boolean): string {
  return `${italic ? 'italic ' : ''}${weight}`;
}

/** Star outline inside a w × h box: alternating outer and inner points, first point at the top. */
export function starPoints(points: number, width: number, height: number, innerRatio = 0.5, inset = 0): number[] {
  const out: number[] = [];
  const rx = Math.max(0, width / 2 - inset);
  const ry = Math.max(0, height / 2 - inset);
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? 1 : innerRatio;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    out.push(width / 2 + Math.cos(angle) * rx * r, height / 2 + Math.sin(angle) * ry * r);
  }
  return out;
}

/** Regular polygon with `sides` corners inside a w × h box (stretched with it), first corner at the top. */
export function polygonPoints(sides: number, width: number, height: number, inset = 0): number[] {
  const out: number[] = [];
  const rx = Math.max(0, width / 2 - inset);
  const ry = Math.max(0, height / 2 - inset);
  for (let i = 0; i < sides; i += 1) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    out.push(width / 2 + Math.cos(angle) * rx, height / 2 + Math.sin(angle) * ry);
  }
  return out;
}

/** Konva dash pattern for a line style, scaled to the line's thickness. Dots need round ends. */
export function dashPattern(dash: LineDash, width: number): number[] | undefined {
  if (dash === 'dashed') return [width * 3, width * 2];
  if (dash === 'dotted') return [0.001, width * 2];
  return undefined;
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
  if (element.type === 'image') {
    return element.source.kind === 'graphic'
      ? { kind: 'graphic', graphicId: element.source.graphicId, width: w, height: h }
      : { kind: 'upload', assetId: element.source.assetId, width: w, height: h };
  }
  return shapeDrawing(element);
}

/**
 * Closed shapes draw their border inside the box (a stroke sits half on each side of its path, so
 * the path is inset by half the border): what's selected is exactly what prints. Borders scale
 * with the zoom like everything else, so they keep their physical width at every zoom level.
 */
function shapeDrawing(shape: ShapeElement): Drawing {
  const { width: w, height: h, fill, stroke } = shape;
  const strokeWidth = stroke ? Math.min(shape.strokeWidth, w / 2, h / 2) : 0;
  const inset = strokeWidth / 2;
  const paint = { fill, stroke, strokeWidth };
  switch (shape.shape) {
    case 'rect':
      return {
        kind: 'rect',
        x: inset,
        y: inset,
        width: Math.max(0, w - strokeWidth),
        height: Math.max(0, h - strokeWidth),
        cornerRadius: Math.max(0, Math.min(shape.cornerRadius, w / 2, h / 2) - inset),
        ...paint,
      };
    case 'circle': {
      const r = Math.max(0, Math.min(w, h) / 2 - inset);
      return { kind: 'ellipse', x: w / 2, y: h / 2, radiusX: r, radiusY: r, ...paint };
    }
    case 'ellipse':
      return { kind: 'ellipse', x: w / 2, y: h / 2, radiusX: Math.max(0, w / 2 - inset), radiusY: Math.max(0, h / 2 - inset), ...paint };
    case 'line': {
      const width = shape.strokeWidth || h;
      // Dots are drawn as round dabs; other styles use the chosen ends.
      const lineCap: LineCap = shape.dash === 'dotted' ? 'round' : shape.lineCap;
      const dash = dashPattern(shape.dash, width);
      return { kind: 'polyline', points: [0, h / 2, w, h / 2], closed: false, fill: null, stroke: shape.stroke ?? fill, strokeWidth: width, lineCap, ...(dash ? { dash } : {}) };
    }
    case 'triangle':
      return { kind: 'polyline', points: insetPoints([w / 2, 0, w, h, 0, h], w, h, inset), closed: true, ...paint };
    case 'star':
      return { kind: 'polyline', points: starPoints(shape.points, w, h, shape.innerRadius, inset), closed: true, ...paint };
    case 'polygon':
      return { kind: 'polyline', points: polygonPoints(shape.points, w, h, inset), closed: true, ...paint };
    case 'arrow': {
      const pointerWidth = Math.min(h, w);
      const colour = shape.stroke ?? fill;
      return {
        kind: 'arrow',
        points: [0, h / 2, w, h / 2],
        pointerLength: Math.min(w * 0.35, pointerWidth),
        pointerWidth,
        fill: colour,
        stroke: colour,
        strokeWidth: shape.strokeWidth || Math.max(1, h / 6),
        lineCap: shape.lineCap,
      };
    }
  }
}

/** Pull points towards the box centre so a border of 2 × `inset` stays inside the box. */
function insetPoints(points: number[], w: number, h: number, inset: number): number[] {
  if (inset <= 0) return points;
  const sx = Math.max(0, w - 2 * inset) / w;
  const sy = Math.max(0, h - 2 * inset) / h;
  return points.map((v, i) => (i % 2 === 0 ? w / 2 + (v - w / 2) * sx : h / 2 + (v - h / 2) * sy));
}

// -------------------------------------------------------------------- Guides

/** A 1 screen-px line at any zoom (guides, placeholder frames). */
export const hairline = { strokeWidth: 1, strokeScaleEnabled: false, perfectDrawEnabled: false, listening: false } as const;

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
