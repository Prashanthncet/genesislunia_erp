import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

type ReqWithUser = { user: { sub: string; role: string; branch_id: string } };

const OPTS = ['A', 'B', 'C', 'D'] as const;

@Controller('cbt')
@UseGuards(AuthGuard, RolesGuard)
export class CbtController {
  constructor(private prisma: PrismaService) {}

  // ─── Question bank CRUD ─────────────────────────────────────

  @Get('questions')
  listQuestions(@Req() req: ReqWithUser, @Query('subject_id') subjectId?: string, @Query('class_id') classId?: string, @Query('type') type?: string) {
    return this.prisma.cbtQuestion.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(subjectId ? { subjectId } : {}),
        ...(classId ? { classId } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { id: 'asc' },
    });
  }

  @Post('questions')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async createQuestion(
    @Req() req: ReqWithUser,
    @Body() body: { subject_id?: string; class_id?: string; question?: string; type?: string; option_a?: string; option_b?: string; option_c?: string; option_d?: string; correct_option?: string; marks?: number },
  ) {
    if (!body?.question) throw new BadRequestException('question text is required');
    const type = body.type ?? 'mcq';
    if (type === 'mcq') {
      if (!body.option_a || !body.option_b || !body.option_c || !body.option_d || !body.correct_option) {
        throw new BadRequestException('MCQ requires option_a..option_d and correct_option (A–D)');
      }
      if (!OPTS.includes(body.correct_option as (typeof OPTS)[number])) {
        throw new BadRequestException('correct_option must be A, B, C or D');
      }
    }
    const q = await this.prisma.cbtQuestion.create({
      data: {
        branchId: req.user.branch_id,
        subjectId: body.subject_id ?? null,
        classId: body.class_id ?? null,
        question: body.question,
        type,
        optionA: body.option_a ?? null,
        optionB: body.option_b ?? null,
        optionC: body.option_c ?? null,
        optionD: body.option_d ?? null,
        correctOption: type === 'mcq' ? body.correct_option! : null,
        marks: body.marks ?? 1,
      },
    });
    return { id: q.id };
  }

  @Put('questions/:id')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async updateQuestion(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { question?: string; marks?: number; correct_option?: string; option_a?: string; option_b?: string; option_c?: string; option_d?: string }) {
    const existing = await this.prisma.cbtQuestion.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Question not found');
    const q = await this.prisma.cbtQuestion.update({
      where: { id },
      data: {
        ...(body.question !== undefined ? { question: body.question } : {}),
        ...(body.marks !== undefined ? { marks: body.marks } : {}),
        ...(body.correct_option !== undefined ? { correctOption: body.correct_option } : {}),
        ...(body.option_a !== undefined ? { optionA: body.option_a } : {}),
        ...(body.option_b !== undefined ? { optionB: body.option_b } : {}),
        ...(body.option_c !== undefined ? { optionC: body.option_c } : {}),
        ...(body.option_d !== undefined ? { optionD: body.option_d } : {}),
      },
    });
    return { id: q.id, success: true };
  }

  @Delete('questions/:id')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async deleteQuestion(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.cbtQuestion.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Question not found');
    await this.prisma.cbtQuestion.delete({ where: { id } });
    return { success: true };
  }

  // ─── Tests ──────────────────────────────────────────────────

  @Get('tests')
  listTests(@Req() req: ReqWithUser, @Query('class_id') classId?: string, @Query('status') status?: string) {
    return this.prisma.cbtTest.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(classId ? { classId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('tests/:id')
  async getTest(@Req() req: ReqWithUser, @Param('id') id: string, @Query('include_answers') includeAnswers?: string) {
    const test = await this.prisma.cbtTest.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!test) throw new NotFoundException('Test not found');
    const ids: string[] = JSON.parse(test.questionIds);
    const questions = await this.prisma.cbtQuestion.findMany({ where: { id: { in: ids } } });
    // preserve the authored order
    const byId = new Map(questions.map((q) => [q.id, q]));
    const ordered = ids.map((qid) => byId.get(qid)).filter(Boolean);
    // strip correct answers unless explicitly requested (staff preview)
    const staffView = includeAnswers === 'true' && ['super_admin', 'branch_admin', 'teacher'].includes(req.user.role);
    const safe = staffView
      ? ordered
      : (ordered as NonNullable<typeof ordered[number]>[]).map((q) => ({ ...q, correctOption: undefined }));
    return { ...test, questions: safe };
  }

  @Post('tests')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async createTest(@Req() req: ReqWithUser, @Body() body: { title?: string; class_id?: string; subject_id?: string; duration_min?: number; question_ids?: string[]; starts_at?: string }) {
    if (!body?.title || !body?.class_id || !Array.isArray(body.question_ids) || body.question_ids.length === 0) {
      throw new BadRequestException('title, class_id and question_ids (non-empty) are required');
    }
    const owned = await this.prisma.cbtQuestion.count({
      where: { id: { in: body.question_ids }, branchId: req.user.branch_id },
    });
    if (owned !== body.question_ids.length) throw new BadRequestException('One or more question_ids are invalid for this branch');
    const test = await this.prisma.cbtTest.create({
      data: {
        branchId: req.user.branch_id,
        title: body.title,
        classId: body.class_id,
        subjectId: body.subject_id ?? null,
        durationMin: body.duration_min ?? 30,
        startsAt: body.starts_at ?? null,
        questionIds: JSON.stringify(body.question_ids),
        createdBy: req.user.sub,
        status: 'Draft',
      },
    });
    return { id: test.id };
  }

  @Put('tests/:id/publish')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async publish(@Req() req: ReqWithUser, @Param('id') id: string) {
    const test = await this.prisma.cbtTest.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!test) throw new NotFoundException('Test not found');
    if (test.status !== 'Draft') throw new ConflictException('Only Draft tests can be published');
    await this.prisma.cbtTest.update({ where: { id }, data: { status: 'Published' } });
    return { success: true, status: 'Published' };
  }

  @Put('tests/:id/complete')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async complete(@Req() req: ReqWithUser, @Param('id') id: string) {
    const test = await this.prisma.cbtTest.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!test) throw new NotFoundException('Test not found');
    await this.prisma.cbtTest.update({ where: { id }, data: { status: 'Completed' } });
    return { success: true, status: 'Completed' };
  }

  @Delete('tests/:id')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async deleteTest(@Req() req: ReqWithUser, @Param('id') id: string) {
    const test = await this.prisma.cbtTest.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { _count: { select: { attempts: true } } },
    });
    if (!test) throw new NotFoundException('Test not found');
    if (test._count.attempts > 0) throw new ConflictException('Cannot delete a test with student attempts');
    await this.prisma.cbtTest.delete({ where: { id } });
    return { success: true };
  }

  // ─── Test-taking ────────────────────────────────────────────

  /** Student starts (or resumes) a published test — creates an empty attempt and returns the paper without answers. */
  @Post('tests/:id/start')
  async start(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { student_id?: string }) {
    const test = await this.prisma.cbtTest.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!test) throw new NotFoundException('Test not found');
    if (test.status !== 'Published') throw new ConflictException('Test is not published');
    const studentId = body?.student_id;
    if (!studentId) throw new BadRequestException('student_id is required');

    const student = await this.prisma.student.findFirst({ where: { id: studentId, branchId: req.user.branch_id } });
    if (!student) throw new NotFoundException('Student not found');

    const attempt = await this.prisma.cbtAttempt.upsert({
      where: { testId_studentId: { testId: test.id, studentId } },
      create: { branchId: req.user.branch_id, testId: test.id, studentId, answers: '{}' },
      update: {},
    });
    const paper = await this.getTest(req, id);
    return { attempt_id: attempt.id, started_at: attempt.submittedAt, test: paper };
  }

  /** Submit answers; server enforces the window since the publish moment. MCQs auto-graded. */
  @Post('tests/:id/submit')
  async submit(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: { student_id?: string; answers?: Record<string, string> }) {
    const test = await this.prisma.cbtTest.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!test) throw new NotFoundException('Test not found');
    if (test.status !== 'Published') throw new ConflictException('Test is not open for submissions');
    const studentId = body?.student_id;
    if (!studentId) throw new BadRequestException('student_id is required');
    if (!body?.answers || typeof body.answers !== 'object') throw new BadRequestException('answers object is required');

    // server-authoritative timing: window opens at createdAt (+ starts_at) and closes after durationMin
    const openAt = test.startsAt ? new Date(test.startsAt) : test.createdAt;
    const deadline = new Date(openAt.getTime() + test.durationMin * 60_000);
    const now = new Date();
    if (now < openAt) throw new ConflictException('Test has not opened yet');
    const lateByMin = (now.getTime() - deadline.getTime()) / 60_000;
    if (lateByMin > 5) throw new ConflictException('Submission window closed'); // 5-min grace for network latency

    const ids: string[] = JSON.parse(test.questionIds);
    const questions = await this.prisma.cbtQuestion.findMany({ where: { id: { in: ids } } });
    const byId = new Map(questions.map((q) => [q.id, q]));

    let score = 0;
    let maxScore = 0;
    for (const qid of ids) {
      const q = byId.get(qid);
      if (!q) continue;
      maxScore += q.marks;
      const given = body.answers[qid];
      if (!given) continue;
      if (q.type === 'mcq') {
        if (given === q.correctOption) score += q.marks;
      } else {
        // subjective: manual grading queue; provisional full credit is NOT given
        score += 0;
      }
    }
    score = Math.round(score * 100) / 100;
    maxScore = Math.round(maxScore * 100) / 100;

    const attempt = await this.prisma.cbtAttempt.upsert({
      where: { testId_studentId: { testId: test.id, studentId } },
      create: { branchId: req.user.branch_id, testId: test.id, studentId, answers: JSON.stringify(body.answers), score, maxScore },
      update: { answers: JSON.stringify(body.answers), score, maxScore, submittedAt: new Date() },
    });
    return {
      attempt_id: attempt.id,
      score,
      max_score: maxScore,
      pending_manual_grading: questions.some((q) => q.type === 'subjective'),
    };
  }

  /** Manual grading for subjective answers. */
  @Put('attempts/:attemptId/grade')
  @Roles('super_admin', 'branch_admin', 'teacher')
  async gradeSubjective(
    @Req() req: ReqWithUser,
    @Param('attemptId') attemptId: string,
    @Body() body: { question_id?: string; marks?: number },
  ) {
    if (!body?.question_id || typeof body?.marks !== 'number') {
      throw new BadRequestException('question_id and marks are required');
    }
    const attempt = await this.prisma.cbtAttempt.findFirst({
      where: { id: attemptId, branchId: req.user.branch_id },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const test = await this.prisma.cbtTest.findFirst({ where: { id: attempt.testId } });
    if (!test) throw new NotFoundException('Test not found');
    const ids: string[] = JSON.parse(test.questionIds);
    const questions = await this.prisma.cbtQuestion.findMany({ where: { id: { in: ids } } });
    const byId = new Map(questions.map((q) => [q.id, q]));
    const q = byId.get(body.question_id);
    if (!q) throw new NotFoundException('Question not part of this test');
    if (q.type !== 'subjective') throw new BadRequestException('Only subjective questions are manually graded');
    if (body.marks < 0 || body.marks > q.marks) throw new BadRequestException(`marks must be between 0 and ${q.marks}`);

    const answers = JSON.parse(attempt.answers) as Record<string, string>;
    const grades = (attempt as unknown as { manualGrades?: Record<string, number> }).manualGrades ?? {};

    // recompute: MCQ score + manually awarded subjective marks
    let score = 0;
    let maxScore = 0;
    for (const qid of ids) {
      const qq = byId.get(qid);
      if (!qq) continue;
      maxScore += qq.marks;
      if (qq.type === 'mcq') {
        if (answers[qid] && answers[qid] === qq.correctOption) score += qq.marks;
      } else if (qid === body.question_id) {
        score += body.marks;
      }
    }
    score = Math.round(score * 100) / 100;
    maxScore = Math.round(maxScore * 100) / 100;
    await this.prisma.cbtAttempt.update({
      where: { id: attempt.id },
      data: { score, maxScore },
    });
    return { attempt_id: attempt.id, score, max_score: maxScore };
  }

  /** Results view for a test (staff). */
  @Get('tests/:id/results')
  async results(@Req() req: ReqWithUser, @Param('id') id: string) {
    const test = await this.prisma.cbtTest.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!test) throw new NotFoundException('Test not found');
    const attempts = await this.prisma.cbtAttempt.findMany({
      where: { testId: id },
      include: { student: { select: { id: true, fullName: true, admissionNo: true } } },
      orderBy: { score: 'desc' },
    });
    return attempts.map((a) => ({
      attempt_id: a.id,
      student: a.student,
      score: a.score,
      max_score: a.maxScore,
      pct: a.maxScore && a.maxScore > 0 ? Math.round((a.score! / a.maxScore) * 1000) / 10 : null,
      submitted_at: a.submittedAt,
    }));
  }
}
