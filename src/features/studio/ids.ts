/**
 * Random ids for designs, elements and assets.
 * `crypto.randomUUID()` only exists in secure contexts (HTTPS or localhost); the staging server
 * is plain HTTP, so fall back to `crypto.getRandomValues()`, which works everywhere.
 */
export function createId(prefix = ''): string {
  const c = globalThis.crypto;
  let id: string;
  if (typeof c?.randomUUID === 'function') {
    id = c.randomUUID();
  } else {
    const bytes = c.getRandomValues(new Uint8Array(16));
    // RFC 4122 version 4 layout.
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return prefix ? `${prefix}_${id}` : id;
}

export type IdFactory = (prefix?: string) => string;
