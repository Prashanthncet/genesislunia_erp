import { Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { buildPdf, PdfBlock } from '../common/pdf';
import { AttendanceTally, addToTally, emptyTally } from '../attendance/attendance-math';
import { Band, GradeSummary, MarkInput, passThreshold, rankMap, summarise } from './grading';

export type CardFilters = { term?: string; academicYear?: string; from?: string; to?: string };

export type ReportCard = GradeSummary & {
  student: { id: string; full_name: string; admission_no: string; roll_no: string | null; class_id: string | null; class_name: string | null };
  school: string;
  term: string | null;
  academic_year: string | null;
  rank: number | null;
  class_size: number;
  attendance: { present: number; total: number; od: number; pct: number | null; from: string | null; to: string | null };
  bands: { grade: string; min_percent: number; grade_point: number | null; remark: string | null }[];
  pass_mark: number;
  passed: boolean | null;
};

/**
 * The academic content of a card — what a parent was issued. Attendance is left out on
 * purpose: it keeps moving every school day, so including it would flag every published
 * card as "changed" the morning after publication.
 */
export function cardFingerprint(card: Pick<ReportCard, 'subjects' | 'overall_pct' | 'overall_grade' | 'grade_point' | 'rank' | 'class_size' | 'passed' | 'remark'>): string {
  return JSON.stringify({
    subjects: [...card.subjects]
      .sort((a, b) => a.subject_id.localeCompare(b.subject_id))
      .map((s) => ({
        id: s.subject_id, pct: s.weighted_pct, grade: s.grade, gp: s.grade_point,
        exams: [...s.exams].sort((a, b) => a.exam_id.localeCompare(b.exam_id)).map((e) => [e.exam_id, e.score, e.max_score, e.weight]),
      })),
    overall: card.overall_pct, grade: card.overall_grade, gp: card.grade_point, rank: card.rank,
    size: card.class_size, passed: card.passed, remark: card.remark,
  });
}

/** "2026-27" / "2026-2027" → Indian academic year window (1 Apr – 31 Mar). */
export function academicYearWindow(y?: string): { from: string; to: string } | null {
  const m = /^(\d{4})(?:-(\d{2}|\d{4}))?$/.exec((y ?? '').trim());
  if (!m) return null;
  const start = Number(m[1]);
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

@Injectable()
export class ReportCardService {
  constructor(private prisma: PrismaService) {}

  async bands(branchId: string): Promise<Band[]> {
    const rows = await this.prisma.gradeBand.findMany({ where: { branchId }, orderBy: { minPercent: 'desc' } });
    return rows.map((b) => ({ grade: b.grade, minPercent: b.minPercent, gradePoint: b.gradePoint, remark: b.remark }));
  }

  private examWhere(branchId: string, f: CardFilters) {
    return {
      branchId,
      ...(f.term ? { term: f.term } : {}),
      ...(f.academicYear ? { academicYear: f.academicYear } : {}),
      ...(f.from || f.to ? { date: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    };
  }

  /** Grade summaries for a set of students (one marks query). */
  async summaries(branchId: string, studentIds: string[], f: CardFilters, bands?: Band[]) {
    const b = bands ?? (await this.bands(branchId));
    const marks = studentIds.length
      ? await this.prisma.examMark.findMany({
          where: { branchId, studentId: { in: studentIds }, exam: this.examWhere(branchId, f) },
          include: {
            exam: { select: { id: true, name: true, weight: true, date: true } },
            subject: { select: { id: true, name: true, code: true } },
          },
          orderBy: { exam: { date: 'asc' } },
        })
      : [];
    const byStudent = new Map<string, MarkInput[]>();
    for (const m of marks) {
      const list = byStudent.get(m.studentId) ?? [];
      list.push({
        subjectId: m.subjectId, subjectName: m.subject.name, subjectCode: m.subject.code,
        examId: m.examId, examName: m.exam.name, score: m.score, maxScore: m.maxScore, weight: m.exam.weight,
      });
      byStudent.set(m.studentId, list);
    }
    const out = new Map<string, GradeSummary>();
    for (const id of studentIds) out.set(id, summarise(byStudent.get(id) ?? [], b));
    return { summaries: out, bands: b };
  }

  private async attendance(branchId: string, studentIds: string[], f: CardFilters) {
    const win = f.from || f.to ? { from: f.from ?? null, to: f.to ?? null } : academicYearWindow(f.academicYear) ?? { from: null, to: null };
    const rows = studentIds.length
      ? await this.prisma.attendanceRecord.groupBy({
          // date in the key so Sundays can be excluded (THE rule: attendance/attendance-math.ts)
          by: ['studentId', 'date', 'status'],
          where: {
            branchId, studentId: { in: studentIds },
            ...(win.from || win.to ? { date: { ...(win.from ? { gte: win.from } : {}), ...(win.to ? { lte: win.to } : {}) } } : {}),
          },
          _count: { _all: true },
        })
      : [];
    const tallies = new Map<string, AttendanceTally>();
    for (const r of rows) {
      const t = tallies.get(r.studentId) ?? emptyTally();
      addToTally(t, r.status, r.date, r._count._all);
      tallies.set(r.studentId, t);
    }
    // present = attended (Present + Late + OD); total = counted days (… + Absent; Leave excluded).
    const out = new Map<string, { present: number; total: number; od: number; leave: number; pct: number | null }>();
    for (const [id, t] of tallies) out.set(id, { present: t.attended, total: t.counted, od: t.od, leave: t.leave, pct: t.percentage });
    return { win, byStudent: out };
  }

  /** Report cards for every active student of a class, ranked within the class. */
  async classCards(branchId: string, classId: string, f: CardFilters): Promise<ReportCard[]> {
    const cls = await this.prisma.class.findFirst({ where: { id: classId, branchId } });
    if (!cls) throw new NotFoundException('class not found');
    const students = await this.prisma.student.findMany({
      where: { branchId, classId, status: 'Active' },
      orderBy: [{ rollNo: 'asc' }, { fullName: 'asc' }],
    });
    return this.buildCards(branchId, students, `${cls.name}${cls.section ? ` ${cls.section}` : ''}`, f);
  }

  /** One student's card; rank is computed against their current class. */
  async studentCard(branchId: string, studentId: string, f: CardFilters): Promise<ReportCard> {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, branchId }, include: { class: true } });
    if (!student) throw new NotFoundException('Student not found');
    const peers = student.classId
      ? await this.prisma.student.findMany({ where: { branchId, classId: student.classId, status: 'Active' } })
      : [];
    const cohort = peers.some((p) => p.id === student.id) ? peers : [...peers, student];
    const className = student.class ? `${student.class.name}${student.class.section ? ` ${student.class.section}` : ''}` : null;
    const cards = await this.buildCards(branchId, cohort, className, f);
    return cards.find((c) => c.student.id === studentId) as ReportCard;
  }

  private async buildCards(
    branchId: string,
    students: { id: string; fullName: string; admissionNo: string; rollNo: string | null; classId: string | null }[],
    className: string | null,
    f: CardFilters,
  ): Promise<ReportCard[]> {
    const ids = students.map((s) => s.id);
    const [{ summaries, bands }, att, branch] = await Promise.all([
      this.summaries(branchId, ids, f),
      this.attendance(branchId, ids, f),
      this.prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } }),
    ]);
    const ranks = rankMap(ids.map((id) => ({ id, pct: summaries.get(id)?.overall_pct ?? null })));
    const classSize = students.length;
    const pass = passThreshold(bands);
    return students.map((s) => {
      const sum = summaries.get(s.id) as GradeSummary;
      const a = att.byStudent.get(s.id) ?? { present: 0, total: 0, od: 0, leave: 0, pct: null };
      return {
        ...sum,
        student: { id: s.id, full_name: s.fullName, admission_no: s.admissionNo, roll_no: s.rollNo, class_id: s.classId, class_name: className },
        school: branch?.name ?? 'School',
        term: f.term ?? null,
        academic_year: f.academicYear ?? null,
        rank: ranks.get(s.id) ?? null,
        class_size: classSize,
        attendance: {
          present: a.present, total: a.total, od: a.od,
          pct: a.pct,
          from: att.win.from, to: att.win.to,
        },
        bands: bands.map((b) => ({ grade: b.grade, min_percent: b.minPercent, grade_point: b.gradePoint, remark: b.remark ?? null })),
        pass_mark: pass,
        passed: sum.overall_pct === null ? null : sum.overall_pct >= pass,
      };
    });
  }

  /** Printable report card (A4) via the shared PDF builder. */
  async cardPdf(card: ReportCard, publishedAt?: Date | string | null): Promise<Buffer> {
    const period = [card.term, card.academic_year].filter(Boolean).join(' · ') || 'All exams';
    const issued = publishedAt ? new Date(publishedAt).toISOString().slice(0, 10) : null;
    const blocks: PdfBlock[] = [
      { kind: 'fields', rows: [
        ['Student', card.student.full_name],
        ['Admission no', card.student.admission_no],
        ['Class', card.student.class_name ?? '-'],
        ['Roll no', card.student.roll_no ?? '-'],
        ['Period', period],
        ['Issued', issued ? `Published ${issued}` : 'Provisional (live marks, not published)'],
        ['Attendance', card.attendance.pct === null ? 'No records' : `${card.attendance.pct}% (${card.attendance.present}/${card.attendance.total} days${card.attendance.od ? `, incl. ${card.attendance.od} OD` : ''})`],
      ] },
      { kind: 'heading', text: 'Subject results (weighted across exams)' },
      card.subjects.length
        ? { kind: 'table', head: ['Subject', 'Exams', 'Weighted %', 'Grade', 'GP'], widths: [130, 209, 60, 50, 50], rows: card.subjects.map((s) => [
            s.subject_name,
            s.exams.map((e) => `${e.exam_name.slice(0, 18)}: ${e.score}/${e.max_score}`).join('; '),
            `${s.weighted_pct}%`, s.grade ?? '-', s.grade_point ?? '-',
          ]) }
        : { kind: 'text', text: 'No marks recorded for this period.' },
      { kind: 'heading', text: 'Result' },
      { kind: 'fields', rows: [
        ['Overall', card.overall_pct === null ? '-' : `${card.overall_pct}%`],
        ['Overall grade', card.overall_grade ?? '-'],
        ['Grade point (CGPA)', card.grade_point ?? '-'],
        ['Rank in class', card.rank ? `${card.rank} of ${card.class_size}` : '-'],
        ['Remark', card.remark ?? '-'],
        ['Status', card.passed === null ? '-' : card.passed ? 'Pass' : `Below pass mark (${card.pass_mark}%)`],
      ] },
      { kind: 'heading', text: 'Grading scale' },
      { kind: 'text', text: card.bands.map((b) => `${b.grade} >= ${b.min_percent}%${b.grade_point !== null ? ` (GP ${b.grade_point})` : ''}`).join('   ') },
      { kind: 'spacer', size: 24 },
      { kind: 'text', text: 'Class Teacher ____________________          Principal ____________________' },
    ];
    return buildPdf({ school: card.school, title: 'Report Card', reference: card.student.admission_no, blocks });
  }

  /** Class summary page followed by every student's card, merged into one PDF. */
  async classPdf(cards: ReportCard[], className: string, f: CardFilters): Promise<Buffer> {
    const school = cards[0]?.school ?? 'School';
    const summary = await buildPdf({
      school,
      title: `Report cards - ${className}`,
      reference: [f.term, f.academicYear].filter(Boolean).join(' ') || undefined,
      blocks: [
        { kind: 'fields', rows: [['Class', className], ['Students', cards.length], ['With marks', cards.filter((c) => c.overall_pct !== null).length], ['Period', [f.term, f.academicYear].filter(Boolean).join(' · ') || 'All exams']] },
        { kind: 'table', head: ['Rank', 'Student', 'Adm. no', 'Overall %', 'Grade', 'GP', 'Attend. %'], widths: [40, 160, 80, 60, 50, 40, 69],
          rows: [...cards].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).map((c) => [
            c.rank ?? '-', c.student.full_name, c.student.admission_no,
            c.overall_pct ?? '-', c.overall_grade ?? '-', c.grade_point ?? '-', c.attendance.pct ?? '-',
          ]) },
      ],
    });
    const out = await PDFDocument.create();
    const add = async (buf: Buffer) => {
      const src = await PDFDocument.load(buf);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    };
    await add(summary);
    for (const c of cards) await add(await this.cardPdf(c));
    out.setTitle(`Report cards - ${className}`);
    return Buffer.from(await out.save());
  }
}
