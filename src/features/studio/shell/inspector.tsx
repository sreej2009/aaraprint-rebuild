import { MousePointerClick } from 'lucide-react';
import { Sheet, SheetContent } from '@/design-system';
import { CanvasAnnouncer } from '../canvas/canvas-announcer';
import { LayersPanel } from '../inspector/layers-panel';
import { PropertiesPanel } from '../inspector/properties-panel';
import { selectActiveSurface, selectSelectedIds, useStudio } from '../store';
import { useStudioUi } from './ui-context';

/**
 * Properties and layers for the active side (Plan §18.7). Docked on desktop, a right drawer on
 * laptops and tablets, a bottom sheet on phones — the same content everywhere.
 */
export function InspectorContent() {
  const surface = useStudio(selectActiveSurface);
  const selectedIds = useStudio(selectSelectedIds);
  if (!surface) return null;
  const selected = selectedIds.length === 1 ? surface.elements.find((e) => e.id === selectedIds[0]) : undefined;
  return (
    <div className="flex flex-col gap-6 p-5">
      <section aria-labelledby="studio-properties-heading" className="flex flex-col gap-3">
        <h2 id="studio-properties-heading" className="text-body-sm font-semibold text-fg">
          Properties
        </h2>
        {selected ? (
          <PropertiesPanel element={selected} surface={surface} />
        ) : selectedIds.length > 1 ? (
          <p className="text-body-sm text-fg-muted">{selectedIds.length} items selected</p>
        ) : (
          <div className="flex gap-3 rounded-md bg-surface-subtle p-4 text-body-sm text-fg-muted">
            <MousePointerClick aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-strong" />
            <p>Select something on the canvas or in the layers below to edit it.</p>
          </div>
        )}
      </section>
      <LayersPanel surface={surface} />
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
      <SheetContent side={layout === 'phone' ? 'bottom' : 'right'} title="Layers and properties" className={layout === 'phone' ? 'h-[80dvh]' : 'max-w-sm'}>
        <InspectorContent />
        {/* The sheet is modal, which hides the canvas's own live region from screen readers. */}
        <CanvasAnnouncer />
      </SheetContent>
    </Sheet>
  );
}
