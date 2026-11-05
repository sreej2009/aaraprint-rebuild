import { useCallback } from 'react';
import { useInteractionStoreApi } from '../canvas/interaction-store';
import { selectActiveSurface, useStudio, useStudioStoreApi } from '../store';
import { frontToBackPlan, hasSides, isSurfaceEmpty } from './side-rules';
import { useStudioUi } from './ui-context';

/**
 * Switch to another side. Text being edited in place is finished first (its editor commits when
 * it loses focus), so nothing is left half-typed on the side being left. Selection, hover and
 * editing state then clear (the store's setActiveSurface); each side keeps its own view.
 */
export function useSwitchSide(): (surfaceId: string) => void {
  const studio = useStudioStoreApi();
  return useCallback(
    (surfaceId) => {
      const active = document.activeElement;
      if (studio.getState().editor.editingTextId && active instanceof HTMLElement && active.closest('[data-testid="text-edit-overlay"]')) active.blur();
      studio.getState().actions.setActiveSurface(surfaceId);
    },
    [studio],
  );
}

/** Copy front to back and clear the side: what the side menu and the empty-side card offer. */
export function useSideActions() {
  const studio = useStudioStoreApi();
  const interaction = useInteractionStoreApi();
  const { openSideDialog } = useStudioUi();
  const document = useStudio((s) => s.document);
  const surface = useStudio(selectActiveSurface);
  const plan = frontToBackPlan(document);
  return {
    sided: hasSides(document),
    plan,
    canClear: Boolean(surface && !isSurfaceEmpty(surface)),
    surfaceLabel: surface?.label ?? '',
    /** An empty back is filled straight away; a back with artwork asks first. */
    copyFrontToBack() {
      if (!plan) return;
      if (plan.needsChoice) {
        openSideDialog('copy');
        return;
      }
      if (studio.getState().actions.copySurface(plan.from.id, plan.to.id, 'replace')) interaction.getState().actions.notify(`Copied the ${plan.from.label.toLowerCase()} to the ${plan.to.label.toLowerCase()}. Now on the ${plan.to.label.toLowerCase()}.`);
    },
    clearSide() {
      if (surface && !isSurfaceEmpty(surface)) openSideDialog('clear');
    },
  };
}

