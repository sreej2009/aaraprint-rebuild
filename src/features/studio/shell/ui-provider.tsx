import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StudioUiContext, type SideDialog, type StudioUi } from './ui-context';
import type { ToolId } from './tools';
import { useStudioLayout, type StudioLayout } from './use-studio-layout';

const docksPanel = (layout: StudioLayout) => layout === 'laptop' || layout === 'desktop';

export function StudioUiProvider({ initialTool, children }: { initialTool: ToolId | null; children: ReactNode }) {
  const layout = useStudioLayout();
  // Laptops and desktops open with a panel docked; phones and tablets start with the canvas only,
  // unless a tool was asked for (e.g. "Upload your design" on the product page).
  const [activeTool, setActiveTool] = useState<ToolId | null>(() => initialTool ?? (docksPanel(layout) ? 'templates' : null));
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sideDialog, openSideDialog] = useState<SideDialog | null>(null);

  // When the window shrinks to a layout where panels cover the canvas, close them.
  const previous = useRef(layout);
  useEffect(() => {
    if (previous.current === layout) return;
    const wasDocked = docksPanel(previous.current);
    previous.current = layout;
    setInspectorOpen(false);
    setMoreOpen(false);
    if (wasDocked && !docksPanel(layout)) setActiveTool(null);
  }, [layout]);

  const ui = useMemo<StudioUi>(
    () => ({
      layout,
      activeTool,
      openTool: (tool) => {
        setMoreOpen(false);
        setActiveTool(tool);
      },
      toggleTool: (tool) => setActiveTool((current) => (current === tool ? null : tool)),
      inspectorOpen,
      setInspectorOpen,
      moreOpen,
      setMoreOpen,
      sideDialog,
      openSideDialog,
    }),
    [layout, activeTool, inspectorOpen, moreOpen, sideDialog],
  );

  return <StudioUiContext.Provider value={ui}>{children}</StudioUiContext.Provider>;
}
