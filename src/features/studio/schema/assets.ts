import type { DesignDocument } from './types';

/** Asset ids used by image elements on any surface. */
export function referencedAssetIds(document: DesignDocument): Set<string> {
  const ids = new Set<string>();
  for (const surface of document.surfaces) {
    for (const element of surface.elements) {
      if (element.type === 'image' && element.source.kind === 'asset') ids.add(element.source.assetId);
    }
  }
  return ids;
}

/**
 * Assets whose file can't be found: local uploads whose blob is gone from this device
 * (e.g. browser storage cleared). Remote files are checked by the storage layer instead.
 * The Studio shows these as "missing image" placeholders and asks for the file again.
 */
export function missingLocalAssets(document: DesignDocument, hasBlob: (blobId: string) => boolean): string[] {
  return Object.values(document.assets)
    .filter((asset) => asset.storage.kind === 'local' && !hasBlob(asset.storage.blobId))
    .map((asset) => asset.id);
}

/**
 * Assets no element uses. They are kept in the document while undo can bring an element back;
 * the save step removes them once they've left the history as well.
 */
export function unusedAssetIds(document: DesignDocument, alsoInUse: Iterable<string> = []): string[] {
  const used = referencedAssetIds(document);
  for (const id of alsoInUse) used.add(id);
  return Object.keys(document.assets).filter((id) => !used.has(id));
}
