import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { buildPdf, PdfBlock, sendPdf } from '../common/pdf';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE, isPortalRole } from '../auth/roles';
import { AuthUser, ReqWithUser, assertInBranch, audit, currentStaffId, portalStudentIds, teacherClassIds } from '../common/access';
import { SubstitutionService } from './substitution.service';
import { DAY_ORDER, WEEK_DAYS, classLabel, dayOfWeek, periodOut, sortPeriods, todayISO, weekDates } from './timetable.util';
import {
  AssignSubstitutionDto, CreateTeacherDto, GenerateDto, GenerateSubjectDto, RoomDto, SavePeriodsDto, ScheduleExamDto,
  SubstituteDto, SubstitutionRequestDto, TeacherAbsentDto, UpdateRoomDto, UpdateTeacherDto, UpsertSlotDto,
} from './dto/timetable.dto';

/** Class timetables are readable by staff and by the portal (own child's / own class only). */
const CLASS_READ: string[] = [...R.ACADEMIC_STAFF, ROLE.PARENT, ROLE.STUDENT];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('timetable')
@UseGuards(AuthGuard, RolesGuard)
export class TimetableController {
  constructor(private prisma: PrismaService, private subs: SubstitutionService) {}

  // ─── Access helpers ──────────────────────────────────────────

  /** Staff: class must be in their school. Portal: class must be their child's / their own. */
  private async assertCanSeeClass(user: AuthUser, classId: string) {
    await assertInBranch(this.prisma, 'class', classId, user.branch_id);
    if (!isPortalRole(user.role)) {
      const tIds = await teacherClassIds(this.prisma, user);
      if (tIds && !tIds.includes(classId)) throw new ForbiddenException('You can only view timetables for classes assigned to you');
      return;
    }
    const allowed = await this.portalClassIds(user);
    if (!allowed.includes(classId)) throw new ForbiddenException('You can only view your own class timetable');
  }

  private async portalClassIds(user: AuthUser): Promise<string[]> {
    const ids = (await portalStudentIds(this.prisma, user)) ?? [];
    const students = await this.prisma.student.findMany({
      where: { id: { in: ids }, branchId: user.branch_id }, select: { classId: true },
    });
    return [...new Set(students.map((s) => s.classId).filter((c): c is string => !!c))];
  }

  /** The whole bell schedule (breaks included) in the order the day runs — by start time. */
  private async teachingPeriods(branchId: string) {
    return sortPeriods(await this.prisma.periodConfig.findMany({ where: { branchId }, orderBy: { periodNumber: 'asc' } }));
  }

  // ─── Classes (role-aware list for the timetable screens) ─────

  @Get('classes')
  @Roles(...CLASS_READ)
  async classes(@Req() req: ReqWithUser) {
    const portal = isPortalRole(req.user.role) ? await this.portalClassIds(req.user) : await teacherClassIds(this.prisma, req.user);
    return this.prisma.class.findMany({
      where: { branchId: req.user.branch_id, ...(portal ? { id: { in: portal } } : {}) },
      orderBy: [{ name: 'asc' }, { section: 'asc' }],
      select: { id: true, name: true, section: true },
    });
  }

  // ─── Teachers ────────────────────────────────────────────────

  /**
   * Teachers plus the classes each one actually stands in front of. The timetable slots
   * give the (class, subject) pairs, so the teacher cards can show "Maths · Class 10 A"
   * rather than only the free-text `subjects` field.
   */
  @Get('teachers')
  @Roles(...R.ACADEMIC_STAFF)
  async listTeachers(@Req() req: ReqWithUser) {
    const branchId = req.user.branch_id;
    const teachers = await this.prisma.staff.findMany({
      where: { branchId, role: 'Teacher' },
      orderBy: { name: 'asc' },
    });
    if (teachers.length === 0) return teachers.map((t) => ({ ...t, classes: [] }));

    const slots = await this.prisma.timetableSlot.findMany({
      where: { branchId, teacherId: { in: teachers.map((t) => t.id) } },
      select: { teacherId: true, subject: true, class: { select: { id: true, name: true, section: true } } },
    });
    const load = new Map<string, { class_id: string; class_label: string; subject: string }[]>();
    for (const s of slots) {
      const list = load.get(s.teacherId) ?? [];
      if (list.some((e) => e.class_id === s.class.id && e.subject === s.subject)) continue;
      list.push({
        class_id: s.class.id,
        class_label: `${s.class.name}${s.class.section ? ` ${s.class.section}` : ''}`,
        subject: s.subject,
      });
      load.set(s.teacherId, list);
    }
    return teachers.map((t) => ({ ...t, classes: load.get(t.id) ?? [] }));
  }

  @Post('teachers')
  @Roles(...R.ADMINS)
  async createTeacher(@Req() req: ReqWithUser, @Body() body: CreateTeacherDto) {
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
  @Roles(...R.TIMETABLE_ADMIN)
  async updateTeacher(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: UpdateTeacherDto) {
    const res = await this.prisma.staff.updateMany({
      where: { id, branchId: req.user.branch_id, role: 'Teacher' },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.subjects !== undefined && { subjects: body.subjects }),
        ...(body.max_periods_per_day !== undefined && { maxPeriodsPerDay: body.max_periods_per_day }),
        ...(body.is_active !== undefined && { isActive: body.is_active }),
      },
    });
    if (res.count === 0) throw new NotFoundException('teacher not found');
    return { success: true };
  }

  // ─── Rooms ───────────────────────────────────────────────────

  @Get('rooms')
  @Roles(...R.ACADEMIC_STAFF)
  listRooms(@Req() req: ReqWithUser) {
    return this.prisma.academicRoom.findMany({ where: { branchId: req.user.branch_id }, orderBy: { name: 'asc' } });
  }

  @Post('rooms')
  @Roles(...R.TIMETABLE_ADMIN)
  async createRoom(@Req() req: ReqWithUser, @Body() body: RoomDto) {
    const room = await this.prisma.academicRoom.create({
      data: { branchId: req.user.branch_id, name: body.name, type: body.type, capacity: body.capacity ?? 40 },
    });
    return { id: room.id };
  }

  @Put('rooms/:id')
  @Roles(...R.TIMETABLE_ADMIN)
  async updateRoom(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: UpdateRoomDto) {
    const res = await this.prisma.academicRoom.updateMany({
      where: { id, branchId: req.user.branch_id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.capacity !== undefined && { capacity: body.capacity }),
      },
    });
    if (res.count === 0) throw new NotFoundException('room not found');
    return { success: true };
  }

  @Delete('rooms/:id')
  @Roles(...R.TIMETABLE_ADMIN)
  async deleteRoom(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.prisma.academicRoom.deleteMany({ where: { id, branchId: req.user.branch_id } });
    return { success: true };
  }

  // ─── Period configs ──────────────────────────────────────────

  @Get('periods')
  @Roles(...CLASS_READ)
  listPeriods(@Req() req: ReqWithUser) {
    return this.teachingPeriods(req.user.branch_id);
  }

  @Post('periods')
  @Roles(...R.TIMETABLE_ADMIN)
  async savePeriods(@Req() req: ReqWithUser, @Body() body: SavePeriodsDto) {
    const nums = body.periods.map((p) => p.period_number);
    if (new Set(nums).size !== nums.length) throw new BadRequestException('period_number values must be unique');
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
  @Roles(...R.ACADEMIC_STAFF)
  async listExamSchedules(@Req() req: ReqWithUser) {
    const schedules = await this.prisma.examSchedule.findMany({
      where: { branchId: req.user.branch_id },
      include: { exam: { select: { name: true } }, room: { select: { name: true } }, invigilator: { select: { name: true } } },
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
  @Roles(...R.TIMETABLE_ADMIN)
  async scheduleExam(@Req() req: ReqWithUser, @Body() body: ScheduleExamDto) {
    const { exam_id, date, period_number, room_id, invigilator_id, subject } = body;
    const branchId = req.user.branch_id;
    await assertInBranch(this.prisma, 'exam', exam_id, branchId);
    await assertInBranch(this.prisma, 'academicRoom', room_id, branchId);
    await assertInBranch(this.prisma, 'staff', invigilator_id, branchId);

    if (invigilator_id) {
      const clash = await this.prisma.examSchedule.findFirst({
        where: { branchId, date, periodNumber: period_number, invigilatorId: invigilator_id },
      });
      if (clash) throw new ConflictException('Teacher is already assigned as an invigilator for another room during this period.');
    }
    if (room_id) {
      const clash = await this.prisma.examSchedule.findFirst({
        where: { branchId, date, periodNumber: period_number, roomId: room_id },
      });
      if (clash) throw new ConflictException('Room is already assigned to another exam during this period.');
    }

    const schedule = await this.prisma.examSchedule.create({
      data: {
        branchId, examId: exam_id, date, periodNumber: period_number,
        roomId: room_id ?? null, invigilatorId: invigilator_id ?? null, subject,
      },
    });
    return { id: schedule.id };
  }

  @Delete('exams/schedule/:id')
  @Roles(...R.TIMETABLE_ADMIN)
  async deleteExamSchedule(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.prisma.examSchedule.deleteMany({ where: { id, branchId: req.user.branch_id } });
    return { success: true };
  }

  // ─── Teacher absence → bulk auto-substitution ────────────────

  @Post('teachers/:id/absent')
  @Roles(...R.TIMETABLE_ADMIN)
  async markTeacherAbsent(@Req() req: ReqWithUser, @Param('id') teacherId: string, @Body() body: TeacherAbsentDto) {
    const { date } = body;
    const branchId = req.user.branch_id;
    await assertInBranch(this.prisma, 'staff', teacherId, branchId);

    const slots = await this.prisma.timetableSlot.findMany({
      where: { branchId, teacherId, dayOfWeek: dayOfWeek(date) },
      orderBy: { periodNumber: 'asc' },
    });
    // Periods that already have cover keep it; open requests get filled.
    const existing = await this.prisma.substitution.findMany({
      where: { branchId, date, status: 'Assigned' },
      select: { classId: true, periodNumber: true },
    });
    const covered = new Set(existing.map((s) => `${s.classId}:${s.periodNumber}`));
    const affected = slots.filter((s) => !covered.has(`${s.classId}:${s.periodNumber}`));

    if (affected.length === 0) {
      return { message: 'No unsubstituted periods found for this teacher on that day.', substitutions: [] };
    }

    const results = [];
    for (const slot of affected) {
      try {
        const r = await this.subs.assignCover({
          branchId, date, classId: slot.classId, periodNumber: slot.periodNumber,
          originalTeacherId: teacherId, reason: body.reason ?? 'Teacher Absent', createdBy: req.user.sub,
        });
        results.push({ class_id: slot.classId, period_number: slot.periodNumber, ...r });
      } catch (e) {
        if (!(e instanceof ConflictException)) throw e;
        results.push({ class_id: slot.classId, period_number: slot.periodNumber, error: e.message });
      }
    }
    return { substitutions: results };
  }

  // ─── Class views ─────────────────────────────────────────────

  @Get('master/:classId')
  @Roles(...CLASS_READ)
  async master(@Req() req: ReqWithUser, @Param('classId') classId: string) {
    await this.assertCanSeeClass(req.user, classId);
    const slots = await this.prisma.timetableSlot.findMany({
      where: { branchId: req.user.branch_id, classId },
      include: { teacher: { select: { name: true } }, room: { select: { name: true } } },
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
      .sort((a, b) => (DAY_ORDER[a.day_of_week] ?? 99) - (DAY_ORDER[b.day_of_week] ?? 99) || a.period_number - b.period_number);
  }

  @Get('today/:classId')
  @Roles(...CLASS_READ)
  async today(@Req() req: ReqWithUser, @Param('classId') classId: string, @Query('date') dateQ?: string) {
    await this.assertCanSeeClass(req.user, classId);
    const date = dateQ && ISO_DATE.test(dateQ) ? dateQ : todayISO();
    const dow = dayOfWeek(date);

    const [slots, subs] = await Promise.all([
      this.prisma.timetableSlot.findMany({
        where: { branchId: req.user.branch_id, classId, dayOfWeek: dow },
        include: { teacher: { select: { name: true } }, room: { select: { name: true } } },
        orderBy: { periodNumber: 'asc' },
      }),
      this.prisma.substitution.findMany({
        where: { branchId: req.user.branch_id, classId, date, status: { in: ['Assigned', 'Requested'] } },
        include: { substitute: { select: { id: true, name: true } }, room: { select: { name: true } } },
      }),
    ]);
    const subMap = new Map(subs.map((s) => [s.periodNumber, s]));

    const periods = await this.teachingPeriods(req.user.branch_id);
    const cfg = new Map(periods.map((p) => [p.periodNumber, p]));
    const order = new Map(periods.map((p, i) => [p.periodNumber, i]));
    slots.sort((a, b) => (order.get(a.periodNumber) ?? 99 + a.periodNumber) - (order.get(b.periodNumber) ?? 99 + b.periodNumber));
    return {
      date,
      day: dow,
      /** Full bell schedule incl. breaks (Short Break, Lunch Break…), in time order. */
      periods: periods.map(periodOut),
      schedule: slots.map((s) => {
        const sub = subMap.get(s.periodNumber);
        return {
          id: s.id,
          period_number: s.periodNumber,
          start_time: cfg.get(s.periodNumber)?.startTime ?? null,
          end_time: cfg.get(s.periodNumber)?.endTime ?? null,
          subject: s.subject,
          teacher_id: s.teacherId,
          teacher_name: s.teacher.name,
          room_id: s.roomId,
          room_name: s.room?.name ?? null,
          cover_requested: sub?.status === 'Requested',
          substitution:
            sub && sub.status === 'Assigned'
              ? { substitute_name: sub.substitute.name, substitute_id: sub.substitute.id, reason: sub.reason, room_name: sub.room?.name ?? null }
              : null,
        };
      }),
    };
  }

  @Get('school-view')
  @Roles(...R.ACADEMIC_STAFF)
  async schoolView(@Req() req: ReqWithUser, @Query('date') dateQ?: string) {
    const date = dateQ && ISO_DATE.test(dateQ) ? dateQ : todayISO();
    const dow = dayOfWeek(date);

    const [slots, subs] = await Promise.all([
      this.prisma.timetableSlot.findMany({
        where: { branchId: req.user.branch_id, dayOfWeek: dow },
        include: { teacher: { select: { name: true } }, class: { select: { id: true, name: true } }, room: { select: { name: true } } },
        orderBy: { periodNumber: 'asc' },
      }),
      this.prisma.substitution.findMany({
        where: { branchId: req.user.branch_id, date, status: 'Assigned' },
        include: { substitute: { select: { id: true, name: true } }, original: { select: { name: true } }, room: { select: { name: true } } },
      }),
    ]);
    const subMap = new Map(subs.map((s) => [`${s.classId}:${s.periodNumber}`, s]));

    const grouped: Record<string, { class_id: string; class_name: string; periods: unknown[] }> = {};
    for (const s of slots) {
      if (!grouped[s.classId]) grouped[s.classId] = { class_id: s.classId, class_name: s.class.name, periods: [] };
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

  // ─── Printable timetables (server-side PDF) ──────────────────

  /**
   * Class week as a PDF: a Mon–Sat grid with times and every break row (Short Break,
   * Lunch Break…) in bell order, then a per-day list with teacher and room.
   * Parents / students: own (child's) class only — 403 otherwise.
   */
  @Get('class/:classId/pdf')
  @Roles(...CLASS_READ)
  async classPdf(@Req() req: ReqWithUser, @Param('classId') classId: string, @Res() res: Response) {
    await this.assertCanSeeClass(req.user, classId);
    const branchId = req.user.branch_id;
    const [cls, branch, periods, slots] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: classId, branchId }, select: { name: true, section: true, classTeacher: { select: { name: true } } } }),
      this.prisma.branch.findUnique({ where: { id: branchId }, select: { name: true, location: true } }),
      this.teachingPeriods(branchId),
      this.prisma.timetableSlot.findMany({
        where: { branchId, classId },
        include: { teacher: { select: { name: true } }, room: { select: { name: true } } },
      }),
    ]);
    if (!cls) throw new NotFoundException('class not found');
    const at = new Map(slots.map((s) => [`${s.dayOfWeek}|${s.periodNumber}`, s]));
    const name = classLabel(cls);
    const buf = await buildPdf({
      school: branch?.name ?? 'School',
      schoolLine: branch?.location ?? undefined,
      title: `Class timetable - ${name}`,
      reference: `Printed ${todayISO()}`,
      blocks: [
        { kind: 'fields', rows: [['Class', name], ['Class teacher', cls.classTeacher?.name ?? '-']] },
        ...weekPdfBlocks(periods, (day, n) => at.get(`${day}|${n}`)?.subject ?? null,
          (day, n) => {
            const s = at.get(`${day}|${n}`);
            return s ? [s.subject, s.teacher.name, s.room?.name ?? '-'] : null;
          }, ['Subject', 'Teacher', 'Room']),
      ],
    });
    await audit(this.prisma, req.user, 'EXPORT', 'timetable', classId, 'class pdf');
    return sendPdf(res, buf, `timetable-${name}.pdf`);
  }

  /** Teacher week as a PDF. A teacher may print only their own; timetable admins any teacher. */
  @Get('teacher/:staffId/pdf')
  @Roles(...R.ACADEMIC_STAFF)
  async teacherPdf(@Req() req: ReqWithUser, @Param('staffId') staffId: string, @Res() res: Response) {
    const branchId = req.user.branch_id;
    const teacher = await this.prisma.staff.findFirst({ where: { id: staffId, branchId }, select: { id: true, name: true, subjects: true } });
    if (!teacher) throw new NotFoundException('teacher not found');
    if (!(R.TIMETABLE_ADMIN as string[]).includes(req.user.role)) {
      const me = await currentStaffId(this.prisma, req.user);
      if (me !== staffId) throw new ForbiddenException('You can only download your own timetable');
    }
    const [branch, periods, slots] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: branchId }, select: { name: true, location: true } }),
      this.teachingPeriods(branchId),
      this.prisma.timetableSlot.findMany({
        where: { branchId, teacherId: staffId },
        include: { class: { select: { name: true, section: true } }, room: { select: { name: true } } },
      }),
    ]);
    const at = new Map(slots.map((s) => [`${s.dayOfWeek}|${s.periodNumber}`, s]));
    const buf = await buildPdf({
      school: branch?.name ?? 'School',
      schoolLine: branch?.location ?? undefined,
      title: `Teacher timetable - ${teacher.name}`,
      reference: `Printed ${todayISO()}`,
      blocks: [
        { kind: 'fields', rows: [['Teacher', teacher.name], ['Lessons per week', slots.length]] },
        ...weekPdfBlocks(periods, (day, n) => {
          const s = at.get(`${day}|${n}`);
          return s ? `${classLabel(s.class)}` : null;
        }, (day, n) => {
          const s = at.get(`${day}|${n}`);
          return s ? [classLabel(s.class), s.subject, s.room?.name ?? '-'] : null;
        }, ['Class', 'Subject', 'Room']),
      ],
    });
    await audit(this.prisma, req.user, 'EXPORT', 'timetable', staffId, 'teacher pdf');
    return sendPdf(res, buf, `timetable-${teacher.name}.pdf`);
  }

  // ─── Teacher views ───────────────────────────────────────────

  /** Weekly grid for one teacher: regular lessons, plus covers they take / hand over in that week. */
  @Get('teacher/:staffId/week')
  @Roles(...R.ACADEMIC_STAFF)
  async teacherWeek(@Req() req: ReqWithUser, @Param('staffId') staffId: string, @Query('date') dateQ?: string) {
    const branchId = req.user.branch_id;
    const teacher = await this.prisma.staff.findFirst({
      where: { id: staffId, branchId }, select: { id: true, name: true, maxPeriodsPerDay: true, subjects: true },
    });
    if (!teacher) throw new NotFoundException('teacher not found');
    const anchor = dateQ && ISO_DATE.test(dateQ) ? dateQ : todayISO();
    const dates = weekDates(anchor);

    const [slots, covers, handedOver] = await Promise.all([
      this.prisma.timetableSlot.findMany({
        where: { branchId, teacherId: staffId },
        include: { class: { select: { name: true, section: true } }, room: { select: { name: true } } },
      }),
      this.prisma.substitution.findMany({
        where: { branchId, substituteTeacherId: staffId, status: 'Assigned', date: { in: dates } },
        include: { class: { select: { name: true, section: true } }, original: { select: { name: true } } },
      }),
      this.prisma.substitution.findMany({
        where: { branchId, originalTeacherId: staffId, date: { in: dates }, status: { in: ['Assigned', 'Requested'] } },
        include: { class: { select: { name: true, section: true } }, substitute: { select: { name: true } } },
      }),
    ]);
    const subjectAt = new Map(slots.map((s) => [`${s.classId}|${s.dayOfWeek}|${s.periodNumber}`, s.subject]));
    const periods = await this.teachingPeriods(branchId);

    return {
      teacher: { id: teacher.id, name: teacher.name, max_periods: teacher.maxPeriodsPerDay, subjects: teacher.subjects },
      week: { from: dates[0], to: dates[6], dates },
      /** Full bell schedule incl. breaks, in time order. */
      periods: periods.map(periodOut),
      slots: slots
        .map((s) => ({
          day_of_week: s.dayOfWeek,
          period_number: s.periodNumber,
          subject: s.subject,
          class_id: s.classId,
          class_name: classLabel(s.class),
          room_name: s.room?.name ?? null,
        }))
        .sort((a, b) => (DAY_ORDER[a.day_of_week] ?? 99) - (DAY_ORDER[b.day_of_week] ?? 99) || a.period_number - b.period_number),
      covers: covers.map((c) => ({
        id: c.id,
        date: c.date,
        day_of_week: dayOfWeek(c.date),
        period_number: c.periodNumber,
        class_id: c.classId,
        class_name: classLabel(c.class),
        subject: subjectAt.get(`${c.classId}|${dayOfWeek(c.date)}|${c.periodNumber}`) ?? null,
        original_teacher_name: c.original?.name ?? null,
        reason: c.reason,
      })),
      handed_over: handedOver.map((c) => ({
        id: c.id,
        date: c.date,
        day_of_week: dayOfWeek(c.date),
        period_number: c.periodNumber,
        class_id: c.classId,
        class_name: classLabel(c.class),
        status: c.status,
        substitute_name: c.status === 'Assigned' ? c.substitute.name : null,
      })),
    };
  }

  /**
   * The logged-in teacher's day: every configured period, marked as a lesson, a
   * cover they were assigned, one of their own lessons handed to a substitute
   * (`relieved` — it is off their plate), a break, or free.
   */
  @Get('me/today')
  @Roles(...R.ACADEMIC_STAFF)
  async myDay(@Req() req: ReqWithUser, @Query('date') dateQ?: string) {
    const branchId = req.user.branch_id;
    const staffId = await currentStaffId(this.prisma, req.user);
    if (!staffId) throw new NotFoundException('No staff profile is linked to this login');
    const date = dateQ && ISO_DATE.test(dateQ) ? dateQ : todayISO();
    const dow = dayOfWeek(date);

    const [staff, periods, slots, covers, mine] = await Promise.all([
      this.prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, name: true, maxPeriodsPerDay: true } }),
      this.teachingPeriods(branchId),
      this.prisma.timetableSlot.findMany({
        where: { branchId, teacherId: staffId, dayOfWeek: dow },
        include: { class: { select: { name: true, section: true } }, room: { select: { name: true } } },
      }),
      this.prisma.substitution.findMany({
        where: { branchId, date, substituteTeacherId: staffId, status: 'Assigned' },
        include: { class: { select: { name: true, section: true } }, original: { select: { name: true } }, room: { select: { name: true } } },
      }),
      this.prisma.substitution.findMany({
        where: { branchId, date, originalTeacherId: staffId },
        include: { substitute: { select: { name: true } } },
      }),
    ]);

    type Entry = {
      period_number: number; start_time: string | null; end_time: string | null;
      kind: 'lesson' | 'cover' | 'relieved' | 'break' | 'free';
      subject: string | null; class_id: string | null; class_name: string | null; room_name: string | null;
      note: string | null; substitution_id: string | null;
    };
    const entries: Entry[] = [];
    const cfg = new Map(periods.map((p) => [p.periodNumber, p]));
    // Bell-schedule order (by start time, breaks in place), then any unconfigured period numbers.
    const extra = [...new Set([...slots.map((s) => s.periodNumber), ...covers.map((c) => c.periodNumber)])]
      .filter((n) => !cfg.has(n)).sort((a, b) => a - b);
    const nums = [...periods.map((p) => p.periodNumber), ...extra];

    for (const n of nums) {
      const p = cfg.get(n);
      const base = { period_number: n, start_time: p?.startTime ?? null, end_time: p?.endTime ?? null };
      const lesson = slots.find((s) => s.periodNumber === n);
      const cover = covers.find((c) => c.periodNumber === n);
      if (lesson) {
        const handed = mine.find((m) => m.classId === lesson.classId && m.periodNumber === n);
        const relieved = handed?.status === 'Assigned';
        entries.push({
          ...base,
          kind: relieved ? 'relieved' : 'lesson',
          subject: lesson.subject, class_id: lesson.classId, class_name: classLabel(lesson.class), room_name: lesson.room?.name ?? null,
          note: relieved
            ? `Covered by ${handed!.substitute.name} — you are not teaching this period`
            : handed?.status === 'Requested'
              ? 'Cover requested — awaiting assignment'
              : handed?.status === 'Cancelled'
                ? 'Cover request cancelled — teach as normal'
                : null,
          substitution_id: handed?.id ?? null,
        });
      }
      if (cover) {
        const subj = await this.prisma.timetableSlot.findFirst({
          where: { branchId, classId: cover.classId, dayOfWeek: dow, periodNumber: n }, select: { subject: true },
        });
        entries.push({
          ...base, kind: 'cover',
          subject: subj?.subject ?? null, class_id: cover.classId, class_name: classLabel(cover.class),
          room_name: cover.room?.name ?? null,
          note: `Substitution${cover.original ? ` for ${cover.original.name}` : ''}${cover.reason ? ` — ${cover.reason}` : ''}`,
          substitution_id: cover.id,
        });
      }
      if (!lesson && !cover) {
        entries.push({
          ...base, kind: p?.isBreak ? 'break' : 'free',
          subject: null, class_id: null, class_name: null, room_name: null,
          note: p?.isBreak ? (p.breakName ?? 'Break') : null, substitution_id: null,
        });
      }
    }

    return {
      date,
      day: dow,
      staff: staff ? { id: staff.id, name: staff.name, max_periods: staff.maxPeriodsPerDay } : null,
      schedule: entries,
      counts: {
        lessons: entries.filter((e) => e.kind === 'lesson').length,
        covers: entries.filter((e) => e.kind === 'cover').length,
        relieved: entries.filter((e) => e.kind === 'relieved').length,
      },
    };
  }

  // ─── Substitutions ───────────────────────────────────────────

  @Get('substitutions')
  @Roles(...R.ACADEMIC_STAFF)
  async listSubstitutions(@Req() req: ReqWithUser, @Query('date') dateQ?: string, @Query('status') status?: string) {
    const date = dateQ && ISO_DATE.test(dateQ) ? dateQ : todayISO();
    const subs = await this.prisma.substitution.findMany({
      where: { branchId: req.user.branch_id, date, ...(status ? { status } : {}) },
      include: {
        class: { select: { name: true, section: true } },
        original: { select: { name: true } },
        substitute: { select: { name: true } },
      },
      orderBy: [{ periodNumber: 'asc' }],
    });
    return subs.map((s) => ({
      id: s.id,
      date: s.date,
      class_id: s.classId,
      class_name: classLabel(s.class),
      period_number: s.periodNumber,
      original_teacher_id: s.originalTeacherId,
      original_teacher_name: s.original?.name ?? null,
      // A Requested row has no substitute yet (the column is non-null, so it holds the requester).
      substitute_teacher_id: s.status === 'Requested' ? null : s.substituteTeacherId,
      substitute_name: s.status === 'Requested' ? null : s.substitute.name,
      reason: s.reason,
      status: s.status,
    }));
  }

  /** Free teachers for a class period, least loaded first, with conflict reasons for the rest. */
  @Get('substitutions/suggest')
  @Roles(...R.TIMETABLE_ADMIN)
  async suggest(
    @Req() req: ReqWithUser,
    @Query('date') date?: string,
    @Query('class_id') classId?: string,
    @Query('period') periodQ?: string,
  ) {
    const period = Number(periodQ);
    if (!date || !ISO_DATE.test(date) || !classId || !Number.isInteger(period) || period < 1) {
      throw new BadRequestException('date (YYYY-MM-DD), class_id and period are required');
    }
    await assertInBranch(this.prisma, 'class', classId, req.user.branch_id);
    const slot = await this.prisma.timetableSlot.findFirst({
      where: { branchId: req.user.branch_id, classId, dayOfWeek: dayOfWeek(date), periodNumber: period },
      include: { teacher: { select: { id: true, name: true } } },
    });
    const existing = await this.prisma.substitution.findUnique({
      where: { date_classId_periodNumber: { date, classId, periodNumber: period } }, select: { id: true },
    });
    const candidates = await this.subs.evaluate(req.user.branch_id, date, period, {
      exclude: slot ? [slot.teacherId] : [], excludeSubId: existing?.id,
    });
    return {
      date,
      class_id: classId,
      period_number: period,
      lesson: slot ? { subject: slot.subject, teacher_id: slot.teacher.id, teacher_name: slot.teacher.name } : null,
      candidates,
    };
  }

  /** A teacher (for their own lesson) or HOD/admin (any lesson) asks for cover. */
  @Post('substitutions/request')
  @Roles(...R.TEACHING)
  async requestCover(@Req() req: ReqWithUser, @Body() body: SubstitutionRequestDto) {
    const branchId = req.user.branch_id;
    const { date, class_id, period_number, reason } = body;
    await assertInBranch(this.prisma, 'class', class_id, branchId);
    const period = await this.prisma.periodConfig.findFirst({ where: { branchId, periodNumber: period_number } });
    if (period?.isBreak) throw new BadRequestException(`Period ${period_number} is a break`);
    const slot = await this.prisma.timetableSlot.findFirst({
      where: { branchId, classId: class_id, dayOfWeek: dayOfWeek(date), periodNumber: period_number },
    });
    if (!slot) throw new NotFoundException('No lesson is scheduled for this class and period on that day');

    if (!(R.TIMETABLE_ADMIN as string[]).includes(req.user.role)) {
      const me = await currentStaffId(this.prisma, req.user);
      if (!me || me !== slot.teacherId) throw new ForbiddenException('You can only request cover for your own lessons');
    }

    const existing = await this.prisma.substitution.findUnique({
      where: { date_classId_periodNumber: { date, classId: class_id, periodNumber: period_number } },
    });
    if (existing && existing.status !== 'Cancelled') {
      throw new ConflictException(`Cover for this period is already ${existing.status.toLowerCase()}`);
    }
    const data = {
      originalTeacherId: slot.teacherId,
      substituteTeacherId: slot.teacherId, // placeholder until assigned — the column is NOT NULL
      reason,
      status: 'Requested',
      createdBy: req.user.sub,
    };
    const saved = existing
      ? await this.prisma.substitution.update({ where: { id: existing.id }, data })
      : await this.prisma.substitution.create({
          data: { ...data, branchId, date, classId: class_id, periodNumber: period_number },
        });
    return { id: saved.id, status: saved.status };
  }

  /** Admin fills a request: manual pick (validated) or auto-pick when no teacher is given. */
  @Post('substitutions/:id/assign')
  @Roles(...R.TIMETABLE_ADMIN)
  async assign(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: AssignSubstitutionDto) {
    const sub = await this.prisma.substitution.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!sub) throw new NotFoundException('substitution not found');
    if (sub.status === 'Cancelled') throw new ConflictException('This substitution was cancelled — raise a new request');
    return this.subs.assignCover({
      branchId: req.user.branch_id,
      createdBy: req.user.sub,
      date: sub.date,
      classId: sub.classId,
      periodNumber: sub.periodNumber,
      originalTeacherId: sub.originalTeacherId,
      substituteTeacherId: body.substitute_teacher_id,
      subId: sub.id,
    });
  }

  @Post('substitutions/:id/cancel')
  @Roles(...R.TIMETABLE_ADMIN)
  async cancel(@Req() req: ReqWithUser, @Param('id') id: string) {
    const sub = await this.prisma.substitution.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!sub) throw new NotFoundException('substitution not found');
    if (sub.status === 'Cancelled') throw new ConflictException('Already cancelled');
    await this.prisma.substitution.update({ where: { id }, data: { status: 'Cancelled' } });
    const notified = sub.status === 'Assigned' ? await this.subs.notifyCancellation(id) : false;
    return { success: true, status: 'Cancelled', substitute_notified: notified };
  }

  @Delete('substitutions/:id')
  @Roles(...R.TIMETABLE_ADMIN)
  async revokeSubstitution(@Req() req: ReqWithUser, @Param('id') id: string) {
    await this.prisma.substitution.deleteMany({ where: { id, branchId: req.user.branch_id } });
    return { success: true };
  }

  // ─── Manual slot upsert ──────────────────────────────────────

  @Put('slot')
  @Roles(...R.TIMETABLE_ADMIN)
  async upsertSlot(@Req() req: ReqWithUser, @Body() body: UpsertSlotDto) {
    const { class_id, day_of_week, period_number, subject, teacher_id, room_id } = body;
    const branchId = req.user.branch_id;
    await assertInBranch(this.prisma, 'class', class_id, branchId);
    await assertInBranch(this.prisma, 'staff', teacher_id, branchId);
    await assertInBranch(this.prisma, 'academicRoom', room_id, branchId);

    const period = await this.prisma.periodConfig.findFirst({ where: { branchId, periodNumber: period_number } });
    if (period?.isBreak) throw new BadRequestException(`Period ${period_number} is a break (${period.breakName ?? 'Break'})`);

    const conflict = await this.prisma.timetableSlot.findFirst({
      where: { branchId, teacherId: teacher_id, dayOfWeek: day_of_week, periodNumber: period_number, classId: { not: class_id } },
      include: { class: { select: { name: true, section: true } } },
    });
    if (conflict) {
      throw new ConflictException(`Teacher is already assigned to another class at this period (${classLabel(conflict.class)}).`);
    }
    // Upcoming covers on this weekday+period would become double bookings.
    const covers = await this.prisma.substitution.findMany({
      where: { branchId, substituteTeacherId: teacher_id, periodNumber: period_number, status: 'Assigned', date: { gte: todayISO() }, classId: { not: class_id } },
      select: { date: true },
    });
    const clash = covers.find((c) => dayOfWeek(c.date) === day_of_week);
    if (clash) {
      throw new ConflictException(`Teacher is covering another class in period ${period_number} on ${clash.date}.`);
    }

    await this.prisma.timetableSlot.upsert({
      where: { classId_dayOfWeek_periodNumber: { classId: class_id, dayOfWeek: day_of_week, periodNumber: period_number } },
      create: {
        branchId, classId: class_id, dayOfWeek: day_of_week, periodNumber: period_number,
        subject, teacherId: teacher_id, roomId: room_id ?? null,
      },
      update: { subject, teacherId: teacher_id, ...(room_id !== undefined ? { roomId: room_id } : {}) },
    });
    return { success: true };
  }

  // ─── Single-period substitution (admin) ──────────────────────

  @Post('substitute')
  @Roles(...R.TIMETABLE_ADMIN)
  async substitute(@Req() req: ReqWithUser, @Body() body: SubstituteDto) {
    const { date, class_id, period_number, reason, substitute_teacher_id } = body;
    const branchId = req.user.branch_id;
    await assertInBranch(this.prisma, 'class', class_id, branchId);
    await assertInBranch(this.prisma, 'staff', body.original_teacher_id, branchId);
    const slot = await this.prisma.timetableSlot.findFirst({
      where: { branchId, classId: class_id, dayOfWeek: dayOfWeek(date), periodNumber: period_number },
      select: { teacherId: true },
    });
    const existing = await this.prisma.substitution.findUnique({
      where: { date_classId_periodNumber: { date, classId: class_id, periodNumber: period_number } }, select: { id: true },
    });
    return this.subs.assignCover({
      branchId,
      createdBy: req.user.sub,
      date,
      classId: class_id,
      periodNumber: period_number,
      originalTeacherId: body.original_teacher_id ?? slot?.teacherId ?? null,
      substituteTeacherId: substitute_teacher_id,
      reason,
      subId: existing?.id,
    });
  }

  // ─── Auto generator (CSP) ────────────────────────────────────

  /**
   * Fills a class week. Lessons go only into NON-break periods from PeriodConfig
   * (the first `periods_per_day` of them); teachers are never double-booked against
   * other classes in this school, and each teacher's daily load — counting their
   * lessons in OTHER classes — stays within maxPeriodsPerDay.
   */
  @Post('generate')
  @Roles(...R.TIMETABLE_ADMIN)
  async generate(@Req() req: ReqWithUser, @Body() body: GenerateDto) {
    const { class_id, periods_per_day, working_days, subjects: subjectList, overwrite } = body;
    const branchId = req.user.branch_id;
    await assertInBranch(this.prisma, 'class', class_id, branchId);

    const names = subjectList.map((s) => s.name);
    if (new Set(names).size !== names.length) throw new BadRequestException('Subject names must be unique');

    const totalSlots = working_days.length * periods_per_day;
    const totalRequired = subjectList.reduce((sum, s) => sum + s.periods_per_week, 0);
    if (totalRequired !== totalSlots) {
      throw new BadRequestException(
        `Slot mismatch: ${totalRequired} subject-periods needed but ${totalSlots} slots available (${working_days.length} days × ${periods_per_day} periods). Adjust periods_per_week values.`,
      );
    }

    const teacherIds = [...new Set(subjectList.map((s) => s.teacher_id))];
    const teachers = await this.prisma.staff.findMany({
      where: { id: { in: teacherIds }, branchId },
      select: { id: true, maxPeriodsPerDay: true },
    });
    if (teachers.length !== teacherIds.length) throw new NotFoundException('teacher not found');
    for (const s of subjectList) {
      await assertInBranch(this.prisma, 'academicRoom', s.room_id || undefined, branchId);
    }
    const teacherLimits = new Map(teachers.map((t) => [t.id, t.maxPeriodsPerDay ?? 6]));

    // Teaching periods: configured non-break periods in order (fallback 1..N if none configured).
    const config = await this.teachingPeriods(branchId);
    const teachingNums = config.length
      ? config.filter((p) => !p.isBreak).map((p) => p.periodNumber)
      : Array.from({ length: periods_per_day }, (_, i) => i + 1);
    if (teachingNums.length < periods_per_day) {
      throw new BadRequestException(
        `Only ${teachingNums.length} teaching periods are configured (breaks excluded); cannot fit ${periods_per_day} per day.`,
      );
    }
    const dayPeriods = teachingNums.slice(0, periods_per_day);

    const existing = await this.prisma.timetableSlot.findMany({
      where: { branchId, classId: { not: class_id } },
      select: { teacherId: true, roomId: true, dayOfWeek: true, periodNumber: true },
    });

    const teacherBlocked: Record<string, Record<number, Set<string>>> = {};
    const roomBlocked: Record<string, Record<number, Set<string>>> = {};
    for (const day of working_days) {
      teacherBlocked[day] = {};
      roomBlocked[day] = {};
      for (const p of dayPeriods) {
        teacherBlocked[day][p] = new Set();
        roomBlocked[day][p] = new Set();
      }
    }
    const teacherDayLoad = Object.fromEntries(
      teacherIds.map((t) => [t, Object.fromEntries(working_days.map((d) => [d, 0]))]),
    ) as Record<string, Record<string, number>>;
    for (const s of existing) {
      teacherBlocked[s.dayOfWeek]?.[s.periodNumber]?.add(s.teacherId);
      if (s.roomId) roomBlocked[s.dayOfWeek]?.[s.periodNumber]?.add(s.roomId);
      if (teacherDayLoad[s.teacherId]?.[s.dayOfWeek] !== undefined) teacherDayLoad[s.teacherId][s.dayOfWeek]++;
    }

    const state = {
      remaining: Object.fromEntries(subjectList.map((s) => [s.name, s.periods_per_week])) as Record<string, number>,
      assignments: [] as Array<{ day: string; period: number; subject: string; teacher_id: string; room_id?: string }>,
      teacherDayLoad,
      lastSubjectByDay: Object.fromEntries(working_days.map((d) => [d, null])) as Record<string, string | null>,
      steps: 0,
    };

    const cells: Array<{ day: string; period: number }> = [];
    for (const day of working_days) for (const p of dayPeriods) cells.push({ day, period: p });

    const success = backtrack(cells, 0, subjectMeta(subjectList), teacherBlocked, roomBlocked, teacherLimits, state, dayPeriods);
    if (!success) {
      throw new ConflictException(
        'Could not generate a conflict-free timetable with these constraints (teachers busy in other classes or at their daily limit). Try other teachers or adjust periods_per_week.',
      );
    }

    await this.prisma.$transaction([
      ...(overwrite ? [this.prisma.timetableSlot.deleteMany({ where: { branchId, classId: class_id } })] : []),
      ...state.assignments.map((a) =>
        this.prisma.timetableSlot.upsert({
          where: { classId_dayOfWeek_periodNumber: { classId: class_id, dayOfWeek: a.day, periodNumber: a.period } },
          create: {
            branchId, classId: class_id, dayOfWeek: a.day, periodNumber: a.period,
            subject: a.subject, teacherId: a.teacher_id, roomId: a.room_id ?? null,
          },
          update: { subject: a.subject, teacherId: a.teacher_id, roomId: a.room_id ?? null },
        }),
      ),
    ]);

    return { generated: state.assignments.length, periods_used: dayPeriods, timetable: state.assignments };
  }
}

// ─── PDF helpers ───────────────────────────────────────────────

type BellRow = { periodNumber: number; startTime: string; endTime: string; isBreak: boolean; breakName: string | null };

/**
 * Week grid (periods in bell order × Mon–Sat; break rows labelled across the week) and a
 * per-day detail table. `cell` gives the short grid text, `detail` the day-list columns.
 */
function weekPdfBlocks(
  periods: BellRow[],
  cell: (day: string, period: number) => string | null,
  detail: (day: string, period: number) => string[] | null,
  detailHead: string[],
): PdfBlock[] {
  const time = (p: BellRow) => `${p.startTime}-${p.endTime}`;
  const rowLabel = (p: BellRow) => (p.isBreak ? (p.breakName ?? 'Break') : `P${p.periodNumber}`);
  const blocks: PdfBlock[] = [
    { kind: 'heading', text: 'Week at a glance' },
    {
      kind: 'table',
      head: ['Period', 'Time', ...WEEK_DAYS],
      widths: [62, 67, 61.6, 61.6, 61.6, 61.6, 61.6, 61.6],
      rows: periods.map((p) => [
        rowLabel(p), time(p),
        ...WEEK_DAYS.map((d) => (p.isBreak ? (p.breakName ?? 'Break') : cell(d, p.periodNumber) ?? '-')),
      ]),
    },
  ];
  for (const d of WEEK_DAYS) {
    blocks.push({ kind: 'heading', text: d });
    blocks.push({
      kind: 'table',
      head: ['Period', 'Time', ...detailHead],
      widths: [70, 80, 130, 129.28, 90],
      rows: periods.map((p) => {
        if (p.isBreak) return [rowLabel(p), time(p), p.breakName ?? 'Break', '', ''];
        return [rowLabel(p), time(p), ...(detail(d, p.periodNumber) ?? ['Free', '', ''])];
      }),
    });
  }
  return blocks;
}

// ─── Generator helpers ─────────────────────────────────────────

type SubjectMeta = { teacher_id: string; name: string; room_id?: string; double_periods: boolean };

function subjectMeta(list: GenerateSubjectDto[]): Record<string, SubjectMeta> {
  const map: Record<string, SubjectMeta> = {};
  for (const s of list) {
    map[s.name] = { teacher_id: s.teacher_id, name: s.name, room_id: s.room_id || undefined, double_periods: !!s.double_periods };
  }
  return map;
}

function backtrack(
  cells: Array<{ day: string; period: number }>,
  index: number,
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
  dayPeriods: number[],
): boolean {
  state.steps++;
  if (state.steps > 50_000) return false;

  let curr = index;
  while (curr < cells.length) {
    const { day, period } = cells[curr];
    if (!state.assignments.some((a) => a.day === day && a.period === period)) break;
    curr++;
  }
  if (curr === cells.length) return Object.values(state.remaining).every((v) => v === 0);

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
      // A double lesson needs the NEXT teaching period (never straddles a break).
      const idx = dayPeriods.indexOf(period);
      const nextPeriod = dayPeriods[idx + 1];
      if (nextPeriod === undefined || nextPeriod !== period + 1) continue;
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

      if (backtrack(cells, curr + 1, meta, teacherBlocked, roomBlocked, teacherLimits, state, dayPeriods)) return true;

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

      if (backtrack(cells, curr + 1, meta, teacherBlocked, roomBlocked, teacherLimits, state, dayPeriods)) return true;

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
