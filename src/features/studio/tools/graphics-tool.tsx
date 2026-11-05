import { ImageOff, Search, Sparkles, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, Spinner } from '@/design-system';
import { GRAPHIC_GROUPS, graphicBox, loadGraphicsLibrary, searchGraphics, useGraphicsLibrary, type GraphicEntry } from '../assets/graphics';
import { useImage } from '../assets/image-cache';
import { createImageElement } from '../schema/create';
import { selectActiveSurface, useStudio, useStudioStoreApi } from '../store';
import { useStudioUi } from '../shell/ui-context';

/**
 * The Graphics tool panel: the approved graphics library, grouped, with local search. Adding a
 * graphic places it centred in the safe area at 30 % of the trim width and selects it. Only
 * graphics whose usage rights are confirmed are ever listed (assets/graphics.ts).
 */
export function GraphicsTool() {
  const library = useGraphicsLibrary();
  const [query, setQuery] = useState('');
  const searchId = useId();

  if (library.status === 'loading') {
    return (
      <output className="flex items-center gap-3 py-6 text-body-sm text-fg-muted">
        <Spinner size="sm" /> Loading graphics…
      </output>
    );
  }
  if (library.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-md bg-surface-subtle p-4" role="alert">
        <p className="text-body-sm font-semibold text-fg">Graphics couldn’t be loaded</p>
        <p className="text-caption text-fg-muted">Check your connection and try again. Your design is safe.</p>
        <Button variant="secondary" size="sm" onClick={() => loadGraphicsLibrary({ retry: true })}>
          Try again
        </Button>
      </div>
    );
  }

  const { graphics } = library.library;
  if (graphics.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border-strong/60 bg-surface-subtle px-5 py-8 text-center" data-testid="graphics-empty">
        <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent-strong">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <p className="text-body-sm font-semibold text-fg">Graphics are being prepared for Studio use.</p>
        <p className="text-caption text-fg-muted">In the meantime, build your design with shapes and text — they print just as sharply.</p>
      </div>
    );
  }

  const results = searchGraphics(graphics, query);
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search graphics
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
        <input
          id={searchId}
          type="search"
          value={query}
          placeholder="Search graphics"
          autoComplete="off"
          onChange={(event) => setQuery(event.currentTarget.value)}
          className="h-10 w-full rounded-sm border border-border-strong bg-surface pr-9 pl-9 text-body-sm text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-offset-0 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-sm text-fg-muted hover:bg-surface-subtle">
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {query ? `${results.length} ${results.length === 1 ? 'graphic' : 'graphics'} found` : ''}
      </p>
      {results.length === 0 ? (
        <p className="text-body-sm text-fg-muted">No graphics match “{query}”.</p>
      ) : (
        GRAPHIC_GROUPS.map((group) => {
          const items = results.filter((g) => g.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group} aria-labelledby={`graphics-${group}`} className="flex flex-col gap-2">
              <h3 id={`graphics-${group}`} className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
                {group}
              </h3>
              <ul className="grid grid-cols-3 gap-2">
                {items.map((graphic) => (
                  <li key={graphic.id}>
                    <GraphicButton graphic={graphic} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function GraphicButton({ graphic }: { graphic: GraphicEntry }) {
  const studio = useStudioStoreApi();
  // The same decoded image the canvas draws: each file downloads once.
  const image = useImage(graphic.url);
  const failed = image?.status === 'error';
  const surface = useStudio(selectActiveSurface);
  const { layout, openTool } = useStudioUi();
  const add = () => {
    const state = studio.getState();
    const target = selectActiveSurface(state);
    if (!target) return;
    const element = createImageElement({ kind: 'graphic', graphicId: graphic.id }, graphicBox(graphic, target.print, target.elements));
    if (!state.actions.addElement(element, { surfaceId: target.id })) return;
    if (layout === 'phone' || layout === 'tablet') openTool(null);
  };
  return (
    <button
      type="button"
      disabled={!surface || failed}
      onClick={add}
      aria-label={`Add graphic: ${graphic.name}`}
      title={failed ? `${graphic.name} couldn’t be loaded` : graphic.name}
      className="group flex w-full flex-col items-center gap-1 rounded-md border border-border bg-surface p-1.5 text-caption text-fg-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
    >
      <span className="grid aspect-square w-full place-items-center overflow-hidden rounded-sm bg-surface-subtle">
        {image?.status === 'loaded' ? (
          <img src={graphic.url} alt="" className="max-h-full max-w-full object-contain" />
        ) : failed ? (
          <ImageOff aria-hidden="true" className="size-5 text-fg-subtle" />
        ) : null}
      </span>
      <span className="w-full truncate text-center">{graphic.name}</span>
    </button>
  );
}
