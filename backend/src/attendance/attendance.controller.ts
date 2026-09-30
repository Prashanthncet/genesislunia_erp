import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';

@Controller('attendance')
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(private prisma: PrismaService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'branch_admin', 'teacher')
  async mark(
    @Req() req: { user: { branch_id: string } },
    @Body() body: { class_id?: string; date?: string; records?: Array<{ student_id: string; status: string }>; marked_by?: string },
  ) {
    const { class_id, date, records, marked_by } = body ?? {};
    if (!class_id || !date || !Array.isArray(records)) {
      throw new BadRequestException('class_id, date, and records are required');
    }

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
