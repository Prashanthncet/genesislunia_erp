import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { PDF_LOGO_PNG_BASE64 } from './pdf-logo';

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
const NAVY_DEEP = rgb(0.043, 0.122, 0.227); // #0B1F3A, brand-900
const ACCENT = rgb(0.231, 0.51, 0.965); // #3B82F6, accent-500
const INK = rgb(0.09, 0.17, 0.3);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.89, 0.91, 0.94);
const TINT = rgb(0.965, 0.976, 0.988); // card / zebra fill
const WHITE = rgb(1, 1, 1);

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 44;
const BAND = 84; // header band height
const FOOT = 46; // reserved footer height

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

/** Rounded-rectangle SVG path (pdf-lib draws SVG paths y-down from the given top-left). */
function rounded(w: number, h: number, r: number, corners: { top?: boolean; bottom?: boolean } = { top: true, bottom: true }): string {
  const t = corners.top ? r : 0;
  const b = corners.bottom ? r : 0;
  return `M ${t} 0 H ${w - t} Q ${w} 0 ${w} ${t} V ${h - b} Q ${w} ${h} ${w - b} ${h} H ${b} Q 0 ${h} 0 ${h - b} V ${t} Q 0 0 ${t} 0 Z`;
}

/** Amounts, counts and percentages read right-aligned in tables. */
const NUMERIC = /^(Rs\.?\s?)?-?[\d,]+(\.\d+)?\s?%?$/;

export async function buildPdf(spec: PdfSpec): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(spec.title));
  doc.setProducer('Genesis ERP');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  try {
    logo = await doc.embedPng(Buffer.from(PDF_LOGO_PNG_BASE64, 'base64'));
  } catch {
    logo = null; // fall back to a monogram tile
  }

  const W = A4[0];
  const H = A4[1];
  const width = W - MARGIN * 2;
  const bottom = MARGIN + FOOT - 10;

  /** Navy brand band: logo tile, school name + line, reference chip, accent stripe. */
  const header = (p: PDFPage) => {
    p.drawRectangle({ x: 0, y: H - BAND, width: W, height: BAND, color: NAVY });
    p.drawRectangle({ x: W * 0.62, y: H - BAND, width: W * 0.38, height: BAND, color: NAVY_DEEP, opacity: 0.55 });
    p.drawRectangle({ x: 0, y: H - BAND - 3, width: W, height: 3, color: ACCENT });

    const tileW = 66;
    const tileH = 46;
    const tileTop = H - (BAND - tileH) / 2;
    p.drawSvgPath(rounded(tileW, tileH, 8), { x: MARGIN, y: tileTop, color: WHITE });
    if (logo) {
      const lw = tileW - 12;
      const lh = (lw * logo.height) / logo.width;
      p.drawImage(logo, { x: MARGIN + 6, y: tileTop - tileH / 2 - lh / 2, width: lw, height: lh });
    } else {
      const m = safe(spec.school).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      p.drawText(m, { x: MARGIN + tileW / 2 - bold.widthOfTextAtSize(m, 18) / 2, y: tileTop - tileH / 2 - 6, size: 18, font: bold, color: NAVY });
    }

    const tx = MARGIN + tileW + 14;
    p.drawText(safe(spec.school), { x: tx, y: H - BAND / 2 + (spec.schoolLine ? 3 : -6), size: 17, font: bold, color: WHITE });
    if (spec.schoolLine) p.drawText(safe(spec.schoolLine), { x: tx, y: H - BAND / 2 - 13, size: 8.5, font: regular, color: WHITE, opacity: 0.75 });

    if (spec.reference) {
      const t = safe(spec.reference);
      const cw = bold.widthOfTextAtSize(t, 9) + 22;
      const ch = 22;
      const cx = W - MARGIN - cw;
      const cy = H - BAND / 2 + ch / 2;
      p.drawSvgPath(rounded(cw, ch, 11), { x: cx, y: cy, color: WHITE, opacity: 0.14, borderColor: WHITE, borderWidth: 0.6, borderOpacity: 0.35 });
      p.drawText(t, { x: cx + 11, y: cy - 14.5, size: 9, font: bold, color: WHITE });
    }
  };

  let page = doc.addPage(A4);
  header(page);
  let y = H - BAND - 40;
  // Document title with an accent bar.
  page.drawRectangle({ x: MARGIN, y: y - 4, width: 4, height: 22, color: ACCENT });
  page.drawText(safe(spec.title), { x: MARGIN + 13, y, size: 19, font: bold, color: INK });
  y -= 34;

  const newPage = () => {
    page = doc.addPage(A4);
    header(page);
    y = H - BAND - 34;
  };
  const ensure = (h: number) => {
    if (y - h < bottom) newPage();
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
  const fit = (text: string, font: PDFFont, size: number, max: number): string => {
    let t = safe(text);
    if (font.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > max) t = t.slice(0, -1);
    return `${t}...`;
  };

  for (const b of spec.blocks) {
    switch (b.kind) {
      case 'heading': {
        ensure(40);
        y -= 12;
        const t = safe(b.text).toUpperCase();
        page.drawRectangle({ x: MARGIN, y: y - 1.5, width: 3, height: 11, color: ACCENT });
        page.drawText(t, { x: MARGIN + 9, y, size: 9.5, font: bold, color: NAVY });
        const end = MARGIN + 9 + bold.widthOfTextAtSize(t, 9.5) + 10;
        if (end < MARGIN + width) page.drawLine({ start: { x: end, y: y + 3.5 }, end: { x: MARGIN + width, y: y + 3.5 }, thickness: 0.7, color: LINE });
        y -= 18;
        break;
      }
      case 'text':
        for (const line of wrap(b.text, regular, 10.5, width)) {
          ensure(15);
          page.drawText(line, { x: MARGIN, y, size: 10.5, font: regular, color: INK });
          y -= 15;
        }
        y -= 6;
        break;
      case 'fields': {
        // Two-column detail card; split across pages when long.
        const pairs: [string, unknown][][] = [];
        for (let i = 0; i < b.rows.length; i += 2) pairs.push(b.rows.slice(i, i + 2) as [string, unknown][]);
        const rowH = 36;
        const colW = width / 2;
        let k = 0;
        while (k < pairs.length) {
          ensure(rowH + 8);
          const fitRows = Math.max(1, Math.min(pairs.length - k, Math.floor((y - bottom - 8) / rowH)));
          const cardH = fitRows * rowH;
          const top = y + 4;
          page.drawSvgPath(rounded(width, cardH, 8), { x: MARGIN, y: top, color: TINT, borderColor: LINE, borderWidth: 0.8 });
          page.drawLine({ start: { x: MARGIN + colW, y: top - 8 }, end: { x: MARGIN + colW, y: top - cardH + 8 }, thickness: 0.6, color: LINE });
          for (let r = 0; r < fitRows; r++) {
            const rowTop = top - r * rowH;
            if (r > 0) page.drawLine({ start: { x: MARGIN + 10, y: rowTop }, end: { x: MARGIN + width - 10, y: rowTop }, thickness: 0.6, color: LINE });
            pairs[k + r].forEach(([label, value], c) => {
              const x = MARGIN + c * colW + 14;
              const max = colW - 28;
              page.drawText(fit(label, regular, 8.5, max), { x, y: rowTop - 14, size: 8.5, font: regular, color: MUTED });
              page.drawText(fit(value == null || value === '' ? '—' : String(value), bold, 10.5, max), { x, y: rowTop - 28, size: 10.5, font: bold, color: INK });
            });
          }
          y -= cardH + 12;
          k += fitRows;
        }
        break;
      }
      case 'table': {
        const cols = b.head.length;
        const widths = b.widths ?? Array(cols).fill(width / cols);
        const headH = 24;
        const rowH = 20;
        const numericCol = b.head.map((_, i) => b.rows.length > 0 && b.rows.every((r) => r[i] == null || r[i] === '' || NUMERIC.test(safe(r[i]))));
        const drawHead = () => {
          page.drawSvgPath(rounded(width, headH, 6, { top: true, bottom: false }), { x: MARGIN, y: y + 6, color: NAVY });
          let x = MARGIN;
          b.head.forEach((h, i) => {
            const t = fit(String(h).toUpperCase(), bold, 8.5, widths[i] - 14);
            const tx = numericCol[i] ? x + widths[i] - 8 - bold.widthOfTextAtSize(t, 8.5) : x + 8;
            page.drawText(t, { x: tx, y: y - 10, size: 8.5, font: bold, color: WHITE });
            x += widths[i];
          });
          y -= headH;
        };
        ensure(headH + rowH);
        drawHead();
        b.rows.forEach((r, ri) => {
          if (y - rowH < bottom) {
            newPage();
            drawHead(); // repeat the header on continuation pages
          }
          if (ri % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - rowH + 6, width, height: rowH, color: TINT });
          let x = MARGIN;
          r.forEach((c, i) => {
            const t = fit(c == null || c === '' ? '—' : String(c), regular, 9.5, widths[i] - 14);
            const tx = numericCol[i] ? x + widths[i] - 8 - regular.widthOfTextAtSize(t, 9.5) : x + 8;
            page.drawText(t, { x: tx, y: y - 8, size: 9.5, font: regular, color: INK });
            x += widths[i];
          });
          page.drawLine({ start: { x: MARGIN, y: y - rowH + 6 }, end: { x: MARGIN + width, y: y - rowH + 6 }, thickness: 0.5, color: LINE });
          y -= rowH;
        });
        y -= 14;
        break;
      }
      case 'image': {
        ensure(b.height + 24);
        const img = await doc.embedPng(b.png);
        page.drawSvgPath(rounded(b.width + 12, b.height + 12, 8), { x: MARGIN, y: y + 16, color: WHITE, borderColor: LINE, borderWidth: 0.8 });
        page.drawImage(img, { x: MARGIN + 6, y: y - b.height + 10, width: b.width, height: b.height });
        y -= b.height + 20;
        break;
      }
      case 'signature': {
        ensure(84);
        y -= 26;
        const x = W - MARGIN - 210;
        page.drawText(safe(b.name), { x, y, size: 13, font: bold, color: NAVY });
        page.drawLine({ start: { x, y: y - 7 }, end: { x: x + 210, y: y - 7 }, thickness: 0.9, color: INK });
        page.drawText(safe(b.title), { x, y: y - 20, size: 9, font: regular, color: MUTED });
        if (b.signedAt) {
          const t = `Digitally signed ${safe(b.signedAt)}`;
          const cw = regular.widthOfTextAtSize(t, 7.5) + 16;
          page.drawSvgPath(rounded(cw, 15, 7.5), { x, y: y - 27, color: TINT, borderColor: LINE, borderWidth: 0.6 });
          page.drawText(t, { x: x + 8, y: y - 37.5, size: 7.5, font: regular, color: MUTED });
        }
        y -= 52;
        break;
      }
      case 'spacer':
        y -= b.size ?? 12;
        break;
    }
  }

  const footer = safe(spec.footer ?? `Generated by Genesis ERP on ${new Date().toISOString().slice(0, 10)}. This is a computer-generated document.`);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MARGIN, y: MARGIN - 4 }, end: { x: W - MARGIN, y: MARGIN - 4 }, thickness: 0.6, color: LINE });
    const ft = footer.length > 110 ? `${footer.slice(0, 107)}...` : footer;
    p.drawText(ft, { x: MARGIN, y: MARGIN - 18, size: 7.5, font: regular, color: MUTED });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, { x: W - MARGIN - bold.widthOfTextAtSize(pn, 7.5), y: MARGIN - 18, size: 7.5, font: bold, color: NAVY });
  });
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
