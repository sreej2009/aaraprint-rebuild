import { Eye, EyeOff, Lock, LockOpen, MousePointerClick } from 'lucide-react';
import { Button, Callout, Sheet, SheetContent } from '@/design-system';
import { cn } from '@/lib/cn';
import { PLACEMENT_MESSAGES, placementFor } from '../canvas/transform-rules';
import { PositionSize } from '../inspector/position-size';
import { elementDisplayName } from '../naming';
import type { DesignElement, SurfacePrint } from '../schema/types';
import { selectActiveSurface, selectDocument, selectSelectedIds, useStudio, useStudioActions } from '../store';
import { useStudioUi } from './ui-context';

const TYPE_LABELS = { text: 'Text', image: 'Image', shape: 'Shape' } as const;

/**
 * Properties and layers for the active side. M6: the selected item's name, print warnings,
 * exact position, size and rotation, and a layer list that selects. The full inspector (style
 * sections, layer actions and reordering) arrives with M7.
 */
export function InspectorContent() {
  // Stable references from the store; the list is derived during render.
  const surface = useStudio(selectActiveSurface);
  const document = useStudio(selectDocument);
  const selectedIds = useStudio(selectSelectedIds);
  const actions = useStudioActions();
  const surfaceLabel = surface?.label ?? '';
  const selected = selectedIds.length === 1 ? surface?.elements.find((e) => e.id === selectedIds[0]) : undefined;
  // Top layer first, like every design tool.
  const layers = [...(surface?.elements ?? [])].reverse().map((e) => ({ id: e.id, name: elementDisplayName(e, document), hidden: e.hidden, locked: e.locked }));
  return (
    <div className="flex flex-col gap-6 p-5">
      <section aria-labelledby="studio-properties-heading" className="flex flex-col gap-3">
        <h2 id="studio-properties-heading" className="text-body-sm font-semibold text-fg">
          Properties
        </h2>
        {selected && surface ? (
          <SelectedProperties element={selected} name={elementDisplayName(selected, document)} print={surface.print} />
        ) : selectedIds.length > 1 ? (
          <p className="text-body-sm text-fg-muted">{selectedIds.length} items selected</p>
        ) : (
          <div className="flex gap-3 rounded-md bg-surface-subtle p-4 text-body-sm text-fg-muted">
            <MousePointerClick aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-strong" />
            <p>Select something on the canvas to edit it — or add text from the tools.</p>
          </div>
        )}
      </section>
      <section aria-labelledby="studio-layers-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="studio-layers-heading" className="text-body-sm font-semibold text-fg">
            Layers
          </h2>
          <p className="text-caption text-fg-muted">
            {surfaceLabel} · {layers.length} {layers.length === 1 ? 'item' : 'items'}
          </p>
        </div>
        {layers.length === 0 ? (
          <p className="text-body-sm text-fg-muted">Nothing on the {surfaceLabel.toLowerCase()} yet.</p>
        ) : (
          // Arrow keys and Delete act on the selection while a layer has focus, as on the canvas.
          <ul className="flex flex-col gap-1" aria-labelledby="studio-layers-heading" data-studio-keys="">
            {layers.map((layer) => {
              const isSelected = selectedIds.includes(layer.id);
              return (
                <li key={layer.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${layer.name}${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}`}
                    onClick={() => actions.select([layer.id])}
                    className={cn(
                      'flex h-10 w-full items-center gap-2 rounded-sm px-2 text-left text-body-sm text-fg transition-colors hover:bg-surface-subtle',
                      isSelected && 'bg-accent-soft text-accent-strong hover:bg-accent-soft-hover',
                    )}
                  >
                    <span className={cn('min-w-0 flex-1 truncate', layer.hidden && 'text-fg-muted')}>{layer.name}</span>
                    {layer.locked && <Lock aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />}
                    {layer.hidden ? <EyeOff aria-hidden="true" className="size-4 shrink-0 text-fg-muted" /> : <Eye aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SelectedProperties({ element, name, print }: { element: DesignElement; name: string; print: SurfacePrint }) {
  const actions = useStudioActions();
  const placement = placementFor(element, print);
  const warning = PLACEMENT_MESSAGES[placement];
  return (
    <div className="flex flex-col gap-4" data-testid="selected-properties">
      <div className="flex min-w-0 flex-col">
        <p className="truncate text-body font-semibold text-fg" title={name}>
          {name}
        </p>
        <p className="text-caption text-fg-muted">{TYPE_LABELS[element.type]}</p>
      </div>
      {element.locked && (
        <Callout
          title="This layer is locked"
          actions={
            <Button variant="secondary" size="sm" onClick={() => actions.setLocked([element.id], false)}>
              <LockOpen aria-hidden="true" />
              Unlock
            </Button>
          }
        >
          Unlock it to move, resize or delete it.
        </Callout>
      )}
      {element.hidden && <Callout title="This layer is hidden">It isn’t shown on the canvas or printed.</Callout>}
      {warning && (
        <Callout tone={placement === 'outside-trim' ? 'danger' : 'warning'} className="p-3">
          {warning}
        </Callout>
      )}
      <PositionSize element={element} print={print} />
    </div>
  );
}

/** Desktop (≥ 1280 px): docked on the right. */
export function InspectorAside() {
  return (
    <aside aria-label="Layers and properties" className="w-75 shrink-0 overflow-y-auto border-l border-border bg-surface">
      <InspectorContent />
    </aside>
  );
}

/** Tablet and laptop: right drawer. Phone: bottom sheet. */
export function InspectorSheet() {
  const { layout, inspectorOpen, setInspectorOpen } = useStudioUi();
  return (
    <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
      <SheetContent side={layout === 'phone' ? 'bottom' : 'right'} title="Layers and properties" className={layout === 'phone' ? 'h-[70dvh]' : 'max-w-sm'}>
        <InspectorContent />
      </SheetContent>
    </Sheet>
  );
}
