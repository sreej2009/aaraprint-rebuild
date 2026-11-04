import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from './ids';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('createId', () => {
  it('creates prefixed v4 UUIDs', () => {
    expect(createId('el')).toMatch(/^el_[0-9a-f-]{36}$/);
    expect(createId()).toMatch(UUID);
    expect(new Set(Array.from({ length: 1000 }, () => createId())).size).toBe(1000);
  });

  it('works without crypto.randomUUID (plain-HTTP pages)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => real.getRandomValues(bytes) });
    const ids = Array.from({ length: 200 }, () => createId());
    for (const id of ids) expect(id).toMatch(UUID);
    expect(new Set(ids).size).toBe(200);
  });
});
