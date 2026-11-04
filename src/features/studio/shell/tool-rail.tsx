import { cn } from '@/lib/cn';
import { railButtonId, TOOL_PANEL_ID } from './dom-ids';
import { HELP_TOOL, RAIL_TOOLS, type ToolDefinition } from './tools';
import { useStudioUi } from './ui-context';

/** Vertical tool rail for tablet and larger (64 px, icon + label). */
export function ToolRail() {
  return (
    <nav aria-label="Design tools" className="flex w-18 shrink-0 flex-col justify-between overflow-y-auto border-r border-border bg-surface py-1">
      <ul className="flex flex-col">
        {RAIL_TOOLS.map((tool) => (
          <li key={tool.id}>
            <RailButton tool={tool} />
          </li>
        ))}
      </ul>
      <RailButton tool={HELP_TOOL} />
    </nav>
  );
}

function RailButton({ tool }: { tool: ToolDefinition }) {
  const { activeTool, toggleTool } = useStudioUi();
  const pressed = activeTool === tool.id;
  const Icon = tool.icon;
  return (
    <button
      type="button"
      id={railButtonId(tool.id)}
      aria-pressed={pressed}
      aria-controls={pressed ? TOOL_PANEL_ID : undefined}
      onClick={() => toggleTool(tool.id)}
      className={cn(
        'mx-1 flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-md text-caption font-medium transition-colors duration-150',
        pressed ? 'bg-accent-soft text-accent-strong' : 'text-fg-muted hover:bg-surface-subtle hover:text-fg',
      )}
    >
      <Icon aria-hidden="true" className="size-5" />
      {tool.label}
    </button>
  );
}
