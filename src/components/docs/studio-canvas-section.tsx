import { lazy, Suspense } from 'react';
import { Skeleton } from '@/design-system';
import { useHydrated } from '@/lib/use-hydrated';
import { DocsSection } from './docs-layout';

// Konva loads only when this section renders in the browser (the page itself is pre-rendered).
const CanvasDemo = lazy(() => import('@/features/studio/demo/canvas-demo'));

export function StudioCanvasSection() {
  const hydrated = useHydrated();
  const placeholder = <Skeleton className="h-[26rem] w-full rounded-md" />;
  return (
    <DocsSection
      id="canvas-demo"
      title="Studio canvas"
      description="The Design Studio's Konva canvas with a sample card: every element type on both sides, each trim shape, print guides (bleed band, trim, safe area), zoom and pan, and the artwork export that never includes guides."
    >
      {hydrated ? <Suspense fallback={placeholder}>{<CanvasDemo />}</Suspense> : placeholder}
    </DocsSection>
  );
}
