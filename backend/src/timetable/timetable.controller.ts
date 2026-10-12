import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';

type JwtUser = { sub: string; role: string; branch_id: string };
type ReqWithUser = { user: JwtUser };

type GenerateSlotInput = {
  name: string;
  teacher_id: string;
  periods_per_week: number;
  room_id?: string;
  double_periods?: boolean;
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_ORDER: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

@Controller('timetable')
@UseGuards(AuthGuard, RolesGuard)
export class TimetableController {
  constructor(private prisma: PrismaService) {}

  // ─── Teachers ────────────────────────────────────────────────

  @Get('teachers')
  listTeachers(@Req() req: ReqWithUser) {
    return this.prisma.staff.findMany({
      where: { branchId: req.user.branch_id, role: 'Teacher' },
      orderBy: { name: 'asc' },
    });
  }

  @Post('teachers')
  @Roles('super_admin', 'branch_admin')
  async createTeacher(
    @Req() req: ReqWithUser,
    @Body() body: { name?: string; email?: string; subjects?: string; max_periods_per_day?: number },
  ) {
    if (!body?.name) throw new BadRequestException('name is required');
    let teacher;
    try {
      teacher = await this.prisma.staff.create({
        data: {
          branchId: req.user.branch_id,
          name: body.name,
          email: body.email ?? `${crypto.randomUUID()}@placeholder.local`,
          role: 'Teacher',
          subjects: body.subjects ?? null,
          maxPeriodsPerDay: body.max_periods_per_day ?? 6,
          isActive: true,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unique constraint')) {
        throw new ConflictException('A teacher with this email already exists in this branch');
      }
      throw err;
    }
    return { id: teacher.id };
  }

  @Put('teachers/:id')
  @Roles('super_admin', 'branch_admin')
  async updateTeacher(
    @Req() req: ReqWithUser,
    @Param('id') id: string,
    @Body() body: { name?: string; email?: string; subjects?: string; max_periods_per_day?: number; is_active?: boolean },
  ) {
    await this.prisma.staff.updateMany({
      where: { id, branchId: req.user.branch_id, role: 'Teacher' },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.subjects !== undefined && { subjects: body.subjects }),
        ...(body.max_periods_per_day !== undefined && { maxPeriodsPerDay: body.max_periods_per_day }),
        ...(body.is_active !== undefined && { isActive: body.is_active }),
      },
    });
    return { success: true };
  }

  // ─── Rooms ───────────────────────────────────────────────────

  @Get('rooms')
  listRooms(@Req() req: ReqWithUser) {
    return this.prisma.academicRoom.findMany({
      where: { branchId: req.user.branch_id },
      orderBy: { name: 'asc' },
    });
  }

  @Post('rooms')
  @Roles('super_admin', 'branch_admin')
  async createRoom(
    @Req() req: ReqWithUser,
    @Body() body: { name?: string; type?: string; capacity?: number },
  ) {
    if (!body?.name || !body?.type) throw new BadRequestException('name and type are required');
    const room = await this.prisma.academicRoom.create({
      data: {
        branchId: req.user.branch_id,
        name: body.name,
        type: body.type,
        capacity: body.capacity ?? 40,
      },
    });
    return { id: room.id };
  }

  @Put('rooms/:id')
  @Roles('super_admin', 'branch_admin')
  async updateRoom(
    @Req() req: ReqWithUser,
    @Param('id') id: string,
    @Body() body: { name?: string; type?: string; capacity?: number },
  ) {
    await this.prisma.academicRoom.updateMany({
      where: { id, branchId: req.user.branch_id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.capacity !== undefined && { capacity: body.capacity }),
      },
    });
    return { success: true };
  }

  @Delete('rooms/:id')
  @Roles('super_admin', 'branch_admin')
  async deleteRoom(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.prisma.academicRoom.deleteMany({ where: { id, branchId: req.user.branch_id } });
    return { success: true };
  }

  // ─── Period configs ──────────────────────────────────────────

  @Get('periods')
  listPeriods(@Req() req: ReqWithUser) {
    return this.prisma.periodConfig.findMany({
      where: { branchId: req.user.branch_id },
      orderBy: { periodNumber: 'asc' },
    });
  }

  @Post('periods')
  @Roles('super_admin', 'branch_admin')
  async savePeriods(
    @Req() req: ReqWithUser,
    @Body() body: { periods?: Array<{ period_number: number; start_time: string; end_time: string; is_break?: boolean; break_name?: string }> },
  ) {
    if (!Array.isArray(body?.periods)) throw new BadRequestException('periods array is required');

    await this.prisma.$transaction([
      this.prisma.periodConfig.deleteMany({ where: { branchId: req.user.branch_id } }),
      ...body.periods.map((p) =>
        this.prisma.periodConfig.create({
          data: {
            branchId: req.user.branch_id,
            periodNumber: p.period_number,
            startTime: p.start_time,
            endTime: p.end_time,
            isBreak: p.is_break ?? false,
            breakName: p.break_name ?? null,
          },
        }),
      ),
    ]);
    return { success: true };
  }

  // ─── Exam invigilation scheduler ─────────────────────────────

  @Get('exams')
  async listExamSchedules(@Req() req: ReqWithUser) {
    const schedules = await this.prisma.examSchedule.findMany({
      where: { branchId: req.user.branch_id },
      include: {
        exam: { select: { name: true } },
        room: { select: { name: true } },
        invigilator: { select: { name: true } },
      },
      orderBy: [{ date: 'asc' }, { periodNumber: 'asc' }],
    });
    return schedules.map((s) => ({
      id: s.id,
      exam_id: s.examId,
      exam_name: s.exam?.name ?? null,
      date: s.date,
      period_number: s.periodNumber,
      room_id: s.roomId,
      room_name: s.room?.name ?? null,
      invigilator_id: s.invigilatorId,
      invigilator_name: s.invigilator?.name ?? null,
      subject: s.subject,
    }));
  }

  @Post('exams/schedule')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async scheduleExam(
    @Req() req: ReqWithUser,
    @Body() body: { exam_id?: string; date?: string; period_number?: number; room_id?: string; invigilator_id?: string; subject?: string },
  ) {
    const { exam_id, date, period_number, room_id, invigilator_id, subject } = body ?? {};
    if (!exam_id || !date || !period_number || !subject) {
      throw new BadRequestException('exam_id, date, period_number, and subject are required');
    }

    if (invigilator_id) {
      const clash = await this.prisma.examSchedule.findFirst({
        where: { branchId: req.user.branch_id, date, periodNumber: period_number, invigilatorId: invigilator_id },
      });
      if (clash) {
        throw new ConflictException('Teacher is already assigned as an invigilator for another room during this period.');
      }
    }

    if (room_id) {
      const clash = await this.prisma.examSchedule.findFirst({
        where: { branchId: req.user.branch_id, date, periodNumber: period_number, roomId: room_id },
      });
      if (clash) {
        throw new ConflictException('Room is already assigned to another exam during this period.');
      }
    }

    const schedule = await this.prisma.examSchedule.create({
      data: {
        branchId: req.user.branch_id,
        examId: exam_id,
        date,
        periodNumber: period_number,
        roomId: room_id ?? null,
        invigilatorId: invigilator_id ?? null,
        subject,
      },
    });
    return { id: schedule.id };
  }

  @Delete('exams/schedule/:id')
  @Roles('super_admin', 'branch_admin')
  async deleteExamSchedule(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.prisma.examSchedule.deleteMany({ where: { id, branchId: req.user.branch_id } });
    return { success: true };
  }

  // ─── Teacher absence → bulk auto-substitution ────────────────

  @Post('teachers/:id/absent')
  @Roles('super_admin', 'branch_admin', 'principal', 'teacher')
  async markTeacherAbsent(
    @Req() req: ReqWithUser,
    @Param('id') teacherId: string,
    @Body() body: { date?: string; reason?: string },
  ) {
    const date = body?.date;
    if (!date) throw new BadRequestException('date is required (YYYY-MM-DD)');
    const branchId = req.user.branch_id;
    const dow = dayOfWeek(date);

    const slots = await this.prisma.timetableSlot.findMany({
      where: {
        branchId,
        teacherId,
        dayOfWeek: dow,
      },
    });

    // Filter out slots that already have a substitution for that date
    const existingSubs = await this.prisma.substitution.findMany({
      where: { branchId, date },
      select: { classId: true, periodNumber: true },
    });
    const subKey = new Set(existingSubs.map((s) => `${s.classId}:${s.periodNumber}`));
    const affected = slots.filter((s) => !subKey.has(`${s.classId}:${s.periodNumber}`));

    if (affected.length === 0) {
      return { message: 'No unsubstituted periods found for this teacher on that day.', substitutions: [] };
    }

    const results = [];
    for (const slot of affected) {
      const result = await this.assignSubstitute({
        branchId,
        date,
        dow,
        classId: slot.classId,
        periodNumber: slot.periodNumber,
        originalTeacherId: teacherId,
        reason: body?.reason ?? 'Teacher Absent',
        createdBy: req.user.sub,
      });
      results.push({ class_id: slot.classId, period_number: slot.periodNumber, ...result });
    }
    return { substitutions: results };
  }

  // ─── Master / live views ─────────────────────────────────────

  @Get('master/:classId')
  async master(@Req() req: ReqWithUser, @Param('classId') classId: string) {
    const slots = await this.prisma.timetableSlot.findMany({
      where: { branchId: req.user.branch_id, classId },
      include: {
        teacher: { select: { name: true } },
        room: { select: { name: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }],
    });
    return slots
      .map((s) => ({
        id: s.id,
        class_id: s.classId,
        day_of_week: s.dayOfWeek,
        period_number: s.periodNumber,
        subject: s.subject,
        teacher_id: s.teacherId,
        teacher_name: s.teacher.name,
        room_id: s.roomId,
        room_name: s.room?.name ?? null,
      }))
      .sort(
        (a, b) =>
          (DAY_ORDER[a.day_of_week] ?? 99) - (DAY_ORDER[b.day_of_week] ?? 99) ||
          a.period_number - b.period_number,
      );
  }

  @Get('today/:classId')
  async today(@Req() req: ReqWithUser, @Param('classId') classId: string, @Query('date') dateQ?: string) {
    const date = dateQ ?? todayISO();
    const dow = dayOfWeek(date);

    const slots = await this.prisma.timetableSlot.findMany({
      where: { branchId: req.user.branch_id, classId, dayOfWeek: dow },
      include: {
        teacher: { select: { name: true } },
        room: { select: { name: true } },
      },
      orderBy: { periodNumber: 'asc' },
    });

    const subs = await this.prisma.substitution.findMany({
      where: { branchId: req.user.branch_id, classId, date },
      include: {
        substitute: { select: { id: true, name: true } },
        room: { select: { name: true } },
      },
    });
    const subMap = new Map(subs.map((s) => [s.periodNumber, s]));

    return {
      date,
      day: dow,
      schedule: slots.map((s) => ({
        id: s.id,
        period_number: s.periodNumber,
        subject: s.subject,
        teacher_id: s.teacherId,
        teacher_name: s.teacher.name,
        room_id: s.roomId,
        room_name: s.room?.name ?? null,
        substitution: subMap.has(s.periodNumber)
          ? {
              substitute_name: subMap.get(s.periodNumber)!.substitute.name,
              substitute_id: subMap.get(s.periodNumber)!.substitute.id,
              reason: subMap.get(s.periodNumber)!.reason,
              room_name: subMap.get(s.periodNumber)!.room?.name ?? null,
            }
          : null,
      })),
    };
  }

  @Get('school-view')
  async schoolView(@Req() req: ReqWithUser, @Query('date') dateQ?: string) {
    const date = dateQ ?? todayISO();
    const dow = dayOfWeek(date);

    const slots = await this.prisma.timetableSlot.findMany({
      where: { branchId: req.user.branch_id, dayOfWeek: dow },
      include: {
        teacher: { select: { name: true } },
        class: { select: { id: true, name: true } },
        room: { select: { name: true } },
      },
      orderBy: { periodNumber: 'asc' },
    });

    const subs = await this.prisma.substitution.findMany({
      where: { branchId: req.user.branch_id, date },
      include: {
        substitute: { select: { id: true, name: true } },
        original: { select: { name: true } },
        room: { select: { name: true } },
      },
    });
    const subMap = new Map(subs.map((s) => [`${s.classId}:${s.periodNumber}`, s]));

    const grouped: Record<string, { class_id: string; class_name: string; periods: unknown[] }> = {};
    for (const s of slots) {
      if (!grouped[s.classId]) {
        grouped[s.classId] = { class_id: s.classId, class_name: s.class.name, periods: [] };
      }
      const sub = subMap.get(`${s.classId}:${s.periodNumber}`);
      grouped[s.classId].periods.push({
        class_id: s.classId,
        class_name: s.class.name,
        period_number: s.periodNumber,
        subject: s.subject,
        teacher_id: s.teacherId,
        teacher_name: s.teacher.name,
        room_id: s.roomId,
        room_name: s.room?.name ?? null,
        substitution: sub
          ? {
              reason: sub.reason,
              original_teacher_name: sub.original?.name ?? null,
              substitute_name: sub.substitute.name,
              substitute_id: sub.substitute.id,
              room_name: sub.room?.name ?? null,
            }
          : null,
      });
    }

    return { date, day: dow, classes: Object.values(grouped) };
  }

  @Get('substitutions')
  async listSubstitutions(@Req() req: ReqWithUser, @Query('date') dateQ?: string) {
    const date = dateQ ?? todayISO();
    const subs = await this.prisma.substitution.findMany({
      where: { branchId: req.user.branch_id, date },
      include: {
        class: { select: { name: true } },
        original: { select: { name: true } },
        substitute: { select: { name: true } },
      },
      orderBy: { periodNumber: 'asc' },
    });    return subs.map((s) => ({
      id: s.id,
      date: s.date,
      class_id: s.classId,
      class_name: s.class.name,
      period_number: s.periodNumber,
      original_teacher_id: s.originalTeacherId,
      original_teacher_name: s.original?.name ?? null,
      substitute_teacher_id: s.substituteTeacherId,
      substitute_name: s.substitute.name,
      reason: s.reason,
    }));
  }

  @Delete('substitutions/:id')
  async revokeSubstitution(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.prisma.substitution.deleteMany({ where: { id, branchId: req.user.branch_id } });
    return { success: true };
  }

  // ─── Manual slot upsert ──────────────────────────────────────

  @Put('slot')
  async upsertSlot(
    @Req() req: ReqWithUser,
    @Body() body: { class_id?: string; day_of_week?: string; period_number?: number; subject?: string; teacher_id?: string },
  ) {
    const { class_id, day_of_week, period_number, subject, teacher_id } = body ?? {};
    if (!class_id || !day_of_week || !period_number || !subject || !teacher_id) {
      throw new BadRequestException('class_id, day_of_week, period_number, subject, and teacher_id are required');
    }

    const conflict = await this.prisma.timetableSlot.findFirst({
      where: {
        branchId: req.user.branch_id,
        teacherId: teacher_id,
        dayOfWeek: day_of_week,
        periodNumber: period_number,
        classId: { not: class_id },
      },
    });
    if (conflict) {
      throw new ConflictException('Teacher is already assigned to another class at this period.');
    }

    await this.prisma.timetableSlot.upsert({
      where: {
        classId_dayOfWeek_periodNumber: { classId: class_id, dayOfWeek: day_of_week, periodNumber: period_number },
      },
      create: {
        branchId: req.user.branch_id,
        classId: class_id,
        dayOfWeek: day_of_week,
        periodNumber: period_number,
        subject,
        teacherId: teacher_id,
      },
      update: { subject, teacherId: teacher_id },
    });
    return { success: true };
  }

  // ─── Single-period substitution ──────────────────────────────

  @Post('substitute')
  async substitute(
    @Req() req: ReqWithUser,
    @Body() body: { date?: string; class_id?: string; period_number?: number; original_teacher_id?: string; reason?: string },
  ) {
    const { date, class_id, period_number, original_teacher_id, reason } = body ?? {};
    if (!date || !class_id || !period_number) {
      throw new BadRequestException('date, class_id, and period_number are required');
    }

    const result = await this.assignSubstitute({
      branchId: req.user.branch_id,
      date,
      dow: dayOfWeek(date),
      classId: class_id,
      periodNumber: period_number,
      originalTeacherId: original_teacher_id,
      reason,
      createdBy: req.user.sub,
    });

    if (result.error) throw new ConflictException(result.error);
    return result;
  }

  // ─── Auto generator (CSP) ────────────────────────────────────

  @Post('generate')
  async generate(
    @Req() req: ReqWithUser,
    @Body() body: {
      class_id?: string;
      periods_per_day?: number;
      working_days?: string[];
      subjects?: GenerateSlotInput[];
      overwrite?: boolean;
    },
  ) {
    const { class_id, periods_per_day, working_days, subjects: subjectList, overwrite } = body ?? {};
    if (!class_id || !periods_per_day || !working_days?.length || !subjectList?.length) {
      throw new BadRequestException('class_id, periods_per_day, working_days, and subjects are required');
    }

    const totalSlots = working_days.length * periods_per_day;
    const totalRequired = subjectList.reduce((sum, s) => sum + s.periods_per_week, 0);
    if (totalRequired !== totalSlots) {
      throw new BadRequestException(
        `Slot mismatch: ${totalRequired} subject-periods needed but ${totalSlots} slots available (${working_days.length} days × ${periods_per_day} periods). Adjust periods_per_week values.`,
      );
    }

    const branchId = req.user.branch_id;

    const existing = await this.prisma.timetableSlot.findMany({
      where: { branchId, classId: { not: class_id } },
      select: { teacherId: true, roomId: true, dayOfWeek: true, periodNumber: true },
    });

    const teacherIds = [...new Set(subjectList.map((s) => s.teacher_id))];
    const teachers = await this.prisma.staff.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, maxPeriodsPerDay: true },
    });
    const teacherLimits = new Map(teachers.map((t) => [t.id, t.maxPeriodsPerDay ?? 6]));

    // blocked maps: teacher/room busy per day+period
    const teacherBlocked: Record<string, Record<number, Set<string>>> = {};
    const roomBlocked: Record<string, Record<number, Set<string>>> = {};
    for (const day of working_days) {
      teacherBlocked[day] = {};
      roomBlocked[day] = {};
      for (let p = 1; p <= periods_per_day; p++) {
        teacherBlocked[day][p] = new Set();
        roomBlocked[day][p] = new Set();
      }
    }
    for (const s of existing) {
      teacherBlocked[s.dayOfWeek]?.[s.periodNumber]?.add(s.teacherId);
      if (s.roomId) roomBlocked[s.dayOfWeek]?.[s.periodNumber]?.add(s.roomId);
    }

    // Validate requested subject quota against each teacher's daily limit
    const state = {
      remaining: Object.fromEntries(subjectList.map((s) => [s.name, s.periods_per_week])) as Record<string, number>,
      assignments: [] as Array<{ day: string; period: number; subject: string; teacher_id: string; room_id?: string }>,
      teacherDayLoad: Object.fromEntries(teacherIds.map((t) => [t, Object.fromEntries(working_days.map((d) => [d, 0]))])) as Record<string, Record<string, number>>,
      lastSubjectByDay: Object.fromEntries(working_days.map((d) => [d, null])) as Record<string, string | null>,
      steps: 0,
    };

    const cells: Array<{ day: string; period: number }> = [];
    for (const day of working_days) {
      for (let p = 1; p <= periods_per_day; p++) cells.push({ day, period: p });
    }

    const success = backtrack(cells, 0, subjectList, subjectMeta(subjectList), teacherBlocked, roomBlocked, teacherLimits, state);
    if (!success) {
      throw new ConflictException(
        'Could not generate a conflict-free timetable with these constraints. Try reducing overlapping teacher assignments or adjusting periods_per_week.',
      );
    }

    if (overwrite) {
      await this.prisma.timetableSlot.deleteMany({ where: { branchId, classId: class_id } });
    }

    await this.prisma.$transaction(
      state.assignments.map((a) =>
        this.prisma.timetableSlot.upsert({
          where: {
            classId_dayOfWeek_periodNumber: {
              classId: class_id,
              dayOfWeek: a.day,
              periodNumber: a.period,
            },
          },
          create: {
            branchId,
            classId: class_id,
            dayOfWeek: a.day,
            periodNumber: a.period,
            subject: a.subject,
            teacherId: a.teacher_id,
            roomId: a.room_id ?? null,
          },
          update: { subject: a.subject, teacherId: a.teacher_id, roomId: a.room_id ?? null },
        }),
      ),
    );

    return { generated: state.assignments.length, timetable: state.assignments };
  }

  // ─── Shared substitution engine ──────────────────────────────

  private async assignSubstitute(args: {
    branchId: string;
    date: string;
    dow: string;
    classId: string;
    periodNumber: number;
    originalTeacherId?: string;
    reason?: string;
    createdBy: string;
  }): Promise<{ assigned_to?: { id: string; name: string }; substitution_id?: string; error?: string }> {
    const { branchId, date, dow, classId, periodNumber, originalTeacherId, reason, createdBy } = args;

    const busySubs = await this.prisma.substitution.findMany({
      where: { branchId, date, periodNumber },
      select: { substituteTeacherId: true },
    });
    const busyPrimary = await this.prisma.timetableSlot.findMany({
      where: { branchId, dayOfWeek: dow, periodNumber },
      select: { teacherId: true },
    });

    const busyIds = new Set<string>([
      ...busySubs.map((s) => s.substituteTeacherId),
      ...busyPrimary.map((s) => s.teacherId),
    ]);
    if (originalTeacherId) busyIds.add(originalTeacherId);

    const available = await this.prisma.staff.findFirst({
      where: {
        branchId,
        role: 'Teacher',
        isActive: true,
        id: { notIn: [...busyIds] },
      },
      select: { id: true, name: true },
    });

    if (!available) return { error: 'No available teacher found for this period.' };

    const existing = await this.prisma.substitution.findUnique({
      where: {
        date_classId_periodNumber: { date, classId, periodNumber },
      },
    });

    const saved = await this.prisma.substitution.upsert({
      where: { date_classId_periodNumber: { date, classId, periodNumber } },
      create: {
        branchId,
        date,
        classId,
        periodNumber,
        originalTeacherId: originalTeacherId ?? null,
        substituteTeacherId: available.id,
        reason: reason ?? 'Manual Substitution',
        createdBy,
      },
      update: {
        substituteTeacherId: available.id,
        reason: reason ?? 'Manual Substitution',
      },
    });

    return { substitution_id: saved.id, assigned_to: available };
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function dayOfWeek(dateStr: string): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(dateStr).getDay()] ?? 'Mon';
}

type SubjectMeta = {
  teacher_id: string;
  name: string;
  room_id?: string;
  double_periods: boolean;
};

function subjectMeta(list: GenerateSlotInput[]): Record<string, SubjectMeta> {
  const map: Record<string, SubjectMeta> = {};
  for (const s of list) {
    map[s.name] = {
      teacher_id: s.teacher_id,
      name: s.name,
      room_id: s.room_id || undefined,
      double_periods: !!s.double_periods,
    };
  }
  return map;
}

function backtrack(
  cells: Array<{ day: string; period: number }>,
  index: number,
  subjectList: GenerateSlotInput[],
  meta: Record<string, SubjectMeta>,
  teacherBlocked: Record<string, Record<number, Set<string>>>,
  roomBlocked: Record<string, Record<number, Set<string>>>,
  teacherLimits: Map<string, number>,
  state: {
    remaining: Record<string, number>;
    assignments: Array<{ day: string; period: number; subject: string; teacher_id: string; room_id?: string }>;
    teacherDayLoad: Record<string, Record<string, number>>;
    lastSubjectByDay: Record<string, string | null>;
    steps: number;
  },
): boolean {
  state.steps++;
  if (state.steps > 50_000) return false;

  let curr = index;
  while (curr < cells.length) {
    const { day, period } = cells[curr];
    if (!state.assignments.some((a) => a.day === day && a.period === period)) break;
    curr++;
  }
  if (curr === cells.length) {
    return Object.values(state.remaining).every((v) => v === 0);
  }

  const { day, period } = cells[curr];
  const candidates = Object.keys(state.remaining)
    .filter((s) => state.remaining[s] > 0)
    .sort((a, b) => state.remaining[b] - state.remaining[a]);

  for (const subj of candidates) {
    const m = meta[subj];
    const limit = teacherLimits.get(m.teacher_id) ?? 6;
    const load = state.teacherDayLoad[m.teacher_id]?.[day] ?? 0;
    const isDouble = m.double_periods && state.remaining[subj] >= 2;

    if (isDouble) {
      const nextPeriod = period + 1;
      if (!cells.some((c) => c.day === day && c.period === nextPeriod)) continue;
      if (teacherBlocked[day]?.[period]?.has(m.teacher_id) || teacherBlocked[day]?.[nextPeriod]?.has(m.teacher_id)) continue;
      if (m.room_id && (roomBlocked[day]?.[period]?.has(m.room_id) || roomBlocked[day]?.[nextPeriod]?.has(m.room_id))) continue;
      if (load + 2 > limit) continue;
      if (state.lastSubjectByDay[day] === subj) continue;

      state.assignments.push({ day, period, subject: subj, teacher_id: m.teacher_id, room_id: m.room_id });
      state.assignments.push({ day, period: nextPeriod, subject: subj, teacher_id: m.teacher_id, room_id: m.room_id });
      state.remaining[subj] -= 2;
      teacherBlocked[day][period].add(m.teacher_id);
      teacherBlocked[day][nextPeriod].add(m.teacher_id);
      if (m.room_id) {
        roomBlocked[day][period].add(m.room_id);
        roomBlocked[day][nextPeriod].add(m.room_id);
      }
      state.teacherDayLoad[m.teacher_id][day] = load + 2;
      const prevLast = state.lastSubjectByDay[day];
      state.lastSubjectByDay[day] = subj;

      if (backtrack(cells, curr + 1, subjectList, meta, teacherBlocked, roomBlocked, teacherLimits, state)) return true;

      state.assignments.pop();
      state.assignments.pop();
      state.remaining[subj] += 2;
      teacherBlocked[day][period].delete(m.teacher_id);
      teacherBlocked[day][nextPeriod].delete(m.teacher_id);
      if (m.room_id) {
        roomBlocked[day][period].delete(m.room_id);
        roomBlocked[day][nextPeriod].delete(m.room_id);
      }
      state.teacherDayLoad[m.teacher_id][day] = load;
      state.lastSubjectByDay[day] = prevLast;
    } else {
      if (teacherBlocked[day]?.[period]?.has(m.teacher_id)) continue;
      if (m.room_id && roomBlocked[day]?.[period]?.has(m.room_id)) continue;
      if (load >= limit) continue;
      if (state.lastSubjectByDay[day] === subj) continue;

      state.assignments.push({ day, period, subject: subj, teacher_id: m.teacher_id, room_id: m.room_id });
      state.remaining[subj]--;
      teacherBlocked[day][period].add(m.teacher_id);
      if (m.room_id) roomBlocked[day][period].add(m.room_id);
      state.teacherDayLoad[m.teacher_id][day] = load + 1;
      const prevLast = state.lastSubjectByDay[day];
      state.lastSubjectByDay[day] = subj;

      if (backtrack(cells, curr + 1, subjectList, meta, teacherBlocked, roomBlocked, teacherLimits, state)) return true;

      state.assignments.pop();
      state.remaining[subj]++;
      teacherBlocked[day][period].delete(m.teacher_id);
      if (m.room_id) roomBlocked[day][period].delete(m.room_id);
      state.teacherDayLoad[m.teacher_id][day] = load;
      state.lastSubjectByDay[day] = prevLast;
    }
  }

  return false;
}
