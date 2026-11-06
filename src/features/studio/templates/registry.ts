import { useSyncExternalStore } from 'react';
import { buildCatalogue, type TemplateCatalogue } from './validate';
import type { StudioTemplate, TemplateCategory } from './types';

/**
 * The template catalogue at runtime (Plan M13). The definitions ship with the app (templates/data)
 * but load only when the Templates panel first needs them, as a separate chunk, and are checked
 * one by one before anything is shown (templates/validate.ts). No server, no remote templates.
 */

export type TemplateRegistryState = { status: 'loading' } | { status: 'ready'; catalogue: TemplateCatalogue } | { status: 'error' };

type Loader = () => Promise<readonly unknown[]>;

const defaultLoader: Loader = () => import('./data').then((module) => module.TEMPLATE_DEFINITIONS);

let loader: Loader = defaultLoader;
let state: TemplateRegistryState = { status: 'loading' };
let started = false;
const listeners = new Set<() => void>();

function setState(next: TemplateRegistryState) {
  state = next;
  for (const listener of listeners) listener();
}

/** Load once per page; `retry` after a failure. */
export function loadTemplates(options: { retry?: boolean } = {}): void {
  if (started && !(options.retry && state.status === 'error')) return;
  started = true;
  setState({ status: 'loading' });
  loader()
    .then((raw) => setState({ status: 'ready', catalogue: buildCatalogue(Array.isArray(raw) ? raw : []) }))
    .catch(() => setState({ status: 'error' }));
}

export function useTemplateRegistry(): TemplateRegistryState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      loadTemplates();
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

/** Tests: load from `next` instead (raw definitions, a load that fails or never ends, or a loader), or restore the shipped data with null. */
export function setTemplateSourceForTests(next: readonly unknown[] | 'error' | 'never' | Loader | null): void {
  loader =
    next === null
      ? defaultLoader
      : next === 'error'
        ? () => Promise.reject(new Error('offline'))
        : next === 'never'
          ? () => new Promise(() => {})
          : typeof next === 'function'
            ? next
            : () => Promise.resolve(next);
  started = false;
  setState({ status: 'loading' });
}

// ------------------------------------------------------------------ Search

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim();

/** Local search by name, category and tags (every word must match), within a category if one is chosen. */
export function filterTemplates(templates: readonly StudioTemplate[], query: string, category: TemplateCategory | null): StudioTemplate[] {
  const words = normalise(query).split(' ').filter(Boolean);
  return templates.filter((template) => {
    if (category && template.category !== category) return false;
    if (words.length === 0) return true;
    const haystack = normalise([template.name, template.category, ...template.tags].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}
