import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { assetSettled, subscribeAssets } from '../assets/asset-library';
import { ensureFonts, facesFor } from '../assets/fonts';
import { graphicById, useGraphicsLibrary } from '../assets/graphics';
import { requestImage, subscribeImages } from '../assets/image-cache';
import type { SurfaceDesign, TextElement } from '../schema/types';

/** Never wait longer than this: a slow file shows its light frame instead of holding the preview back. */
export const PREVIEW_READY_TIMEOUT_MS = 8000;

/**
 * Whether the preview can be shown without flashing half-drawn artwork (Plan M14): the fonts its
 * text uses have loaded (or failed — fallbacks then), and every uploaded image and graphic it
 * shows has settled (drawn, missing or failed). Uses the same caches as the editor, so nothing is
 * decoded twice; never waits longer than `timeoutMs`.
 */
export function usePreviewReady(surfaces: readonly SurfaceDesign[], timeoutMs = PREVIEW_READY_TIMEOUT_MS): boolean {
  const library = useGraphicsLibrary();
  const { assetIds, graphicIds, facesKey } = useMemo(() => {
    const elements = surfaces.flatMap((s) => s.elements.filter((e) => !e.hidden));
    const assets = new Set<string>();
    const graphics = new Set<string>();
    for (const e of elements) {
      if (e.type !== 'image') continue;
      if (e.source.kind === 'asset') assets.add(e.source.assetId);
      else graphics.add(e.source.graphicId);
    }
    return { assetIds: [...assets], graphicIds: [...graphics], facesKey: JSON.stringify(facesFor(elements.filter((e): e is TextElement => e.type === 'text'))) };
  }, [surfaces]);

  const imagesSettled = useSyncExternalStore(
    (listener) => {
      const offAssets = subscribeAssets(listener);
      const offImages = subscribeImages(listener);
      return () => {
        offAssets();
        offImages();
      };
    },
    () =>
      assetIds.every(assetSettled) &&
      graphicIds.every((id) => {
        if (library.status === 'loading') return false;
        const entry = graphicById(library, id);
        return !entry || requestImage(entry.url).status !== 'loading';
      }),
    () => false,
  );

  const [fontsReady, setFontsReady] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    ensureFonts(JSON.parse(facesKey) as ReturnType<typeof facesFor>)
      .catch(() => undefined) // a font that can't load falls back, as in the editor
      .finally(() => live && setFontsReady(facesKey));
    return () => {
      live = false;
    };
  }, [facesKey]);

  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [timeoutMs]);

  return timedOut || (fontsReady === facesKey && imagesSettled);
}
