import { describe, expect, it } from 'vitest';
import { commandForKey, type KeyLike } from './shortcuts';

const press = (key: string, mods: Partial<KeyLike> = {}) => commandForKey({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe('editing shortcuts', () => {
  it('nudges 0.5 mm with arrows and 5 mm with Shift', () => {
    expect(press('ArrowLeft')).toEqual({ scope: 'selection', command: { kind: 'nudge', dxMm: -0.5, dyMm: 0 } });
    expect(press('ArrowDown', { shiftKey: true })).toEqual({ scope: 'selection', command: { kind: 'nudge', dxMm: 0, dyMm: 5 } });
  });

  it('deletes, deselects, duplicates and reorders', () => {
    expect(press('Delete')?.command).toEqual({ kind: 'delete' });
    expect(press('Backspace')?.command).toEqual({ kind: 'delete' });
    expect(press('Escape')?.command).toEqual({ kind: 'deselect' });
    expect(press('d', { ctrlKey: true })).toEqual({ scope: 'global', command: { kind: 'duplicate', offsetMm: 3 } });
    expect(press(']', { code: 'BracketRight', ctrlKey: true })?.command).toEqual({ kind: 'arrange', action: 'forward' });
    expect(press('{', { code: 'BracketLeft', metaKey: true, shiftKey: true })?.command).toEqual({ kind: 'arrange', action: 'back' });
  });

  it('undoes and redoes with Ctrl or ⌘', () => {
    expect(press('z', { ctrlKey: true })?.command).toEqual({ kind: 'undo' });
    expect(press('Z', { metaKey: true, shiftKey: true })?.command).toEqual({ kind: 'redo' });
    expect(press('y', { ctrlKey: true })?.command).toEqual({ kind: 'redo' });
  });

  it('leaves other keys and Alt combinations alone', () => {
    expect(press('a')).toBeNull();
    expect(press('ArrowUp', { altKey: true })).toBeNull(); // layer reordering, M7
    expect(press('Delete', { shiftKey: true })).toBeNull();
    expect(press('=', { ctrlKey: true })).toBeNull(); // zoom: use-zoom-shortcuts
  });
});
