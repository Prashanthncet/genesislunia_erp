import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

/**
 * One small document builder shared by every printable: admission letter, fee
 * receipt, report card, payslip, gate pass. Server-side so the output is identical
 * on every device and can be archived, not a browser print view.
 *
 *   const pdf = await buildPdf({ school: 'Sainik School', title: 'Fee Receipt', blocks: [...] });
 *   res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="r.pdf"' }).send(pdf);
 */

export type PdfBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'fields'; rows: [string, string | number | null | undefined][] }
  | { kind: 'table'; head: string[]; rows: (string | number | null | undefined)[][]; widths?: number[] }
  | { kind: 'image'; png: Uint8Array; width: number; height: number }
  | { kind: 'signature'; name: string; title: string; signedAt?: string }
  | { kind: 'spacer'; size?: number };

export type PdfSpec = {
  school: string;
  schoolLine?: string; // address / affiliation line under the school name
  title: string;
  reference?: string; // e.g. receipt no — printed top-right
  blocks: PdfBlock[];
  footer?: string;
};

const NAVY = rgb(0.078, 0.169, 0.29); // #142B4A, the app's brand-700
const INK = rgb(0.09, 0.17, 0.3);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.89, 0.91, 0.94);

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;

/** pdf-lib's standard fonts are WinAnsi only; replace what they can't encode. */
function safe(v: unknown): string {
  return String(v ?? '—')
    .replace(/₹/g, 'Rs.')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

export async function buildPdf(spec: PdfSpec): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(spec.title));
  doc.setProducer('Genesis ERP');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const width = A4[0] - MARGIN * 2;

  const header = (p: PDFPage) => {
    p.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: NAVY });
    p.drawText(safe(spec.school), { x: MARGIN, y: A4[1] - MARGIN, size: 18, font: bold, color: NAVY });
    if (spec.schoolLine) p.drawText(safe(spec.schoolLine), { x: MARGIN, y: A4[1] - MARGIN - 16, size: 9, font: regular, color: MUTED });
    if (spec.reference) {
      const t = safe(spec.reference);
      p.drawText(t, { x: A4[0] - MARGIN - regular.widthOfTextAtSize(t, 9), y: A4[1] - MARGIN, size: 9, font: regular, color: MUTED });
    }
    p.drawLine({ start: { x: MARGIN, y: A4[1] - MARGIN - 26 }, end: { x: A4[0] - MARGIN, y: A4[1] - MARGIN - 26 }, thickness: 1, color: LINE });
  };
  header(page);
  y -= 54;
  page.drawText(safe(spec.title), { x: MARGIN, y, size: 15, font: bold, color: INK });
  y -= 24;

  const ensure = (h: number) => {
    if (y - h < MARGIN + 30) {
      page = doc.addPage(A4);
      header(page);
      y = A4[1] - MARGIN - 46;
    }
  };

  const wrap = (text: string, font: PDFFont, size: number, max: number): string[] => {
    const words = safe(text).split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > max && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };

  for (const b of spec.blocks) {
    switch (b.kind) {
      case 'heading':
        ensure(26);
        y -= 6;
        page.drawText(safe(b.text).toUpperCase(), { x: MARGIN, y, size: 9, font: bold, color: MUTED });
        y -= 14;
        break;
      case 'text':
        for (const line of wrap(b.text, regular, 10.5, width)) {
          ensure(15);
          page.drawText(line, { x: MARGIN, y, size: 10.5, font: regular, color: INK });
          y -= 15;
        }
        y -= 4;
        break;
      case 'fields': {
        const colW = width / 2;
        b.rows.forEach(([label, value], i) => {
          if (i % 2 === 0) ensure(30);
          const x = MARGIN + (i % 2) * colW;
          page.drawText(safe(label), { x, y, size: 8.5, font: regular, color: MUTED });
          page.drawText(safe(value).slice(0, 60), { x, y: y - 12, size: 10.5, font: bold, color: INK });
          if (i % 2 === 1 || i === b.rows.length - 1) y -= 30;
        });
        break;
      }
      case 'table': {
        const cols = b.head.length;
        const widths = b.widths ?? Array(cols).fill(width / cols);
        const rowH = 18;
        const drawRow = (cells: unknown[], font: PDFFont, shade: boolean) => {
          ensure(rowH);
          if (shade) page.drawRectangle({ x: MARGIN, y: y - 5, width, height: rowH, color: rgb(0.96, 0.97, 0.98) });
          let x = MARGIN + 4;
          cells.forEach((c, i) => {
            let t = safe(c);
            while (t.length > 1 && font.widthOfTextAtSize(t, 9.5) > widths[i] - 8) t = t.slice(0, -1);
            page.drawText(t, { x, y, size: 9.5, font, color: INK });
            x += widths[i];
          });
          y -= rowH;
        };
        drawRow(b.head, bold, true);
        b.rows.forEach((r) => drawRow(r, regular, false));
        page.drawLine({ start: { x: MARGIN, y: y + 12 }, end: { x: MARGIN + width, y: y + 12 }, thickness: 0.5, color: LINE });
        y -= 6;
        break;
      }
      case 'image': {
        ensure(b.height + 8);
        const img = await doc.embedPng(b.png);
        page.drawImage(img, { x: MARGIN, y: y - b.height + 10, width: b.width, height: b.height });
        y -= b.height + 8;
        break;
      }
      case 'signature':
        ensure(60);
        y -= 20;
        page.drawText(safe(b.name), { x: A4[0] - MARGIN - 200, y, size: 13, font: bold, color: NAVY });
        page.drawLine({ start: { x: A4[0] - MARGIN - 200, y: y - 6 }, end: { x: A4[0] - MARGIN, y: y - 6 }, thickness: 0.8, color: INK });
        page.drawText(safe(b.title), { x: A4[0] - MARGIN - 200, y: y - 18, size: 9, font: regular, color: MUTED });
        if (b.signedAt) page.drawText(`Digitally signed ${safe(b.signedAt)}`, { x: A4[0] - MARGIN - 200, y: y - 30, size: 8, font: regular, color: MUTED });
        y -= 44;
        break;
      case 'spacer':
        y -= b.size ?? 12;
        break;
    }
  }

  const footer = safe(spec.footer ?? `Generated by Genesis ERP on ${new Date().toISOString().slice(0, 10)}. This is a computer-generated document.`);
  for (const p of doc.getPages()) {
    p.drawText(footer, { x: MARGIN, y: MARGIN - 20, size: 8, font: regular, color: MUTED });
  }
  return Buffer.from(await doc.save());
}

/** Express response helper: `return sendPdf(res, buf, 'receipt-RCPT-2026-0001.pdf')`. */
export function sendPdf(res: { set: (h: Record<string, string>) => { send: (b: Buffer) => unknown } }, buf: Buffer, filename: string) {
  return res
    .set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Content-Length': String(buf.length),
    })
    .send(buf);
}
