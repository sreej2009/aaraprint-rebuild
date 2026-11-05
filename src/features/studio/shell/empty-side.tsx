import { CopyPlus, Shapes, Sparkles, Type } from 'lucide-react';
import { useContext } from 'react';
import { Button } from '@/design-system';
import { selectActiveSurface, useStudio } from '../store';
import { isSurfaceEmpty } from './side-rules';
import { StudioUiContext } from './ui-context';
import { useSideActions } from './use-side-actions';

/**
 * Shown over the canvas while the active side has nothing on it, so an empty side looks
 * intentional: what to do next — add text, a shape or a graphic, or copy the front onto the back.
 * Plain HTML over the stage: never drawn into the artwork, never stored in the design.
 */
export function EmptySideCard() {
  // Only inside the Studio: the /design-system canvas demo has no tools to open.
  const ui = useContext(StudioUiContext);
  return ui ? <EmptySide openTool={ui.openTool} /> : null;
}

function EmptySide({ openTool }: { openTool: (tool: 'text' | 'shapes' | 'graphics') => void }) {
  const surface = useStudio(selectActiveSurface);
  const first = useStudio((s) => s.document.surfaces[0]?.id);
  const { sided, plan, copyFrontToBack } = useSideActions();
  if (!surface || !isSurfaceEmpty(surface)) return null;
  const onBack = sided && surface.id !== first;
  const open = (tool: 'text' | 'shapes' | 'graphics') => openTool(tool);
  const title = sided ? `${surface.label} side is empty` : 'Your design is empty';
  return (
    <section
      aria-labelledby="studio-empty-side-title"
      data-no-pan=""
      data-testid="empty-side"
      className="absolute top-3 left-1/2 z-10 flex w-[min(26rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-lg border border-border bg-surface/95 p-3 shadow-2 backdrop-blur"
    >
      <div className="flex flex-col">
        <h2 id="studio-empty-side-title" className="text-body-sm font-semibold text-fg">
          {title}
        </h2>
        <p className="text-caption text-fg-muted">{onBack && plan ? `Add something, or start from a copy of the ${plan.from.label.toLowerCase()}.` : 'Add something to get started.'}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="secondary" size="sm" className="pointer-coarse:h-10" onClick={() => open('text')}>
          <Type aria-hidden="true" />
          Add text
        </Button>
        <Button variant="secondary" size="sm" className="pointer-coarse:h-10" onClick={() => open('shapes')}>
          <Shapes aria-hidden="true" />
          Add shape
        </Button>
        <Button variant="secondary" size="sm" className="pointer-coarse:h-10" onClick={() => open('graphics')}>
          <Sparkles aria-hidden="true" />
          Add graphic
        </Button>
        {onBack && plan && (
          <Button variant="secondary" size="sm" className="pointer-coarse:h-10" onClick={copyFrontToBack}>
            <CopyPlus aria-hidden="true" />
            Copy {plan.from.label.toLowerCase()} to {plan.to.label.toLowerCase()}
          </Button>
        )}
      </div>
    </section>
  );
}
