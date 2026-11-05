import { Squircle } from 'lucide-react';
import { SHAPE_ICONS } from '../inspector/shape-icons';
import { selectActiveSurface, useStudio, useStudioStoreApi } from '../store';
import { useStudioUi } from '../shell/ui-context';
import { presetShape, SHAPE_PRESETS, type ShapePreset } from './shape-presets';

/**
 * The Shapes tool panel: one button per shape. Adding one puts it centred in the safe area of the
 * side being edited and selects it (one undo step); the panel closes first where it would cover
 * the canvas (tablet overlay, phone sheet).
 */
export function ShapesTool() {
  const studio = useStudioStoreApi();
  const surface = useStudio(selectActiveSurface);
  const { layout, openTool } = useStudioUi();

  const add = (preset: ShapePreset) => {
    const state = studio.getState();
    const target = selectActiveSurface(state);
    if (!target) return;
    const element = presetShape(preset, target.print, target.elements);
    if (!state.actions.addElement(element, { surfaceId: target.id })) return;
    if (layout === 'phone' || layout === 'tablet') openTool(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-3 gap-2">
        {SHAPE_PRESETS.map((preset) => {
          const Icon = preset.id === 'rounded-rect' ? Squircle : SHAPE_ICONS[preset.shape];
          return (
            <li key={preset.id}>
              <button
                type="button"
                disabled={!surface}
                onClick={() => add(preset)}
                aria-label={`Add ${preset.label.toLowerCase()}`}
                title={`Add ${preset.label.toLowerCase()}`}
                className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-1 text-caption font-medium text-fg-muted transition-colors hover:border-accent hover:bg-accent-soft/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon aria-hidden="true" className="size-7 text-accent-strong" strokeWidth={1.5} />
                <span className="text-center leading-tight">{preset.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="rounded-md bg-surface-subtle p-4 text-caption text-fg-muted">Fill, border, corners and points are in Properties once a shape is selected.</p>
    </div>
  );
}
