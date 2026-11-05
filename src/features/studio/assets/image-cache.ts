import { useSyncExternalStore } from 'react';

/**
 * The Studio's image loader (Plan §18.3 `ImageNode`): graphics now, uploads from M12. Each URL is
 * decoded once and shared by every element and thumbnail that shows it; failures are remembered
 * (and can be retried) instead of being requested again on every render.
 */

export type ImageState = { status: 'loading' } | { status: 'loaded'; image: HTMLImageElement } | { status: 'error' };

type Loader = (url: string) => Promise<HTMLImageElement>;

const LOADING: ImageState = { status: 'loading' };
const ERROR: ImageState = { status: 'error' };

const states = new Map<string, ImageState>();
const listeners = new Map<string, Set<() => void>>();

function browserLoader(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Couldn't load ${url}`));
    image.src = url;
  });
}

let loader: Loader = browserLoader;

function notify(url: string) {
  for (const listener of listeners.get(url) ?? []) listener();
}

/** Start loading `url` (once); returns its current state. */
export function requestImage(url: string): ImageState {
  const known = states.get(url);
  if (known) return known;
  states.set(url, LOADING);
  loader(url).then(
    (image) => {
      states.set(url, { status: 'loaded', image });
      notify(url);
    },
    () => {
      states.set(url, ERROR);
      notify(url);
    },
  );
  return LOADING;
}

/** Forget a failed image so the next request tries again. */
export function retryImage(url: string): void {
  if (states.get(url)?.status !== 'error') return;
  states.delete(url);
  requestImage(url);
  notify(url);
}

export function imageState(url: string): ImageState {
  return states.get(url) ?? LOADING;
}

function subscribe(url: string, listener: () => void): () => void {
  let set = listeners.get(url);
  if (!set) listeners.set(url, (set = new Set()));
  set.add(listener);
  return () => set.delete(listener);
}

/** The decoded image for `url` (null: nothing to load). Re-renders when it arrives or fails. */
export function useImage(url: string | null): ImageState | null {
  return useSyncExternalStore(
    (listener) => (url ? subscribe(url, listener) : () => {}),
    () => (url ? requestImage(url) : null),
    () => (url ? LOADING : null),
  );
}

/** Tests: swap the loader and clear the cache. */
export function setImageLoaderForTests(next: Loader | null): void {
  loader = next ?? browserLoader;
  states.clear();
  listeners.clear();
}
