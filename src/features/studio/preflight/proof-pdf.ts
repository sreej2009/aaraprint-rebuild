/**
 * A one-page PDF holding the proof picture (Phase 4 M6), written by hand: no PDF library. The
 * picture is the same proof as the PNG (composeProof), embedded as a JPEG (`/DCTDecode`, which
 * PDF readers decode natively) on a page sized so the artwork prints at its real size — page
 * points = proof px ÷ (print DPI × proof scale) × 72. A page longer than 200 in (14 400 pt, the
 * PDF 1.4 viewer limit) is scaled down to fit, and the result says so.
 *
 * Like the PNG, it is a proof to check, not a print-ready file (no fonts, vectors or colour
 * profile): print files are made from the approved design server-side (Phase 6).
 */

export const PDF_MAX_PAGE_PT = 14_400;

export interface PdfPage {
  widthPt: number;
  heightPt: number;
  /** True when the page had to be scaled down to stay within 14 400 pt. */
  reduced: boolean;
}

/** The page for a proof `widthPx × heightPx` drawn at `pxPerInch` (print DPI × proof scale). */
export function pdfPageFor(widthPx: number, heightPx: number, pxPerInch: number): PdfPage {
  const w = (widthPx / pxPerInch) * 72;
  const h = (heightPx / pxPerInch) * 72;
  const fit = Math.min(1, PDF_MAX_PAGE_PT / Math.max(w, h));
  const round = (v: number) => Math.round(v * 100) / 100;
  return { widthPt: round(w * fit), heightPt: round(h * fit), reduced: fit < 1 };
}

export interface PdfImage {
  /** JPEG bytes (baseline or progressive, RGB). */
  jpeg: Uint8Array;
  widthPx: number;
  heightPx: number;
}

/** A PDF text string that keeps any script: UTF-16BE in hex, with its byte-order mark. */
export function pdfText(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i += 1) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

const encoder = new TextEncoder();

/** The PDF file's bytes: catalog, pages, one page, the image, its drawing and the document info. */
export function proofPdf(image: PdfImage, page: PdfPage, info: { title: string; subject: string }): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: string | (() => void)) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    if (typeof body === 'string') push(body);
    else body();
    push('\nendobj\n');
  };

  // The header's second line marks the file as binary (bytes above 127), as the spec recommends.
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const drawing = `q\n${page.widthPt} 0 0 ${page.heightPt} 0 0 cm\n/Proof Do\nQ`;
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.widthPt} ${page.heightPt}] /Resources << /XObject << /Proof 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${image.widthPx} /Height ${image.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.length} >>\nstream\n`);
    push(image.jpeg);
    push('\nendstream');
  });
  object(5, `<< /Length ${encoder.encode(drawing).length} >>\nstream\n${drawing}\nendstream`);
  object(6, `<< /Title ${pdfText(info.title)} /Subject ${pdfText(info.subject)} /Producer (Aaraprint Studio) >>`);

  const xref = length;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
