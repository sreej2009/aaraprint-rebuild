import { useState } from 'react';
import { Button, ColorField, Field, Input, OptionChips } from '@/design-system';
import { DIMENSION_RANGE_MM, type StudioChoice } from '@/features/product-workflow/configuration';
import type { StudioChoiceValue, StudioOptionDefinition, SurfaceDefinition } from '@/features/product-workflow/types';

/**
 * One Studio-only option from the registry (Phase 4 M2): a format or feature (chips), part or
 * substrate colours (colour fields with the original's presets), or a size (presets and a custom
 * size). Values the audit could not establish are shown as unavailable, never invented. Every
 * committed change is one `onChoose` call — one product command, one undo step.
 */

export interface StudioOptionFieldProps {
  option: StudioOptionDefinition;
  /** The configuration's Studio choices. */
  choices: Record<string, StudioChoice>;
  onChoose(key: string, choice: StudioChoice | null): void;
}

const knownValues = (option: StudioOptionDefinition): readonly StudioChoiceValue[] => (option.values.status === 'known' ? option.values.values : []);

export function StudioOptionField({ option, choices, onChoose }: StudioOptionFieldProps) {
  if (option.type === 'colour') return <ColourOption option={option} choices={choices} onChoose={onChoose} />;
  if (option.type === 'dimensions') return <DimensionsOption option={option} choices={choices} onChoose={onChoose} />;
  return <ChoiceOption option={option} choices={choices} onChoose={onChoose} />;
}

function Unavailable({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-body-sm font-semibold text-fg">{label}</span>
      <p className="rounded-sm border border-dashed border-border-strong bg-surface-subtle px-3 py-2 text-caption text-fg-muted" data-option-unavailable>
        Not available to choose online yet — {note.charAt(0).toLowerCase()}
        {note.slice(1)}
      </p>
    </div>
  );
}

function ChoiceOption({ option, choices, onChoose }: StudioOptionFieldProps) {
  if (option.values.status === 'unknown') return <Unavailable label={option.label} note={option.values.note} />;
  const chosen = choices[option.id];
  const value = chosen?.type === 'choice' ? chosen.valueId : (option.defaultValueId ?? undefined);
  return (
    <OptionChips
      label={option.label}
      value={value}
      onValueChange={(valueId) => onChoose(option.id, { type: 'choice', valueId })}
      options={knownValues(option).map((v) => ({ value: v.id, label: v.label, ...(v.priceDeltaCents ? { priceDeltaCents: v.priceDeltaCents } : {}) }))}
    />
  );
}

function ColourOption({ option, choices, onChoose }: StudioOptionFieldProps) {
  if (option.parts === 'per-product') {
    return <Unavailable label={option.label} note="The parts that can be recoloured differ by product and are chosen in the Design Studio later." />;
  }
  const presets = knownValues(option)
    .filter((v): v is StudioChoiceValue & { hex: string } => Boolean(v.hex))
    .map((v) => ({ hex: v.hex, label: v.label }));
  if (presets.length === 0 && !option.allowCustomColour) {
    return <Unavailable label={option.label} note={option.values.status === 'unknown' ? option.values.note : 'No colours are listed.'} />;
  }
  const commit = (key: string, hex: string | null) => {
    if (!hex) return onChoose(key, null);
    const preset = knownValues(option).find((v) => v.hex?.toLowerCase() === hex.toLowerCase());
    onChoose(key, { type: 'colour', valueId: preset?.id ?? null, hex });
  };
  const field = (key: string, label: string) => {
    const chosen = choices[key];
    return (
      <ColorField
        key={key}
        label={label}
        noneLabel="Original"
        value={chosen?.type === 'colour' ? chosen.hex : null}
        presets={presets}
        // The native picker reports every move while it's open; only the final colour is a choice.
        onChange={(hex, info) => {
          if (!info.live) commit(key, hex);
        }}
      />
    );
  };
  // One colour (substrate, custom colour): just the field. Several parts: a group, one field each.
  if (!option.parts) return field(option.id, option.label);
  const parts: readonly SurfaceDefinition[] = option.parts;
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-body-sm font-semibold text-fg">{option.label}</legend>
      {parts.map((part) => field(`${option.id}:${part.id}`, part.label))}
    </fieldset>
  );
}

const cm = (mm: number) => String(Math.round(mm) / 10);

function DimensionsOption({ option, choices, onChoose }: StudioOptionFieldProps) {
  const chosen = choices[option.id];
  const current = chosen?.type === 'dimensions' ? chosen : null;
  const range = option.rangeMm ?? DIMENSION_RANGE_MM;
  const [width, setWidth] = useState(current ? cm(current.widthMm) : '');
  const [height, setHeight] = useState(current ? cm(current.heightMm) : '');
  const [error, setError] = useState<string | null>(null);
  const presets = knownValues(option).filter((v) => v.widthMm && v.heightMm);

  const applyCustom = () => {
    const widthMm = Math.round(Number(width) * 10);
    const heightMm = Math.round(Number(height) * 10);
    const ok = [widthMm, heightMm].every((mm) => Number.isFinite(mm) && mm >= range.min && mm <= range.max);
    if (!ok) {
      setError(`Enter a width and height from ${range.min / 10} to ${range.max / 10} cm.`);
      return;
    }
    setError(null);
    onChoose(option.id, { type: 'dimensions', widthMm, heightMm, presetId: null });
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-body-sm font-semibold text-fg">{option.label}</legend>
      {presets.length > 0 ? (
        <OptionChips
          label={`${option.label} presets`}
          hideLabel
          value={current?.presetId ?? undefined}
          onValueChange={(presetId) => {
            const preset = presets.find((p) => p.id === presetId);
            if (preset?.widthMm && preset.heightMm) {
              setWidth(cm(preset.widthMm));
              setHeight(cm(preset.heightMm));
              onChoose(option.id, { type: 'dimensions', widthMm: preset.widthMm, heightMm: preset.heightMm, presetId: preset.id });
            }
          }}
          options={presets.map((p) => ({ value: p.id, label: p.label }))}
        />
      ) : (
        <p className="text-caption text-fg-muted" data-option-unavailable>
          Preset sizes for this product aren’t available online yet; enter a custom size instead.
        </p>
      )}
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <Field label="Width (cm)">
          <Input inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
        </Field>
        <Field label="Height (cm)">
          <Input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
        </Field>
        <Button type="button" variant="secondary" onClick={applyCustom}>
          Apply size
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : (
        <p className="text-caption text-fg-muted">
          Custom size {range.min / 10}–{range.max / 10} cm. {current ? `Chosen: ${cm(current.widthMm)} × ${cm(current.heightMm)} cm.` : ''}
        </p>
      )}
    </fieldset>
  );
}
