import { useEffect, useId, useRef } from 'react';
import { controlClasses } from '@/design-system';
import { cn } from '@/lib/cn';
import { useTextEdit } from '../canvas/use-text-edit';
import type { TextElement } from '../schema/types';
import { MAX_TEXT_LENGTH } from '../schema/validate';

/**
 * The selected text's content (inspector "Content"). Typing updates the canvas live; everything
 * typed while the field has focus is one undo step. Escape restores the text from when the field
 * was entered; leaving the field keeps it (empty text removes the text box).
 * The field is uncontrolled while focused, so the browser's own undo (Ctrl Z) works inside it.
 */
export function TextContentField({ element }: { element: TextElement }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const edit = useTextEdit(element.id);

  // Show changes made elsewhere (canvas editing, undo) while the field isn't being typed in.
  useEffect(() => {
    const field = ref.current;
    if (field && document.activeElement !== field && field.value !== element.text) field.value = element.text;
  }, [element.text]);

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-2">
      <h3 id={`${id}-heading`} className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
        Content
      </h3>
      <label htmlFor={id} className="sr-only">
        Text content
      </label>
      <textarea
        ref={ref}
        id={id}
        defaultValue={element.text}
        maxLength={MAX_TEXT_LENGTH}
        rows={3}
        spellCheck
        disabled={element.locked}
        aria-describedby={`${id}-hint`}
        className={cn(controlClasses, 'min-h-20 resize-y px-3 py-2 text-body-sm pointer-coarse:text-body')}
        onFocus={() => edit.begin()}
        onInput={(event) => edit.update(event.currentTarget.value)}
        onBlur={() => edit.commit()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            const original = edit.original();
            if (original === null || event.currentTarget.value === original) return;
            // Only swallow Escape when there's something to restore; otherwise it can close a sheet.
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.value = original;
            edit.cancel();
          } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            edit.commit();
          }
        }}
      />
      <p id={`${id}-hint`} className="text-caption text-fg-muted">
        Enter starts a new line. You can also double-click (or double-tap) the text on the canvas.
      </p>
    </section>
  );
}
