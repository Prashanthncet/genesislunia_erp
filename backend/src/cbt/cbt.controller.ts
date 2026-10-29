import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import type { CbtAttempt, CbtQuestion, CbtTest } from '@prisma/client';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { assertInBranch, audit, ReqWithUser } from '../common/access';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto, CreateTestDto, GradeDto, OPTS, SaveAnswersDto, SubmitDto, UpdateQuestionDto } from './cbt.dto';
import { parseSchoolTime } from '../common/school-time';

/** Network grace after the deadline for autosave / a submit already in flight. */
export const GRACE_MS = 15_000;
const MAX_TEXT = 5000;

type Answers = Record<string, string>;
type Grades = Record<string, number>;

const parse = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Server-authoritative deadline: min(startedAt + duration, scheduled window end). */
export function attemptDeadline(test: Pick<CbtTest, 'startsAt' | 'durationMin'>, startedAt: Date): Date {
  const byDuration = startedAt.getTime() + test.durationMin * 60_000;
  const windowEnd = windowEndOf(test);
  return new Date(windowEnd ? Math.min(byDuration, windowEnd.getTime()) : byDuration);
}

function windowEndOf(test: Pick<CbtTest, 'startsAt' | 'durationMin'>): Date | null {
  if (!test.startsAt) return null;
  const t = parseSchoolTime(test.startsAt).getTime();
  return Number.isNaN(t) ? null : new Date(t + test.durationMin * 60_000);
}

/**
 * Grade an attempt: MCQs automatically; a blank subjective answer scores 0; written
 * subjective answers keep any manual grade already given, otherwise they are pending.
 */
export function gradeAttempt(questions: CbtQuestion[], answers: Answers, existing: Grades = {}) {
  const grades: Grades = {};
  const pending: string[] = [];
  let maxScore = 0;
  for (const q of questions) {
    maxScore += q.marks;
    const given = (answers[q.id] ?? '').trim();
    if (q.type === 'mcq') grades[q.id] = given && given === q.correctOption ? q.marks : 0;
    else if (!given) grades[q.id] = 0;
    else if (typeof existing[q.id] === 'number') grades[q.id] = existing[q.id];
    else pending.push(q.id);
  }
  const score = r2(Object.values(grades).reduce((s, g) => s + g, 0));
  return { grades, pending, score, maxScore: r2(maxScore), status: pending.length ? 'Submitted' : 'Graded' };
}

const stripAnswer = (q: CbtQuestion) => ({
  id: q.id, question: q.question, type: q.type, marks: q.marks,
  optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
});

@Controller('cbt')
@UseGuards(AuthGuard, RolesGuard)
export class CbtController {
  constructor(private prisma: PrismaService) {}

  // ─── helpers ────────────────────────────────────────────────

  private async questionsOf(test: CbtTest): Promise<CbtQuestion[]> {
    const ids = parse<string[]>(test.questionIds, []);
    const rows = await this.prisma.cbtQuestion.findMany({ where: { id: { in: ids }, branchId: test.branchId } });
    const byId = new Map(rows.map((q) => [q.id, q]));
    return ids.map((id) => byId.get(id)).filter((q): q is CbtQuestion => !!q);
  }

  /** The logged-in student's record (from User.studentId — never from the request body). */
  private async me(req: ReqWithUser) {
    const u = await this.prisma.user.findUnique({ where: { id: req.user.sub }, select: { studentId: true } });
    if (!u?.studentId) throw new ForbiddenException('This login is not linked to a student');
    const student = await this.prisma.student.findFirst({
      where: { id: u.studentId, branchId: req.user.branch_id },
      select: { id: true, fullName: true, classId: true },
    });
    if (!student) throw new ForbiddenException('This login is not linked to a student');
    return student;
  }

  /** Student's own attempt in their school, or 404. */
  private async myAttempt(req: ReqWithUser, attemptId: string) {
    const student = await this.me(req);
    const attempt = await this.prisma.cbtAttempt.findFirst({
      where: { id: attemptId, branchId: req.user.branch_id, studentId: student.id },
      include: { test: true },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return attempt;
  }

  /**
   * Close an attempt: grade what is saved (plus `extra` if still inside the deadline+grace).
   * Atomic on status so a double submit can't grade twice — the loser gets 409.
   */
  private async finish(attempt: CbtAttempt & { test: CbtTest }, extra?: Answers) {
    const now = new Date();
    const deadline = attemptDeadline(attempt.test, attempt.startedAt);
    const inTime = now.getTime() <= deadline.getTime() + GRACE_MS;
    const answers = { ...parse<Answers>(attempt.answers, {}), ...(inTime && extra ? extra : {}) };
    const questions = await this.questionsOf(attempt.test);
    const g = gradeAttempt(questions, answers);
    const res = await this.prisma.cbtAttempt.updateMany({
      where: { id: attempt.id, status: 'In Progress' },
      data: { answers: JSON.stringify(answers), grades: JSON.stringify(g.grades), score: g.score, maxScore: g.maxScore, status: g.status, submittedAt: now },
    });
    if (res.count === 0) throw new ConflictException('This test has already been submitted');
    return {
      attempt_id: attempt.id, status: g.status, score: g.score, max_score: g.maxScore,
      pending_manual_grading: g.pending.length > 0, auto_submitted: now.getTime() > deadline.getTime(),
      late_answers_ignored: !inTime && !!extra && Object.keys(extra).length > 0,
    };
  }

  /** Lazily auto-submit attempts whose time ran out while nobody was looking. */
  private async expireDue(where: { testId?: string; studentId?: string; branchId: string }) {
    const open = await this.prisma.cbtAttempt.findMany({ where: { ...where, status: 'In Progress' }, include: { test: true } });
    const now = Date.now();
    for (const a of open) {
      const forceClose = a.test.status === 'Completed';
      if (forceClose || now > attemptDeadline(a.test, a.startedAt).getTime() + GRACE_MS) {
        await this.finish(a).catch(() => undefined); // a concurrent submit already closed it
      }
    }
  }

  private validateAnswers(questions: CbtQuestion[], raw: Record<string, unknown>): Answers {
    const byId = new Map(questions.map((q) => [q.id, q]));
    const out: Answers = {};
    const entries = Object.entries(raw ?? {});
    if (entries.length > questions.length) throw new BadRequestException('Too many answers');
    for (const [qid, v] of entries) {
      const q = byId.get(qid);
      if (!q) throw new BadRequestException(`Question ${qid} is not part of this test`);
      if (v !== null && typeof v !== 'string') throw new BadRequestException('Answers must be strings');
      const s = (v ?? '') as string;
      if (q.type === 'mcq' && s !== '' && !(OPTS as readonly string[]).includes(s)) throw new BadRequestException('MCQ answers must be A, B, C or D');
      if (s.length > MAX_TEXT) throw new BadRequestException(`Answers are limited to ${MAX_TEXT} characters`);
      out[qid] = s;
    }
    return out;
  }

  private async attemptView(attempt: CbtAttempt & { test: CbtTest }) {
    const questions = await this.questionsOf(attempt.test);
    const deadline = attemptDeadline(attempt.test, attempt.startedAt);
    const now = new Date();
    return {
      attempt_id: attempt.id,
      test_id: attempt.testId,
      title: attempt.test.title,
      duration_min: attempt.test.durationMin,
      status: attempt.status,
      started_at: attempt.startedAt,
      submitted_at: attempt.submittedAt,
      deadline: deadline.toISOString(),
      server_now: now.toISOString(),
      remaining_seconds: attempt.status === 'In Progress' ? Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 1000)) : 0,
      auto_submitted: !!attempt.submittedAt && attempt.submittedAt.getTime() > deadline.getTime(),
      questions: questions.map(stripAnswer),
      answers: parse<Answers>(attempt.answers, {}),
    };
  }

  // ─── Question bank (authors only — it contains the answers) ──

  @Get('questions')
  @Roles(...R.CBT_AUTHOR)
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
  @Roles(...R.CBT_AUTHOR)
  async createQuestion(@Req() req: ReqWithUser, @Body() body: CreateQuestionDto) {
    await assertInBranch(this.prisma, 'class', body.class_id, req.user.branch_id);
    await assertInBranch(this.prisma, 'subject', body.subject_id, req.user.branch_id);
    const type = body.type ?? 'mcq';
    if (type === 'mcq' && (!body.option_a || !body.option_b || !body.option_c || !body.option_d || !body.correct_option)) {
      throw new BadRequestException('MCQ requires option_a..option_d and correct_option (A–D)');
    }
    const q = await this.prisma.cbtQuestion.create({
      data: {
        branchId: req.user.branch_id,
        subjectId: body.subject_id || null,
        classId: body.class_id || null,
        question: body.question,
        type,
        optionA: type === 'mcq' ? body.option_a! : null,
        optionB: type === 'mcq' ? body.option_b! : null,
        optionC: type === 'mcq' ? body.option_c! : null,
        optionD: type === 'mcq' ? body.option_d! : null,
        correctOption: type === 'mcq' ? body.correct_option! : null,
        marks: body.marks ?? 1,
      },
    });
    return { id: q.id };
  }

  @Put('questions/:id')
  @Roles(...R.CBT_AUTHOR)
  async updateQuestion(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: UpdateQuestionDto) {
    const existing = await this.prisma.cbtQuestion.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Question not found');
    if (existing.type !== 'mcq' && body.correct_option !== undefined) throw new BadRequestException('Subjective questions have no correct option');
    await this.prisma.cbtQuestion.update({
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
    return { id, success: true };
  }

  @Delete('questions/:id')
  @Roles(...R.CBT_AUTHOR)
  async deleteQuestion(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.cbtQuestion.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Question not found');
    const used = await this.prisma.cbtTest.count({ where: { branchId: req.user.branch_id, questionIds: { contains: `"${id}"` } } });
    if (used > 0) throw new ConflictException('Question is used in a test; remove it from the test first');
    await this.prisma.cbtQuestion.delete({ where: { id } });
    return { success: true };
  }

  // ─── Tests (authors) ────────────────────────────────────────

  @Get('tests')
  @Roles(...R.CBT_AUTHOR)
  async listTests(@Req() req: ReqWithUser, @Query('class_id') classId?: string, @Query('status') status?: string) {
    const tests = await this.prisma.cbtTest.findMany({
      where: { branchId: req.user.branch_id, ...(classId ? { classId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    const counts = await this.prisma.cbtAttempt.groupBy({
      by: ['testId', 'status'],
      where: { branchId: req.user.branch_id, testId: { in: tests.map((t) => t.id) } },
      _count: { _all: true },
    });
    return tests.map((t) => {
      const c = counts.filter((x) => x.testId === t.id);
      const n = (s: string) => c.find((x) => x.status === s)?._count._all ?? 0;
      return {
        ...t,
        question_count: parse<string[]>(t.questionIds, []).length,
        attempts: { in_progress: n('In Progress'), submitted: n('Submitted'), graded: n('Graded') },
      };
    });
  }

  @Get('tests/:id')
  @Roles(...R.CBT_AUTHOR, ROLE.STUDENT)
  async getTest(@Req() req: ReqWithUser, @Param('id') id: string, @Query('include_answers') includeAnswers?: string) {
    const test = await this.prisma.cbtTest.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!test) throw new NotFoundException('Test not found');
    if (req.user.role === ROLE.STUDENT) {
      // Students see the cover page only; questions come with their attempt.
      const student = await this.me(req);
      if (test.status === 'Draft' || test.classId !== student.classId) throw new NotFoundException('Test not found');
      const attempt = await this.prisma.cbtAttempt.findUnique({ where: { testId_studentId: { testId: id, studentId: student.id } } });
      return {
        id: test.id, title: test.title, status: test.status, duration_min: test.durationMin, starts_at: test.startsAt ? parseSchoolTime(test.startsAt).toISOString() : null,
        question_count: parse<string[]>(test.questionIds, []).length,
        attempt: attempt ? { id: attempt.id, status: attempt.status } : null,
      };
    }
    const questions = await this.questionsOf(test);
    return { ...test, questions: includeAnswers === 'true' ? questions : questions.map(stripAnswer) };
  }

  @Post('tests')
  @Roles(...R.CBT_AUTHOR)
  async createTest(@Req() req: ReqWithUser, @Body() body: CreateTestDto) {
    await assertInBranch(this.prisma, 'class', body.class_id, req.user.branch_id);
    await assertInBranch(this.prisma, 'subject', body.subject_id, req.user.branch_id);
    const ids = [...new Set(body.question_ids)];
    const owned = await this.prisma.cbtQuestion.count({ where: { id: { in: ids }, branchId: req.user.branch_id } });
    if (owned !== ids.length) throw new BadRequestException('One or more question_ids are invalid for this branch');
    const test = await this.prisma.cbtTest.create({
      data: {
        branchId: req.user.branch_id,
        title: body.title,
        classId: body.class_id,
        subjectId: body.subject_id || null,
        durationMin: body.duration_min ?? 30,
        // Stored as a UTC instant; zone-less input means school-local time.
        startsAt: body.starts_at ? parseSchoolTime(body.starts_at).toISOString() : null,
        questionIds: JSON.stringify(ids),
        createdBy: req.user.sub,
        status: 'Draft',
      },
    });
    return { id: test.id };
  }

  @Put('tests/:id/publish')
  @Roles(...R.CBT_AUTHOR)
  async publish(@Req() req: ReqWithUser, @Param('id') id: string) {
    const test = await this.prisma.cbtTest.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!test) throw new NotFoundException('Test not found');
    if (test.status !== 'Draft') throw new ConflictException('Only Draft tests can be published');
    const publishedAt = new Date();
    await this.prisma.cbtTest.update({ where: { id }, data: { status: 'Published', publishedAt } });
    await audit(this.prisma, req.user, 'APPROVE', 'cbt_test', id, 'published');
    return { success: true, status: 'Published', published_at: publishedAt };
  }

  /** Closes the test: every unfinished attempt is auto-submitted with what was saved. */
  @Put('tests/:id/complete')
  @Roles(...R.CBT_AUTHOR)
  async complete(@Req() req: ReqWithUser, @Param('id') id: string) {
    const test = await this.prisma.cbtTest.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!test) throw new NotFoundException('Test not found');
    await this.prisma.cbtTest.update({ where: { id }, data: { status: 'Completed' } });
    await this.expireDue({ testId: id, branchId: req.user.branch_id });
    return { success: true, status: 'Completed' };
  }

  @Delete('tests/:id')
  @Roles(...R.CBT_AUTHOR)
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

  // ─── Student flow ───────────────────────────────────────────

  /** Published / completed tests for the student's class, with their own attempt status. */
  @Get('my-tests')
  @Roles(ROLE.STUDENT)
  async myTests(@Req() req: ReqWithUser) {
    const student = await this.me(req);
    await this.expireDue({ studentId: student.id, branchId: req.user.branch_id });
    if (!student.classId) return [];
    const tests = await this.prisma.cbtTest.findMany({
      where: { branchId: req.user.branch_id, classId: student.classId, status: { in: ['Published', 'Completed'] } },
      orderBy: { createdAt: 'desc' },
    });
    const attempts = await this.prisma.cbtAttempt.findMany({ where: { studentId: student.id, testId: { in: tests.map((t) => t.id) } } });
    const byTest = new Map(attempts.map((a) => [a.testId, a]));
    const now = Date.now();
    return tests.map((t) => {
      const a = byTest.get(t.id);
      const windowEnd = windowEndOf(t);
      const opensAt = t.startsAt ? parseSchoolTime(t.startsAt).getTime() : null;
      const open = t.status === 'Published' && (!opensAt || now >= opensAt) && (!windowEnd || now <= windowEnd.getTime());
      return {
        id: t.id, title: t.title, subject_id: t.subjectId, duration_min: t.durationMin, starts_at: t.startsAt ? parseSchoolTime(t.startsAt).toISOString() : null,
        window_end: windowEnd?.toISOString() ?? null, test_status: t.status,
        question_count: parse<string[]>(t.questionIds, []).length,
        attempt_id: a?.id ?? null,
        my_status: a ? a.status : open ? 'Not started' : opensAt && now < opensAt ? 'Upcoming' : 'Missed',
        can_start: !a ? open : a.status === 'In Progress',
        deadline: a ? attemptDeadline(t, a.startedAt).toISOString() : null,
      };
    });
  }

  /** Start (or resume) — student id comes from the login, never from the body. */
  @Post('tests/:id/start')
  @Roles(ROLE.STUDENT)
  async start(@Req() req: ReqWithUser, @Param('id') id: string) {
    const student = await this.me(req);
    const test = await this.prisma.cbtTest.findFirst({ where: { id, branchId: req.user.branch_id, classId: student.classId ?? '__none__' } });
    if (!test || test.status === 'Draft') throw new NotFoundException('Test not found');
    await this.expireDue({ testId: id, studentId: student.id, branchId: req.user.branch_id });

    let attempt = await this.prisma.cbtAttempt.findUnique({ where: { testId_studentId: { testId: id, studentId: student.id } }, include: { test: true } });
    if (!attempt) {
      if (test.status !== 'Published') throw new ConflictException('This test is closed');
      const now = Date.now();
      if (test.startsAt && now < parseSchoolTime(test.startsAt).getTime()) throw new ConflictException('This test has not opened yet');
      const windowEnd = windowEndOf(test);
      if (windowEnd && now > windowEnd.getTime()) throw new ConflictException('The window for this test has closed');
      try {
        await this.prisma.cbtAttempt.create({
          data: { branchId: req.user.branch_id, testId: id, studentId: student.id, answers: '{}', status: 'In Progress', startedAt: new Date(), submittedAt: null },
        });
      } catch (err) {
        if (!(err instanceof Error && err.message.includes('Unique constraint'))) throw err; // double-click: resume the other one
      }
      attempt = await this.prisma.cbtAttempt.findUnique({ where: { testId_studentId: { testId: id, studentId: student.id } }, include: { test: true } });
    }
    return this.attemptView(attempt!);
  }

  /** Paper + saved answers + server clock, for (re)loading the player. */
  @Get('attempts/:id')
  @Roles(ROLE.STUDENT)
  async getAttempt(@Req() req: ReqWithUser, @Param('id') id: string) {
    let attempt = await this.myAttempt(req, id);
    if (attempt.status === 'In Progress') {
      await this.expireDue({ testId: attempt.testId, studentId: attempt.studentId, branchId: req.user.branch_id });
      attempt = await this.myAttempt(req, id);
    }
    return this.attemptView(attempt);
  }

  /** Autosave: merges answers; refused once the deadline (+15 s grace) has passed. */
  @Put('attempts/:id/answers')
  @Roles(ROLE.STUDENT)
  async saveAnswers(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: SaveAnswersDto) {
    const attempt = await this.myAttempt(req, id);
    if (attempt.status !== 'In Progress') throw new ConflictException('This test has already been submitted');
    const deadline = attemptDeadline(attempt.test, attempt.startedAt);
    if (attempt.test.status !== 'Published' || Date.now() > deadline.getTime() + GRACE_MS) {
      throw new ConflictException('Time is up — answers can no longer be changed');
    }
    const questions = await this.questionsOf(attempt.test);
    const merged = { ...parse<Answers>(attempt.answers, {}), ...this.validateAnswers(questions, body.answers) };
    const res = await this.prisma.cbtAttempt.updateMany({ where: { id, status: 'In Progress' }, data: { answers: JSON.stringify(merged) } });
    if (res.count === 0) throw new ConflictException('This test has already been submitted');
    return { saved: Object.keys(body.answers).length, server_now: new Date().toISOString(), remaining_seconds: Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000)) };
  }

  /** One submission only. After the deadline the autosaved answers are graded and it is marked auto-submitted. */
  @Post('attempts/:id/submit')
  @Roles(ROLE.STUDENT)
  async submitAttempt(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: SubmitDto) {
    const attempt = await this.myAttempt(req, id);
    if (attempt.status !== 'In Progress') throw new ConflictException('This test has already been submitted');
    const questions = await this.questionsOf(attempt.test);
    const extra = body.answers ? this.validateAnswers(questions, body.answers) : undefined;
    return this.finish(attempt, extra);
  }

  /** Convenience alias used by older clients: submit my attempt for this test. */
  @Post('tests/:id/submit')
  @Roles(ROLE.STUDENT)
  async submitByTest(@Req() req: ReqWithUser, @Param('id') testId: string, @Body() body: SubmitDto) {
    const student = await this.me(req);
    const attempt = await this.prisma.cbtAttempt.findFirst({ where: { testId, studentId: student.id, branchId: req.user.branch_id } });
    if (!attempt) throw new NotFoundException('Start the test first');
    return this.submitAttempt(req, attempt.id, body);
  }

  /** My submitted attempts. Marks appear once fully graded; correct options once the test has closed. */
  @Get('my-results')
  @Roles(ROLE.STUDENT)
  async myResults(@Req() req: ReqWithUser) {
    const student = await this.me(req);
    await this.expireDue({ studentId: student.id, branchId: req.user.branch_id });
    const attempts = await this.prisma.cbtAttempt.findMany({
      where: { studentId: student.id, branchId: req.user.branch_id, status: { in: ['Submitted', 'Graded'] } },
      include: { test: true },
      orderBy: { submittedAt: 'desc' },
    });
    const now = Date.now();
    const out = [];
    for (const a of attempts) {
      const graded = a.status === 'Graded';
      const windowEnd = windowEndOf(a.test);
      const reveal = a.test.status === 'Completed' || (!!windowEnd && now > windowEnd.getTime());
      const deadline = attemptDeadline(a.test, a.startedAt);
      const answers = parse<Answers>(a.answers, {});
      const grades = parse<Grades>(a.grades, {});
      const questions = graded ? await this.questionsOf(a.test) : [];
      out.push({
        attempt_id: a.id, test_id: a.testId, title: a.test.title, status: graded ? 'Graded' : 'Awaiting grading',
        submitted_at: a.submittedAt, auto_submitted: !!a.submittedAt && a.submittedAt.getTime() > deadline.getTime(),
        score: graded ? a.score : null, max_score: a.maxScore,
        breakdown: graded
          ? questions.map((q) => ({
              question_id: q.id, question: q.question, type: q.type, marks: q.marks,
              your_answer: answers[q.id] ?? null, awarded: grades[q.id] ?? 0,
              ...(q.type === 'mcq' ? { options: { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } } : {}),
              correct_option: reveal && q.type === 'mcq' ? q.correctOption : null,
            }))
          : null,
      });
    }
    return out;
  }

  // ─── Grading + results (authors) ────────────────────────────

  /** Every written subjective answer still waiting for marks (or all, with include_graded=true). */
  @Get('grading-queue')
  @Roles(...R.CBT_AUTHOR)
  async gradingQueue(@Req() req: ReqWithUser, @Query('test_id') testId?: string, @Query('include_graded') includeGraded?: string) {
    await this.expireDue({ branchId: req.user.branch_id, ...(testId ? { testId } : {}) });
    const attempts = await this.prisma.cbtAttempt.findMany({
      where: { branchId: req.user.branch_id, status: { in: includeGraded === 'true' ? ['Submitted', 'Graded'] : ['Submitted'] }, ...(testId ? { testId } : {}) },
      include: { test: true, student: { select: { id: true, fullName: true, admissionNo: true } } },
      orderBy: { submittedAt: 'asc' },
      take: 500,
    });
    const questionCache = new Map<string, CbtQuestion[]>();
    const items = [];
    for (const a of attempts) {
      if (!questionCache.has(a.testId)) questionCache.set(a.testId, await this.questionsOf(a.test));
      const answers = parse<Answers>(a.answers, {});
      const grades = parse<Grades>(a.grades, {});
      for (const q of questionCache.get(a.testId)!) {
        if (q.type !== 'subjective' || !(answers[q.id] ?? '').trim()) continue;
        const graded = typeof grades[q.id] === 'number';
        if (graded && includeGraded !== 'true') continue;
        items.push({
          attempt_id: a.id, test_id: a.testId, test_title: a.test.title, student: a.student, submitted_at: a.submittedAt,
          question_id: q.id, question: q.question, max_marks: q.marks, answer: answers[q.id], awarded: graded ? grades[q.id] : null,
        });
      }
    }
    return items;
  }

  /** Award marks for one subjective answer; merged into the attempt's grades. */
  @Put('attempts/:attemptId/grade')
  @Roles(...R.CBT_AUTHOR)
  async gradeSubjective(@Req() req: ReqWithUser, @Param('attemptId') attemptId: string, @Body() body: GradeDto) {
    let attempt = await this.prisma.cbtAttempt.findFirst({ where: { id: attemptId, branchId: req.user.branch_id }, include: { test: true } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.status === 'In Progress') {
      await this.expireDue({ testId: attempt.testId, studentId: attempt.studentId, branchId: req.user.branch_id });
      attempt = await this.prisma.cbtAttempt.findFirst({ where: { id: attemptId }, include: { test: true } });
      if (!attempt || attempt.status === 'In Progress') throw new ConflictException('The student is still taking this test');
    }
    const questions = await this.questionsOf(attempt.test);
    const q = questions.find((x) => x.id === body.question_id);
    if (!q) throw new NotFoundException('Question not part of this test');
    if (q.type !== 'subjective') throw new BadRequestException('Only subjective questions are manually graded');
    if (body.marks < 0 || body.marks > q.marks) throw new BadRequestException(`marks must be between 0 and ${q.marks}`);
    const answers = parse<Answers>(attempt.answers, {});
    if (!(answers[q.id] ?? '').trim()) throw new BadRequestException('The student left this question blank (scored 0 automatically)');

    const existing = { ...parse<Grades>(attempt.grades, {}), [q.id]: body.marks };
    const g = gradeAttempt(questions, answers, existing);
    await this.prisma.cbtAttempt.update({
      where: { id: attempt.id },
      data: { grades: JSON.stringify(g.grades), score: g.score, maxScore: g.maxScore, status: g.status },
    });
    await audit(this.prisma, req.user, 'UPDATE', 'cbt_attempt', attempt.id, `graded ${q.id}: ${body.marks}/${q.marks}`);
    return { attempt_id: attempt.id, score: g.score, max_score: g.maxScore, status: g.status, grades: g.grades, pending: g.pending };
  }

  /** Teacher view of a test: every attempt with answers and per-question grades. */
  @Get('tests/:id/results')
  @Roles(...R.CBT_AUTHOR)
  async results(@Req() req: ReqWithUser, @Param('id') id: string) {
    const test = await this.prisma.cbtTest.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!test) throw new NotFoundException('Test not found');
    await this.expireDue({ testId: id, branchId: req.user.branch_id });
    const attempts = await this.prisma.cbtAttempt.findMany({
      where: { testId: id, branchId: req.user.branch_id },
      include: { student: { select: { id: true, fullName: true, admissionNo: true } } },
      orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
    });
    return attempts.map((a) => {
      const deadline = attemptDeadline(test, a.startedAt);
      return {
        attempt_id: a.id,
        student: a.student,
        status: a.status,
        score: a.score,
        max_score: a.maxScore,
        pct: a.score != null && a.maxScore ? Math.round((a.score / a.maxScore) * 1000) / 10 : null,
        started_at: a.startedAt,
        submitted_at: a.submittedAt,
        auto_submitted: !!a.submittedAt && a.submittedAt.getTime() > deadline.getTime(),
        answers: parse<Answers>(a.answers, {}),
        grades: parse<Grades>(a.grades, {}),
      };
    });
  }
}
