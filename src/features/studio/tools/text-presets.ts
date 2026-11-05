import { DEFAULT_TEXT_FONT } from '../assets/fonts';
import { DUPLICATE_OFFSET_MM } from '../canvas/transform-rules';
import { printBoxes } from '../geometry/boxes';
import { mmToPx, ptToPx, pxToPt } from '../geometry/units';
import { createId, type IdFactory } from '../ids';
import { createTextElement } from '../schema/create';
import type { DesignElement, FontWeight, SurfacePrint, TextElement } from '../schema/types';

/**
 * Text presets for the Text tool (Plan §18.5): Heading, Subheading, Body and Name + title, set in
 * the Studio's typefaces (decision D3). Sizes follow the product — a fraction of the safe area's
 * shorter side, rounded to half points — so a heading reads as a heading on a business card and
 * on a banner alike. New text lands centred in the safe area and starts as sample text
 * (`placeholder`), selected so that typing replaces it.
 */

export type TextPresetId = 'heading' | 'subheading' | 'body' | 'name-title';

interface PresetLine {
  text: string;
  fontFamily: string;
  fontWeight: FontWeight;
  /** Font size as a fraction of the safe area's shorter side. */
  size: number;
  lineHeight: number;
  letterSpacing: number;
}

export interface TextPreset {
  id: TextPresetId;
  /** Button label and undo label ("Add heading"). */
  label: string;
  hint: string;
  lines: readonly PresetLine[];
}

export const TEXT_PRESETS: readonly TextPreset[] = [
  {
    id: 'heading',
    label: 'Heading',
    hint: 'Large and bold, for names and titles',
    lines: [{ text: 'Add a heading', fontFamily: 'Fraunces', fontWeight: 600, size: 0.1, lineHeight: 1.15, letterSpacing: 0 }],
  },
  {
    id: 'subheading',
    label: 'Subheading',
    hint: 'A short line under the heading',
    lines: [{ text: 'Add a subheading', fontFamily: DEFAULT_TEXT_FONT, fontWeight: 600, size: 0.068, lineHeight: 1.25, letterSpacing: 0 }],
  },
  {
    id: 'body',
    label: 'Body text',
    hint: 'Details, addresses and descriptions',
    lines: [{ text: 'Add a little body text', fontFamily: DEFAULT_TEXT_FONT, fontWeight: 400, size: 0.05, lineHeight: 1.4, letterSpacing: 0 }],
  },
  {
    id: 'name-title',
    label: 'Name and title',
    hint: 'Two lines, for business cards and badges',
    lines: [
      { text: 'Your Name', fontFamily: 'Fraunces', fontWeight: 600, size: 0.09, lineHeight: 1.15, letterSpacing: 0 },
      { text: 'Job title', fontFamily: DEFAULT_TEXT_FONT, fontWeight: 500, size: 0.05, lineHeight: 1.3, letterSpacing: 0.04 },
    ],
  },
];

export function presetById(id: TextPresetId): TextPreset {
  const preset = TEXT_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown text preset "${id}"`);
  return preset;
}

/** Never smaller than this, however small the product. */
const MIN_PRESET_PT = 5;
/** The box spans this share of the safe area's width; text wraps inside it. */
const BOX_WIDTH = 0.8;
/** Space between the lines of a multi-line preset, as a fraction of the first line's size. */
const LINE_GAP = 0.25;

const round2 = (value: number) => Math.round(value * 100) / 100 || 0;

/** The preset's font size for this print, in print px (whole or half points). */
export function presetFontSize(line: Pick<PresetLine, 'size'>, print: SurfacePrint): number {
  const safe = printBoxes(print).safe;
  const raw = Math.min(safe.width, safe.height) * line.size;
  const pt = Math.max(MIN_PRESET_PT, Math.round(pxToPt(raw, print.dpi) * 2) / 2);
  return round2(ptToPx(pt, print.dpi));
}

/**
 * The text elements for a preset on this print: centred in the safe area. If text already sits
 * exactly there (the preset was added before), the new text steps down and right like a duplicate,
 * so it never hides behind the earlier one.
 */
export function presetElements(preset: TextPreset, print: SurfacePrint, existing: readonly DesignElement[], newId: IdFactory = createId): TextElement[] {
  const safe = printBoxes(print).safe;
  const width = round2(Math.max(1, safe.width * BOX_WIDTH));
  const sized = preset.lines.map((line) => {
    const fontSize = presetFontSize(line, print);
    // The store measures the real height as soon as the text is added; one line until then.
    return { line, fontSize, height: round2(fontSize * line.lineHeight) };
  });
  const gap = (sized[0]?.fontSize ?? 0) * LINE_GAP;
  const total = sized.reduce((sum, s) => sum + s.height, 0) + gap * (sized.length - 1);
  const x = round2(safe.x + (safe.width - width) / 2);
  let y = round2(safe.y + Math.max(0, (safe.height - total) / 2));

  const step = mmToPx(DUPLICATE_OFFSET_MM, print.dpi);
  let offset = 0;
  for (let i = 0; i < 20 && existing.some((e) => e.type === 'text' && Math.abs(e.x - (x + offset)) < 0.5 && Math.abs(e.y - (y + offset)) < 0.5); i += 1) offset += step;

  return sized.map(({ line, fontSize, height }) => {
    const element = createTextElement(
      { x: round2(x + offset), y: round2(y + offset), width, height },
      {
        text: line.text,
        fontFamily: line.fontFamily,
        fontWeight: line.fontWeight,
        fontSize,
        lineHeight: line.lineHeight,
        letterSpacing: line.letterSpacing,
        align: 'center',
        placeholder: true,
      },
      newId,
    );
    y = round2(y + height + gap);
    return element;
  });
}
