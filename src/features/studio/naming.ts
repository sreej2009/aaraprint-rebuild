import type { DesignDocument, DesignElement, ShapeKind } from './schema/types';

const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  triangle: 'Triangle',
  star: 'Star',
  arrow: 'Arrow',
};

const MAX_NAME = 32;

/** Layer name: the customer's own name, else the text, shape type or file name. */
export function elementDisplayName(element: DesignElement, document?: DesignDocument): string {
  if (element.name) return element.name;
  if (element.type === 'text') {
    const firstLine = element.text.split('\n').find((line) => line.trim())?.trim() ?? '';
    if (!firstLine) return 'Text';
    return firstLine.length > MAX_NAME ? `${firstLine.slice(0, MAX_NAME - 1)}…` : firstLine;
  }
  if (element.type === 'shape') return SHAPE_NAMES[element.shape];
  if (element.source.kind === 'asset') return document?.assets[element.source.assetId]?.name ?? 'Image';
  return titleCase(element.source.graphicId);
}

/** "“Riya Sharma”" for one element, "3 items" for several — used in undo/redo labels. */
export function describeElements(elements: readonly DesignElement[], document?: DesignDocument): string {
  if (elements.length === 1 && elements[0]) return `“${elementDisplayName(elements[0], document)}”`;
  return `${elements.length} items`;
}

function titleCase(slug: string): string {
  const words = slug.replace(/-/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'Graphic';
}
