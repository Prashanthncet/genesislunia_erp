import { BadRequestException, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { buildPdf } from '../common/pdf';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type FilterQuery = { class_id?: string; section?: string; from?: string; to?: string };

export type ReportFilters = {
  /** null = every class in the school */
  classIds: string[] | null;
  from?: string;
  to?: string;
  /** normalised copy used for cache keys / audit / file names */
  key: { class_id?: string; section?: string; from?: string; to?: string };
};

/**
 * Validates the shared filter bar (class_id, section, from, to) and resolves it to a set
 * of class ids in the caller's school. Unknown class → 404 (never another school's class);
 * malformed or inverted dates → 400.
 */
export async function parseFilters(prisma: PrismaService, branchId: string, q: FilterQuery): Promise<ReportFilters> {
  const from = q.from?.trim() || undefined;
  const to = q.to?.trim() || undefined;
  for (const [k, v] of [['from', from], ['to', to]] as const) {
    if (v && (!ISO_DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) {
      throw new BadRequestException(`${k} must be a valid date (YYYY-MM-DD)`);
    }
  }
  if (from && to && from > to) throw new BadRequestException('from must be on or before to');
  const classId = q.class_id?.trim() || undefined;
  const section = q.section?.trim() || undefined;
  if (section && section.length > 40) throw new BadRequestException('section is too long');

  let classIds: string[] | null = null;
  if (classId || section) {
    if (classId) {
      const cls = await prisma.class.findFirst({ where: { id: classId, branchId }, select: { id: true, section: true } });
      if (!cls) throw new NotFoundException('class not found');
      classIds = section && (cls.section ?? '').toLowerCase() !== section.toLowerCase() ? [] : [cls.id];
    } else {
      const all = await prisma.class.findMany({ where: { branchId }, select: { id: true, section: true } });
      classIds = all.filter((c) => (c.section ?? '').toLowerCase() === (section as string).toLowerCase()).map((c) => c.id);
    }
  }
  return { classIds, from, to, key: { class_id: classId, section, from, to } };
}

export const dateRange = (f: { from?: string; to?: string }) =>
  f.from || f.to ? { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } : undefined;

export const pct1 = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/* ── Exports ─────────────────────────────────────────────────── */

export type Cell = string | number | null | undefined;
export type Table = { title: string; head: string[]; rows: Cell[][]; note?: string };
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

/** CSV cell: quoted when needed; formula-looking values are prefixed with ' (CSV/DDE injection). */
export const csvEscape = (v: Cell): string => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/** Max rows rendered into a PDF (a 5,000-row PDF is ~200 pages); CSV/XLSX carry everything. */
const PDF_ROW_CAP = 1500;

export async function renderTable(t: Table, format: ExportFormat, school: string, filterLine: string): Promise<Buffer> {
  if (format === 'csv') {
    const lines = [t.head, ...t.rows].map((r) => r.map(csvEscape).join(','));
    // BOM so Excel opens UTF-8 names (₹, accents) correctly.
    return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
  }
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = school;
    const ws = wb.addWorksheet(t.title.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
    ws.addRow(t.head).font = { bold: true };
    for (const r of t.rows) {
      // Strings that look like formulas stay as text in XLSX (no evaluation), so no prefix needed.
      ws.addRow(r.map((c) => (c === undefined ? null : c)));
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    t.head.forEach((h, i) => {
      const longest = Math.max(h.length, ...t.rows.slice(0, 200).map((r) => String(r[i] ?? '').length));
      ws.getColumn(i + 1).width = Math.min(48, Math.max(10, longest + 2));
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const rows = t.rows.slice(0, PDF_ROW_CAP);
  const width = 499;
  return buildPdf({
    school,
    title: t.title,
    reference: new Date().toISOString().slice(0, 10),
    blocks: [
      { kind: 'text', text: filterLine },
      ...(t.note ? [{ kind: 'text' as const, text: t.note }] : []),
      ...(t.rows.length > PDF_ROW_CAP
        ? [{ kind: 'text' as const, text: `Showing the first ${PDF_ROW_CAP} of ${t.rows.length} rows - export CSV or XLSX for the full data.` }]
        : []),
      rows.length
        ? { kind: 'table' as const, head: t.head, rows, widths: t.head.map(() => width / t.head.length) }
        : { kind: 'text' as const, text: 'No rows match these filters.' },
    ],
  });
}
