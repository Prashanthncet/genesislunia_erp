import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

/**
 * Escapes CSV fields and neutralizes formula injection (DDE attacks in Excel/Sheets).
 * Any cell value starting with =, +, -, @, \t, \r has a single quote prepended.
 */
const csvEscape = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private prisma: PrismaService) {}

  /** Attendance % per class over an optional date range. */
  @Get('attendance')
  async attendance(@Req() req: ReqWithUser, @Query('from') from?: string, @Query('to') to?: string) {
    const where: Record<string, unknown> = { branchId: req.user.branch_id };
    if (from || to) {
      where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }
    const records = await this.prisma.attendanceRecord.findMany({
      where,
      select: { classId: true, status: true },
    });
    const byClass = new Map<string, { present: number; total: number }>();
    for (const r of records) {
      const bucket = byClass.get(r.classId) ?? { present: 0, total: 0 };
      bucket.total += 1;
      if (r.status === 'Present') bucket.present += 1;
      byClass.set(r.classId, bucket);
    }
    const classes = await this.prisma.class.findMany({ where: { branchId: req.user.branch_id } });
    return classes.map((c) => {
      const bucket = byClass.get(c.id);
      const pct = bucket && bucket.total > 0 ? Math.round((bucket.present / bucket.total) * 1000) / 10 : null;
      return { class_id: c.id, class_name: c.name, section: c.section, attendance_pct: pct, total_records: bucket?.total ?? 0 };
    });
  }

  /** Fee collection: invoiced vs collected, per term and overall. */
  @Get('fees')
  async fees(@Req() req: ReqWithUser) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { branchId: req.user.branch_id },
      include: { payments: { select: { amountPaid: true } } },
    });
    let invoiced = 0;
    let collected = 0;
    const byStatus: Record<string, number> = {};
    for (const inv of invoices) {
      invoiced += inv.totalAmount;
      const paid = inv.payments.reduce((s, p) => s + p.amountPaid, 0);
      collected += paid;
      byStatus[inv.status] = (byStatus[inv.status] ?? 0) + 1;
    }
    return {
      invoiced,
      collected,
      collection_pct: invoiced > 0 ? Math.round((collected / invoiced) * 1000) / 10 : null,
      outstanding: Math.max(0, invoiced - collected),
      invoice_count: invoices.length,
      by_status: byStatus,
    };
  }

  /** Academic performance: average score % per exam. */
  @Get('academics')
  async academics(@Req() req: ReqWithUser) {
    const exams = await this.prisma.exam.findMany({
      where: { branchId: req.user.branch_id },
      include: { examMarks: { select: { score: true, maxScore: true } } },
    });
    return exams.map((exam) => {
      const marks = exam.examMarks;
      const avg = marks.length > 0 ? marks.reduce((s, m) => s + (m.score / m.maxScore) * 100, 0) / marks.length : null;
      return {
        exam_id: exam.id,
        exam_name: exam.name,
        exam_date: exam.date,
        marks_count: marks.length,
        avg_score_pct: avg !== null ? Math.round(avg * 10) / 10 : null,
      };
    });
  }

  /** Admin dashboard: one call with headline numbers from every module. */
  @Get('dashboard')
  async dashboard(@Req() req: ReqWithUser) {
    const branchId = req.user.branch_id;
    const [students, staff, classes, incidents, pendingLeaves, pendingGatePasses, pendingAdmissions] =
      await this.prisma.$transaction([
        this.prisma.student.count({ where: { branchId, status: 'Active' } }),
        this.prisma.staff.count({ where: { branchId, isActive: true } }),
        this.prisma.class.count({ where: { branchId } }),
        this.prisma.incident.count({ where: { branchId, status: { not: 'Closed' } } }),
        this.prisma.staffLeave.count({ where: { branchId, status: 'Pending' } }),
        this.prisma.gatePass.count({ where: { branchId, status: 'Pending' } }),
        this.prisma.admission.count({ where: { branchId, status: { notIn: ['Admission Complete', 'Rejected'] } } }),
      ]);

    const invoices = await this.prisma.feeInvoice.findMany({
      where: { branchId },
      include: { payments: { select: { amountPaid: true } } },
    });
    const collected = invoices.reduce((s, inv) => s + inv.payments.reduce((p, pay) => p + pay.amountPaid, 0), 0);
    const invoiced = invoices.reduce((s, inv) => s + inv.totalAmount, 0);

    return {
      students_active: students,
      staff_active: staff,
      classes: classes,
      incidents_open: incidents,
      staff_leaves_pending: pendingLeaves,
      gate_passes_pending: pendingGatePasses,
      admissions_in_progress: pendingAdmissions,
      fees: {
        invoiced,
        collected,
        collection_pct: invoiced > 0 ? Math.round((collected / invoiced) * 1000) / 10 : null,
      },
    };
  }

  /** CSV export: type = students | fees | attendance. */
  @Get('export/:type')
  async exportCsv(
    @Req() req: ReqWithUser,
    @Param('type') type: string,
    @Res() res: Response,
  ) {
    const branchId = req.user.branch_id;
    let rows: string[][];

    if (type === 'students') {
      const students = await this.prisma.student.findMany({
        where: { branchId },
        include: { class: { select: { name: true, section: true } } },
        orderBy: { fullName: 'asc' },
      });
      rows = [
        ['admission_no', 'full_name', 'class', 'roll_no', 'gender', 'mobile', 'status'],
        ...students.map((s) => [s.admissionNo, s.fullName, s.class ? `${s.class.name} ${s.class.section ?? ''}`.trim() : '', s.rollNo ?? '', s.gender ?? '', s.mobileNumber ?? '', s.status]),
      ];
    } else if (type === 'fees') {
      const invoices = await this.prisma.feeInvoice.findMany({
        where: { branchId },
        include: {
          student: { select: { fullName: true, admissionNo: true } },
          payments: { select: { amountPaid: true } },
        },
        orderBy: { dueDate: 'desc' },
      });
      rows = [
        ['invoice_no', 'student', 'admission_no', 'term', 'total', 'paid', 'balance', 'status'],
        ...invoices.map((inv) => {
          const paid = inv.payments.reduce((s, p) => s + p.amountPaid, 0);
          return [inv.invoiceNo ?? '', inv.student.fullName, inv.student.admissionNo, inv.term, String(inv.totalAmount), String(paid), String(Math.max(0, inv.totalAmount - paid)), inv.status];
        }),
      ];
    } else if (type === 'attendance') {
      const records = await this.prisma.attendanceRecord.findMany({
        where: { branchId },
        include: {
          student: { select: { fullName: true, admissionNo: true } },
          class: { select: { name: true, section: true } },
        },
        orderBy: [{ date: 'desc' }, { studentId: 'asc' }],
        take: 5000,
      });
      rows = [
        ['date', 'class', 'student', 'admission_no', 'status'],
        ...records.map((r) => [r.date, r.class ? `${r.class.name} ${r.class.section ?? ''}`.trim() : '', r.student.fullName, r.student.admissionNo, r.status]),
      ];
    } else {
      return res.status(400).json({ message: 'type must be students | fees | attendance' });
    }

    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="genesis-erp-${type}.csv"`);
    return res.send(csv);
  }

  /** Occupancy + payroll totals used by the dashboard charts. */
  @Get('summary')
  async summary(@Req() req: ReqWithUser) {
    const branchId = req.user.branch_id;
    const rooms = await this.prisma.room.findMany({
      where: { hostel: { branchId } },
      include: { _count: { select: { allocations: true } } },
    });
    const capacity = rooms.reduce((s, r) => s + r.capacity, 0);
    const allocated = rooms.reduce((s, r) => s + r._count.allocations, 0);

    const payslips = await this.prisma.payslip.findMany({ where: { branchId } });
    const salaryCost = payslips.reduce((s, p) => s + p.netSalary, 0);

    return {
      hostel: { capacity, allocated, occupancy_pct: capacity > 0 ? Math.round((allocated / capacity) * 1000) / 10 : null },
      payroll_total_net: Math.round(salaryCost * 100) / 100,
      payslip_count: payslips.length,
    };
  }
}
