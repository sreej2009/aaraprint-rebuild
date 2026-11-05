import { createContext, useContext } from 'react';
import type { ToolId } from './tools';
import type { StudioLayout } from './use-studio-layout';

/**
 * Editor chrome state: which tool panel is open and which drawers or sheets are showing.
 * Kept out of the Studio store on purpose — it's neither design data nor undoable editor state.
 */
export interface StudioUi {
  layout: StudioLayout;
  /** Open tool panel (docked on laptop/desktop, overlay on tablet, bottom sheet on phone). */
  activeTool: ToolId | null;
  openTool(tool: ToolId | null): void;
  /** Rail behaviour: pressing the open tool closes its panel. */
  toggleTool(tool: ToolId): void;
  /** Layers & properties drawer (tablet, laptop) or sheet (phone). Docked on desktop. */
  inspectorOpen: boolean;
  setInspectorOpen(open: boolean): void;
  /** Phone "More" sheet. */
  moreOpen: boolean;
  setMoreOpen(open: boolean): void;
  /** Confirmation for copying onto a side with artwork, or clearing a side. */
  sideDialog: SideDialog | null;
  openSideDialog(dialog: SideDialog | null): void;
}

export type SideDialog = 'copy' | 'clear';

export const StudioUiContext = createContext<StudioUi | null>(null);

export function useStudioUi(): StudioUi {
  const ui = useContext(StudioUiContext);
  if (!ui) throw new Error('useStudioUi must be used inside <StudioUiProvider>.');
  return ui;
}
