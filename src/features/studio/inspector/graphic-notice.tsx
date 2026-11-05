import { Button, Callout } from '@/design-system';
import { graphicById, useGraphicsLibrary } from '../assets/graphics';
import { retryImage, useImage } from '../assets/image-cache';
import type { ImageElement } from '../schema/types';

/**
 * Says when a library graphic can't be shown: it isn't (or is no longer) in the approved library,
 * or its file didn't load. The element stays in the design either way — nothing is removed.
 */
export function GraphicNotice({ element }: { element: ImageElement }) {
  return element.source.kind === 'graphic' ? <LibraryGraphicNotice graphicId={element.source.graphicId} /> : null;
}

function LibraryGraphicNotice({ graphicId }: { graphicId: string }) {
  const library = useGraphicsLibrary();
  const entry = graphicById(library, graphicId);
  const image = useImage(entry?.url ?? null);
  if (library.status === 'loading') return null;
  if (library.status === 'error' || !entry) {
    return (
      <Callout tone="warning" title="This graphic isn’t available" className="p-3">
        It stays in your design, but it can’t be shown or printed until it’s back in the graphics library. You can delete it or keep it for later.
      </Callout>
    );
  }
  if (image?.status !== 'error') return null;
  return (
    <Callout
      tone="warning"
      title="This graphic couldn’t be loaded"
      className="p-3"
      actions={
        <Button variant="secondary" size="sm" className="pointer-coarse:h-11" onClick={() => retryImage(entry.url)}>
          Try again
        </Button>
      }
    >
      It stays in your design. Check your connection and try again.
    </Callout>
  );
}
