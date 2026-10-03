import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { MarkAttendanceDto } from '../fees/dto/fees.dto';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

@Controller('attendance')
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(private prisma: PrismaService) {}

  /** Monthly register: per-student × per-day matrix for a class in a given month. */
  @Get('register')
  async register(@Req() req: ReqWithUser, @Query('class_id') classId?: string, @Query('month') month?: string) {
    if (!classId || !month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('class_id and month (YYYY-MM) are required');
    }
    const monthStart = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

    const students = await this.prisma.student.findMany({
      where: { branchId: req.user.branch_id, classId, status: 'Active' },
      orderBy: { rollNo: 'asc' },
      select: { id: true, fullName: true, rollNo: true },
    });
    const records = await this.prisma.attendanceRecord.findMany({
      where: { branchId: req.user.branch_id, classId, date: { gte: monthStart, lte: monthEnd } },
      select: { studentId: true, date: true, status: true },
    });

    const byStudent = new Map<string, Record<string, string>>();
    const dates = new Set<string>();
    for (const r of records) {
      dates.add(r.date);
      const row = byStudent.get(r.studentId) ?? {};
      row[r.date] = r.status;
      byStudent.set(r.studentId, row);
    }

    return {
      month,
      class_id: classId,
      dates: Array.from(dates).sort(),
      students: students.map((s) => {
        const days = byStudent.get(s.id) ?? {};
        const values = Object.values(days);
        return {
          ...s,
          days,
          present: values.filter((v) => v === 'Present').length,
          marked: values.length,
        };
      }),
    };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'branch_admin', 'teacher')
  async mark(
    @Req() req: { user: { branch_id: string } },
    @Body() body: MarkAttendanceDto,
  ) {
    const { class_id, date, records, marked_by } = body;

    await this.prisma.$transaction(
      records.map((r) =>
        this.prisma.attendanceRecord.upsert({
          where: { studentId_date: { studentId: r.student_id, date } },
          create: {
            branchId: req.user.branch_id,
            studentId: r.student_id,
            classId: class_id,
            date,
            status: r.status,
            markedBy: marked_by ?? null,
          },
          update: { status: r.status, markedBy: marked_by ?? null },
        }),
      ),
    );

    return { success: true, count: records.length };
  }

  @Get()
  async get(
    @Req() req: { user: { branch_id: string } },
    @Query('class_id') classId?: string,
    @Query('date') date?: string,
  ) {
    if (!classId || !date) return [];

    return this.prisma.attendanceRecord.findMany({
      where: { branchId: req.user.branch_id, classId, date },
      include: { student: { select: { fullName: true, admissionNo: true } } },
    });
  }

  @Post('notify-absent')
  async notifyAbsent(
    @Req() req: { user: { branch_id: string } },
    @Body() body: { date?: string },
  ) {
    const date = body?.date;
    if (!date) throw new BadRequestException('date is required');

    const absentees = await this.prisma.attendanceRecord.findMany({
      where: {
        branchId: req.user.branch_id,
        date,
        status: 'Absent',
        notified: 0,
        student: { email: { not: null } },
      },
      include: { student: { select: { fullName: true, email: true, fatherName: true } } },
    });

    // Email dispatch is a no-op placeholder (was mocked in the legacy backend too)
    for (const record of absentees) {
      // eslint-disable-next-line no-console
      console.log(`[EMAIL] Absence notice → ${record.student.email} (${record.student.fullName})`);
    }

    if (absentees.length > 0) {
      await this.prisma.attendanceRecord.updateMany({
        where: { branchId: req.user.branch_id, date, status: 'Absent' },
        data: { notified: 1 },
      });
    }

    return { notified: absentees.length };
  }
}
