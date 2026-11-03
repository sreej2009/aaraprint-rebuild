/** WCAG 2.x relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`Expected #rrggbb, got "${hex}"`);
  const channels = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours (1–21). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
