import { useContext } from 'react';
import { CopyPlus, Ellipsis, Eraser } from 'lucide-react';
import { Button, ConfirmDialog, Dialog, DialogClose, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton, SegmentedControl } from '@/design-system';
import { useInteractionStoreApi } from '../canvas/interaction-store';
import { selectActiveSurface, selectActiveSurfaceId, useStudio, useStudioStoreApi } from '../store';
import { describeContents, frontToBackPlan, hasSides, isSurfaceEmpty } from './side-rules';
import { StudioSessionContext } from './session-context';
import { useStudioUi } from './ui-context';
import { useSideActions, useSwitchSide } from './use-side-actions';

/**
 * Front / Back, with the number of items on each. Hidden for single-sided products, and (M4) for
 * products the registry prints on one surface while the other sides are empty and not being
 * edited: no needless front/back control, but a design that already uses a side can still reach it.
 */
export function SideSwitcher({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  const active = useStudio(selectActiveSurfaceId);
  const surfaces = useStudio((s) => s.document.surfaces);
  const switchSide = useSwitchSide();
  const singleSurface = useContext(StudioSessionContext)?.workspace?.singleSurface ?? false;
  if (surfaces.length < 2) return null;
  if (singleSurface && active === surfaces[0]?.id && surfaces.slice(1).every(isSurfaceEmpty)) return null;
  return (
    <SegmentedControl
      label="Side"
      size={size}
      value={active}
      onValueChange={switchSide}
      options={surfaces.map((s) => ({ value: s.id, label: s.label, count: s.elements.length }))}
      className={className}
    />
  );
}

/** The side menu next to the switcher: Copy front to back, Clear this side. */
export function SideMenu({ className }: { className?: string }) {
  const { sided, plan, canClear, surfaceLabel, copyFrontToBack, clearSide } = useSideActions();
  const document = useStudio((s) => s.document);
  const [front, back] = document.surfaces;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="Side options" icon={<Ellipsis />} size="sm" className={className} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {sided && front && back && (
          <DropdownMenuItem icon={<CopyPlus />} disabled={!plan} onSelect={copyFrontToBack}>
            Copy {front.label.toLowerCase()} to {back.label.toLowerCase()}
            {!plan && <span className="block text-caption text-fg-subtle">The {front.label.toLowerCase()} is empty</span>}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem icon={<Eraser />} tone="danger" disabled={!canClear} onSelect={clearSide}>
          Clear {sided ? surfaceLabel.toLowerCase() : 'design'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Confirmations for copying onto a side with artwork, and for clearing a side. Rendered once. */
export function SideDialogs() {
  const { sideDialog, openSideDialog } = useStudioUi();
  const studio = useStudioStoreApi();
  const interaction = useInteractionStoreApi();
  const document = useStudio((s) => s.document);
  const surface = useStudio(selectActiveSurface);
  const plan = frontToBackPlan(document);
  const close = () => openSideDialog(null);
  const notify = (text: string) => interaction.getState().actions.notify(text);

  const copy = (mode: 'replace' | 'append') => {
    close();
    if (!plan) return;
    if (studio.getState().actions.copySurface(plan.from.id, plan.to.id, mode)) {
      const from = plan.from.label.toLowerCase();
      const to = plan.to.label.toLowerCase();
      notify(mode === 'replace' ? `Replaced the ${to} with a copy of the ${from}. Press Ctrl Z to undo.` : `Added a copy of the ${from} to the ${to}. Press Ctrl Z to undo.`);
    }
  };

  const sided = hasSides(document);
  const label = surface?.label.toLowerCase() ?? '';
  return (
    <>
      <Dialog open={sideDialog === 'copy' && Boolean(plan)} onOpenChange={(open) => !open && close()}>
        {plan && (
          <DialogContent
            size="sm"
            title={`Copy the ${plan.from.label.toLowerCase()} to the ${plan.to.label.toLowerCase()}?`}
            description={`The ${plan.to.label.toLowerCase()} already has ${describeContents(plan.to)}. Replace it with a copy of the ${plan.from.label.toLowerCase()}, or add the copy on top. The ${plan.from.label.toLowerCase()} doesn’t change, and you can undo this.`}
            footer={
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DialogClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </DialogClose>
                <Button variant="secondary" onClick={() => copy('append')}>
                  Keep both
                </Button>
                <Button onClick={() => copy('replace')}>Replace {plan.to.label.toLowerCase()}</Button>
              </div>
            }
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={sideDialog === 'clear' && Boolean(surface && !isSurfaceEmpty(surface))}
        onOpenChange={(open) => !open && close()}
        tone="danger"
        title={sided ? `Clear the ${label}?` : 'Clear the design?'}
        description={`This removes ${surface ? describeContents(surface) : 'everything'} from the ${sided ? label : 'design'}${sided ? '. The other side doesn’t change' : ''}. You can undo this.`}
        confirmLabel={sided ? `Clear ${label}` : 'Clear design'}
        onConfirm={() => {
          close();
          if (surface && studio.getState().actions.clearSurface(surface.id)) notify(`Cleared the ${sided ? label : 'design'}. Press Ctrl Z to undo.`);
        }}
      />
    </>
  );
}
