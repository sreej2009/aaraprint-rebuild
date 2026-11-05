import type Konva from 'konva';
import { useCallback, useRef, useState } from 'react';
import { Button, SegmentedControl } from '@/design-system';
import { exportArtwork } from '../canvas/export';
import { createInteractionStore, InteractionStoreContext, useInteractionStoreApi } from '../canvas/interaction-store';
import { useViewportStoreApi, ViewportStoreContext } from '../canvas/viewport-context';
import { createViewportStore } from '../canvas/viewport-store';
import { ZoomControl } from '../canvas/zoom-control';
import { resizeSurface } from '../commands';
import { CanvasWorkspace } from '../shell/canvas-workspace';
import { useStudioShortcuts } from '../keyboard/use-studio-shortcuts';
import { createStudioStore, selectActiveSurface, selectActiveSurfaceId, StudioProvider, useStudio, useStudioActions, useStudioStoreApi } from '../store';
import { DEMO_SHAPES, demoDesign } from './demo-design';

/**
 * The real Studio canvas with a sample design, for the /design-system reference page: every element
 * type, both sides, every trim shape, zoom and the guide-free artwork export.
 */
export default function CanvasDemo() {
  const [store] = useState(() => createStudioStore({ document: demoDesign() }));
  const [viewportStore] = useState(() => createViewportStore({ showGuides: true }));
  const [interactionStore] = useState(() => createInteractionStore());
  return (
    <StudioProvider store={store}>
      <ViewportStoreContext.Provider value={viewportStore}>
        <InteractionStoreContext.Provider value={interactionStore}>
          <DemoBody />
        </InteractionStoreContext.Provider>
      </ViewportStoreContext.Provider>
    </StudioProvider>
  );
}

function DemoBody() {
  const actions = useStudioActions();
  const active = useStudio(selectActiveSurfaceId);
  const surfaces = useStudio((s) => s.document.surfaces);
  const print = useStudio((s) => selectActiveSurface(s)?.print);
  const viewportStore = useViewportStoreApi();
  // Editing keys only while the demo canvas has focus: the page itself keeps scrolling with arrows.
  useStudioShortcuts(useStudioStoreApi(), useInteractionStoreApi(), { allowBody: false });
  const stageRef = useRef<Konva.Stage | null>(null);
  const onStage = useCallback((stage: Konva.Stage | null) => {
    stageRef.current = stage;
  }, []);
  const [artwork, setArtwork] = useState<string | null>(null);
  const shape = DEMO_SHAPES.find((s) => print && JSON.stringify(s.print) === JSON.stringify(print))?.value ?? 'rectangle';

  const changeShape = (value: string) => {
    const next = DEMO_SHAPES.find((s) => s.value === value);
    if (!next) return;
    actions.execute('Change shape', (doc) => doc.surfaces.reduce((d, s) => resizeSurface(d, s.id, next.print, 'fit'), doc));
    setArtwork(null);
  };

  const showArtwork = () => {
    const stage = stageRef.current;
    if (!stage || !print) return;
    setArtwork(exportArtwork(stage, viewportStore.getState().viewport, print, 0.5).toDataURL('image/png'));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Demo side"
          size="sm"
          value={active}
          onValueChange={(id) => {
            actions.setActiveSurface(id);
            setArtwork(null);
          }}
          options={surfaces.map((s) => ({ value: s.id, label: s.label, count: s.elements.length }))}
        />
        <SegmentedControl label="Demo trim shape" size="sm" value={shape} onValueChange={changeShape} options={DEMO_SHAPES.map(({ value, label }) => ({ value, label }))} />
        <ZoomControl className="rounded-md border border-border bg-surface" />
        <Button variant="secondary" size="sm" onClick={showArtwork}>
          Show printable artwork
        </Button>
      </div>
      <div className="h-[26rem] overflow-hidden rounded-md border border-border">
        <CanvasWorkspace onStage={onStage} />
      </div>
      {artwork && (
        <figure className="flex flex-col gap-2">
          <img src={artwork} alt="Printable artwork of this side, at half print resolution, without guides" className="max-w-full self-start rounded-sm border border-border" data-testid="artwork-export" />
          <figcaption className="text-caption text-fg-muted">Exported from the artwork layer only (bleed included, guides excluded), at half print resolution.</figcaption>
        </figure>
      )}
    </div>
  );
}
