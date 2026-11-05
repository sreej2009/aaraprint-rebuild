import { useSyncExternalStore } from 'react';
import { FONT_WEIGHTS, type FontWeight, type TextElement } from '../schema/types';

/**
 * Fonts the Studio offers for text (Plan §18.5, decision D3). All are self-hosted
 * `@fontsource-variable` packages under the SIL Open Font License 1.1, so there is no runtime CDN:
 * - Plus Jakarta Sans and Fraunces are loaded only in the Studio (assets/studio-fonts.css);
 * - Inter and Manrope are the site's own fonts (styles/app.css).
 * Each variable font covers every weight the schema allows (400–800); only some have italics.
 */

export interface StudioFont {
  /** Stored in the design document. */
  family: string;
  /** The `@font-face` family the browser loads. */
  face: string;
  category: 'sans-serif' | 'serif';
  weights: readonly FontWeight[];
  italic: boolean;
  /** Copyright holder, for the credits page. */
  copyright: string;
}

export const STUDIO_FONTS: readonly StudioFont[] = [
  { family: 'Plus Jakarta Sans', face: 'Plus Jakarta Sans Variable', category: 'sans-serif', weights: FONT_WEIGHTS, italic: true, copyright: 'The Plus Jakarta Sans Project Authors' },
  { family: 'Fraunces', face: 'Fraunces Variable', category: 'serif', weights: FONT_WEIGHTS, italic: true, copyright: 'The Fraunces Project Authors' },
  { family: 'Inter', face: 'Inter Variable', category: 'sans-serif', weights: FONT_WEIGHTS, italic: true, copyright: 'The Inter Project Authors' },
  { family: 'Manrope', face: 'Manrope Variable', category: 'sans-serif', weights: FONT_WEIGHTS, italic: false, copyright: 'The Manrope Project Authors' },
];

/** New text uses the Studio's body font. */
export const DEFAULT_TEXT_FONT = 'Plus Jakarta Sans';

export const WEIGHT_LABELS: Record<FontWeight, string> = { 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold' };

export function fontByFamily(family: string): StudioFont | null {
  return STUDIO_FONTS.find((f) => f.family === family) ?? null;
}

/** CSS font-family list for the canvas and the editing overlay. Unknown families fall back to sans-serif. */
export function fontCss(family: string): string {
  const font = fontByFamily(family);
  if (font) return `'${font.face}', '${font.family}', ${font.category}`;
  return `'${family.replace(/'/g, '')}', sans-serif`;
}

/** The weight a font actually has that is closest to `weight` (all of ours have every weight). */
export function supportedWeight(font: StudioFont, weight: FontWeight): FontWeight {
  if (font.weights.includes(weight)) return weight;
  return [...font.weights].sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight))[0] ?? 400;
}

/**
 * Style fields after switching to `family`: weights and italics the new font doesn't have are
 * replaced by the nearest it does, so the canvas never draws a synthesised face.
 */
export function stylePatchForFamily(element: Pick<TextElement, 'fontWeight' | 'italic'>, family: string): Pick<TextElement, 'fontFamily' | 'fontWeight' | 'italic'> {
  const font = fontByFamily(family);
  if (!font) return { fontFamily: family, fontWeight: element.fontWeight, italic: element.italic };
  return { fontFamily: family, fontWeight: supportedWeight(font, element.fontWeight), italic: element.italic && font.italic };
}

// ---------------------------------------------------------------- Loading

/** One face of a font, with the characters it needs to draw (unicode-range subsets load on demand). */
export interface FontFaceRequest {
  family: string;
  weight: FontWeight;
  italic: boolean;
  text: string;
}

/** CSS `font` shorthand for `document.fonts`, e.g. `italic 700 16px 'Fraunces Variable'`. */
export function faceSpec({ family, weight, italic }: Pick<FontFaceRequest, 'family' | 'weight' | 'italic'>): string {
  const face = fontByFamily(family)?.face ?? family.replace(/'/g, '');
  return `${italic ? 'italic ' : ''}${weight} 16px '${face}'`;
}

/** The faces a set of text elements uses, with the characters each needs. */
export function facesFor(elements: Iterable<TextElement>): FontFaceRequest[] {
  const faces = new Map<string, FontFaceRequest>();
  for (const e of elements) {
    const key = `${e.fontFamily}|${e.fontWeight}|${e.italic}`;
    const face = faces.get(key) ?? { family: e.fontFamily, weight: e.fontWeight, italic: e.italic, text: '' };
    face.text += e.text;
    faces.set(key, face);
  }
  // Each character once, plus a Latin sample so the main subset always loads.
  return [...faces.values()].map((f) => ({ ...f, text: [...new Set(`Aa${f.text}`.replace(/\s/g, ''))].sort().join('') }));
}

type FontSet = Pick<FontFaceSet, 'check' | 'load'>;

let version = 0;
const listeners = new Set<() => void>();
const inFlight = new Map<string, Promise<void>>();

function fontSet(): FontSet | null {
  return typeof document !== 'undefined' && document.fonts ? document.fonts : null;
}

/**
 * Load faces the canvas needs. Text drawn in a canvas doesn't wait for web fonts: it's drawn (and
 * measured) with a fallback until the font arrives. Whenever a face finishes loading, the fonts
 * version goes up and subscribers re-measure and redraw the text (see `useFontsVersion`).
 * Resolves when every face is ready (or failed to load).
 */
export function ensureFonts(faces: readonly FontFaceRequest[], fonts: FontSet | null = fontSet()): Promise<void> {
  if (!fonts) return Promise.resolve();
  const loads = faces.map((face) => {
    const spec = faceSpec(face);
    let ready = true;
    try {
      ready = fonts.check(spec, face.text);
    } catch {
      ready = true; // an invalid spec can't be loaded either
    }
    if (ready) return Promise.resolve();
    const key = `${spec}|${face.text}`;
    let load = inFlight.get(key);
    if (!load) {
      load = fonts
        .load(spec, face.text)
        .then(
          (loaded) => {
            if (loaded.length > 0) bumpFontsVersion();
          },
          () => {},
        )
        .finally(() => inFlight.delete(key));
      inFlight.set(key, load);
    }
    return load;
  });
  return Promise.all(loads).then(() => {});
}

function bumpFontsVersion() {
  version += 1;
  for (const listener of listeners) listener();
}

/** Goes up every time a web font face finishes loading. */
export function fontsVersion(): number {
  return version;
}

export function subscribeFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFontsVersion(): number {
  return useSyncExternalStore(subscribeFonts, fontsVersion, fontsVersion);
}

/** Tests only. */
export function resetFontsForTests(): void {
  version = 0;
  listeners.clear();
  inFlight.clear();
}
