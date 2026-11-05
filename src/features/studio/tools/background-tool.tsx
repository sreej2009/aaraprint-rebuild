import { useRef } from 'react';
import { ColorField, type ColorChangeInfo } from '@/design-system';
import { COLOUR_PRESETS } from '../inspector/inspector-rules';
import { selectActiveSurface, useStudio, useStudioActions } from '../store';

let gesture = 0;

/**
 * The Background tool (Plan §18.5): the colour of the side being edited, right to the bleed edge.
 * Each side has its own; "No background" leaves the material unprinted (paper white, the
 * garment's colour…). A drag in the colour picker is one undo step.
 */
export function BackgroundTool() {
  const actions = useStudioActions();
  const surface = useStudio(selectActiveSurface);
  const key = useRef<string | null>(null);
  if (!surface) return null;

  const onChange = (color: string | null, { live }: ColorChangeInfo) => {
    if (live) {
      key.current ??= `background:${(gesture += 1)}`;
      actions.setBackground(color, { coalesceKey: key.current, gesture: true });
      return;
    }
    const current = key.current;
    key.current = null;
    actions.setBackground(color, current ? { coalesceKey: current, gesture: true } : {});
    if (current) actions.sealHistory();
  };

  return (
    <div className="flex flex-col gap-4">
      <ColorField label={`${surface.label} background colour`} noneLabel="No background" value={surface.background.color} presets={[...COLOUR_PRESETS, { hex: '#f4f1ea', label: 'Ivory' }]} onChange={onChange} />
      <p className="rounded-md bg-surface-subtle p-4 text-caption text-fg-muted">
        The colour runs into the bleed, so no white edge shows after trimming. It applies to the {surface.label.toLowerCase()} only.
      </p>
    </div>
  );
}
