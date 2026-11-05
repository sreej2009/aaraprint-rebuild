import { BringToFront, Copy, LockOpen, SendToBack, Trash2 } from 'lucide-react';
import { IconButton } from '@/design-system';
import { cn } from '@/lib/cn';
import { mmToPx } from '../geometry/units';
import { elementDisplayName } from '../naming';
import { selectActiveSurface, useStudio, useStudioActions } from '../store';
import { useInteraction } from './interaction-store';
import { DUPLICATE_OFFSET_MM } from './transform-rules';

/**
 * Quick actions for the selected element, floating at the top of the canvas: duplicate, layer
 * order and delete — the touch equivalents of Ctrl D, Ctrl ] / [ and Delete. Locked items offer
 * Unlock instead. Hidden while a gesture runs so it never covers what's being moved.
 */
export function SelectionToolbar({ className }: { className?: string }) {
  const actions = useStudioActions();
  const surface = useStudio(selectActiveSurface);
  const selectedId = useStudio((s) => (s.editor.selectedIds.length === 1 ? s.editor.selectedIds[0]! : null));
  const document = useStudio((s) => s.document);
  const gesture = useInteraction((s) => s.gesture);
  const index = surface?.elements.findIndex((e) => e.id === selectedId) ?? -1;
  const element = index >= 0 ? surface!.elements[index]! : null;
  if (!element || !surface || gesture) return null;
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
      {element.locked ? (
        <IconButton label="Unlock" icon={<LockOpen />} size="sm" onClick={() => actions.setLocked([element.id], false)} />
      ) : (
        <>
          <IconButton label="Duplicate" shortcut="Ctrl D" icon={<Copy />} size="sm" onClick={() => actions.duplicateSelection(mmToPx(DUPLICATE_OFFSET_MM, surface.print.dpi))} />
          <IconButton label="Bring forward" shortcut="Ctrl ]" icon={<BringToFront />} size="sm" disabled={top} onClick={() => actions.arrangeElement(element.id, 'forward')} />
          <IconButton label="Send backward" shortcut="Ctrl [" icon={<SendToBack />} size="sm" disabled={bottom} onClick={() => actions.arrangeElement(element.id, 'backward')} />
          <IconButton label="Delete" shortcut="Delete" icon={<Trash2 />} size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => actions.removeSelection()} />
        </>
      )}
    </div>
  );
}
