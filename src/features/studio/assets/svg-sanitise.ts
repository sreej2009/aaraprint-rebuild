/**
 * SVG sanitiser (Plan §18.5 "SVG safety"), shared by the graphics extraction script and, from M12,
 * uploaded SVGs. SVGs are only ever drawn as images (`<img>` / canvas `drawImage`), where scripts
 * never run anyway; sanitising also keeps stored files free of anything that could act if one were
 * ever opened directly: scripts, `foreignObject`, event handlers, `javascript:` links and external
 * references (which could also leak who is viewing the design).
 *
 * No path aliases: the Node extraction script imports this file directly.
 */

export interface SvgEnvironment {
  parser: { parseFromString(text: string, type: 'image/svg+xml'): Document };
  serialize(node: Node): string;
}

export interface SanitisedSvg {
  svg: string;
  /** Natural size (from width/height, else the viewBox), in CSS px. */
  width: number;
  height: number;
  /** What was taken out, for logs and tests. */
  removed: string[];
}

export class SvgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SvgError';
  }
}

const FORBIDDEN_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas', 'handler', 'listener']);
const LINK_ATTRIBUTES = new Set(['href', 'xlink:href', 'src', 'action', 'formaction']);

/** Same-document references (`#id`) are fine; anything else could fetch or run something. */
function isLocalReference(value: string): boolean {
  return /^\s*#[\w.:-]*\s*$/.test(value);
}

/** CSS that only refers to this document: no `@import`, no `url()` other than `url(#id)`, no `expression()`. */
function isSafeCss(css: string): boolean {
  if (/@import|expression\s*\(|javascript:|behavior\s*:/i.test(css)) return false;
  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) if (!isLocalReference(match[2] ?? '')) return false;
  return true;
}

function defaultEnvironment(): SvgEnvironment {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') throw new SvgError('No DOM parser is available.');
  const serializer = new XMLSerializer();
  return { parser: new DOMParser(), serialize: (node) => serializer.serializeToString(node) };
}

function length(value: string | null): number | null {
  if (!value) return null;
  const match = /^\s*([\d.]+)\s*(px)?\s*$/.exec(value);
  const n = match ? Number.parseFloat(match[1]!) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function sanitiseSvg(text: string, env: SvgEnvironment = defaultEnvironment()): SanitisedSvg {
  const doc = env.parser.parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.getElementsByTagName('parsererror').length > 0 || root.localName !== 'svg') throw new SvgError('This is not a valid SVG file.');
  const removed: string[] = [];

  const visit = (element: Element) => {
    for (const child of [...element.children]) {
      const name = child.localName.toLowerCase();
      if (FORBIDDEN_ELEMENTS.has(name) || (name === 'style' && !isSafeCss(child.textContent ?? ''))) {
        removed.push(`<${child.localName}>`);
        child.remove();
        continue;
      }
      visit(child);
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const unsafe =
        name.startsWith('on') ||
        (LINK_ATTRIBUTES.has(name) && !isLocalReference(attribute.value)) ||
        (name === 'style' && !isSafeCss(attribute.value)) ||
        /^\s*(javascript|data|vbscript):/i.test(attribute.value) ||
        (/url\(/i.test(attribute.value) && !isSafeCss(attribute.value));
      if (unsafe) {
        removed.push(`${element.localName}@${attribute.name}`);
        element.removeAttribute(attribute.name);
      }
    }
  };
  visit(root);

  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number) ?? [];
  const vbWidth = viewBox.length === 4 && viewBox[2]! > 0 ? viewBox[2]! : null;
  const vbHeight = viewBox.length === 4 && viewBox[3]! > 0 ? viewBox[3]! : null;
  const width = length(root.getAttribute('width')) ?? vbWidth;
  const height = length(root.getAttribute('height')) ?? vbHeight;
  if (!width || !height) throw new SvgError('The SVG has no size (width/height or viewBox).');
  // An explicit size lets browsers decode it at its own proportions everywhere.
  if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return { svg: env.serialize(root), width, height, removed };
}
