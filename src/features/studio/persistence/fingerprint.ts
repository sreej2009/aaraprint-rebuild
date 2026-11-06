import type { DesignDocument } from '../schema/types';

/**
 * A content fingerprint of a design: equal designs have equal fingerprints, whatever the
 * selection, zoom, undo history or key order. `meta` (timestamps, revision) is left out — it
 * changes when a design is saved, not when it's edited. FNV-1a over canonical JSON, 2 × 32 bits.
 */
export function designFingerprint(document: DesignDocument): string {
  const { meta: _meta, ...content } = document;
  const text = canonicalJson(content);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193 + 2);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
}

/**
 * JSON with object keys in a fixed order: a design read back from storage (rebuilt by the
 * validator) has its keys in a different order than the one in the editor, but the same content.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}

/** A plain-JSON copy for storage: no functions, no prototypes, nothing shared with the store. */
export function toStoredDocument(document: DesignDocument, meta: DesignDocument['meta']): unknown {
  return JSON.parse(JSON.stringify({ ...document, meta }));
}
