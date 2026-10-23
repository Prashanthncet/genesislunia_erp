import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get,
  NotFoundException, Param, Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { assertInBranch, audit, AuthUser, currentStaffId, portalStudentIds } from '../common/access';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateAssignmentDto, CreateLessonPlanDto, CreateSubjectDto, CreateSyllabusDto, LessonStatusDto,
  UpdateAssignmentDto, UpdateLessonPlanDto, UpdateSubjectDto, UpdateSyllabusDto,
} from './academics.dto';

type Req_ = { user: AuthUser };

/** Staff read everything in their school; parents/students only their own class (narrowed below). */
const READ_ALL = [...R.STAFF, ROLE.PARENT, ROLE.STUDENT];

@Controller('academics')
@UseGuards(AuthGuard, RolesGuard)
export class AcademicsController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  /** Classes a portal user may see (their children's / own class); null for staff. */
  private async portalClassIds(user: AuthUser): Promise<string[] | null> {
    const ids = await portalStudentIds(this.prisma, user);
    if (!ids) return null;
    const rows = await this.prisma.student.findMany({ where: { id: { in: ids }, branchId: user.branch_id }, select: { classId: true } });
    return [...new Set(rows.map((r) => r.classId).filter((c): c is string => !!c))];
  }

  /** Class filter honouring portal scope: a parent asking for another class gets nothing. */
  private async classScope(user: AuthUser, classId?: string): Promise<object> {
    const allowed = await this.portalClassIds(user);
    if (!allowed) return classId ? { classId } : {};
    return { classId: { in: classId ? allowed.filter((c) => c === classId) : allowed } };
  }

  /**
   * The teacher an item is recorded against. Teachers are always themselves (a different
   * teacher_id → 403). Leadership/HOD may name any teacher in their school, defaulting to
   * their own staff row.
   */
  private async resolveTeacher(user: AuthUser, requested?: string): Promise<string> {
    const own = await currentStaffId(this.prisma, user);
    if (user.role === ROLE.TEACHER) {
      if (!own) throw new ForbiddenException('Your login is not linked to a staff record');
      if (requested && requested !== own) throw new ForbiddenException('Teachers can only post as themselves');
      return own;
    }
    const id = requested || own;
    if (!id) throw new BadRequestException('teacher_id is required');
    await assertInBranch(this.prisma, 'staff', id, user.branch_id);
    return id;
  }

  /** Teachers may only change their own items; leadership/HOD may change any. */
  private async assertOwner(user: AuthUser, teacherId: string) {
    if (user.role !== ROLE.TEACHER) return;
    const own = await currentStaffId(this.prisma, user);
    if (!own || own !== teacherId) throw new ForbiddenException('You can only change your own items');
  }

  // ─── Teachers (for the dropdowns) ──────────────────────────

  /** Teaching staff for the plan/assignment forms. A teacher only ever sees themselves. */
  @Get('teachers')
  @Roles(...R.TEACHING)
  async teachers(@Req() req: Req_) {
    if (req.user.role === ROLE.TEACHER) {
      const own = await currentStaffId(this.prisma, req.user);
      if (!own) return [];
      return this.prisma.staff.findMany({ where: { id: own }, select: { id: true, name: true, subjects: true } });
    }
    return this.prisma.staff.findMany({
      where: { branchId: req.user.branch_id, isActive: true, AND: [{ subjects: { not: null } }, { subjects: { not: '' } }] },
      select: { id: true, name: true, subjects: true },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Subjects ──────────────────────────────────────────────

  @Get('subjects')
  @Roles(...READ_ALL)
  listSubjects(@Req() req: Req_, @Query('level') level?: string) {
    return this.prisma.subject.findMany({
      where: { branchId: req.user.branch_id, ...(level ? { level } : {}) },
      include: { _count: { select: { syllabus: true, assignments: true } } },
      orderBy: { code: 'asc' },
    });
  }

  @Post('subjects')
  @Roles(...R.ACADEMIC_SETUP)
  async createSubject(@Req() req: Req_, @Body() body: CreateSubjectDto) {
    try {
      const s = await this.prisma.subject.create({
        data: { branchId: req.user.branch_id, name: body.name.trim(), code: body.code.trim().toUpperCase(), level: body.level ?? 'Secondary', groupId: body.group_id ?? 1 },
      });
      await audit(this.prisma, req.user, 'CREATE', 'subject', s.id, s.code);
      return { id: s.id };
    } catch (err: unknown) {
      if (String((err as Error)?.message).includes('Unique constraint')) throw new ConflictException('Subject code already exists in this school');
      throw err;
    }
  }

  @Put('subjects/:id')
  @Roles(...R.ACADEMIC_SETUP)
  async updateSubject(@Req() req: Req_, @Param('id') id: string, @Body() body: UpdateSubjectDto) {
    await assertInBranch(this.prisma, 'subject', id, req.user.branch_id);
    try {
      const s = await this.prisma.subject.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.code !== undefined ? { code: body.code.trim().toUpperCase() } : {}),
          ...(body.level !== undefined ? { level: body.level } : {}),
          ...(body.group_id !== undefined ? { groupId: body.group_id } : {}),
        },
      });
      await audit(this.prisma, req.user, 'UPDATE', 'subject', id, s.code);
      return { id: s.id, success: true };
    } catch (err: unknown) {
      if (String((err as Error)?.message).includes('Unique constraint')) throw new ConflictException('Subject code already exists in this school');
      throw err;
    }
  }

  @Delete('subjects/:id')
  @Roles(...R.ACADEMIC_SETUP)
  async deleteSubject(@Req() req: Req_, @Param('id') id: string) {
    const existing = await this.prisma.subject.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { _count: { select: { examMarks: true, syllabus: true, assignments: true } } },
    });
    if (!existing) throw new NotFoundException('Subject not found');
    if (existing._count.examMarks > 0 || existing._count.syllabus > 0 || existing._count.assignments > 0) {
      throw new ConflictException('Cannot delete a subject with marks, syllabus or assignments attached');
    }
    await this.prisma.subject.delete({ where: { id } });
    await audit(this.prisma, req.user, 'DELETE', 'subject', id, existing.code);
    return { success: true };
  }

  // ─── Syllabus ──────────────────────────────────────────────

  @Get('syllabus')
  @Roles(...READ_ALL)
  async listSyllabus(@Req() req: Req_, @Query('class_id') classId?: string, @Query('subject_id') subjectId?: string) {
    return this.prisma.syllabus.findMany({
      where: { branchId: req.user.branch_id, ...(await this.classScope(req.user, classId)), ...(subjectId ? { subjectId } : {}) },
      include: { subject: true, class: true, _count: { select: { lessonPlans: true } } },
      orderBy: { title: 'asc' },
    });
  }

  /**
   * Syllabus coverage: per unit and per subject, % of lesson plans marked Completed
   * out of all plans recorded against it. A unit with no plans reports pct = null.
   */
  @Get('syllabus/progress')
  @Roles(...READ_ALL)
  async progress(@Req() req: Req_, @Query('class_id') classId?: string, @Query('subject_id') subjectId?: string) {
    const units = await this.prisma.syllabus.findMany({
      where: { branchId: req.user.branch_id, ...(await this.classScope(req.user, classId)), ...(subjectId ? { subjectId } : {}) },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        class: { select: { id: true, name: true, section: true } },
        lessonPlans: { select: { status: true } },
      },
      orderBy: [{ classId: 'asc' }, { title: 'asc' }],
    });
    const pct = (done: number, all: number) => (all > 0 ? Math.round((done / all) * 1000) / 10 : null);
    const rows = units.map((u) => {
      const planned = u.lessonPlans.length;
      const completed = u.lessonPlans.filter((p) => p.status === 'Completed').length;
      const inProgress = u.lessonPlans.filter((p) => p.status === 'In Progress').length;
      return {
        syllabus_id: u.id, title: u.title,
        class_id: u.class.id, class_name: `${u.class.name}${u.class.section ? ` ${u.class.section}` : ''}`,
        subject_id: u.subject.id, subject_name: u.subject.name, subject_code: u.subject.code,
        planned, completed, in_progress: inProgress, pct: pct(completed, planned),
      };
    });
    const bySubject = new Map<string, { class_id: string; class_name: string; subject_id: string; subject_name: string; units: number; planned: number; completed: number }>();
    for (const r of rows) {
      const key = `${r.class_id}|${r.subject_id}`;
      const b = bySubject.get(key) ?? { class_id: r.class_id, class_name: r.class_name, subject_id: r.subject_id, subject_name: r.subject_name, units: 0, planned: 0, completed: 0 };
      b.units += 1; b.planned += r.planned; b.completed += r.completed;
      bySubject.set(key, b);
    }
    const planned = rows.reduce((s, r) => s + r.planned, 0);
    const completed = rows.reduce((s, r) => s + r.completed, 0);
    return {
      overall: { units: rows.length, planned, completed, pct: pct(completed, planned) },
      by_subject: [...bySubject.values()].map((b) => ({ ...b, pct: pct(b.completed, b.planned) })),
      units: rows,
    };
  }

  @Post('syllabus')
  @Roles(...R.ACADEMIC_SETUP)
  async createSyllabus(@Req() req: Req_, @Body() body: CreateSyllabusDto) {
    await assertInBranch(this.prisma, 'class', body.class_id, req.user.branch_id);
    await assertInBranch(this.prisma, 'subject', body.subject_id, req.user.branch_id);
    const s = await this.prisma.syllabus.create({
      data: { branchId: req.user.branch_id, classId: body.class_id, subjectId: body.subject_id, title: body.title.trim(), description: body.description?.trim() || null },
    });
    await audit(this.prisma, req.user, 'CREATE', 'syllabus', s.id, s.title);
    return { id: s.id };
  }

  @Put('syllabus/:id')
  @Roles(...R.ACADEMIC_SETUP)
  async updateSyllabus(@Req() req: Req_, @Param('id') id: string, @Body() body: UpdateSyllabusDto) {
    await assertInBranch(this.prisma, 'syllabus', id, req.user.branch_id);
    const s = await this.prisma.syllabus.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
      },
    });
    await audit(this.prisma, req.user, 'UPDATE', 'syllabus', id, s.title);
    return { id: s.id, success: true };
  }

  @Delete('syllabus/:id')
  @Roles(...R.ACADEMIC_SETUP)
  async deleteSyllabus(@Req() req: Req_, @Param('id') id: string) {
    const existing = await this.prisma.syllabus.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { _count: { select: { lessonPlans: true } } },
    });
    if (!existing) throw new NotFoundException('Syllabus unit not found');
    if (existing._count.lessonPlans > 0) {
      throw new ConflictException(`This unit has ${existing._count.lessonPlans} lesson plan(s); delete them first`);
    }
    await this.prisma.syllabus.delete({ where: { id } });
    await audit(this.prisma, req.user, 'DELETE', 'syllabus', id, existing.title);
    return { success: true };
  }

  // ─── Lesson plans ──────────────────────────────────────────

  @Get('lesson-plans')
  @Roles(...R.STAFF)
  listLessonPlans(@Req() req: Req_, @Query('teacher_id') teacherId?: string, @Query('syllabus_id') syllabusId?: string, @Query('class_id') classId?: string) {
    return this.prisma.lessonPlan.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(teacherId ? { teacherId } : {}),
        ...(syllabusId ? { syllabusId } : {}),
        ...(classId ? { syllabus: { classId } } : {}),
      },
      include: {
        syllabus: { include: { subject: true, class: { select: { id: true, name: true, section: true } } } },
        teacher: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  @Post('lesson-plans')
  @Roles(...R.TEACHING)
  async createLessonPlan(@Req() req: Req_, @Body() body: CreateLessonPlanDto) {
    await assertInBranch(this.prisma, 'syllabus', body.syllabus_id, req.user.branch_id);
    const teacherId = await this.resolveTeacher(req.user, body.teacher_id);
    const p = await this.prisma.lessonPlan.create({
      data: { branchId: req.user.branch_id, syllabusId: body.syllabus_id, teacherId, topic: body.topic.trim(), date: body.date, status: body.status ?? 'Planned' },
    });
    await audit(this.prisma, req.user, 'CREATE', 'lesson_plan', p.id, p.topic);
    return { id: p.id, teacher_id: teacherId };
  }

  @Put('lesson-plans/:id')
  @Roles(...R.TEACHING)
  async updateLessonPlan(@Req() req: Req_, @Param('id') id: string, @Body() body: UpdateLessonPlanDto) {
    const existing = await this.prisma.lessonPlan.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Lesson plan not found');
    await this.assertOwner(req.user, existing.teacherId);
    const p = await this.prisma.lessonPlan.update({
      where: { id },
      data: {
        ...(body.topic !== undefined ? { topic: body.topic.trim() } : {}),
        ...(body.date !== undefined ? { date: body.date } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
    await audit(this.prisma, req.user, 'UPDATE', 'lesson_plan', id, p.status);
    return { id: p.id, success: true };
  }

  /** Quick status change from the progress view (Planned → In Progress → Completed). */
  @Patch('lesson-plans/:id/status')
  @Roles(...R.TEACHING)
  async setLessonStatus(@Req() req: Req_, @Param('id') id: string, @Body() body: LessonStatusDto) {
    const existing = await this.prisma.lessonPlan.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Lesson plan not found');
    await this.assertOwner(req.user, existing.teacherId);
    await this.prisma.lessonPlan.update({ where: { id }, data: { status: body.status } });
    await audit(this.prisma, req.user, 'UPDATE', 'lesson_plan', id, `status ${existing.status} -> ${body.status}`);
    return { id, status: body.status, success: true };
  }

  @Delete('lesson-plans/:id')
  @Roles(...R.TEACHING)
  async deleteLessonPlan(@Req() req: Req_, @Param('id') id: string) {
    const existing = await this.prisma.lessonPlan.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Lesson plan not found');
    await this.assertOwner(req.user, existing.teacherId);
    await this.prisma.lessonPlan.delete({ where: { id } });
    await audit(this.prisma, req.user, 'DELETE', 'lesson_plan', id, existing.topic);
    return { success: true };
  }

  // ─── Assignments ───────────────────────────────────────────

  @Get('assignments')
  @Roles(...READ_ALL)
  async listAssignments(@Req() req: Req_, @Query('class_id') classId?: string, @Query('subject_id') subjectId?: string) {
    return this.prisma.assignment.findMany({
      where: { branchId: req.user.branch_id, ...(await this.classScope(req.user, classId)), ...(subjectId ? { subjectId } : {}) },
      include: { subject: true, class: true, teacher: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'desc' },
    });
  }

  @Post('assignments')
  @Roles(...R.TEACHING)
  async createAssignment(@Req() req: Req_, @Body() body: CreateAssignmentDto) {
    await assertInBranch(this.prisma, 'class', body.class_id, req.user.branch_id);
    await assertInBranch(this.prisma, 'subject', body.subject_id, req.user.branch_id);
    const teacherId = await this.resolveTeacher(req.user, body.teacher_id);
    const a = await this.prisma.assignment.create({
      data: {
        branchId: req.user.branch_id, classId: body.class_id, subjectId: body.subject_id, teacherId,
        title: body.title.trim(), description: body.description?.trim() || null, dueDate: body.due_date,
      },
    });
    await audit(this.prisma, req.user, 'CREATE', 'assignment', a.id, a.title);
    await this.notifications.notify({
      branch_id: req.user.branch_id,
      channel: 'email',
      recipient: 'class-guardians@demo.local',
      subject: `New assignment: ${a.title}`,
      body: `An assignment "${a.title}" was posted, due ${a.dueDate}.`,
      ref_type: 'assignment',
      ref_id: a.id,
    });
    return { id: a.id, teacher_id: teacherId };
  }

  @Put('assignments/:id')
  @Roles(...R.TEACHING)
  async updateAssignment(@Req() req: Req_, @Param('id') id: string, @Body() body: UpdateAssignmentDto) {
    const existing = await this.prisma.assignment.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Assignment not found');
    await this.assertOwner(req.user, existing.teacherId);
    const a = await this.prisma.assignment.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
        ...(body.due_date !== undefined ? { dueDate: body.due_date } : {}),
      },
    });
    await audit(this.prisma, req.user, 'UPDATE', 'assignment', id, a.title);
    return { id: a.id, success: true };
  }

  @Delete('assignments/:id')
  @Roles(...R.TEACHING)
  async deleteAssignment(@Req() req: Req_, @Param('id') id: string) {
    const existing = await this.prisma.assignment.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Assignment not found');
    await this.assertOwner(req.user, existing.teacherId);
    await this.prisma.assignment.delete({ where: { id } });
    await audit(this.prisma, req.user, 'DELETE', 'assignment', id, existing.title);
    return { success: true };
  }
}
