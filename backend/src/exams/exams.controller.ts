import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get,
  NotFoundException, Param, Post, Put, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { assertCanSeeStudent, assertInBranch, audit, AuthUser, currentStaffId, portalStudentIds, teacherClassIds } from '../common/access';
import { sendPdf } from '../common/pdf';
import { ReportCacheService } from '../reports/report-cache.service';
import {
  BulkMarksDto, CreateExamDto, GradeBandDto, PublishReportCardsDto, ReplaceGradeBandsDto, UpdateExamDto, UpdateGradeBandDto,
} from './exams.dto';
import { Band, validateBands } from './grading';
import { CardFilters, cardFingerprint, ReportCard, ReportCardService } from './report-card.service';
import { retryOnUniqueRace } from '../common/retry';

type Req_ = { user: AuthUser };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Staff + portal: portal callers are narrowed to their own child inside the handler. */
const READ_ALL = [...R.ACADEMIC_STAFF, ROLE.PARENT, ROLE.STUDENT];
/** Marks entry: every teaching role; plain teachers are additionally scoped by the timetable. */
const MARKS_WRITE = [...new Set([...R.TEACHING, ...R.ACADEMIC_SETUP])];
/** Roles that may enter marks for any class/subject without a timetable slot. */
const MARKS_UNSCOPED: string[] = [...R.LEADERSHIP, ROLE.HOD];

const isPortal = (role: string) => role === ROLE.PARENT || role === ROLE.STUDENT;

type Snapshot = { id: string; academicYear: string; term: string; data: string; publishedAt: Date; publishedBy: string | null; classId: string | null };

function cardFilters(q: { term?: string; academic_year?: string; from?: string; to?: string }): CardFilters {
  for (const [k, v] of [['from', q.from], ['to', q.to]] as const) {
    if (v && !ISO_DATE.test(v)) throw new BadRequestException(`${k} must be YYYY-MM-DD`);
  }
  if (q.from && q.to && q.from > q.to) throw new BadRequestException('from must be on or before to');
  if (q.academic_year && !/^\d{4}(-(\d{2}|\d{4}))?$/.test(q.academic_year)) {
    throw new BadRequestException('academic_year must look like 2026-27');
  }
  return {
    term: q.term?.trim() || undefined,
    academicYear: q.academic_year?.trim() || undefined,
    from: q.from || undefined,
    to: q.to || undefined,
  };
}

@Controller('exams')
@UseGuards(AuthGuard, RolesGuard)
export class ExamsController {
  constructor(
    private prisma: PrismaService,
    private cards: ReportCardService,
    private cache: ReportCacheService,
  ) {}

  /** True when the caller's staff row has a timetable slot for this class + subject (name or code). */
  private async teaches(user: AuthUser, classId: string, subject: { name: string; code: string }): Promise<boolean> {
    if (MARKS_UNSCOPED.includes(user.role)) return true;
    const staffId = await currentStaffId(this.prisma, user);
    if (!staffId) return false;
    const slots = await this.prisma.timetableSlot.findMany({
      where: { branchId: user.branch_id, classId, teacherId: staffId },
      select: { subject: true },
    });
    const names = new Set([subject.name.toLowerCase(), subject.code.toLowerCase()]);
    return slots.some((s) => names.has(s.subject.trim().toLowerCase()));
  }

  // ─── Exams CRUD ────────────────────────────────────────────

  @Get()
  @Roles(...READ_ALL)
  async list(@Req() req: Req_, @Query('class_id') classId?: string, @Query('term') term?: string, @Query('academic_year') year?: string) {
    const portal = await portalStudentIds(this.prisma, req.user);
    let classFilter: object = classId ? { classId } : {};
    if (portal) {
      const kids = await this.prisma.student.findMany({ where: { id: { in: portal }, branchId: req.user.branch_id }, select: { classId: true } });
      const ids = kids.map((k) => k.classId).filter((c): c is string => !!c);
      classFilter = { OR: [{ classId: { in: classId ? ids.filter((i) => i === classId) : ids } }, { classId: null }] };
    } else {
      const teacherScope = await teacherClassIds(this.prisma, req.user);
      if (teacherScope !== null) {
        if (classId && !teacherScope.includes(classId)) {
          throw new ForbiddenException('You can only view exams for classes assigned to you');
        }
        classFilter = classId ? { classId } : { classId: { in: teacherScope } };
      }
    }
    return this.prisma.exam.findMany({
      where: { branchId: req.user.branch_id, ...classFilter, ...(term ? { term } : {}), ...(year ? { academicYear: year } : {}) },
      include: { class: { select: { id: true, name: true, section: true } }, _count: { select: { examMarks: true } } },
      orderBy: { date: 'desc' },
    });
  }

  @Post()
  @Roles(...R.ACADEMIC_SETUP)
  async create(@Req() req: Req_, @Body() body: CreateExamDto) {
    await assertInBranch(this.prisma, 'class', body.class_id, req.user.branch_id);
    const exam = await this.prisma.exam.create({
      data: {
        branchId: req.user.branch_id,
        name: body.name.trim(),
        date: body.date,
        classId: body.class_id ?? null,
        term: body.term?.trim() || null,
        academicYear: body.academic_year ?? null,
        weight: body.weight ?? 1,
        maxMarks: body.max_marks ?? 100,
      },
    });
    await audit(this.prisma, req.user, 'CREATE', 'exam', exam.id, exam.name);
    this.cache.invalidateBranch(req.user.branch_id);
    return exam;
  }

  @Get('subjects/:level')
  @Roles(...READ_ALL)
  subjects(@Req() req: Req_, @Param('level') level: string) {
    return this.prisma.subject.findMany({ where: { branchId: req.user.branch_id, level }, orderBy: { groupId: 'asc' } });
  }

  // ─── Grade bands ───────────────────────────────────────────

  @Get('grade-bands')
  @Roles(...READ_ALL)
  gradeBands(@Req() req: Req_) {
    return this.prisma.gradeBand.findMany({ where: { branchId: req.user.branch_id }, orderBy: { minPercent: 'desc' } });
  }

  private async saveBandsChecked(branchId: string, next: Band[]) {
    const err = validateBands(next);
    if (err) throw new BadRequestException(err);
  }

  private toBand = (b: { grade: string; minPercent: number; gradePoint: number | null; remark: string | null }): Band => ({ ...b });

  /** Replace the whole scale at once (what the editor saves). */
  @Put('grade-bands')
  @Roles(...R.ACADEMIC_SETUP)
  async replaceBands(@Req() req: Req_, @Body() body: ReplaceGradeBandsDto) {
    const next = body.bands.map((b) => ({ grade: b.grade.trim(), minPercent: b.min_percent, gradePoint: b.grade_point ?? null, remark: b.remark?.trim() || null }));
    await this.saveBandsChecked(req.user.branch_id, next);
    await this.prisma.$transaction([
      this.prisma.gradeBand.deleteMany({ where: { branchId: req.user.branch_id } }),
      this.prisma.gradeBand.createMany({ data: next.map((b) => ({ ...b, branchId: req.user.branch_id })) }),
    ]);
    await audit(this.prisma, req.user, 'UPDATE', 'grade_band', req.user.branch_id, `${next.length} bands`);
    this.cache.invalidateBranch(req.user.branch_id);
    return this.gradeBands(req);
  }

  @Post('grade-bands')
  @Roles(...R.ACADEMIC_SETUP)
  async addBand(@Req() req: Req_, @Body() body: GradeBandDto) {
    const existing = await this.prisma.gradeBand.findMany({ where: { branchId: req.user.branch_id } });
    const band = { grade: body.grade.trim(), minPercent: body.min_percent, gradePoint: body.grade_point ?? null, remark: body.remark?.trim() || null };
    await this.saveBandsChecked(req.user.branch_id, [...existing.map(this.toBand), band]);
    const created = await this.prisma.gradeBand.create({ data: { ...band, branchId: req.user.branch_id } });
    await audit(this.prisma, req.user, 'CREATE', 'grade_band', created.id, band.grade);
    this.cache.invalidateBranch(req.user.branch_id);
    return created;
  }

  @Put('grade-bands/:id')
  @Roles(...R.ACADEMIC_SETUP)
  async updateBand(@Req() req: Req_, @Param('id') id: string, @Body() body: UpdateGradeBandDto) {
    const existing = await this.prisma.gradeBand.findMany({ where: { branchId: req.user.branch_id } });
    const row = existing.find((b) => b.id === id);
    if (!row) throw new NotFoundException('grade band not found');
    const patched = {
      grade: body.grade?.trim() ?? row.grade,
      minPercent: body.min_percent ?? row.minPercent,
      gradePoint: body.grade_point !== undefined ? body.grade_point : row.gradePoint,
      remark: body.remark !== undefined ? body.remark.trim() || null : row.remark,
    };
    await this.saveBandsChecked(req.user.branch_id, [...existing.filter((b) => b.id !== id).map(this.toBand), patched]);
    const updated = await this.prisma.gradeBand.update({ where: { id }, data: patched });
    await audit(this.prisma, req.user, 'UPDATE', 'grade_band', id, patched.grade);
    this.cache.invalidateBranch(req.user.branch_id);
    return updated;
  }

  @Delete('grade-bands/:id')
  @Roles(...R.ACADEMIC_SETUP)
  async deleteBand(@Req() req: Req_, @Param('id') id: string) {
    const existing = await this.prisma.gradeBand.findMany({ where: { branchId: req.user.branch_id } });
    if (!existing.some((b) => b.id === id)) throw new NotFoundException('grade band not found');
    await this.saveBandsChecked(req.user.branch_id, existing.filter((b) => b.id !== id).map(this.toBand));
    await this.prisma.gradeBand.delete({ where: { id } });
    await audit(this.prisma, req.user, 'DELETE', 'grade_band', id);
    this.cache.invalidateBranch(req.user.branch_id);
    return { success: true };
  }

  // ─── Marks ─────────────────────────────────────────────────

  /**
   * Class/subject pairs the caller may enter marks for. Leadership/HOD get `all: true`
   * (any class, any subject); a teacher gets the pairs from their timetable.
   */
  @Get('my-teaching')
  @Roles(...MARKS_WRITE)
  async myTeaching(@Req() req: Req_) {
    if (MARKS_UNSCOPED.includes(req.user.role)) return { all: true, pairs: [] };
    const staffId = await currentStaffId(this.prisma, req.user);
    if (!staffId) return { all: false, pairs: [] };
    const [slots, subjects] = await Promise.all([
      this.prisma.timetableSlot.findMany({
        where: { branchId: req.user.branch_id, teacherId: staffId },
        select: { classId: true, subject: true, class: { select: { name: true, section: true } } },
      }),
      this.prisma.subject.findMany({ where: { branchId: req.user.branch_id } }),
    ]);
    const seen = new Map<string, { class_id: string; class_name: string; subject_id: string; subject_name: string }>();
    for (const s of slots) {
      const key = s.subject.trim().toLowerCase();
      const sub = subjects.find((x) => x.name.toLowerCase() === key || x.code.toLowerCase() === key);
      if (!sub) continue;
      seen.set(`${s.classId}|${sub.id}`, {
        class_id: s.classId,
        class_name: `${s.class.name}${s.class.section ? ` ${s.class.section}` : ''}`,
        subject_id: sub.id,
        subject_name: sub.name,
      });
    }
    return { all: false, pairs: [...seen.values()] };
  }

  /** Marks-entry grid: every active student of the class with their current score. */
  @Get('marks')
  @Roles(...MARKS_WRITE)
  async marksGrid(@Req() req: Req_, @Query('exam_id') examId?: string, @Query('subject_id') subjectId?: string, @Query('class_id') classIdQ?: string) {
    if (!examId || !subjectId) throw new BadRequestException('exam_id and subject_id are required');
    const exam = await this.prisma.exam.findFirst({ where: { id: examId, branchId: req.user.branch_id } });
    if (!exam) throw new NotFoundException('exam not found');
    const subject = await this.prisma.subject.findFirst({ where: { id: subjectId, branchId: req.user.branch_id } });
    if (!subject) throw new NotFoundException('subject not found');
    const classId = exam.classId ?? classIdQ;
    if (!classId) throw new BadRequestException('class_id is required for an exam that is not tied to a class');
    await assertInBranch(this.prisma, 'class', classId, req.user.branch_id);
    if (!(await this.teaches(req.user, classId, subject))) {
      throw new ForbiddenException(`You do not teach ${subject.name} to this class`);
    }
    const [students, marks] = await Promise.all([
      this.prisma.student.findMany({
        where: { branchId: req.user.branch_id, classId, status: 'Active' },
        select: { id: true, fullName: true, admissionNo: true, rollNo: true },
        orderBy: [{ rollNo: 'asc' }, { fullName: 'asc' }],
      }),
      this.prisma.examMark.findMany({ where: { branchId: req.user.branch_id, examId, subjectId } }),
    ]);
    const byStudent = new Map(marks.map((m) => [m.studentId, m.score]));
    return {
      exam: { id: exam.id, name: exam.name, max_marks: exam.maxMarks, weight: exam.weight, class_id: classId },
      subject: { id: subject.id, name: subject.name, code: subject.code },
      rows: students.map((s) => ({ student_id: s.id, full_name: s.fullName, admission_no: s.admissionNo, roll_no: s.rollNo, score: byStudent.get(s.id) ?? null })),
    };
  }

  /**
   * Bulk marks entry for one exam (+ subject, + class). Every id is checked against the
   * caller's school, every student must belong to the exam's class, every score must be
   * within 0..exam.max_marks, and a plain teacher must teach that subject to that class.
   * All-or-nothing: one bad row rejects the whole batch with a message naming it.
   */
  @Post('marks')
  @Roles(...MARKS_WRITE)
  async submitMarks(@Req() req: Req_, @Body() body: BulkMarksDto) {
    const branchId = req.user.branch_id;
    const exam = await this.prisma.exam.findFirst({ where: { id: body.exam_id, branchId } });
    if (!exam) throw new NotFoundException('exam not found');
    if (exam.classId && body.class_id && body.class_id !== exam.classId) {
      throw new BadRequestException('class_id does not match the exam\'s class');
    }
    const classId = exam.classId ?? body.class_id;
    if (!classId) throw new BadRequestException('class_id is required for an exam that is not tied to a class');
    await assertInBranch(this.prisma, 'class', classId, branchId);

    const subjectIds = [...new Set(body.marks.map((m) => m.subject_id ?? body.subject_id))];
    if (subjectIds.some((s) => !s)) throw new BadRequestException('subject_id is required (top level or per row)');
    const subjects = await this.prisma.subject.findMany({ where: { id: { in: subjectIds as string[] }, branchId } });
    if (subjects.length !== subjectIds.length) throw new NotFoundException('subject not found');
    for (const s of subjects) {
      if (!(await this.teaches(req.user, classId, s))) {
        throw new ForbiddenException(`You do not teach ${s.name} to this class`);
      }
    }

    const studentIds = [...new Set(body.marks.map((m) => m.student_id))];
    const students = await this.prisma.student.findMany({ where: { id: { in: studentIds }, branchId }, select: { id: true, classId: true, fullName: true } });
    if (students.length !== studentIds.length) throw new NotFoundException('student not found');
    const seen = new Set<string>();
    for (const m of body.marks) {
      const st = students.find((s) => s.id === m.student_id)!;
      if (st.classId !== classId) throw new BadRequestException(`${st.fullName} is not in this exam's class`);
      const key = `${m.student_id}|${m.subject_id ?? body.subject_id}`;
      if (seen.has(key)) throw new BadRequestException(`Duplicate row for ${st.fullName}`);
      seen.add(key);
      if (m.score < 0 || m.score > exam.maxMarks) {
        throw new BadRequestException(`Score for ${st.fullName} must be between 0 and ${exam.maxMarks}`);
      }
    }

    await retryOnUniqueRace(() => this.prisma.$transaction(
      body.marks.map((m) => {
        const subjectId = (m.subject_id ?? body.subject_id) as string;
        return this.prisma.examMark.upsert({
          where: { examId_studentId_subjectId: { examId: exam.id, studentId: m.student_id, subjectId } },
          create: { branchId, examId: exam.id, studentId: m.student_id, subjectId, score: m.score, maxScore: exam.maxMarks },
          update: { score: m.score, maxScore: exam.maxMarks },
        });
      }),
    ));
    await audit(this.prisma, req.user, 'UPDATE', 'exam_marks', exam.id, `${body.marks.length} marks, subjects ${subjectIds.join(',')}`);
    this.cache.invalidateBranch(branchId);
    return { success: true, recorded: body.marks.length };
  }

  // ─── Report cards ──────────────────────────────────────────

  /** Students of a class for the report-card picker (no raw ids typed by users). */
  @Get('class-roster/:classId')
  @Roles(...MARKS_WRITE)
  async roster(@Req() req: Req_, @Param('classId') classId: string) {
    await assertInBranch(this.prisma, 'class', classId, req.user.branch_id);
    await assertInBranch(this.prisma, 'class', classId, req.user.branch_id);
    const teacherScope = await teacherClassIds(this.prisma, req.user);
    if (teacherScope !== null && !teacherScope.includes(classId)) {
      throw new ForbiddenException('You can only view students in classes assigned to you');
    }
    return this.prisma.student.findMany({
      where: { branchId: req.user.branch_id, classId, status: 'Active' },
      select: { id: true, fullName: true, admissionNo: true, rollNo: true },
      orderBy: [{ rollNo: 'asc' }, { fullName: 'asc' }],
    });
  }

  /**
   * "Generate report cards for class": computes every card and returns per-student
   * status plus the URLs to download each PDF and the combined class PDF. Cards are
   * computed on demand from live marks (nothing is snapshotted), so a re-run after a
   * correction always reflects the corrected marks.
   */
  @Post('report-cards/class/:classId')
  @Roles(...MARKS_WRITE)
  async generateClass(@Req() req: Req_, @Param('classId') classId: string, @Query() q: Record<string, string>) {
    const teacherScope = await teacherClassIds(this.prisma, req.user);
    if (teacherScope !== null && !teacherScope.includes(classId)) {
      throw new ForbiddenException('You can only generate report cards for classes assigned to you');
    }
    const f = cardFilters(q);
    const cards = await this.cards.classCards(req.user.branch_id, classId, f);
    const qs = new URLSearchParams(Object.entries({ term: f.term, academic_year: f.academicYear, from: f.from, to: f.to }).filter(([, v]) => v) as [string, string][]).toString();
    const suffix = qs ? `?${qs}` : '';
    await audit(this.prisma, req.user, 'CREATE', 'report_cards', classId, `${cards.length} cards ${qs}`);
    return {
      class_id: classId,
      generated_at: new Date().toISOString(),
      total: cards.length,
      ready: cards.filter((c) => c.overall_pct !== null).length,
      class_pdf_url: `/api/exams/report-cards/class/${classId}/pdf${suffix}`,
      students: cards.map((c) => ({
        student_id: c.student.id,
        full_name: c.student.full_name,
        admission_no: c.student.admission_no,
        status: c.overall_pct === null ? 'no_marks' : 'ready',
        overall_pct: c.overall_pct,
        overall_grade: c.overall_grade,
        grade_point: c.grade_point,
        rank: c.rank,
        attendance_pct: c.attendance.pct,
        pdf_url: `/api/exams/report-card/${c.student.id}/pdf${suffix}`,
      })),
    };
  }

  /** Class summary page + every student's card, merged into one PDF. */
  @Get('report-cards/class/:classId/pdf')
  @Roles(...MARKS_WRITE)
  async classPdf(@Req() req: Req_, @Param('classId') classId: string, @Query() q: Record<string, string>, @Res() res: Response) {
    const teacherScope = await teacherClassIds(this.prisma, req.user);
    if (teacherScope !== null && !teacherScope.includes(classId)) {
      throw new ForbiddenException('You can only export report cards for classes assigned to you');
    }
    const f = cardFilters(q);
    const cards = await this.cards.classCards(req.user.branch_id, classId, f);
    const className = cards[0]?.student.class_name ?? classId;
    const buf = await this.cards.classPdf(cards, className, f);
    await audit(this.prisma, req.user, 'EXPORT', 'report_cards', classId, 'class pdf');
    return sendPdf(res, buf, `report-cards-${className}.pdf`);
  }

  // ─── Published (frozen) report cards ───────────────────────

  /**
   * Freeze the term: computes every active student's card in the class with the grade
   * engine and stores it as a ReportCardSnapshot. Parents and students only ever see
   * snapshots, so later mark edits don't change what was issued. Re-publishing replaces
   * the snapshots, needs `confirm: true`, and is audited.
   */
  @Post('report-cards/publish')
  @Roles(...R.ACADEMIC_SETUP)
  async publish(@Req() req: Req_, @Body() body: PublishReportCardsDto) {
    const branchId = req.user.branch_id;
    await assertInBranch(this.prisma, 'class', body.class_id, branchId);
    const term = body.term.trim();
    const year = body.academic_year.trim();
    const cards = await this.cards.classCards(branchId, body.class_id, { term, academicYear: year });
    if (!cards.length) throw new BadRequestException('The class has no active students');
    const ids = cards.map((c) => c.student.id);
    const existing = await this.prisma.reportCardSnapshot.findMany({
      where: { branchId, academicYear: year, term, studentId: { in: ids } },
      select: { studentId: true, publishedAt: true, data: true },
    });
    if (existing.length && !body.confirm) {
      const when = existing.map((e) => e.publishedAt).sort((a, b) => b.getTime() - a.getTime())[0];
      throw new ConflictException(
        `Report cards for ${term} ${year} were already published on ${when.toISOString().slice(0, 10)}. Send confirm: true to replace them.`,
      );
    }
    const publishedBy = (await currentStaffId(this.prisma, req.user)) ?? `user:${req.user.sub}`;
    const publishedAt = new Date();
    await this.prisma.$transaction(
      cards.map((card) => {
        const data = JSON.stringify(card);
        return this.prisma.reportCardSnapshot.upsert({
          where: { studentId_academicYear_term: { studentId: card.student.id, academicYear: year, term } },
          create: { branchId, studentId: card.student.id, classId: body.class_id, academicYear: year, term, data, publishedBy, publishedAt },
          update: { classId: body.class_id, data, publishedBy, publishedAt, fileKey: null },
        });
      }),
    );
    const changed = existing.filter((e) => {
      const card = cards.find((c) => c.student.id === e.studentId);
      return !!card && cardFingerprint(JSON.parse(e.data) as ReportCard) !== cardFingerprint(card);
    }).length;
    const republished = existing.length > 0;
    await audit(
      this.prisma, req.user, republished ? 'UPDATE' : 'APPROVE', 'report_card_publication', body.class_id,
      republished
        ? `REPUBLISHED ${term} ${year}: ${cards.length} cards, ${existing.length} replaced (${changed} with changed results)`
        : `published ${term} ${year}: ${cards.length} cards`,
    );
    return {
      class_id: body.class_id, term, academic_year: year, published: cards.length,
      republished, replaced: existing.length, replaced_with_changes: changed, published_at: publishedAt,
      without_marks: cards.filter((c) => c.overall_pct === null).length,
    };
  }

  /** Publication status of a class for a term: per student, published? and changed since? */
  @Get('report-cards/published')
  @Roles(...MARKS_WRITE)
  async publication(@Req() req: Req_, @Query('class_id') classId?: string, @Query('term') term?: string, @Query('academic_year') year?: string) {
    if (!classId || !term || !year) throw new BadRequestException('class_id, term and academic_year are required');
    const f = cardFilters({ term, academic_year: year });
    const teacherScope = await teacherClassIds(this.prisma, req.user);
    if (teacherScope !== null && !teacherScope.includes(classId)) {
      throw new ForbiddenException('You can only view report cards for classes assigned to you');
    }
    await assertInBranch(this.prisma, 'class', classId, req.user.branch_id);
    const cards = await this.cards.classCards(req.user.branch_id, classId, f);
    const snaps = await this.prisma.reportCardSnapshot.findMany({
      where: { branchId: req.user.branch_id, academicYear: f.academicYear, term: f.term, studentId: { in: cards.map((c) => c.student.id) } },
    });
    const by = new Map(snaps.map((x) => [x.studentId, x]));
    const students = cards.map((c) => {
      const snap = by.get(c.student.id);
      return {
        student_id: c.student.id, full_name: c.student.full_name, admission_no: c.student.admission_no,
        published_at: snap?.publishedAt ?? null,
        changed_since_publish: snap ? cardFingerprint(JSON.parse(snap.data) as ReportCard) !== cardFingerprint(c) : null,
        live: { overall_pct: c.overall_pct, overall_grade: c.overall_grade, rank: c.rank },
      };
    });
    const latest = snaps.map((x) => x.publishedAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      class_id: classId, term: f.term, academic_year: f.academicYear,
      published: snaps.length > 0, published_count: snaps.length, published_at: latest,
      changed_count: students.filter((x) => x.changed_since_publish).length, students,
    };
  }

  /** The published snapshot for a student (one term, or the latest when no term is given). */
  private snapshotFor(branchId: string, studentId: string, f: CardFilters): Promise<Snapshot | null> {
    return this.prisma.reportCardSnapshot.findFirst({
      where: { branchId, studentId, ...(f.term ? { term: f.term } : {}), ...(f.academicYear ? { academicYear: f.academicYear } : {}) },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /**
   * Which card a caller gets. Portal roles: ONLY the published snapshot (404 when the term
   * has not been published). Staff: the live card by default, or the snapshot with
   * `?source=published`; a live card carries `changed_since_publish` when that term has a
   * snapshot (needs term + academic_year).
   */
  private async resolveCard(req: Req_, studentId: string, q: Record<string, string>) {
    await assertInBranch(this.prisma, 'student', studentId, req.user.branch_id);
    await assertCanSeeStudent(this.prisma, req.user, studentId);
    const f = cardFilters(q);
    if (isPortal(req.user.role) || q.source === 'published') {
      const snap = await this.snapshotFor(req.user.branch_id, studentId, f);
      if (!snap) {
        const which = f.term ? `for ${f.term}${f.academicYear ? ` ${f.academicYear}` : ''} ` : '';
        throw new NotFoundException(`The report card ${which}has not been published yet`);
      }
      return {
        card: JSON.parse(snap.data) as ReportCard,
        publication: { status: 'published' as const, published_at: snap.publishedAt as Date | null, changed_since_publish: null as boolean | null },
      };
    }
    const card = await this.cards.studentCard(req.user.branch_id, studentId, f);
    const snap = f.term && f.academicYear ? await this.snapshotFor(req.user.branch_id, studentId, f) : null;
    return {
      card,
      publication: {
        status: 'live' as const,
        published_at: (snap?.publishedAt ?? null) as Date | null,
        changed_since_publish: snap ? cardFingerprint(JSON.parse(snap.data) as ReportCard) !== cardFingerprint(card) : null,
      },
    };
  }

  @Get('report-card/:studentId')
  @Roles(...READ_ALL)
  async reportCard(@Req() req: Req_, @Param('studentId') studentId: string, @Query() q: Record<string, string>) {
    const { card, publication } = await this.resolveCard(req, studentId, q);
    return { ...card, publication };
  }

  @Get('report-card/:studentId/pdf')
  @Roles(...READ_ALL)
  async reportCardPdf(@Req() req: Req_, @Param('studentId') studentId: string, @Query() q: Record<string, string>, @Res() res: Response) {
    const { card, publication } = await this.resolveCard(req, studentId, q);
    // A published card is rendered from the stored data, so its PDF never changes after publish.
    const published = publication.status === 'published';
    const buf = await this.cards.cardPdf(card, published ? publication.published_at : null);
    await audit(this.prisma, req.user, 'EXPORT', 'report_card', studentId, `pdf ${publication.status}`);
    const tag = published ? `-${[card.term, card.academic_year].filter(Boolean).join('-')}` : '';
    return sendPdf(res, buf, `report-card-${card.student.admission_no}${tag}.pdf`);
  }

  /** Legacy flat marks list (kept for older clients); same access rules as the report card. */
  @Get('reports/:studentId')
  @Roles(...READ_ALL)
  async report(@Req() req: Req_, @Param('studentId') studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, branchId: req.user.branch_id },
      include: { class: { select: { name: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');
    await assertCanSeeStudent(this.prisma, req.user, studentId);
    const marks = await this.prisma.examMark.findMany({
      where: { studentId, branchId: req.user.branch_id },
      include: { exam: { select: { name: true, date: true } }, subject: { select: { code: true, name: true, groupId: true } } },
      orderBy: [{ exam: { date: 'desc' } }, { subject: { groupId: 'asc' } }],
    });
    return {
      student: { full_name: student.fullName, admission_no: student.admissionNo, class_name: student.class?.name ?? null },
      results: marks.map((m) => ({
        exam_name: m.exam.name, date: m.exam.date, subject_code: m.subject.code, subject_name: m.subject.name,
        score: m.score, max_score: m.maxScore,
      })),
    };
  }

  // ─── Single exam (declared after literal routes) ───────────

  @Get(':id')
  @Roles(...R.ACADEMIC_STAFF)
  async one(@Req() req: Req_, @Param('id') id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { class: { select: { id: true, name: true, section: true } }, _count: { select: { examMarks: true } } },
    });
    if (!exam) throw new NotFoundException('exam not found');
    return exam;
  }

  @Put(':id')
  @Roles(...R.ACADEMIC_SETUP)
  async update(@Req() req: Req_, @Param('id') id: string, @Body() body: UpdateExamDto) {
    const exam = await this.prisma.exam.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!exam) throw new NotFoundException('exam not found');
    await assertInBranch(this.prisma, 'class', body.class_id, req.user.branch_id);
    const markCount = await this.prisma.examMark.count({ where: { examId: id } });
    if (body.class_id !== undefined && body.class_id !== exam.classId && markCount > 0) {
      throw new ConflictException('Cannot move an exam with marks to another class');
    }
    if (body.max_marks !== undefined && body.max_marks !== exam.maxMarks && markCount > 0) {
      const top = await this.prisma.examMark.aggregate({ where: { examId: id }, _max: { score: true } });
      if ((top._max.score ?? 0) > body.max_marks) {
        throw new ConflictException(`A recorded score (${top._max.score}) exceeds the new max_marks`);
      }
    }
    const updated = await this.prisma.exam.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.date !== undefined ? { date: body.date } : {}),
        ...(body.class_id !== undefined ? { classId: body.class_id || null } : {}),
        ...(body.term !== undefined ? { term: body.term.trim() || null } : {}),
        ...(body.academic_year !== undefined ? { academicYear: body.academic_year || null } : {}),
        ...(body.weight !== undefined ? { weight: body.weight } : {}),
        ...(body.max_marks !== undefined ? { maxMarks: body.max_marks } : {}),
      },
    });
    if (body.max_marks !== undefined && body.max_marks !== exam.maxMarks) {
      await this.prisma.examMark.updateMany({ where: { examId: id }, data: { maxScore: body.max_marks } });
    }
    await audit(this.prisma, req.user, 'UPDATE', 'exam', id, updated.name);
    this.cache.invalidateBranch(req.user.branch_id);
    return updated;
  }

  @Delete(':id')
  @Roles(...R.ACADEMIC_SETUP)
  async remove(@Req() req: Req_, @Param('id') id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { _count: { select: { examMarks: true, schedules: true } } },
    });
    if (!exam) throw new NotFoundException('exam not found');
    if (exam._count.examMarks > 0 || exam._count.schedules > 0) {
      throw new ConflictException('Cannot delete an exam with marks or a schedule attached');
    }
    await this.prisma.exam.delete({ where: { id } });
    await audit(this.prisma, req.user, 'DELETE', 'exam', id, exam.name);
    this.cache.invalidateBranch(req.user.branch_id);
    return { success: true };
  }
}
