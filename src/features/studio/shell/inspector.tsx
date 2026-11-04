import { Eye, EyeOff, Lock, MousePointerClick } from 'lucide-react';
import { Sheet, SheetContent } from '@/design-system';
import { elementDisplayName } from '../naming';
import { selectActiveSurface, selectDocument, selectSelectedIds, useStudio } from '../store';
import { useStudioUi } from './ui-context';

/**
 * Properties and layers for the active side. In M4 it shows the empty state and a read-only
 * layer list; editing controls arrive with the inspector milestone (M7).
 */
export function InspectorContent() {
  // Stable references from the store; the list is derived during render.
  const surface = useStudio(selectActiveSurface);
  const document = useStudio(selectDocument);
  const selectedCount = useStudio((s) => selectSelectedIds(s).length);
  const surfaceLabel = surface?.label ?? '';
  // Top layer first, like every design tool.
  const layers = [...(surface?.elements ?? [])].reverse().map((e) => ({ id: e.id, name: elementDisplayName(e, document), hidden: e.hidden, locked: e.locked }));
  return (
    <div className="flex flex-col gap-6 p-5">
      <section aria-labelledby="studio-properties-heading" className="flex flex-col gap-3">
        <h2 id="studio-properties-heading" className="text-body-sm font-semibold text-fg">
          Properties
        </h2>
        {selectedCount === 0 ? (
          <div className="flex gap-3 rounded-md bg-surface-subtle p-4 text-body-sm text-fg-muted">
            <MousePointerClick aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-strong" />
            <p>Select something on the canvas to edit it — or add text from the tools.</p>
          </div>
        ) : (
          <p className="text-body-sm text-fg-muted">{selectedCount === 1 ? '1 item selected' : `${selectedCount} items selected`}</p>
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
          <ul className="flex flex-col gap-1">
            {layers.map((layer) => (
              <li key={layer.id} className="flex h-10 items-center gap-2 rounded-sm px-2 text-body-sm text-fg">
                <span className="min-w-0 flex-1 truncate">{layer.name}</span>
                {layer.locked && <Lock aria-label="Locked" className="size-4 text-fg-muted" />}
                {layer.hidden ? <EyeOff aria-label="Hidden" className="size-4 text-fg-muted" /> : <Eye aria-hidden="true" className="size-4 text-fg-subtle" />}
              </li>
            ))}
          </ul>
        )}
      </section>
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
