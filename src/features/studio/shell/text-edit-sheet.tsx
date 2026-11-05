import { useEffect, useId, useRef, useState } from 'react';
import { Button, Sheet, SheetContent } from '@/design-system';
import { fontCss } from '../assets/fonts';
import { useEditingText } from '../canvas/text-editing';
import { useTextEdit } from '../canvas/use-text-edit';
import type { TextElement } from '../schema/types';
import { MAX_TEXT_LENGTH } from '../schema/validate';
import { useStudioActions } from '../store';

/**
 * Phones edit text in a bottom sheet (Plan §18.3) rather than on the small canvas: a full-width
 * field with room for the on-screen keyboard, the canvas still visible above and updating live.
 * Done (or closing the sheet) keeps the text; Cancel restores it. The whole edit is one undo step.
 */
export function TextEditSheet() {
  const element = useEditingText();
  if (!element) return null;
  return <EditSheet key={element.id} element={element} />;
}

/** How far the on-screen keyboard covers the bottom of the layout viewport (px). */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

function EditSheet({ element }: { element: TextElement }) {
  const actions = useStudioActions();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const inset = useKeyboardInset();
  const edit = useTextEdit(element.id, () => actions.setEditingText(null));

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) edit.commit();
      }}
    >
      <SheetContent
        side="bottom"
        title="Edit text"
        description="Changes show on the design as you type."
        style={inset ? { bottom: inset, maxHeight: `calc(100dvh - ${inset}px - 1rem)` } : undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const textarea = ref.current;
          if (!textarea) return;
          textarea.focus();
          // Sample text is selected so typing replaces it.
          if (element.placeholder) textarea.select();
          else textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          edit.begin();
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          edit.cancel();
        }}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => edit.cancel()}>
              Cancel
            </Button>
            <Button onClick={() => edit.commit()}>Done</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-1.5 px-5 py-4">
          <label htmlFor={fieldId} className="text-body-sm font-medium text-fg">
            Text content
          </label>
          <textarea
            ref={ref}
            id={fieldId}
            defaultValue={element.text}
            maxLength={MAX_TEXT_LENGTH}
            rows={4}
            spellCheck
            data-testid="text-edit-sheet-field"
            className="min-h-28 w-full resize-y rounded-sm border border-border-strong bg-surface px-3 py-2.5 text-body text-fg focus-visible:border-accent focus-visible:outline-offset-0"
            // The design's own font; at least 16 px so phones don't zoom in.
            style={{ fontFamily: fontCss(element.fontFamily), fontWeight: element.fontWeight, fontStyle: element.italic ? 'italic' : 'normal' }}
            onInput={(event) => edit.update(event.currentTarget.value)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
