import type { TextMeasurer } from '../canvas/text-layout';

/**
 * A stand-in for the Konva text measurer in unit tests (jsdom has no canvas): wraps words the way
 * Konva does — at spaces, never splitting a word that fits a line on its own — with a fixed width
 * per character that grows with letter spacing, bold weights and the serif font. The real
 * measurement is covered by the browser tests (e2e/studio-text.spec.ts).
 */
export const fakeMeasure: TextMeasurer = (e) => {
  const charWidth = e.fontSize * (0.5 + e.letterSpacing) * (e.fontWeight >= 700 ? 1.1 : 1) * (e.fontFamily === 'Fraunces' ? 1.2 : 1) * (e.italic ? 0.95 : 1);
  let lines = 0;
  for (const paragraph of e.text.split('\n')) {
    lines += 1;
    let used = 0;
    for (const word of paragraph.split(' ')) {
      const width = word.length * charWidth;
      const next = used === 0 ? width : used + charWidth + width;
      if (used > 0 && next > e.width) {
        lines += 1;
        used = width;
      } else used = next;
    }
  }
  return lines * e.fontSize * e.lineHeight;
};
