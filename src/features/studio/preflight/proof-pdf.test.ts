import { describe, expect, it } from 'vitest';
import { PDF_MAX_PAGE_PT, pdfPageFor, pdfText, proofPdf } from './proof-pdf';
import { proofLayout } from './proof-layout';
import type { SurfacePrint } from '../schema/types';

/** The PDF proof (Phase 4 M6): a hand-written one-page PDF holding the proof picture at real size. */

const CARD: SurfacePrint = { widthPx: 1050, heightPx: 600, dpi: 300, bleedPx: 18, safeZonePx: 24, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
const decode = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('the PDF page', () => {
  it('is the proof at real size: px ÷ (DPI × scale) × 72 pt', () => {
    const layout = proofLayout([CARD, CARD]); // 2367 × 983 px at 300 DPI, unscaled
    expect(pdfPageFor(layout.width, layout.height, 300 * layout.scale)).toEqual({ widthPt: 568.08, heightPt: 235.92, reduced: false });
    // So the trim (1050 px) is 88.9 mm on paper: 1050 / 300 × 72 = 252 pt = 88.9 mm.
    expect((1050 / 300) * 72 * (25.4 / 72)).toBeCloseTo(88.9, 1);
  });

  it('a scaled proof keeps real size (its px per inch is scaled too); past 200 in it is reduced and says so', () => {
    const tent: SurfacePrint = { widthPx: 9000, heightPx: 3358, dpi: 150, bleedPx: 30, safeZonePx: 50, trim: { shape: 'rectangle', cornerRadiusPx: 0 } };
    const layout = proofLayout([tent]);
    const page = pdfPageFor(layout.width, layout.height, 150 * layout.scale);
    expect(page.reduced).toBe(false);
    expect(page.widthPt).toBeCloseTo((layout.width / (150 * layout.scale)) * 72, 0);
    expect(pdfPageFor(30_000, 1000, 100)).toMatchObject({ widthPt: PDF_MAX_PAGE_PT, reduced: true });
  });
});

describe('the PDF file', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const bytes = proofPdf({ jpeg, widthPx: 2367, heightPx: 983 }, { widthPt: 568.08, heightPt: 235.92, reduced: false }, { title: 'Riya’s card — Classic Visiting Cards', subject: 'Proof only' });
  const text = decode(bytes);

  it('is a PDF with one page sized to the proof, the picture as a JPEG image', () => {
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Pages /Kids [3 0 R] /Count 1');
    expect(text).toContain('/MediaBox [0 0 568.08 235.92]');
    expect(text).toContain('/Width 2367 /Height 983 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 10');
    expect(text).toContain('568.08 0 0 235.92 0 0 cm');
    // The JPEG is embedded byte for byte.
    const at = text.indexOf('stream\n', text.indexOf('/DCTDecode')) + 'stream\n'.length;
    expect([...bytes.slice(at, at + jpeg.length)]).toEqual([...jpeg]);
  });

  it('has a valid cross-reference table: every offset points at its object', () => {
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(6);
    offsets.forEach((offset, i) => expect(text.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`));
  });

  it('keeps any script in its title (UTF-16BE)', () => {
    expect(pdfText('Aa’')).toBe('<FEFF00410061 2019>'.replace(' ', ''));
    expect(text).toContain(`/Title ${pdfText('Riya’s card — Classic Visiting Cards')}`);
  });
});
