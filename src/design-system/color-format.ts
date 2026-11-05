/** "#ABC", "abc", "#aabbcc" → "#aabbcc"; anything else → null. Colours are stored lower-case. */
export function normaliseHex(text: string): string | null {
  const raw = text.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${[...raw].map((c) => c + c).join('')}`;
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}
