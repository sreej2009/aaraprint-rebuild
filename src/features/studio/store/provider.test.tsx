import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { sampleDesign } from '../testing/fixtures';
import { useStudio, useStudioActions, useStudioStoreApi } from './context';
import { createStudioStore } from './create-store';
import { StudioProvider } from './provider';
import { selectCanUndo, selectDocument, selectSelectedIds } from './selectors';

function wrapperFor(store: ReturnType<typeof createStudioStore>) {
  return ({ children }: { children: ReactNode }) => <StudioProvider store={store}>{children}</StudioProvider>;
}

describe('StudioProvider hooks', () => {
  it('expose state slices and actions from the provided store', () => {
    const store = createStudioStore({ document: sampleDesign() });
    const { result } = renderHook(() => ({ canUndo: useStudio(selectCanUndo), actions: useStudioActions(), api: useStudioStoreApi() }), { wrapper: wrapperFor(store) });
    expect(result.current.api).toBe(store);
    expect(result.current.canUndo).toBe(false);
    act(() => {
      result.current.actions.updateElement('el_name', { x: 70 });
    });
    expect(result.current.canUndo).toBe(true);
  });

  it('re-render only when the selected slice changes', () => {
    const store = createStudioStore({ document: sampleDesign() });
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders += 1;
        return useStudio(selectDocument);
      },
      { wrapper: wrapperFor(store) },
    );
    const first = renders;
    act(() => store.getState().actions.select(['el_name']));
    act(() => store.getState().actions.setHovered('el_logo'));
    expect(renders).toBe(first); // selection and hover don't touch the document
    act(() => {
      store.getState().actions.updateElement('el_name', { x: 70 });
    });
    expect(renders).toBe(first + 1);
    expect(result.current.surfaces[0]?.elements[1]?.x).toBe(70);
  });

  it('keep action functions stable across updates', () => {
    const store = createStudioStore({ document: sampleDesign() });
    const { result, rerender } = renderHook(() => useStudioActions(), { wrapper: wrapperFor(store) });
    const first = result.current;
    act(() => store.getState().actions.select(['el_name']));
    rerender();
    expect(result.current).toBe(first);
    expect(store.getState().editor.selectedIds).toEqual(['el_name']);
    expect(selectSelectedIds(store.getState())).toEqual(['el_name']);
  });

  it('fail clearly outside a provider', () => {
    expect(() => renderHook(() => useStudio(selectCanUndo))).toThrow(/inside <StudioProvider>/);
  });
});
