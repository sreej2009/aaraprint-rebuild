import Konva from 'konva';
import type { TextElement } from '../schema/types';
import { drawingFor } from './drawing';

let node: Konva.Text | null = null;

/**
 * The height Konva lays a text element out at: the same node settings the canvas draws with
 * (canvas/canvas-stage.tsx), so wrapping and line count match what's on screen and in exports.
 * One off-stage node is reused; Konva measures with the canvas `measureText` of the loaded font.
 */
export function measureTextHeight(element: TextElement): number {
  const drawing = drawingFor(element);
  if (drawing.kind !== 'text') return element.height;
  node ??= new Konva.Text({ wrap: 'word', padding: 0, listening: false });
  const { kind: _kind, fill: _fill, textDecoration: _decoration, ...layout } = drawing;
  node.setAttrs(layout);
  return node.height();
}
