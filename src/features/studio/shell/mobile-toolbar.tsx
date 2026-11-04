import { Ellipsis, Layers } from 'lucide-react';
import { Sheet, SheetContent } from '@/design-system';
import { cn } from '@/lib/cn';
import { SideSwitcher } from './top-bar';
import { PHONE_MORE, PHONE_TOOLBAR, toolById } from './tools';
import { useStudioUi } from './ui-context';

/** Phones: side switcher under the top bar (Blueprint §13.2). */
export function PhoneSideBar() {
  return (
    <div className="flex shrink-0 justify-center border-b border-border bg-surface px-3 py-2">
      <SideSwitcher size="sm" className="w-full max-w-sm [&>*]:flex-1" />
    </div>
  );
}

const barButton = 'flex h-16 flex-col items-center justify-center gap-1 text-caption font-medium';

/** Phones: bottom toolbar (64 px + safe area). Tools open as bottom sheets. */
export function MobileToolbar() {
  const { activeTool, openTool, moreOpen, setMoreOpen } = useStudioUi();
  return (
    <nav aria-label="Design tools" className="shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        {PHONE_TOOLBAR.map((id) => {
          const tool = toolById(id);
          const Icon = tool.icon;
          const open = activeTool === id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => openTool(id)}
                className={cn(barButton, 'w-full', open ? 'text-accent-strong' : 'text-fg-muted')}
              >
                <Icon aria-hidden="true" className="size-5" />
                {tool.label}
              </button>
            </li>
          );
        })}
        <li>
          <button type="button" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className={cn(barButton, 'w-full', moreOpen ? 'text-accent-strong' : 'text-fg-muted')}>
            <Ellipsis aria-hidden="true" className="size-5" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Phones: the rest of the tools, plus layers and properties. */
export function MoreSheet() {
  const { moreOpen, setMoreOpen, openTool, setInspectorOpen } = useStudioUi();
  const rows = [
    ...PHONE_MORE.map((id) => {
      const tool = toolById(id);
      return { key: id, label: tool.title, hint: tool.intro, Icon: tool.icon, onSelect: () => openTool(id) };
    }),
    {
      key: 'layers',
      label: 'Layers and properties',
      hint: 'Everything on this side, top to bottom.',
      Icon: Layers,
      onSelect: () => {
        setMoreOpen(false);
        setInspectorOpen(true);
      },
    },
  ];
  return (
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <SheetContent side="bottom" title="More tools">
        <ul className="flex flex-col p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {rows.map(({ key, label, hint, Icon, onSelect }) => (
            <li key={key}>
              <button type="button" onClick={onSelect} className="flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-subtle">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-sm font-semibold text-fg">{label}</span>
                  <span className="truncate text-caption text-fg-muted">{hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
