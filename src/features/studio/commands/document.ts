import type { DesignAsset, DesignDocument } from '../schema/types';
import { DesignCommandError } from './shared';

export const MAX_DESIGN_NAME = 120;

export function renameDesign(document: DesignDocument, name: string): DesignDocument {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (!clean) throw new DesignCommandError('A design needs a name');
  const value = clean.slice(0, MAX_DESIGN_NAME);
  return value === document.name ? document : { ...document, name: value };
}

export function setVariant(document: DesignDocument, variantId: string | null): DesignDocument {
  return document.product.variantId === variantId ? document : { ...document, product: { ...document.product, variantId } };
}

/** Register an uploaded file. Only its reference and facts are stored — never the bytes. */
export function addAsset(document: DesignDocument, asset: DesignAsset): DesignDocument {
  const existing = document.assets[asset.id];
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(asset)) return document;
    throw new DesignCommandError(`Asset id "${asset.id}" is already in use`);
  }
  return { ...document, assets: { ...document.assets, [asset.id]: asset } };
}

/** Drop assets (used when saving, for files no element or undo step needs any more). */
export function removeAssets(document: DesignDocument, assetIds: Iterable<string>): DesignDocument {
  const remove = new Set([...assetIds].filter((id) => id in document.assets));
  if (remove.size === 0) return document;
  return { ...document, assets: Object.fromEntries(Object.entries(document.assets).filter(([id]) => !remove.has(id))) };
}
