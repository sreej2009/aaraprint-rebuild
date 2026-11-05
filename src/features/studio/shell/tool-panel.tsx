import { ChevronDown, ChevronUp, PanelLeftClose } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton, Sheet, SheetContent } from '@/design-system';
import { cn } from '@/lib/cn';
import { ToolContent } from './tool-content';
import { railButtonId, TOOL_PANEL_ID } from './dom-ids';
import { toolById } from './tools';
import { useStudioUi } from './ui-context';

/**
 * The open tool's panel next to the rail: docked (320 px, pushes the canvas) on laptop and desktop,
 * floating over the canvas on tablets. Escape closes it and returns focus to its rail button.
 */
export function ToolPanel({ variant }: { variant: 'docked' | 'overlay' }) {
  const { activeTool, openTool } = useStudioUi();
  const panelRef = useRef<HTMLElement>(null);

  // Escape closes the panel while focus is inside it, and returns focus to its rail button.
  useEffect(() => {
    if (!activeTool) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !panelRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      openTool(null);
      document.getElementById(railButtonId(activeTool))?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeTool, openTool]);

  if (!activeTool) return null;
  const tool = toolById(activeTool);
  const close = () => {
    openTool(null);
    document.getElementById(railButtonId(tool.id))?.focus();
  };
  return (
    <aside
      ref={panelRef}
      id={TOOL_PANEL_ID}
      aria-labelledby={`${TOOL_PANEL_ID}-title`}
      className={cn(
        'flex w-80 shrink-0 flex-col overflow-hidden border-r border-border bg-surface',
        variant === 'overlay' && 'absolute inset-y-0 left-18 z-20 shadow-3 animate-sheet-in-left',
      )}
    >
      <div className="flex items-start gap-2 px-5 pt-4 pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={`${TOOL_PANEL_ID}-title`} className="font-display text-h3 font-semibold text-fg">
            {tool.title}
          </h2>
          <p className="text-body-sm text-fg-muted">{tool.intro}</p>
        </div>
        <IconButton label="Close panel" icon={<PanelLeftClose />} size="sm" className="-mr-2" onClick={close} />
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
        <ToolContent tool={tool} />
      </div>
    </aside>
  );
}

/** Phones: the open tool as a bottom sheet that starts half height and can expand. */
export function ToolSheet() {
  const { activeTool, openTool } = useStudioUi();
  const [expanded, setExpanded] = useState(false);
  const tool = activeTool ? toolById(activeTool) : null;
  return (
    <Sheet
      open={Boolean(tool)}
      onOpenChange={(open) => {
        if (!open) {
          openTool(null);
          setExpanded(false);
        }
      }}
    >
      {tool && (
        <SheetContent
          side="bottom"
          title={tool.title}
          description={tool.intro}
          className={cn('transition-[height] duration-200', expanded ? 'h-[90dvh]' : 'h-[48dvh]')}
          // A tool can hand over to another sheet (adding text opens the text editor): leave focus there.
          onCloseAutoFocus={(event) => {
            if (document.activeElement?.closest('[role="dialog"]')) event.preventDefault();
          }}
        >
          <div className="flex justify-center pt-1">
            <IconButton
              label={expanded ? 'Show less' : 'Show more'}
              icon={expanded ? <ChevronDown /> : <ChevronUp />}
              size="sm"
              tooltip={false}
              aria-expanded={expanded}
              onClick={() => setExpanded((e) => !e)}
            />
          </div>
          <div className="px-5 pb-6">
            <ToolContent tool={tool} />
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
