import { useEffect } from 'react';
import { modalDialogOpen } from '../keyboard/use-studio-shortcuts';
import type { ViewportStore } from './viewport-store';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * View shortcuts (Blueprint §11.10): Ctrl/⌘ + and − zoom, Ctrl/⌘ 0 shows real size, Shift 1 fits,
 * Ctrl/⌘ ; toggles guides. They replace the browser's own page zoom while the Studio is open.
 */
export function useZoomShortcuts(store: ViewportStore): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || isTyping(event.target) || modalDialogOpen()) return;
      const { actions, showGuides } = store.getState();
      const mod = event.ctrlKey || event.metaKey;
      let handled = true;
      if (mod && (event.key === '=' || event.key === '+')) actions.zoomStep(1);
      else if (mod && (event.key === '-' || event.key === '_')) actions.zoomStep(-1);
      else if (mod && event.key === '0') actions.actualSize();
      else if (mod && (event.key === ';' || event.code === 'Semicolon')) actions.setShowGuides(!showGuides);
      else if (!mod && event.shiftKey && event.code === 'Digit1') actions.fit();
      else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store]);
}
