import { useId, useRef } from 'react';
import { ColorField, NumberField, SegmentedControl, type ColorChangeInfo, type NumberCommitInfo } from '@/design-system';
import { describeElements } from '../naming';
import type { ElementPatch, LineCap, LineDash, ShapeElement, SurfacePrint } from '../schema/types';
import { selectDocument, useStudio, useStudioActions } from '../store';
import {
  COLOUR_PRESETS,
  cornerRadiusMax,
  DEFAULT_BORDER_PT,
  fromPt,
  lineWidthPatch,
  pointsRange,
  STROKE_PT_RANGE,
  strokeMaxPt,
  toMm,
  toPx,
  toStrokePt,
} from './inspector-rules';

const LINE_CAPS: { value: LineCap; label: string }[] = [
  { value: 'butt', label: 'Flat' },
  { value: 'round', label: 'Round' },
  { value: 'square', label: 'Square' },
];
const LINE_DASHES: { value: LineDash; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];

let colourGesture = 0;

/**
 * Style for the selected shape (Plan §18.5): fill and border for closed shapes (either can be
 * switched off), corner radius for rectangles, points and inner radius for stars, sides for
 * polygons; colour, width, ends and dashes for lines. Widths are in pt, the corner radius in mm;
 * each change is one undo step (number steps and a colour-picker drag merge).
 */
export function ShapeStyleSection({ element, print }: { element: ShapeElement; print: SurfacePrint }) {
  const actions = useStudioActions();
  const document = useStudio(selectDocument);
  const headingId = useId();
  const name = describeElements([element], document);
  const disabled = element.locked;
  const colourKeys = useRef<Record<string, string | null>>({});

  const set = (verb: string, patch: ElementPatch<ShapeElement>, merge: { coalesceKey?: string; gesture?: boolean } = {}) =>
    actions.updateElement<ShapeElement>(element.id, patch, { label: `${verb} ${name}`, ...merge });
  const stepKey = (field: string, info: NumberCommitInfo) => (info.step ? { coalesceKey: `shape-style:${field}:${element.id}` } : {});
  /** A colour-picker drag is one undo step: live changes share a key, the final one ends it. */
  const colour = (field: string, verb: string, patchFor: (value: string | null) => ElementPatch<ShapeElement>) => (value: string | null, { live }: ColorChangeInfo) => {
    if (live) {
      colourKeys.current[field] ??= `shape-colour:${field}:${(colourGesture += 1)}`;
      set(verb, patchFor(value), { coalesceKey: colourKeys.current[field]!, gesture: true });
      return;
    }
    const key = colourKeys.current[field] ?? null;
    colourKeys.current[field] = null;
    set(verb, patchFor(value), key ? { coalesceKey: key, gesture: true } : {});
    if (key) actions.sealHistory();
  };

  const isLine = element.shape === 'line';
  const isArrow = element.shape === 'arrow';
  const strokePt = toStrokePt(element.strokeWidth, print);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
        {isLine || isArrow ? 'Line' : 'Fill & border'}
      </h3>

      {isLine || isArrow ? (
        <>
          <ColorField
            label={isArrow ? 'Arrow colour' : 'Line colour'}
            value={element.stroke ?? element.fill ?? '#1b1f27'}
            disabled={disabled}
            presets={COLOUR_PRESETS}
            onChange={colour('stroke', 'Change colour of', (value) => ({ stroke: value }))}
          />
          <NumberField
            label="Line width"
            unit="pt"
            decimals={2}
            step={0.25}
            min={STROKE_PT_RANGE.lineMin}
            max={STROKE_PT_RANGE.max}
            value={strokePt}
            disabled={disabled}
            onCommit={(pt, info) => set('Change line width of', isLine ? lineWidthPatch(element, fromPt(pt, print)) : { strokeWidth: fromPt(pt, print) }, stepKey('stroke-width', info))}
          />
          <Choice label="Line ends" value={element.lineCap} options={LINE_CAPS} disabled={disabled || (isLine && element.dash === 'dotted')} onChange={(lineCap) => set('Change line ends of', { lineCap })} />
          {isLine && <Choice label="Line style" value={element.dash} options={LINE_DASHES} disabled={disabled} onChange={(dash) => set('Change line style of', { dash })} />}
        </>
      ) : (
        <>
          <ColorField
            label="Fill colour"
            noneLabel="No fill"
            value={element.fill}
            disabled={disabled}
            presets={COLOUR_PRESETS}
            onChange={colour('fill', 'Change fill of', (fill) => ({ fill }))}
          />
          <ColorField
            label="Border colour"
            noneLabel="No border"
            value={element.strokeWidth > 0 ? element.stroke : null}
            disabled={disabled}
            presets={COLOUR_PRESETS}
            // Choosing a colour for a shape without a border gives it one.
            onChange={colour('stroke', 'Change border of', (stroke) =>
              stroke === null ? { stroke: null, strokeWidth: 0 } : { stroke, ...(element.strokeWidth > 0 ? {} : { strokeWidth: fromPt(Math.min(DEFAULT_BORDER_PT, strokeMaxPt(element, print)), print) }) },
            )}
          />
          <NumberField
            label="Border width"
            unit="pt"
            decimals={2}
            step={0.25}
            min={0}
            max={strokeMaxPt(element, print)}
            value={element.stroke ? strokePt : 0}
            disabled={disabled}
            hint={element.stroke && element.strokeWidth > 0 ? undefined : '0 = no border'}
            onCommit={(pt, info) =>
              set('Change border of', pt > 0 ? { strokeWidth: fromPt(pt, print), ...(element.stroke ? {} : { stroke: '#1b1f27' }) } : { strokeWidth: 0 }, stepKey('stroke-width', info))
            }
          />
          {element.shape === 'rect' && (
            <NumberField
              label="Corner radius"
              unit="mm"
              decimals={1}
              step={0.1}
              min={0}
              max={toMm(cornerRadiusMax(element), print)}
              value={toMm(Math.min(element.cornerRadius, cornerRadiusMax(element)), print)}
              disabled={disabled}
              onCommit={(mm, info) => set('Change corners of', { cornerRadius: Math.min(toPx(mm, print), cornerRadiusMax(element)) }, stepKey('corner-radius', info))}
            />
          )}
          {(element.shape === 'star' || element.shape === 'polygon') && (
            <div className="grid grid-cols-2 gap-x-2 gap-y-3">
              <NumberField
                label={element.shape === 'star' ? 'Star points' : 'Sides'}
                decimals={0}
                step={1}
                {...pointsRange(element)}
                value={element.points}
                disabled={disabled}
                onCommit={(points, info) => set(element.shape === 'star' ? 'Change points of' : 'Change sides of', { points }, stepKey('points', info))}
              />
              {element.shape === 'star' && (
                <NumberField
                  label="Inner radius"
                  unit="%"
                  decimals={0}
                  step={5}
                  min={10}
                  max={95}
                  value={Math.round(element.innerRadius * 100)}
                  disabled={disabled}
                  hint="Of the outer radius (the star's size)"
                  onCommit={(percent, info) => set('Change points of', { innerRadius: percent / 100 }, stepKey('inner-radius', info))}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Choice<T extends string>({ label, value, options, disabled, onChange }: { label: string; value: T; options: { value: T; label: string }[]; disabled: boolean; onChange(value: T): void }) {
  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden="true" className="text-caption text-fg-muted">
        {label}
      </span>
      <SegmentedControl label={label} value={value} disabled={disabled} className="w-full [&>*]:flex-1 pointer-coarse:[&>*]:h-10" options={options} onValueChange={(v) => onChange(v as T)} />
    </div>
  );
}
