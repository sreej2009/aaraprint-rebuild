import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Pencil } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { IconButton } from '@/design-system';
import { cn } from '@/lib/cn';
import { elementDisplayName } from '../naming';
import type { DesignDocument, DesignElement, SurfaceDesign } from '../schema/types';
import { selectDocument, selectSelectedIds, useStudio, useStudioActions } from '../store';
import { ElementIcon } from './element-icon';
import { arrangeOptions, layerAccessibleName } from './inspector-rules';

/** Matches the `data-layer-row` attribute on each row's main button. */
const ROW = '[data-layer-row]';

/** Whether part of the list shows inside its scrolling panel. */
function listVisible(list: HTMLElement | null): boolean {
  if (!list) return false;
  let parent = list.parentElement;
  while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
  if (!parent) return true;
  const a = list.getBoundingClientRect();
  const b = parent.getBoundingClientRect();
  // No layout (tests): treat as visible.
  if (a.height === 0 && b.height === 0) return true;
  return a.bottom > b.top && a.top < b.bottom;
}

/**
 * The layers of the active side, top layer first (Plan §18.7).
 * - Click or tap a row to select it on the canvas; hover highlights it there.
 * - Each row shows the type, the name and the hidden / locked state, with show/hide and lock buttons.
 * - Reorder with Move up / Move down; rename with the pencil, F2 or a double-click.
 * - Keyboard: ↑/↓ (Home/End) move between layers and select them; Alt + ↑/↓ move the layer;
 *   F2 renames; Delete removes; the list is a single tab stop (roving focus).
 */
export function LayersPanel({ surface }: { surface: SurfaceDesign }) {
  const document = useStudio(selectDocument);
  const selectedIds = useStudio(selectSelectedIds);
  const actions = useStudioActions();
  const listRef = useRef<HTMLUListElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Focus to restore after the next render (reordering moves the row's DOM node).
  const pendingFocus = useRef<string | null>(null);
  const focusAfterRender = (id: string) => {
    pendingFocus.current = id;
  };

  // Top layer first, like every design tool.
  const layers = [...surface.elements].reverse();
  const selected = selectedIds.length === 1 ? (layers.find((e) => e.id === selectedIds[0]) ?? null) : null;
  const activeId = selected?.id ?? layers[0]?.id ?? null;
  const order = selected ? arrangeOptions(surface, selected.id) : { forward: false, backward: false };

  const rowButton = (id: string) => listRef.current?.querySelector<HTMLElement>(`${ROW}[data-id="${CSS.escape(id)}"]`) ?? null;

  useEffect(() => {
    if (!pendingFocus.current) return;
    rowButton(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  // A new canvas selection scrolls its row into view — only while the list is on screen, so the
  // inspector never jumps away from the properties being edited.
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    if (!selectedId || !listVisible(listRef.current)) return;
    rowButton(selectedId)?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  const move = (id: string, action: 'forward' | 'backward') => {
    if (actions.arrangeElement(id, action)) focusAfterRender(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const target = event.target as HTMLElement;
    const id = target.closest<HTMLElement>(ROW)?.dataset.id;
    if (!id) return;
    const index = layers.findIndex((e) => e.id === id);
    const go = (next: number) => {
      const element = layers[Math.max(0, Math.min(layers.length - 1, next))];
      if (!element) return;
      actions.select([element.id]);
      rowButton(element.id)?.focus();
    };
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault(); // never nudge the element from here
      const up = event.key === 'ArrowUp';
      if (event.altKey) move(id, up ? 'forward' : 'backward');
      else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) go(index + (up ? -1 : 1));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      go(event.key === 'Home' ? 0 : layers.length - 1);
    } else if (event.key === 'F2') {
      event.preventDefault();
      setRenamingId(id);
    }
  };

  return (
    <section aria-labelledby="studio-layers-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h2 id="studio-layers-heading" className="text-body-sm font-semibold text-fg">
            Layers
          </h2>
          <p className="text-caption text-fg-muted">
            {surface.label} · {layers.length} {layers.length === 1 ? 'item' : 'items'}
          </p>
        </div>
        {layers.length > 0 && (
          <div role="toolbar" aria-label="Selected layer" className="flex items-center">
            <IconButton label="Move layer up" shortcut="Alt ↑" icon={<ArrowUp />} size="sm" className="pointer-coarse:size-11" disabled={!order.forward} onClick={() => selected && move(selected.id, 'forward')} />
            <IconButton label="Move layer down" shortcut="Alt ↓" icon={<ArrowDown />} size="sm" className="pointer-coarse:size-11" disabled={!order.backward} onClick={() => selected && move(selected.id, 'backward')} />
            <IconButton label="Rename layer" shortcut="F2" icon={<Pencil />} size="sm" className="pointer-coarse:size-11" disabled={!selected} onClick={() => selected && setRenamingId(selected.id)} />
          </div>
        )}
      </div>
      {layers.length === 0 ? (
        <p className="text-body-sm text-fg-muted">Nothing on the {surface.label.toLowerCase()} yet.</p>
      ) : (
        <>
          <p id="studio-layers-help" className="sr-only">
            Up and down arrows move between layers. Alt with an arrow moves the layer. F2 renames it.
          </p>
          {/* Arrow keys are delegated from the rows' buttons; Delete and Escape act on the selection (data-studio-keys). */}
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- key handling delegated from the row buttons inside */}
          <ul ref={listRef} aria-labelledby="studio-layers-heading" aria-describedby="studio-layers-help" className="flex flex-col gap-0.5" data-studio-keys="" onKeyDown={onKeyDown}>
            {layers.map((element) => (
              <LayerRow
                key={element.id}
                element={element}
                document={document}
                selected={selectedIds.includes(element.id)}
                tabbable={element.id === activeId}
                renaming={renamingId === element.id}
                onRenameEnd={(focus) => {
                  if (focus) focusAfterRender(element.id);
                  setRenamingId(null);
                }}
                onStartRename={() => setRenamingId(element.id)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface LayerRowProps {
  element: DesignElement;
  document: DesignDocument;
  selected: boolean;
  tabbable: boolean;
  renaming: boolean;
  onStartRename(): void;
  onRenameEnd(focusRow: boolean): void;
}

function LayerRow({ element, document, selected, tabbable, renaming, onStartRename, onRenameEnd }: LayerRowProps) {
  const actions = useStudioActions();
  const name = elementDisplayName(element, document);
  return (
    <li
      className={cn(
        'group flex h-10 items-center gap-1 rounded-sm pr-1 transition-colors pointer-coarse:h-12',
        selected ? 'bg-accent-soft text-accent-strong' : 'hover:bg-surface-subtle',
      )}
    >
      {renaming ? (
        <RenameInput element={element} name={name} onEnd={onRenameEnd} />
      ) : (
        <button
          type="button"
          data-layer-row=""
          data-id={element.id}
          tabIndex={tabbable ? 0 : -1}
          aria-pressed={selected}
          aria-label={layerAccessibleName(element, document)}
          onClick={() => actions.select([element.id])}
          onDoubleClick={onStartRename}
          onPointerEnter={() => actions.setHovered(element.hidden ? null : element.id)}
          onPointerLeave={() => actions.setHovered(null)}
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm pl-2 text-left text-body-sm focus-visible:-outline-offset-2"
        >
          <ElementIcon element={element} className={selected ? 'text-accent-strong' : 'text-fg-muted'} />
          <span className={cn('min-w-0 flex-1 truncate', element.hidden && 'text-fg-muted italic line-through decoration-fg-subtle')}>{name}</span>
        </button>
      )}
      {/* Row toggles stay out of the tab order (the list is one tab stop); the inspector has the same toggles for keyboard users. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${element.locked ? 'Unlock' : 'Lock'} “${name}”`}
        title={element.locked ? 'Unlock' : 'Lock'}
        onClick={() => actions.setLocked([element.id], !element.locked)}
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-sm hover:bg-surface-sunken pointer-coarse:size-10 [&_svg]:size-4',
          element.locked ? 'text-fg' : 'text-fg-subtle opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100',
          selected && !element.locked && 'opacity-100',
        )}
      >
        {element.locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${element.hidden ? 'Show' : 'Hide'} “${name}”`}
        title={element.hidden ? 'Show' : 'Hide'}
        onClick={() => actions.setHidden([element.id], !element.hidden, { keepSelection: true })}
        className={cn('grid size-8 shrink-0 place-items-center rounded-sm hover:bg-surface-sunken pointer-coarse:size-10 [&_svg]:size-4', element.hidden ? 'text-fg' : 'text-fg-subtle')}
      >
        {element.hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </li>
  );
}

/** Enter or leaving the field saves; Escape cancels; an empty name goes back to the automatic one. */
function RenameInput({ element, name, onEnd }: { element: DesignElement; name: string; onEnd(focusRow: boolean): void }) {
  const actions = useStudioActions();
  const done = useRef(false);
  const finish = (save: boolean, value: string, focusRow: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && value.trim() !== name) actions.renameElement(element.id, value.trim() || null);
    onEnd(focusRow);
  };
  return (
    <input
      aria-label="Layer name"
      defaultValue={element.name ?? name}
      maxLength={80}
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- renaming is an explicit action; focus goes straight to the field
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true, event.currentTarget.value, true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish(false, '', true);
        }
      }}
      onBlur={(event) => finish(true, event.currentTarget.value, false)}
      className="mx-1 h-8 min-w-0 flex-1 rounded-sm border border-accent bg-surface px-2 text-body-sm text-fg outline-none pointer-coarse:h-10"
    />
  );
}
