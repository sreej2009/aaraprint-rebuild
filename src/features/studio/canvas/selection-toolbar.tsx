import { BringToFront, Copy, LockOpen, PencilLine, SendToBack, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useContext } from 'react';
import { IconButton } from '@/design-system';
import { cn } from '@/lib/cn';
import { mmToPx } from '../geometry/units';
import { elementDisplayName } from '../naming';
import { selectActiveSurface, useStudio, useStudioActions } from '../store';
import { useInteraction } from './interaction-store';
import { StudioUiContext } from '../shell/ui-context';
import { DUPLICATE_OFFSET_MM } from './transform-rules';

/**
 * Quick actions for the selected element, floating at the top of the canvas: edit text, duplicate,
 * layer order and delete — the touch equivalents of Enter, Ctrl D, Ctrl ] / [ and Delete. Locked
 * items offer Unlock instead. Hidden while a gesture runs (so it never covers what's being moved)
 * and while text is being edited.
 */
export function SelectionToolbar({ className }: { className?: string }) {
  const actions = useStudioActions();
  const surface = useStudio(selectActiveSurface);
  const selectedId = useStudio((s) => (s.editor.selectedIds.length === 1 ? s.editor.selectedIds[0]! : null));
  const document = useStudio((s) => s.document);
  const gesture = useInteraction((s) => s.gesture);
  const editing = useStudio((s) => s.editor.editingTextId !== null);
  // In the Studio (not the /design-system demo), where the inspector isn't docked, open it from here.
  const ui = useContext(StudioUiContext);
  const openProperties = ui && ui.layout !== 'desktop' ? () => ui.setInspectorOpen(true) : null;
  const index = surface?.elements.findIndex((e) => e.id === selectedId) ?? -1;
  const element = index >= 0 ? surface!.elements[index]! : null;
  if (!element || !surface || gesture || editing) return null;
  const name = elementDisplayName(element, document);
  const top = index === surface.elements.length - 1;
  const bottom = index === 0;
  return (
    <div
      role="toolbar"
      aria-label={`Selected: ${name}`}
      className={cn('absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-surface/95 px-1 py-0.5 shadow-2 backdrop-blur', className)}
      data-testid="selection-toolbar"
    >
      {openProperties && (
        <>
          <IconButton label="Properties" icon={<SlidersHorizontal />} size="sm" aria-haspopup="dialog" onClick={openProperties} />
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
        </>
      )}
      {element.locked ? (
        <IconButton label="Unlock" icon={<LockOpen />} size="sm" onClick={() => actions.setLocked([element.id], false)} />
      ) : (
        <>
          {element.type === 'text' && !element.hidden && (
            <>
              <IconButton label="Edit text" shortcut="Enter" icon={<PencilLine />} size="sm" onClick={() => actions.setEditingText(element.id)} />
              <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
            </>
          )}
          <IconButton label="Duplicate" shortcut="Ctrl D" icon={<Copy />} size="sm" onClick={() => actions.duplicateSelection(mmToPx(DUPLICATE_OFFSET_MM, surface.print.dpi))} />
          <IconButton label="Bring forward" shortcut="Ctrl ]" icon={<BringToFront />} size="sm" disabled={top} onClick={() => actions.arrangeElement(element.id, 'forward')} />
          <IconButton label="Send backward" shortcut="Ctrl [" icon={<SendToBack />} size="sm" disabled={bottom} onClick={() => actions.arrangeElement(element.id, 'backward')} />
          <IconButton label="Delete" shortcut="Delete" icon={<Trash2 />} size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => actions.removeSelection()} />
        </>
      )}
    </div>
  );
}
