import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('lets later classes override earlier conflicting ones', () => {
    expect(cn('px-4 bg-accent', 'px-6')).toBe('bg-accent px-6');
  });

  it('treats custom type-scale names as font sizes, not colours', () => {
    // Without the custom config tailwind-merge would drop `text-body` as a "colour".
    expect(cn('text-body text-fg')).toBe('text-body text-fg');
    expect(cn('text-body', 'text-h2')).toBe('text-h2');
    expect(cn('text-fg', 'text-fg-muted')).toBe('text-fg-muted');
  });

  it('knows the custom shadow scale', () => {
    expect(cn('shadow-1', 'shadow-3')).toBe('shadow-3');
  });

  it('ignores falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });
});
