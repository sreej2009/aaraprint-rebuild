import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TextElement } from '../schema/types';
import { MAX_TEXT_LENGTH } from '../schema/validate';
import { useStudioActions } from '../store';
import { CANVAS_FOCUS_ATTRIBUTE, textEditorStyle, useEditingText } from './text-editing';
import { useTextEdit } from './use-text-edit';
import { useViewport } from './viewport-context';

/**
 * Editing text in place on the canvas (desktop, laptop, tablet; Plan §18.3): a native textarea laid
 * over the text, matched to its font, size, weight, spacing, alignment, colour, rotation and the
 * zoom, while the canvas hides its own drawing of it. A real textarea gives the caret, selection,
 * IME input, spell-check and native undo (Ctrl Z) for free; the canvas has none of them.
 * - Enter adds a line; Ctrl/⌘ + Enter or clicking elsewhere keeps the text; Escape restores it.
 * - The whole edit is one undo step (canvas/text-edit-session.ts).
 */
export function TextEditOverlay() {
  const element = useEditingText();
  if (!element) return null;
  return <InlineTextEditor key={element.id} element={element} />;
}

function InlineTextEditor({ element }: { element: TextElement }) {
  const actions = useStudioActions();
  const viewport = useViewport((s) => s.viewport);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Sample text is selected so typing replaces it; otherwise the caret goes to the end.
  const [selectAll] = useState(element.placeholder);
  // How the edit ends decides where focus goes: back to the canvas after a key, nowhere after a click.
  const returnFocus = useRef(false);
  const edit = useTextEdit(element.id, () => {
    const region = returnFocus.current ? ref.current?.closest<HTMLElement>(`[${CANVAS_FOCUS_ATTRIBUTE}]`) : null;
    actions.setEditingText(null);
    region?.focus({ preventScroll: true });
  });

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    if (selectAll) textarea.select();
    else textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    edit.begin();
  }, [edit, selectAll]);

  // CSS may wrap a line sooner than the canvas: never clip what's being typed.
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(element.height * viewport.scale, textarea.scrollHeight)}px`;
  });

  return (
    <textarea
      ref={ref}
      aria-label="Text content"
      aria-describedby="studio-text-edit-help"
      data-no-pan=""
      data-testid="text-edit-overlay"
      defaultValue={element.text}
      maxLength={MAX_TEXT_LENGTH}
      spellCheck
      rows={1}
      wrap="soft"
      className="pointer-events-auto absolute z-10 m-0 resize-none overflow-hidden border-0 bg-transparent p-0 whitespace-pre-wrap outline-1 outline-offset-0 outline-accent outline-dashed select-text [overflow-wrap:break-word]"
      style={textEditorStyle(element, viewport)}
      onInput={(event) => edit.update(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          returnFocus.current = true;
          edit.cancel();
        } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          returnFocus.current = true;
          edit.commit();
        }
      }}
      onBlur={(event) => {
        // Switching to another window keeps editing; focus comes back to the textarea.
        if (event.relatedTarget === null && !document.hasFocus()) return;
        edit.commit();
      }}
    />
  );
}

/** Screen-reader help for the editor, rendered once next to the canvas. */
export function TextEditHelp() {
  return (
    <p id="studio-text-edit-help" className="sr-only">
      Type to change the text. Enter adds a line. Control Enter or leaving the field keeps it; Escape cancels.
    </p>
  );
}
