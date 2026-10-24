import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportCardService } from '../exams/report-card.service';
import { bandFor, passThreshold } from '../exams/grading';
import { dateRange, pct1, ReportFilters, Table } from './report-utils';
import { AttendanceTally, addToTally, emptyTally, isSunday } from '../attendance/attendance-math';

const today = () => new Date().toISOString().slice(0, 10);
const className = (c: { name: string; section: string | null } | null | undefined) =>
  c ? `${c.name}${c.section ? ` ${c.section}` : ''}` : '';

/** Every aggregate behind the Reports page / home dashboard. All are branch-scoped and filterable. */
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService, private cards: ReportCardService) {}

  private classWhere(f: ReportFilters) {
    return f.classIds ? { id: { in: f.classIds } } : {};
  }

  private async classes(branchId: string, f: ReportFilters) {
    return this.prisma.class.findMany({ where: { branchId, ...this.classWhere(f) }, orderBy: [{ name: 'asc' }, { section: 'asc' }] });
  }

  /* ── Attendance ───────────────────────────────────────────── */

  async attendanceByClass(branchId: string, f: ReportFilters) {
    const range = dateRange(f);
    // Grouped by date too, so Sundays can be excluded (THE rule: attendance/attendance-math.ts).
    const grouped = await this.prisma.attendanceRecord.groupBy({
      by: ['classId', 'date', 'status'],
      where: { branchId, ...(f.classIds ? { classId: { in: f.classIds } } : {}), ...(range ? { date: range } : {}) },
      _count: { _all: true },
    });
    const byClass = new Map<string, AttendanceTally>();
    for (const g of grouped) {
      const b = byClass.get(g.classId) ?? emptyTally();
      addToTally(b, g.status, g.date, g._count._all);
      byClass.set(g.classId, b);
    }
    const classes = await this.classes(branchId, f);
    return classes.map((c) => {
      const b = byClass.get(c.id) ?? emptyTally();
      return {
        class_id: c.id, class_name: c.name, section: c.section,
        attendance_pct: b.percentage,
        /** attended = Present + Late + OD */
        present: b.attended,
        absent: b.absent,
        late: b.late,
        od: b.od,
        leave: b.leave,
        /** the denominator: Present + Late + OD + Absent (Leave and Sundays excluded) */
        total_records: b.counted,
      };
    });
  }

  /** Daily series when the window is <= 62 days, otherwise monthly. */
  async attendanceTrend(branchId: string, f: ReportFilters) {
    const range = dateRange(f);
    const grouped = await this.prisma.attendanceRecord.groupBy({
      by: ['date', 'status'],
      where: { branchId, ...(f.classIds ? { classId: { in: f.classIds } } : {}), ...(range ? { date: range } : {}) },
      _count: { _all: true },
    });
    const dates = grouped.map((g) => g.date).sort();
    const span = dates.length ? (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86_400_000 : 0;
    const granularity: 'day' | 'month' = span <= 62 ? 'day' : 'month';
    const buckets = new Map<string, AttendanceTally>();
    const overall = emptyTally();
    for (const g of grouped) {
      if (isSunday(g.date)) continue;
      const k = granularity === 'day' ? g.date : g.date.slice(0, 7);
      const b = buckets.get(k) ?? emptyTally();
      addToTally(b, g.status, g.date, g._count._all);
      buckets.set(k, b);
      addToTally(overall, g.status, g.date, g._count._all);
    }
    const points = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, b]) => ({
      period, present: b.attended, absent: b.absent, od: b.od, late: b.late, leave: b.leave, total: b.counted, pct: b.percentage,
    }));
    return { granularity, overall_pct: overall.percentage, present: overall.attended, total: overall.counted, od: overall.od, points };
  }

  /* ── Fees ─────────────────────────────────────────────────── */

  private async invoices(branchId: string, f: ReportFilters) {
    const range = dateRange(f);
    return this.prisma.feeInvoice.findMany({
      where: { branchId, ...(range ? { dueDate: range } : {}), ...(f.classIds ? { student: { classId: { in: f.classIds } } } : {}) },
      include: {
        payments: { select: { amountPaid: true } },
        student: { select: { id: true, fullName: true, admissionNo: true, mobileNumber: true, classId: true, class: { select: { name: true, section: true } } } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /** Collected vs due, by class and by term, with the defaulter count. Dates filter on the invoice due date. */
  async fees(branchId: string, f: ReportFilters) {
    const invoices = await this.invoices(branchId, f);
    const now = today();
    let invoiced = 0, collected = 0, overdue = 0;
    const byStatus: Record<string, number> = {};
    const byClass = new Map<string, { class_id: string | null; class_name: string; invoiced: number; collected: number; outstanding: number; invoices: number }>();
    const byTerm = new Map<string, { term: string; invoiced: number; collected: number; outstanding: number; invoices: number }>();
    const defaulters = new Set<string>();
    for (const inv of invoices) {
      const paid = inv.payments.reduce((s, p) => s + p.amountPaid, 0);
      const bal = Math.max(0, inv.totalAmount - paid);
      invoiced += inv.totalAmount; collected += paid;
      if (bal > 0 && inv.dueDate < now) { overdue += bal; defaulters.add(inv.studentId); }
      byStatus[inv.status] = (byStatus[inv.status] ?? 0) + 1;
      const ck = inv.student.classId ?? 'none';
      const c = byClass.get(ck) ?? { class_id: inv.student.classId, class_name: className(inv.student.class) || 'Unassigned', invoiced: 0, collected: 0, outstanding: 0, invoices: 0 };
      c.invoiced += inv.totalAmount; c.collected += paid; c.outstanding += bal; c.invoices += 1;
      byClass.set(ck, c);
      const t = byTerm.get(inv.term) ?? { term: inv.term, invoiced: 0, collected: 0, outstanding: 0, invoices: 0 };
      t.invoiced += inv.totalAmount; t.collected += paid; t.outstanding += bal; t.invoices += 1;
      byTerm.set(inv.term, t);
    }
    const withPct = <T extends { invoiced: number; collected: number }>(r: T) => ({ ...r, collection_pct: pct1(r.collected, r.invoiced) });
    return {
      invoiced,
      collected,
      collection_pct: pct1(collected, invoiced),
      outstanding: Math.max(0, invoiced - collected),
      overdue,
      invoice_count: invoices.length,
      defaulter_count: defaulters.size,
      by_status: byStatus,
      by_class: [...byClass.values()].sort((a, b) => a.class_name.localeCompare(b.class_name)).map(withPct),
      by_term: [...byTerm.values()].sort((a, b) => a.term.localeCompare(b.term)).map(withPct),
    };
  }

  /** Students with an unpaid balance on an invoice already past its due date. */
  async defaulters(branchId: string, f: ReportFilters) {
    const invoices = await this.invoices(branchId, f);
    const now = today();
    const by = new Map<string, { student_id: string; full_name: string; admission_no: string; class_name: string; mobile: string | null; overdue_invoices: number; overdue_amount: number; oldest_due: string }>();
    for (const inv of invoices) {
      const bal = Math.max(0, inv.totalAmount - inv.payments.reduce((s, p) => s + p.amountPaid, 0));
      if (bal <= 0 || inv.dueDate >= now) continue;
      const d = by.get(inv.studentId) ?? {
        student_id: inv.studentId, full_name: inv.student.fullName, admission_no: inv.student.admissionNo,
        class_name: className(inv.student.class), mobile: inv.student.mobileNumber, overdue_invoices: 0, overdue_amount: 0, oldest_due: inv.dueDate,
      };
      d.overdue_invoices += 1; d.overdue_amount += bal;
      if (inv.dueDate < d.oldest_due) d.oldest_due = inv.dueDate;
      by.set(inv.studentId, d);
    }
    return [...by.values()].sort((a, b) => b.overdue_amount - a.overdue_amount);
  }

  /* ── Academic performance (grade engine) ──────────────────── */

  async performance(branchId: string, f: ReportFilters) {
    const classes = await this.classes(branchId, f);
    const bands = await this.cards.bands(branchId);
    const pass = passThreshold(bands);
    const students = await this.prisma.student.findMany({
      where: { branchId, status: 'Active', classId: { in: classes.map((c) => c.id) } },
      select: { id: true, classId: true },
    });
    const { summaries } = await this.cards.summaries(branchId, students.map((s) => s.id), { from: f.from, to: f.to }, bands);

    const dist = (pcts: number[]) => {
      const out: Record<string, number> = Object.fromEntries(bands.map((b) => [b.grade, 0]));
      for (const p of pcts) { const g = bandFor(p, bands)?.grade; if (g) out[g] = (out[g] ?? 0) + 1; }
      return out;
    };
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

    const subjAll = new Map<string, { subject_id: string; subject_name: string; pcts: number[] }>();
    const byClass = classes.map((c) => {
      const ids = students.filter((s) => s.classId === c.id).map((s) => s.id);
      const overall = ids.map((id) => summaries.get(id)?.overall_pct).filter((p): p is number => p != null);
      const subj = new Map<string, { subject_id: string; subject_name: string; pcts: number[] }>();
      for (const id of ids) {
        for (const s of summaries.get(id)?.subjects ?? []) {
          for (const m of [subj, subjAll]) {
            const b = m.get(s.subject_id) ?? { subject_id: s.subject_id, subject_name: s.subject_name, pcts: [] };
            b.pcts.push(s.weighted_pct);
            m.set(s.subject_id, b);
          }
        }
      }
      return {
        class_id: c.id, class_name: className(c), section: c.section,
        students: ids.length, students_with_marks: overall.length,
        avg_pct: avg(overall),
        pass_rate: overall.length ? pct1(overall.filter((p) => p >= pass).length, overall.length) : null,
        grade_distribution: dist(overall),
        subjects: [...subj.values()].sort((a, b) => a.subject_name.localeCompare(b.subject_name)).map((s) => ({
          subject_id: s.subject_id, subject_name: s.subject_name, entries: s.pcts.length, avg_pct: avg(s.pcts),
          pass_rate: pct1(s.pcts.filter((p) => p >= pass).length, s.pcts.length),
        })),
      };
    });
    const all = students.map((s) => summaries.get(s.id)?.overall_pct).filter((p): p is number => p != null);
    return {
      pass_mark: pass,
      overall: {
        students: students.length, students_with_marks: all.length, avg_pct: avg(all),
        pass_rate: all.length ? pct1(all.filter((p) => p >= pass).length, all.length) : null,
        grade_distribution: dist(all),
      },
      by_class: byClass,
      by_subject: [...subjAll.values()].sort((a, b) => a.subject_name.localeCompare(b.subject_name)).map((s) => ({
        subject_id: s.subject_id, subject_name: s.subject_name, entries: s.pcts.length, avg_pct: avg(s.pcts),
        pass_rate: pct1(s.pcts.filter((p) => p >= pass).length, s.pcts.length),
      })),
    };
  }

  /** Average score % per exam (raw marks, not weighted). */
  async examAverages(branchId: string, f: ReportFilters) {
    const range = dateRange(f);
    const exams = await this.prisma.exam.findMany({
      where: { branchId, ...(range ? { date: range } : {}) },
      include: { examMarks: { where: f.classIds ? { student: { classId: { in: f.classIds } } } : {}, select: { score: true, maxScore: true } } },
      orderBy: { date: 'asc' },
    });
    return exams.map((e) => {
      const m = e.examMarks;
      const a = m.length ? m.reduce((s, x) => s + (x.maxScore > 0 ? (x.score / x.maxScore) * 100 : 0), 0) / m.length : null;
      return { exam_id: e.id, exam_name: e.name, exam_date: e.date, term: e.term, academic_year: e.academicYear, marks_count: m.length, avg_score_pct: a === null ? null : Math.round(a * 10) / 10 };
    });
  }

  /** Per exam × class average (home dashboard grouped bars). */
  async examScores(branchId: string, f: ReportFilters) {
    const range = dateRange(f);
    const [marks, exams, classes] = await Promise.all([
      this.prisma.examMark.findMany({
        where: { branchId, ...(f.classIds ? { student: { classId: { in: f.classIds } } } : {}), ...(range ? { exam: { date: range } } : {}) },
        select: { examId: true, score: true, maxScore: true, student: { select: { classId: true } } },
      }),
      this.prisma.exam.findMany({ where: { branchId, ...(range ? { date: range } : {}) }, orderBy: { date: 'asc' } }),
      this.classes(branchId, f),
    ]);
    const buckets = new Map<string, { sum: number; n: number }>();
    for (const m of marks) {
      const cid = m.student?.classId;
      if (!cid) continue;
      const k = `${m.examId}|${cid}`;
      const b = buckets.get(k) ?? { sum: 0, n: 0 };
      b.sum += m.maxScore > 0 ? (m.score / m.maxScore) * 100 : 0; b.n += 1;
      buckets.set(k, b);
    }
    return exams.map((e) => ({
      exam_id: e.id, exam_name: e.name, exam_date: e.date,
      classes: classes.map((c) => {
        const b = buckets.get(`${e.id}|${c.id}`);
        return { class_id: c.id, class_name: c.name, section: c.section, avg_score_pct: b && b.n ? Math.round((b.sum / b.n) * 10) / 10 : null, marks_count: b?.n ?? 0 };
      }),
    }));
  }

  /* ── Home-dashboard series (shape kept for the dashboard page) ── */

  async trends(branchId: string, f: ReportFilters, includeFees: boolean) {
    const inClass = f.classIds ? { classId: { in: f.classIds } } : {};
    const range = dateRange(f);
    const [students, classes, invoices, payments, records] = await Promise.all([
      this.prisma.student.findMany({ where: { branchId, ...inClass }, select: { createdAt: true } }),
      this.prisma.class.findMany({ where: { branchId, ...this.classWhere(f) }, select: { createdAt: true } }),
      includeFees
        ? this.prisma.feeInvoice.findMany({ where: { branchId, ...(range ? { dueDate: range } : {}), ...(f.classIds ? { student: inClass } : {}) }, select: { id: true, dueDate: true, totalAmount: true } })
        : Promise.resolve([] as { id: string; dueDate: string; totalAmount: number }[]),
      includeFees
        ? this.prisma.offlinePayment.findMany({ where: { branchId }, select: { invoiceId: true, amountPaid: true } })
        : Promise.resolve([] as { invoiceId: string; amountPaid: number }[]),
      this.prisma.attendanceRecord.findMany({ where: { branchId, ...inClass, ...(range ? { date: range } : {}) }, select: { date: true, status: true } }),
    ]);
    const inWindow = (m: string) => (!f.from || m >= f.from.slice(0, 7)) && (!f.to || m <= f.to.slice(0, 7));
    const seen = new Set<string>();
    const note = (m: string) => { if (/^\d{4}-\d{2}$/.test(m) && inWindow(m)) seen.add(m); };
    for (const s of students) note(s.createdAt.toISOString().slice(0, 7));
    for (const c of classes) note(c.createdAt.toISOString().slice(0, 7));
    for (const i of invoices) note(i.dueDate.slice(0, 7));
    for (const r of records) note(r.date.slice(0, 7));
    const months = [...seen].sort();
    if (!months.length) return { points: [], fees_included: includeFees };
    const grid: string[] = [];
    const [sy, sm] = months[0].split('-').map(Number);
    const [ey, em] = months[months.length - 1].split('-').map(Number);
    for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
      grid.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    const paidBy = new Map<string, number>();
    for (const p of payments) paidBy.set(p.invoiceId, (paidBy.get(p.invoiceId) ?? 0) + p.amountPaid);
    const fees = new Map<string, { invoiced: number; collected: number; outstanding: number }>();
    for (const inv of invoices) {
      const m = inv.dueDate.slice(0, 7);
      const b = fees.get(m) ?? { invoiced: 0, collected: 0, outstanding: 0 };
      const paid = paidBy.get(inv.id) ?? 0;
      b.invoiced += inv.totalAmount; b.collected += paid; b.outstanding += Math.max(0, inv.totalAmount - paid);
      fees.set(m, b);
    }
    const count = (rows: { createdAt: Date }[]) => {
      const out = new Map<string, number>();
      for (const r of rows) { const m = r.createdAt.toISOString().slice(0, 7); out.set(m, (out.get(m) ?? 0) + 1); }
      return out;
    };
    const enr = count(students);
    const cc = count(classes);
    const att = new Map<string, AttendanceTally>();
    for (const r of records) {
      const m = r.date.slice(0, 7);
      const b = att.get(m) ?? emptyTally();
      addToTally(b, r.status, r.date);
      att.set(m, b);
    }
    return {
      fees_included: includeFees,
      points: grid.map((m) => {
        const fe = fees.get(m);
        const a = att.get(m);
        return {
          month: m,
          label: new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
          year: Number(m.slice(0, 4)),
          ...(includeFees ? { invoiced: fe?.invoiced ?? 0, collected: fe?.collected ?? 0, outstanding: fe?.outstanding ?? 0 } : {}),
          enrollments: enr.get(m) ?? 0,
          classes: cc.get(m) ?? 0,
          attendance_pct: a ? a.percentage : null,
          attendance_records: a?.counted ?? 0,
        };
      }),
    };
  }

  async dashboard(branchId: string, f: ReportFilters, includeFees: boolean) {
    const inClass = f.classIds ? { classId: { in: f.classIds } } : {};
    const [students, staff, classes, incidents, pendingLeaves, pendingGatePasses, pendingAdmissions] = await this.prisma.$transaction([
      this.prisma.student.count({ where: { branchId, status: 'Active', ...inClass } }),
      this.prisma.staff.count({ where: { branchId, isActive: true } }),
      this.prisma.class.count({ where: { branchId, ...this.classWhere(f) } }),
      this.prisma.incident.count({ where: { branchId, status: { not: 'Closed' }, ...(f.classIds ? { student: inClass } : {}) } }),
      this.prisma.staffLeave.count({ where: { branchId, status: 'Pending' } }),
      this.prisma.gatePass.count({ where: { branchId, status: 'Pending', ...(f.classIds ? { student: inClass } : {}) } }),
      this.prisma.admission.count({ where: { branchId, status: { notIn: ['Admission Complete', 'Rejected'] } } }),
    ]);
    let fees: { invoiced: number; collected: number; collection_pct: number | null } | null = null;
    if (includeFees) {
      const fr = await this.fees(branchId, f);
      fees = { invoiced: fr.invoiced, collected: fr.collected, collection_pct: fr.collection_pct };
    }
    return {
      students_active: students, staff_active: staff, classes, incidents_open: incidents,
      staff_leaves_pending: pendingLeaves, gate_passes_pending: pendingGatePasses, admissions_in_progress: pendingAdmissions,
      fees,
    };
  }

  async hostel(branchId: string) {
    const rooms = await this.prisma.room.findMany({ where: { hostel: { branchId } }, include: { _count: { select: { allocations: true } } } });
    const capacity = rooms.reduce((s, r) => s + r.capacity, 0);
    const allocated = rooms.reduce((s, r) => s + r._count.allocations, 0);
    return { capacity, allocated, occupancy_pct: pct1(allocated, capacity) };
  }

  /** Payroll totals; from/to filter on the payslip month (YYYY-MM). */
  async payroll(branchId: string, f: ReportFilters) {
    const slips = await this.prisma.payslip.findMany({ where: { branchId }, select: { monthYear: true, netSalary: true, grossSalary: true, status: true } });
    const inWindow = (m: string) => (!f.from || m >= f.from.slice(0, 7)) && (!f.to || m <= f.to.slice(0, 7));
    const rows = slips.filter((s) => inWindow(s.monthYear));
    const by = new Map<string, { month: string; payslips: number; gross: number; net: number; paid: number }>();
    for (const s of rows) {
      const b = by.get(s.monthYear) ?? { month: s.monthYear, payslips: 0, gross: 0, net: 0, paid: 0 };
      b.payslips += 1; b.gross += s.grossSalary; b.net += s.netSalary; if (s.status === 'Paid') b.paid += 1;
      by.set(s.monthYear, b);
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      payroll_total_net: r2(rows.reduce((s, p) => s + p.netSalary, 0)),
      payroll_total_gross: r2(rows.reduce((s, p) => s + p.grossSalary, 0)),
      payslip_count: rows.length,
      by_month: [...by.values()].sort((a, b) => a.month.localeCompare(b.month)).map((b) => ({ ...b, gross: r2(b.gross), net: r2(b.net) })),
    };
  }

  /* ── Export tables ────────────────────────────────────────── */

  async table(report: string, branchId: string, f: ReportFilters): Promise<Table> {
    const range = dateRange(f);
    switch (report) {
      case 'students': {
        const rows = await this.prisma.student.findMany({
          where: { branchId, ...(f.classIds ? { classId: { in: f.classIds } } : {}) },
          include: { class: { select: { name: true, section: true } } },
          orderBy: { fullName: 'asc' },
        });
        return { title: 'Students', head: ['admission_no', 'full_name', 'class', 'roll_no', 'gender', 'mobile', 'status'],
          rows: rows.map((s) => [s.admissionNo, s.fullName, className(s.class), s.rollNo, s.gender, s.mobileNumber, s.status]) };
      }
      case 'fees': {
        const inv = await this.invoices(branchId, f);
        return { title: 'Fee invoices', head: ['invoice_no', 'student', 'admission_no', 'class', 'term', 'due_date', 'total', 'paid', 'balance', 'status'],
          rows: inv.map((i) => {
            const paid = i.payments.reduce((s, p) => s + p.amountPaid, 0);
            return [i.invoiceNo, i.student.fullName, i.student.admissionNo, className(i.student.class), i.term, i.dueDate, i.totalAmount, paid, Math.max(0, i.totalAmount - paid), i.status];
          }).reverse() };
      }
      case 'fee-summary': {
        const fr = await this.fees(branchId, f);
        return { title: 'Fee collection by class', head: ['class', 'invoices', 'invoiced', 'collected', 'outstanding', 'collection_pct'],
          rows: fr.by_class.map((c) => [c.class_name, c.invoices, c.invoiced, c.collected, c.outstanding, c.collection_pct]),
          note: `Total invoiced ${fr.invoiced}, collected ${fr.collected} (${fr.collection_pct ?? '-'}%), overdue ${fr.overdue}, defaulters ${fr.defaulter_count}.` };
      }
      case 'defaulters': {
        const d = await this.defaulters(branchId, f);
        return { title: 'Fee defaulters', head: ['admission_no', 'student', 'class', 'mobile', 'overdue_invoices', 'overdue_amount', 'oldest_due'],
          rows: d.map((x) => [x.admission_no, x.full_name, x.class_name, x.mobile, x.overdue_invoices, x.overdue_amount, x.oldest_due]) };
      }
      case 'attendance': {
        const recs = await this.prisma.attendanceRecord.findMany({
          where: { branchId, ...(f.classIds ? { classId: { in: f.classIds } } : {}), ...(range ? { date: range } : {}) },
          include: { student: { select: { fullName: true, admissionNo: true } }, class: { select: { name: true, section: true } } },
          orderBy: [{ date: 'desc' }, { studentId: 'asc' }],
          take: 20000,
        });
        return { title: 'Attendance records', head: ['date', 'class', 'student', 'admission_no', 'status', 'note'],
          rows: recs.map((r) => [r.date, className(r.class), r.student.fullName, r.student.admissionNo, r.status, r.note ?? '']) };
      }
      case 'attendance-summary': {
        const rows = await this.attendanceByClass(branchId, f);
        return { title: 'Attendance by class', head: ['class', 'section', 'attended', 'absent', 'late', 'od', 'leave', 'counted_days', 'attendance_pct'],
          rows: rows.map((r) => [r.class_name, r.section, r.present, r.absent, r.late, r.od, r.leave, r.total_records, r.attendance_pct]) };
      }
      case 'attendance-trend': {
        const t = await this.attendanceTrend(branchId, f);
        return { title: `Attendance trend (by ${t.granularity})`, head: ['period', 'attended', 'absent', 'od', 'counted_days', 'attendance_pct'],
          rows: t.points.map((p) => [p.period, p.present, p.absent, p.od, p.total, p.pct]) };
      }
      case 'performance': {
        const p = await this.performance(branchId, f);
        const rows: (string | number | null)[][] = [];
        for (const c of p.by_class) {
          rows.push([c.class_name, 'All subjects', c.students_with_marks, c.avg_pct, c.pass_rate]);
          for (const s of c.subjects) rows.push([c.class_name, s.subject_name, s.entries, s.avg_pct, s.pass_rate]);
        }
        return { title: 'Academic performance', head: ['class', 'subject', 'students', 'avg_pct', 'pass_rate'], rows,
          note: `Weighted grade-engine averages. Pass mark ${p.pass_mark}%. School average ${p.overall.avg_pct ?? '-'}%, pass rate ${p.overall.pass_rate ?? '-'}%.` };
      }
      case 'exams': {
        const e = await this.examAverages(branchId, f);
        return { title: 'Exam averages', head: ['exam', 'date', 'term', 'academic_year', 'marks', 'avg_pct'],
          rows: e.map((x) => [x.exam_name, x.exam_date, x.term, x.academic_year, x.marks_count, x.avg_score_pct]) };
      }
      case 'payroll': {
        const p = await this.payroll(branchId, f);
        return { title: 'Payroll by month', head: ['month', 'payslips', 'paid', 'gross', 'net'],
          rows: p.by_month.map((m) => [m.month, m.payslips, m.paid, m.gross, m.net]),
          note: `Total net ${p.payroll_total_net} across ${p.payslip_count} payslips.` };
      }
      default:
        throw new Error(`unknown report ${report}`);
    }
  }
}
