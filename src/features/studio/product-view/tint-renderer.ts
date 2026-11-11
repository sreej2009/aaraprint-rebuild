import { useSyncExternalStore } from 'react';
import { applyTint, prepareTintSource, type Pixels, type TintSource } from './tint';

/**
 * Tinted product photos for the Preview and the editing workspace (Phase 4 M3): one shared pipeline
 * and one cache, so both show the same pixels and nothing is computed twice.
 *
 * Caches (bounded; the oldest entry goes first and its canvas is left to the garbage collector —
 * no object URLs are made):
 *   pixels  — decoded photo and mask pixels, by URL (6)
 *   sources — the colour-independent preparation (stats, smoothing, coverage), by photo + mask (4)
 *   results — the tinted canvas, by photo + mask + colour (12)
 * Work happens only when a photo, mask or colour is first asked for — never on render or pointer
 * moves. A photo that can't be read (e.g. a CDN without CORS) fails, and the caller falls back to
 * the untinted photo.
 */

export type TintState = { status: 'loading' } | { status: 'ready'; image: HTMLCanvasElement } | { status: 'error' };

export interface TintRequest {
  photoUrl: string;
  maskUrl: string;
  hex: string;
}

type Renderer = (request: TintRequest) => Promise<HTMLCanvasElement>;

const LOADING: TintState = { status: 'loading' };
const ERROR: TintState = { status: 'error' };
const RESULT_LIMIT = 12;

function remember<V>(cache: Map<string, V>, key: string, value: V, limit: number): V {
  while (cache.size >= limit) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}

const pixelCache = new Map<string, Promise<Pixels>>();
const sourceCache = new Map<string, Promise<TintSource>>();

function loadPixels(url: string): Promise<Pixels> {
  const known = pixelCache.get(url);
  if (known) return known;
  const loading = new Promise<Pixels>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onerror = () => reject(new Error(`Couldn't load ${url}`));
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('No 2D canvas');
        context.drawImage(image, 0, 0);
        resolve(context.getImageData(0, 0, canvas.width, canvas.height));
      } catch (error) {
        reject(error);
      }
    };
    image.src = url;
  });
  loading.catch(() => pixelCache.get(url) === loading && pixelCache.delete(url));
  return remember(pixelCache, url, loading, 6);
}

/** Let the page paint between the heavy steps. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const browserRenderer: Renderer = async ({ photoUrl, maskUrl, hex }) => {
  const [photo, mask] = await Promise.all([loadPixels(photoUrl), loadPixels(maskUrl)]);
  const key = `${photoUrl}|${maskUrl}`;
  let source = sourceCache.get(key);
  if (!source) {
    source = breathe().then(() => prepareTintSource(photo, mask));
    source.catch(() => sourceCache.get(key) === source && sourceCache.delete(key));
    remember(sourceCache, key, source, 4);
  }
  const prepared = await source;
  await breathe();
  const canvas = document.createElement('canvas');
  canvas.width = photo.width;
  canvas.height = photo.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas');
  context.putImageData(new ImageData(applyTint(photo, prepared, hex), photo.width, photo.height), 0, 0);
  return canvas;
};

let renderer: Renderer = browserRenderer;
const states = new Map<string, TintState>();
/** Each photo's most recently finished tint: shown while the next colour is prepared (no flash). */
const latest = new Map<string, HTMLCanvasElement>();
const listeners = new Set<() => void>();

const keyOf = (r: TintRequest) => `${r.photoUrl}|${r.maskUrl}|${r.hex.toLowerCase()}`;

/** Start tinting (once per photo + mask + colour); returns the current state. */
export function requestTint(request: TintRequest): TintState {
  const key = keyOf(request);
  const known = states.get(key);
  if (known) return known;
  remember(states, key, LOADING, RESULT_LIMIT);
  renderer(request).then(
    (image) => {
      if (states.has(key)) states.set(key, { status: 'ready', image });
      latest.delete(request.photoUrl);
      remember(latest, request.photoUrl, image, 4);
      for (const listener of listeners) listener();
    },
    () => {
      if (states.has(key)) states.set(key, ERROR);
      for (const listener of listeners) listener();
    },
  );
  return LOADING;
}

/** The photo's most recently finished tint, if any. */
export function latestTint(photoUrl: string): HTMLCanvasElement | null {
  return latest.get(photoUrl) ?? null;
}

export function useTint(request: TintRequest | null): TintState | null {
  const key = request ? keyOf(request) : null;
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (request && key ? (states.get(key) ?? requestTint(request)) : null),
    () => (request ? LOADING : null),
  );
}

/** Tests: swap the renderer (jsdom has no canvas pixels) and clear every cache. */
export function setTintRendererForTests(next: Renderer | null): void {
  renderer = next ?? browserRenderer;
  states.clear();
  latest.clear();
  pixelCache.clear();
  sourceCache.clear();
}
