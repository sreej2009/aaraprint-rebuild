import { useEffect, useMemo, useState } from 'react';
import { assetAvailability, subscribeAssets } from '../assets/asset-library';
import { graphicById, useGraphicsLibrary, type LibraryState } from '../assets/graphics';
import { requestImage, subscribeImages } from '../assets/image-cache';
import type { DesignDocument } from '../schema/types';
import { useStudio } from '../store';
import { evaluatePrintChecks, type PrintReport, type ResourceState } from './print-checks';

/** A library graphic: drawn, missing (not in the approved library, or the file failed) or loading. */
export function graphicAvailability(library: LibraryState, graphicId: string): ResourceState {
  if (library.status === 'loading') return 'loading';
  const entry = graphicById(library, graphicId);
  if (!entry) return 'missing';
  const image = requestImage(entry.url).status;
  return image === 'loaded' ? 'available' : image === 'error' ? 'missing' : 'loading';
}

/** Goes up whenever an image or upload settles, so checks that depend on them are redone. */
function useResourceVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const offAssets = subscribeAssets(bump);
    const offImages = subscribeImages(bump);
    return () => {
      offAssets();
      offImages();
    };
  }, []);
  return version;
}

export function usePrintReportFor(document: DesignDocument): PrintReport {
  const library = useGraphicsLibrary();
  const version = useResourceVersion();
  return useMemo(
    () => evaluatePrintChecks({ document, imageState: assetAvailability, graphicState: (id) => graphicAvailability(library, id) }),
    // `version` stands for the image and upload states read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [document, library, version],
  );
}

/** Checks of the current design (the dialog: nothing changes while it's open). */
export function usePrintReport(): PrintReport {
  return usePrintReportFor(useStudio((s) => s.document));
}

/**
 * Checks for the top-bar count: the design is read once editing pauses (300 ms), so dragging,
 * resizing and typing never run them on every move.
 */
export function useSettledPrintReport(delayMs = 300): PrintReport {
  const live = useStudio((s) => s.document);
  const [settled, setSettled] = useState(live);
  useEffect(() => {
    if (live === settled) return;
    const timer = setTimeout(() => setSettled(live), delayMs);
    return () => clearTimeout(timer);
  }, [live, settled, delayMs]);
  return usePrintReportFor(settled);
}
