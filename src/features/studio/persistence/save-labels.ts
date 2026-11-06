import type { SaveState } from './save-controller';

/** "Saved just now", "Saved 2 min ago", "Saved 4:05 pm" — local saving only, never "synced". */
export function saveLabel(state: Pick<SaveState, 'status' | 'lastSavedAt'>, now: number): string {
  switch (state.status) {
    case 'sample':
      return 'Sample · not saved';
    case 'idle':
      return 'Not saved yet';
    case 'dirty':
      return 'Unsaved changes';
    case 'saving':
      return 'Saving…';
    case 'error':
      return 'Save failed';
    case 'conflict':
      return 'Saved in another tab';
    case 'saved': {
      if (state.lastSavedAt === null) return 'Saved';
      const minutes = Math.floor((now - state.lastSavedAt) / 60_000);
      if (minutes < 1) return 'Saved just now';
      if (minutes < 60) return `Saved ${minutes} min ago`;
      return `Saved ${formatTime(state.lastSavedAt)}`;
    }
  }
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** "Today, 4:05 pm" / "3 Nov, 4:05 pm". */
export function formatVersionTime(ms: number, now: number): string {
  const date = new Date(ms);
  const sameDay = date.toDateString() === new Date(now).toDateString();
  return sameDay ? `Today, ${formatTime(ms)}` : date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
