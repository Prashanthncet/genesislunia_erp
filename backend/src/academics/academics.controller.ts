import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

@Controller('academics')
@UseGuards(AuthGuard, RolesGuard)
export class AcademicsController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // ─── Subjects CRUD ──────────────────────────────────────────

  @Get('subjects')
  listSubjects(@Req() req: ReqWithUser, @Query('level') level?: string) {
    return this.prisma.subject.findMany({
      where: { branchId: req.user.branch_id, ...(level ? { level } : {}) },
      include: { _count: { select: { syllabus: true, assignments: true } } },
      orderBy: { code: 'asc' },
    });
  }

  @Post('subjects')
  @Roles('super_admin', 'branch_admin')
  async createSubject(@Req() req: ReqWithUser, @Body() body: { name?: string; code?: string; level?: string; group_id?: number }) {
    if (!body?.name || !body?.code) throw new BadRequestException('name and code are required');
    try {
      const s = await this.prisma.subject.create({
        data: {
          branchId: req.user.branch_id,
          name: body.name,
          code: body.code,
          level: body.level ?? 'Secondary',
          groupId: body.group_id ?? 1,
        },
      });
      return { id: s.id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unique constraint')) throw new ConflictException('Subject code already exists in this branch');
      throw err;
    }
  }

  @Put('subjects/:id')
  @Roles('super_admin', 'branch_admin')
  async updateSubject(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { name?: string; code?: string; level?: string; group_id?: number }) {
    const existing = await this.prisma.subject.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Subject not found');
    const s = await this.prisma.subject.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.level !== undefined ? { level: body.level } : {}),
        ...(body.group_id !== undefined ? { groupId: body.group_id } : {}),
      },
    });
    return { id: s.id, success: true };
  }

  @Delete('subjects/:id')
  @Roles('super_admin', 'branch_admin')
  async deleteSubject(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.subject.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { _count: { select: { examMarks: true, syllabus: true } } },
    });
    if (!existing) throw new NotFoundException('Subject not found');
    if (existing._count.examMarks > 0 || existing._count.syllabus > 0) {
      throw new ConflictException('Cannot delete a subject with marks or syllabus attached');
    }
    await this.prisma.subject.delete({ where: { id } });
    return { success: true };
  }

  // ─── Syllabus CRUD ──────────────────────────────────────────

  @Get('syllabus')
  listSyllabus(@Req() req: ReqWithUser, @Query('class_id') classId?: string, @Query('subject_id') subjectId?: string) {
    return this.prisma.syllabus.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(classId ? { classId } : {}),
        ...(subjectId ? { subjectId } : {}),
      },
      include: { subject: true, class: true, _count: { select: { lessonPlans: true } } },
      orderBy: { title: 'asc' },
    });
  }

  @Post('syllabus')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async createSyllabus(
    @Req() req: ReqWithUser,
    @Body() body: { class_id?: string; subject_id?: string; title?: string; description?: string },
  ) {
    if (!body?.class_id || !body?.subject_id || !body?.title) {
      throw new BadRequestException('class_id, subject_id and title are required');
    }
    const s = await this.prisma.syllabus.create({
      data: {
        branchId: req.user.branch_id,
        classId: body.class_id,
        subjectId: body.subject_id,
        title: body.title,
        description: body.description ?? null,
      },
    });
    return { id: s.id };
  }

  @Put('syllabus/:id')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async updateSyllabus(
    @Req() req: ReqWithUser,
    @Param('id') id: string,
    @Body() body: { title?: string; description?: string },
  ) {
    const existing = await this.prisma.syllabus.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Syllabus unit not found');
    const s = await this.prisma.syllabus.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });
    return { id: s.id, success: true };
  }

  @Delete('syllabus/:id')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async deleteSyllabus(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.syllabus.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Syllabus unit not found');
    await this.prisma.syllabus.delete({ where: { id } });
    return { success: true };
  }

  // ─── Lesson plans CRUD ──────────────────────────────────────

  @Get('lesson-plans')
  listLessonPlans(@Req() req: ReqWithUser, @Query('teacher_id') teacherId?: string, @Query('syllabus_id') syllabusId?: string) {
    return this.prisma.lessonPlan.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(teacherId ? { teacherId } : {}),
        ...(syllabusId ? { syllabusId } : {}),
      },
      include: { syllabus: { include: { subject: true } }, teacher: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });
  }

  @Post('lesson-plans')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async createLessonPlan(
    @Req() req: ReqWithUser,
    @Body() body: { syllabus_id?: string; teacher_id?: string; topic?: string; date?: string; status?: string },
  ) {
    if (!body?.syllabus_id || !body?.teacher_id || !body?.topic || !body?.date) {
      throw new BadRequestException('syllabus_id, teacher_id, topic and date are required');
    }
    const p = await this.prisma.lessonPlan.create({
      data: {
        branchId: req.user.branch_id,
        syllabusId: body.syllabus_id,
        teacherId: body.teacher_id,
        topic: body.topic,
        date: body.date,
        status: body.status ?? 'Planned',
      },
    });
    return { id: p.id };
  }

  @Put('lesson-plans/:id')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async updateLessonPlan(
    @Req() req: ReqWithUser,
    @Param('id') id: string,
    @Body() body: { topic?: string; date?: string; status?: string },
  ) {
    const existing = await this.prisma.lessonPlan.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Lesson plan not found');
    const p = await this.prisma.lessonPlan.update({
      where: { id },
      data: {
        ...(body.topic !== undefined ? { topic: body.topic } : {}),
        ...(body.date !== undefined ? { date: body.date } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
    return { id: p.id, success: true };
  }

  @Delete('lesson-plans/:id')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async deleteLessonPlan(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.lessonPlan.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Lesson plan not found');
    await this.prisma.lessonPlan.delete({ where: { id } });
    return { success: true };
  }

  // ─── Assignments CRUD ───────────────────────────────────────

  @Get('assignments')
  listAssignments(@Req() req: ReqWithUser, @Query('class_id') classId?: string, @Query('subject_id') subjectId?: string) {
    return this.prisma.assignment.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(classId ? { classId } : {}),
        ...(subjectId ? { subjectId } : {}),
      },
      include: { subject: true, class: true, teacher: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'desc' },
    });
  }

  @Post('assignments')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async createAssignment(
    @Req() req: ReqWithUser,
    @Body() body: { class_id?: string; subject_id?: string; teacher_id?: string; title?: string; description?: string; due_date?: string },
  ) {
    if (!body?.class_id || !body?.subject_id || !body?.teacher_id || !body?.title || !body?.due_date) {
      throw new BadRequestException('class_id, subject_id, teacher_id, title and due_date are required');
    }
    const a = await this.prisma.assignment.create({
      data: {
        branchId: req.user.branch_id,
        classId: body.class_id,
        subjectId: body.subject_id,
        teacherId: body.teacher_id,
        title: body.title,
        description: body.description ?? null,
        dueDate: body.due_date,
      },
    });
    // notify the class teacher? (demo: just log the notification)
    await this.notifications.notify({
      branch_id: req.user.branch_id,
      channel: 'email',
      recipient: 'class-guardians@demo.local',
      subject: `New assignment: ${body.title}`,
      body: `An assignment "${body.title}" was posted, due ${body.due_date}.`,
      ref_type: 'assignment',
      ref_id: a.id,
    });
    return { id: a.id };
  }

  @Put('assignments/:id')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async updateAssignment(
    @Req() req: ReqWithUser,
    @Param('id') id: string,
    @Body() body: { title?: string; description?: string; due_date?: string },
  ) {
    const existing = await this.prisma.assignment.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Assignment not found');
    const a = await this.prisma.assignment.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.due_date !== undefined ? { dueDate: body.due_date } : {}),
      },
    });
    return { id: a.id, success: true };
  }

  @Delete('assignments/:id')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async deleteAssignment(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.assignment.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Assignment not found');
    await this.prisma.assignment.delete({ where: { id } });
    return { success: true };
  }
}
