import { useEffect, useState } from 'react';
import { useStudioStoreApi } from '../store';
import { announcementFor } from './announcements';
import { useInteractionStoreApi } from './interaction-store';

/** Appended to repeat an identical message, which screen readers would otherwise skip. */
const REPEAT_MARK = String.fromCharCode(0xa0);

/**
 * Polite live region for the canvas: what's selected, where it is, and what changed. Messages
 * settle for a moment (a drag or a burst of arrow keys is announced once, when it stops).
 */
export function CanvasAnnouncer() {
  const studio = useStudioStoreApi();
  const interaction = useInteractionStoreApi();
  const [message, setMessage] = useState('');

  useEffect(() => {
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const say = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!pending || interaction.getState().gesture) return; // wait for the gesture to end
        const text = pending;
        pending = null;
        setMessage((current) => (current === text ? text + REPEAT_MARK : text));
      }, delay);
    };
    const offStudio = studio.subscribe((next, prev) => {
      const text = announcementFor(prev, next);
      if (!text) return;
      pending = text;
      say(350);
    });
    const offInteraction = interaction.subscribe((next, prev) => {
      if (next.notice && next.notice !== prev.notice) {
        pending = next.notice.text;
        say(50);
      } else if (prev.gesture && !next.gesture && pending) {
        say(100);
      }
    });
    return () => {
      clearTimeout(timer);
      offStudio();
      offInteraction();
    };
  }, [studio, interaction]);

  return (
    <p aria-live="polite" className="sr-only" data-testid="canvas-announcer">
      {message}
    </p>
  );
}
