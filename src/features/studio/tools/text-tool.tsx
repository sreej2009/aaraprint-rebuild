import { Plus } from 'lucide-react';
import { fontCss } from '../assets/fonts';
import * as cmd from '../commands';
import { selectActiveSurface, useStudio, useStudioStoreApi } from '../store';
import { useStudioUi } from '../shell/ui-context';
import { presetElements, TEXT_PRESETS, type TextPreset } from './text-presets';

/** Preview sizes in the panel (screen px), largest first like the presets themselves. */
const PREVIEW_SIZE: Record<TextPreset['id'], string> = { heading: '1.375rem', subheading: '1.0625rem', body: '0.875rem', 'name-title': '1.125rem' };

/**
 * The Text tool panel: one button per preset. Adding text puts it centred in the safe area of the
 * side being edited, selects it and opens it for typing (in place on larger screens, in a sheet on
 * phones). The panel closes first where it would cover the canvas (tablet overlay, phone sheet).
 */
export function TextTool() {
  const studio = useStudioStoreApi();
  const surface = useStudio(selectActiveSurface);
  const { layout, openTool } = useStudioUi();

  const add = (preset: TextPreset) => {
    const state = studio.getState();
    const target = selectActiveSurface(state);
    if (!target) return;
    const elements = presetElements(preset, target.print, target.elements);
    const [first] = elements;
    if (!first) return;
    const added = state.actions.execute(`Add ${preset.label.toLowerCase()}`, (d) => elements.reduce((doc, element) => cmd.addElement(doc, target.id, element), d), {
      surfaceId: target.id,
      select: [first.id],
    });
    if (!added) return;
    if (layout === 'phone' || layout === 'tablet') openTool(null);
    studio.getState().actions.setEditingText(first.id);
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {TEXT_PRESETS.map((preset) => (
          <li key={preset.id}>
            <button
              type="button"
              disabled={!surface}
              onClick={() => add(preset)}
              aria-label={`Add ${preset.label.toLowerCase()}`}
              aria-describedby={`text-preset-${preset.id}`}
              className="group flex w-full items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                {preset.lines.map((line) => (
                  <span
                    key={line.text}
                    className="truncate text-fg"
                    style={{ fontFamily: fontCss(line.fontFamily), fontWeight: line.fontWeight, fontSize: line === preset.lines[0] ? PREVIEW_SIZE[preset.id] : '0.8125rem', letterSpacing: `${line.letterSpacing}em`, lineHeight: 1.2 }}
                  >
                    {line.text}
                  </span>
                ))}
                <span id={`text-preset-${preset.id}`} className="text-caption text-fg-muted">
                  {preset.label} · {preset.hint}
                </span>
              </span>
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-subtle text-fg-muted transition-colors group-hover:bg-accent group-hover:text-fg-on-accent">
                <Plus className="size-4" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 rounded-md bg-surface-subtle p-4 text-caption text-fg-muted">
        <p className="font-semibold text-fg">Editing text</p>
        <p>Double-click (or double-tap) text on the canvas to change it, or select it and press Enter. Fonts, size, colour and spacing are in Properties.</p>
      </div>
    </div>
  );
}
