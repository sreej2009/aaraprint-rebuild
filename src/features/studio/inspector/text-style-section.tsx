import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Italic, Underline } from 'lucide-react';
import { useId, useRef } from 'react';
import { ColorField, IconToggle, NumberField, SegmentedControl, Select, type NumberCommitInfo } from '@/design-system';
import { fontByFamily, fontCss, STUDIO_FONTS, stylePatchForFamily, supportedWeight, WEIGHT_LABELS } from '../assets/fonts';
import { describeElements } from '../naming';
import { TEXT_ALIGNS, type ElementPatch, type FontWeight, type SurfacePrint, type TextAlign, type TextElement } from '../schema/types';
import { selectDocument, useStudio, useStudioActions } from '../store';
import { ALIGN_LABELS, fromPt, LETTER_SPACING_RANGE, LINE_HEIGHT_RANGE, maxFontPt, MIN_FONT_PT, TEXT_COLOUR_PRESETS, toPt } from './inspector-rules';

const ALIGN_ICONS: Record<TextAlign, typeof AlignLeft> = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify };

let colourGesture = 0;

/**
 * Text style for the selected text (Plan §18.5): font, weight, italic, underline, size in pt,
 * colour, alignment, line height and letter spacing. Each change is one undo step (number steps
 * and a colour-picker drag merge); the box re-measures its height as the text re-flows.
 * Only the weights and italics the chosen font really has are offered.
 */
export function TextStyleSection({ element, print }: { element: TextElement; print: SurfacePrint }) {
  const actions = useStudioActions();
  const document = useStudio(selectDocument);
  const headingId = useId();
  const name = describeElements([element], document);
  const disabled = element.locked;
  const font = fontByFamily(element.fontFamily);
  const weights = font?.weights ?? [element.fontWeight];
  // One key per colour-picker session: a drag inside the picker is one undo step.
  const colourKey = useRef<string | null>(null);

  const set = (verb: string, patch: ElementPatch<TextElement>, merge: { coalesceKey?: string; gesture?: boolean } = {}) =>
    actions.updateElement<TextElement>(element.id, patch, { label: `${verb} ${name}`, ...merge });
  const stepKey = (field: string, info: NumberCommitInfo) => (info.step ? { coalesceKey: `text-style:${field}:${element.id}` } : {});

  const fontOptions = [
    ...STUDIO_FONTS.map((f) => ({ value: f.family, label: f.family, style: { fontFamily: fontCss(f.family) } })),
    // A font from an older design that the Studio doesn't offer: keep showing what it is.
    ...(font ? [] : [{ value: element.fontFamily, label: `${element.fontFamily} (not available)`, disabled: true }]),
  ];

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
        Text style
      </h3>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${headingId}-font`} className="text-caption text-fg-muted">
          Font family
        </label>
        <Select
          id={`${headingId}-font`}
          value={element.fontFamily}
          options={fontOptions}
          disabled={disabled}
          className="h-9 text-body-sm pointer-coarse:h-11"
          onValueChange={(family) => set('Change font of', stylePatchForFamily(element, family))}
        />
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${headingId}-weight`} className="text-caption text-fg-muted">
            Font weight
          </label>
          <Select
            id={`${headingId}-weight`}
            value={String(element.fontWeight)}
            options={weights.map((w) => ({ value: String(w), label: WEIGHT_LABELS[w], style: { fontWeight: w } }))}
            disabled={disabled}
            className="h-9 text-body-sm pointer-coarse:h-11"
            onValueChange={(value) => set('Change weight of', { fontWeight: (font ? supportedWeight(font, Number(value) as FontWeight) : Number(value)) as FontWeight })}
          />
        </div>
        <fieldset className="m-0 flex items-center gap-1 border-0 p-0">
          <legend className="sr-only">Font style</legend>
          <IconToggle
            label="Italic"
            icon={<Italic />}
            pressed={element.italic}
            disabled={disabled || (!font?.italic && !element.italic)}
            tooltip={font && !font.italic ? `${font.family} has no italic` : 'Italic'}
            onPressedChange={(italic) => set('Change style of', { italic })}
            className="pointer-coarse:size-11"
          />
          <IconToggle
            label="Underline"
            icon={<Underline />}
            pressed={element.underline}
            disabled={disabled}
            onPressedChange={(underline) => set('Change style of', { underline })}
            className="pointer-coarse:size-11"
          />
        </fieldset>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <NumberField
          label="Font size"
          unit="pt"
          decimals={1}
          step={1}
          min={MIN_FONT_PT}
          max={maxFontPt(print)}
          value={toPt(element.fontSize, print)}
          disabled={disabled}
          onCommit={(pt, info) => set('Change size of', { fontSize: fromPt(pt, print) }, stepKey('size', info))}
        />
        <NumberField
          label="Line height"
          unit="×"
          decimals={2}
          step={0.1}
          min={LINE_HEIGHT_RANGE.min}
          max={LINE_HEIGHT_RANGE.max}
          value={element.lineHeight}
          disabled={disabled}
          onCommit={(lineHeight, info) => set('Change line height of', { lineHeight }, stepKey('line-height', info))}
        />
        <NumberField
          label="Letter spacing"
          unit="em"
          decimals={2}
          step={0.01}
          min={LETTER_SPACING_RANGE.min}
          max={LETTER_SPACING_RANGE.max}
          value={element.letterSpacing}
          disabled={disabled}
          hint="0 is the font’s own spacing"
          onCommit={(letterSpacing, info) => set('Change letter spacing of', { letterSpacing }, stepKey('letter-spacing', info))}
          className="col-span-2 pointer-fine:col-span-1"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-caption text-fg-muted">Alignment</span>
        <SegmentedControl
          label="Horizontal alignment"
          value={element.align}
          disabled={disabled}
          className="w-full [&>*]:flex-1 pointer-coarse:[&>*]:h-10"
          options={TEXT_ALIGNS.map((align) => {
            const Icon = ALIGN_ICONS[align];
            return { value: align, label: ALIGN_LABELS[align], icon: <Icon aria-hidden="true" /> };
          })}
          onValueChange={(align) => set('Align', { align: align as TextAlign })}
        />
      </div>

      <ColorField
        label="Text colour"
        value={element.color}
        disabled={disabled}
        presets={TEXT_COLOUR_PRESETS}
        onChange={(color, { live }) => {
          if (live) {
            colourKey.current ??= `text-colour:${(colourGesture += 1)}`;
            set('Change text colour of', { color }, { coalesceKey: colourKey.current, gesture: true });
            return;
          }
          const key = colourKey.current;
          colourKey.current = null;
          set('Change text colour of', { color }, key ? { coalesceKey: key, gesture: true } : {});
          if (key) actions.sealHistory();
        }}
      />
    </section>
  );
}
