import type { CSSProperties } from 'react';
import { fontCss } from '../assets/fonts';
import type { Viewport } from '../geometry/viewport';
import type { TextElement } from '../schema/types';
import { selectActiveSurface, selectEditingTextId, useStudio } from '../store';

/** Marks the canvas region, where focus returns after editing ends with the keyboard. */
export const CANVAS_FOCUS_ATTRIBUTE = 'data-studio-canvas';

/** The text element being edited on the active side, if any. */
export function useEditingText(): TextElement | null {
  return useStudio((s) => {
    const id = selectEditingTextId(s);
    const element = id ? selectActiveSurface(s)?.elements.find((e) => e.id === id) : undefined;
    return element?.type === 'text' ? element : null;
  });
}

/** The textarea's look: the text's own font, size, spacing and colour at the current zoom. */
export function textEditorStyle(element: TextElement, viewport: Viewport): CSSProperties {
  const s = viewport.scale;
  const width = element.width * s;
  const height = element.height * s;
  return {
    left: element.x * s + viewport.x,
    top: element.y * s + viewport.y,
    width,
    minHeight: height,
    // Rotates around the text box's centre, like the canvas.
    transformOrigin: `${width / 2}px ${height / 2}px`,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    fontFamily: fontCss(element.fontFamily),
    fontSize: element.fontSize * s,
    fontWeight: element.fontWeight,
    fontStyle: element.italic ? 'italic' : 'normal',
    lineHeight: element.lineHeight,
    letterSpacing: element.letterSpacing * element.fontSize * s,
    textAlign: element.align,
    textDecoration: element.underline ? 'underline' : 'none',
    color: element.color,
    caretColor: element.color,
    opacity: Math.max(element.opacity, 0.35),
  };
}

