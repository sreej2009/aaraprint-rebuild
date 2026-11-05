import { useEffect } from 'react';
import { ensureFonts, facesFor, subscribeFonts } from '../assets/fonts';
import type { DesignDocument, TextElement } from '../schema/types';
import type { StudioStore } from '../store';
import { subscribeTextMeasurer } from './text-layout';

function textElements(document: DesignDocument): TextElement[] {
  return document.surfaces.flatMap((s) => s.elements.filter((e): e is TextElement => e.type === 'text'));
}

/**
 * Keeps stored text heights true for the whole editing session: loads the font faces the design
 * uses (every side), and re-measures all text when the canvas's measurer arrives or a font
 * finishes loading — so wrapping measured with a fallback font never lingers.
 */
export function useTextLayout(studio: StudioStore): void {
  useEffect(() => {
    const relayout = () => void studio.getState().actions.relayoutText();
    const offFonts = subscribeFonts(relayout);
    const offMeasurer = subscribeTextMeasurer(relayout);
    let loaded = '';
    const load = (document: DesignDocument) => {
      const faces = facesFor(textElements(document));
      const key = JSON.stringify(faces);
      if (key === loaded) return;
      loaded = key;
      void ensureFonts(faces);
    };
    relayout();
    load(studio.getState().document);
    const offStudio = studio.subscribe((next, prev) => {
      if (next.document !== prev.document) load(next.document);
    });
    return () => {
      offFonts();
      offMeasurer();
      offStudio();
    };
  }, [studio]);
}
