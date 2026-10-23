import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Band, bandFor, rankMap, summarise, validateBands, weightedPercent } from '../src/exams/grading';

/**
 * Phase 6 (academics, exams, grade engine, report cards) and Phase 7 (reports,
 * exports, cache). Runs against the fresh per-run e2e DB built from migrations + seed.
 */

const CBSE: Band[] = [
  { grade: 'A1', minPercent: 91, gradePoint: 10 },
  { grade: 'A2', minPercent: 81, gradePoint: 9 },
  { grade: 'B1', minPercent: 71, gradePoint: 8 },
  { grade: 'B2', minPercent: 61, gradePoint: 7 },
  { grade: 'C1', minPercent: 51, gradePoint: 6 },
  { grade: 'C2', minPercent: 41, gradePoint: 5 },
  { grade: 'D', minPercent: 33, gradePoint: 4 },
  { grade: 'E', minPercent: 0, gradePoint: 0 },
];

describe('Grade engine (unit)', () => {
  it('weighted average = sum(score/max*weight)/sum(weight)*100', () => {
    // 40/50 (80%) weight 2 + 50/100 (50%) weight 1 → (1.6 + 0.5) / 3 = 70%
    expect(weightedPercent([{ score: 40, maxScore: 50, weight: 2 }, { score: 50, maxScore: 100, weight: 1 }])).toBeCloseTo(70, 6);
    // equal weights → plain mean of percentages
    expect(weightedPercent([{ score: 30, maxScore: 60, weight: 1 }, { score: 90, maxScore: 100, weight: 1 }])).toBeCloseTo(70, 6);
    // zero max / zero weight rows are ignored; nothing countable → null
    expect(weightedPercent([{ score: 5, maxScore: 0, weight: 1 }])).toBeNull();
    expect(weightedPercent([])).toBeNull();
  });

  it('band boundaries: threshold is inclusive, just below drops a band', () => {
    expect(bandFor(91, CBSE)?.grade).toBe('A1');
    expect(bandFor(90.99, CBSE)?.grade).toBe('A2');
    expect(bandFor(33, CBSE)?.grade).toBe('D');
    expect(bandFor(32.9, CBSE)?.grade).toBe('E');
    expect(bandFor(0, CBSE)?.grade).toBe('E');
    expect(bandFor(100, CBSE)?.grade).toBe('A1');
  });

  it('band validation: needs a 0 band, unique thresholds and grades, monotonic points', () => {
    expect(validateBands(CBSE)).toBeNull();
    expect(validateBands([])).toMatch(/at least one/i);
    expect(validateBands([{ grade: 'A', minPercent: 50, gradePoint: 5 }])).toMatch(/0%/);
    expect(validateBands([{ grade: 'A', minPercent: 0, gradePoint: 5 }, { grade: 'B', minPercent: 0, gradePoint: 4 }])).toMatch(/overlap/);
    expect(validateBands([{ grade: 'A', minPercent: 0, gradePoint: 5 }, { grade: 'a', minPercent: 50, gradePoint: 6 }])).toMatch(/Duplicate/);
    expect(validateBands([{ grade: 'A', minPercent: 50, gradePoint: 1 }, { grade: 'B', minPercent: 0, gradePoint: 4 }])).toMatch(/higher grade point/);
    expect(validateBands([{ grade: 'A', minPercent: 120, gradePoint: 1 }, { grade: 'B', minPercent: 0, gradePoint: 0 }])).toMatch(/between 0 and 100/);
  });

  it('summary: per-subject weighted %, overall = mean of subjects, CGPA = mean grade point', () => {
    const m = (subjectId: string, score: number, maxScore: number, weight: number, examId = 'e') =>
      ({ subjectId, subjectName: subjectId, subjectCode: subjectId, examId, examName: examId, score, maxScore, weight });
    const s = summarise([m('MAT', 40, 50, 2, 'e1'), m('MAT', 50, 100, 1, 'e2'), m('ENG', 95, 100, 1)], CBSE);
    const mat = s.subjects.find((x) => x.subject_id === 'MAT')!;
    const eng = s.subjects.find((x) => x.subject_id === 'ENG')!;
    expect(mat.weighted_pct).toBe(70);
    expect(mat.grade).toBe('B2');
    expect(eng.grade).toBe('A1');
    expect(s.overall_pct).toBe(82.5);
    expect(s.overall_grade).toBe('A2');
    expect(s.grade_point).toBe(8.5);
    expect(summarise([], CBSE).overall_pct).toBeNull();
  });

  it('rank: competition ranking with ties, unmarked students unranked', () => {
    const r = rankMap([{ id: 'a', pct: 90 }, { id: 'b', pct: 80 }, { id: 'c', pct: 90 }, { id: 'd', pct: 70 }, { id: 'e', pct: null }]);
    expect([r.get('a'), r.get('c'), r.get('b'), r.get('d'), r.get('e')]).toEqual([1, 1, 3, 4, undefined]);
  });
});

describe('Academics, exams & reports (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};

  const LOGINS: Record<string, [string, string]> = {
    admin: ['schooladmin@sainik01.edu', 'Demo@Admin1'],
    principal: ['principal@sainik01.edu', 'Demo@Principal1'],
    hod: ['hod@sainik01.edu', 'Demo@Hod1'],
    teacher: ['teacher@sainik01.edu', 'Demo@Teacher1'],
    accounts: ['accounts@sainik01.edu', 'Demo@Accounts1'],
    hr: ['hr@sainik01.edu', 'Demo@Hr1'],
    parent: ['parent@sainik01.edu', 'Demo@Parent1'],
    student: ['student@sainik01.edu', 'Demo@Student1'],
    g2: ['admin@greenfield02.edu', 'Demo@Green1'],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    for (const [k, [email, password]] of Object.entries(LOGINS)) {
      const res = await request(server).post('/api/auth/login').send({ email, password });
      if (!res.body.token) throw new Error(`login failed for ${k}: ${res.status} ${JSON.stringify(res.body)}`);
      tok[k] = res.body.token;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (who: string) => ({
    get: (url: string) => request(server).get(url).set('Authorization', `Bearer ${tok[who]}`),
    post: (url: string, body?: object) => request(server).post(url).set('Authorization', `Bearer ${tok[who]}`).send(body ?? {}),
    put: (url: string, body?: object) => request(server).put(url).set('Authorization', `Bearer ${tok[who]}`).send(body ?? {}),
    patch: (url: string, body?: object) => request(server).patch(url).set('Authorization', `Bearer ${tok[who]}`).send(body ?? {}),
    del: (url: string) => request(server).delete(url).set('Authorization', `Bearer ${tok[who]}`),
  });
  const binary = (res: any, cb: (e: Error | null, b: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };
  const download = (who: string | null, url: string) => {
    const r = request(server).get(url).buffer(true).parse(binary);
    return who ? r.set('Authorization', `Bearer ${tok[who]}`) : r;
  };

  // ─── Academics ─────────────────────────────────────────────

  describe('academics', () => {
    const ids: Record<string, string> = {};

    it('syllabus: setup roles create via snake_case; teacher 403; other-school class 404; delete works', async () => {
      const ok = await as('hod').post('/api/academics/syllabus', { class_id: 'cls_10a', subject_id: 'sub_mat', title: 'E2E Phase6 Unit', description: 'd' });
      expect(ok.status).toBe(201);
      ids.syl = ok.body.id;
      expect((await as('teacher').post('/api/academics/syllabus', { class_id: 'cls_10a', subject_id: 'sub_mat', title: 'x' })).status).toBe(403);
      expect((await as('admin').post('/api/academics/syllabus', { class_id: 'g2_cls_5a', subject_id: 'sub_mat', title: 'x' })).status).toBe(404);
      expect((await as('admin').post('/api/academics/syllabus', { classId: 'cls_10a', subjectId: 'sub_mat', title: 'x' })).status).toBe(400);
      const tmp = await as('admin').post('/api/academics/syllabus', { class_id: 'cls_10a', subject_id: 'sub_eng', title: 'E2E delete me' });
      expect((await as('admin').del(`/api/academics/syllabus/${tmp.body.id}`)).status).toBe(200);
      expect(await prisma.syllabus.count({ where: { id: tmp.body.id } })).toBe(0);
    });

    it('lesson plan: teacher posts as self (teacher_id from login); posting as another teacher → 403', async () => {
      const own = await as('teacher').post('/api/academics/lesson-plans', { syllabus_id: ids.syl, topic: 'E2E teacher plan', date: '2026-10-20' });
      expect(own.status).toBe(201);
      expect(own.body.teacher_id).toBe('t_rajesh');
      ids.teacherPlan = own.body.id;
      const spoof = await as('teacher').post('/api/academics/lesson-plans', { syllabus_id: ids.syl, teacher_id: 't_meera', topic: 'spoof', date: '2026-10-20' });
      expect(spoof.status).toBe(403);
      const hod = await as('hod').post('/api/academics/lesson-plans', { syllabus_id: ids.syl, topic: 'E2E hod plan', date: '2026-10-21', status: 'Completed' });
      expect(hod.status).toBe(201);
      expect(hod.body.teacher_id).toBe('t_meera');
      ids.hodPlan = hod.body.id;
      // admin names a teacher explicitly; one from another school → 404
      expect((await as('admin').post('/api/academics/lesson-plans', { syllabus_id: ids.syl, teacher_id: 'g2_t_asha', topic: 'x', date: '2026-10-21' })).status).toBe(404);
      expect((await as('admin').post('/api/academics/lesson-plans', { syllabus_id: ids.syl, teacher_id: 't_meera', topic: 'x', date: 'not-a-date' })).status).toBe(400);
    });

    it("teacher cannot edit/delete another teacher's plan (403) but can update their own status", async () => {
      expect((await as('teacher').del(`/api/academics/lesson-plans/${ids.hodPlan}`)).status).toBe(403);
      expect((await as('teacher').put(`/api/academics/lesson-plans/${ids.hodPlan}`, { topic: 'hijack' })).status).toBe(403);
      expect((await as('teacher').patch(`/api/academics/lesson-plans/${ids.hodPlan}/status`, { status: 'Planned' })).status).toBe(403);
      expect(await prisma.lessonPlan.count({ where: { id: ids.hodPlan } })).toBe(1);
      const st = await as('teacher').patch(`/api/academics/lesson-plans/${ids.teacherPlan}/status`, { status: 'In Progress' });
      expect(st.status).toBe(200);
      expect((await as('teacher').patch(`/api/academics/lesson-plans/${ids.teacherPlan}/status`, { status: 'Done-ish' })).status).toBe(400);
    });

    it('syllabus progress: % of lesson plans Completed per unit and subject; delete guarded while plans exist', async () => {
      const res = await as('teacher').get('/api/academics/syllabus/progress?class_id=cls_10a');
      expect(res.status).toBe(200);
      const unit = res.body.units.find((u: { syllabus_id: string }) => u.syllabus_id === ids.syl);
      expect(unit).toMatchObject({ planned: 2, completed: 1, in_progress: 1, pct: 50 });
      expect(res.body.by_subject.some((s: { subject_id: string }) => s.subject_id === 'sub_mat')).toBe(true);
      expect((await as('admin').del(`/api/academics/syllabus/${ids.syl}`)).status).toBe(409);
    });

    it('assignments: snake_case create; teacher scoped to own items; parent sees only own class', async () => {
      const a = await as('teacher').post('/api/academics/assignments', { class_id: 'cls_10a', subject_id: 'sub_eng', title: 'E2E essay', due_date: '2026-11-01' });
      expect(a.status).toBe(201);
      expect(a.body.teacher_id).toBe('t_rajesh');
      const other = await as('hod').post('/api/academics/assignments', { class_id: 'cls_10a', subject_id: 'sub_mat', title: 'E2E hod hw', due_date: '2026-11-02' });
      expect(other.status).toBe(201);
      expect((await as('teacher').del(`/api/academics/assignments/${other.body.id}`)).status).toBe(403);
      expect((await as('teacher').del(`/api/academics/assignments/${a.body.id}`)).status).toBe(200);
      const parent = await as('parent').get('/api/academics/assignments');
      expect(parent.status).toBe(200);
      const classes = new Set(parent.body.map((x: { classId: string }) => x.classId));
      expect([...classes].every((c) => c === 'cls_10a' || c === 'cls_10b')).toBe(true);
      expect((await as('parent').get('/api/academics/assignments?class_id=cls_09a')).body).toHaveLength(0);
      expect((await as('parent').get('/api/academics/lesson-plans')).status).toBe(403);
      expect((await as('parent').post('/api/academics/assignments', { class_id: 'cls_10a', subject_id: 'sub_eng', title: 'x', due_date: '2026-11-01' })).status).toBe(403);
    });

    it('teacher dropdown: a teacher only sees themselves; HOD sees teaching staff', async () => {
      const t = await as('teacher').get('/api/academics/teachers');
      expect(t.body.map((s: { id: string }) => s.id)).toEqual(['t_rajesh']);
      const h = await as('hod').get('/api/academics/teachers');
      expect(h.body.length).toBeGreaterThan(5);
    });
  });

  // ─── Exams, marks, grade engine, report cards ──────────────

  describe('exams & marks', () => {
    const ids: Record<string, string> = {};
    let notTaught = '';

    beforeAll(async () => {
      // A cls_10a subject that teacher@ (t_rajesh) has NO timetable slot for.
      const slots = await prisma.timetableSlot.findMany({ where: { classId: 'cls_10a', teacherId: 't_rajesh' }, select: { subject: true } });
      const taught = new Set(slots.map((s) => s.subject.toLowerCase()));
      expect(taught.has('english')).toBe(true);
      const subjects = await prisma.subject.findMany({ where: { branchId: 'sainik01' } });
      notTaught = subjects.find((s) => !taught.has(s.name.toLowerCase()) && !taught.has(s.code.toLowerCase()))!.id;
    });

    it('exam CRUD: setup roles create; teacher 403; validation 400; other-school class 404', async () => {
      const a = await as('admin').post('/api/exams', { name: 'E2E Unit Test A', date: '2026-08-01', class_id: 'cls_10a', term: 'E2E-T1', academic_year: '2026-27', weight: 2, max_marks: 50 });
      expect(a.status).toBe(201);
      expect(a.body).toMatchObject({ weight: 2, maxMarks: 50, term: 'E2E-T1' });
      ids.a = a.body.id;
      const b = await as('hod').post('/api/exams', { name: 'E2E Unit Test B', date: '2026-09-01', class_id: 'cls_10a', term: 'E2E-T1', academic_year: '2026-27', weight: 1, max_marks: 100 });
      expect(b.status).toBe(201);
      ids.b = b.body.id;
      expect((await as('teacher').post('/api/exams', { name: 'x', date: '2026-08-01' })).status).toBe(403);
      expect((await as('admin').post('/api/exams', { name: 'x', date: '01/08/2026' })).status).toBe(400);
      expect((await as('admin').post('/api/exams', { name: 'x', date: '2026-08-01', max_marks: -5 })).status).toBe(400);
      expect((await as('admin').post('/api/exams', { name: 'x', date: '2026-08-01', class_id: 'g2_cls_5a' })).status).toBe(404);
      const tmp = await as('admin').post('/api/exams', { name: 'E2E tmp', date: '2026-08-01' });
      expect((await as('admin').put(`/api/exams/${tmp.body.id}`, { name: 'E2E tmp 2', weight: 3 })).body.weight).toBe(3);
      expect((await as('admin').del(`/api/exams/${tmp.body.id}`)).status).toBe(200);
      expect((await as('admin').del('/api/exams/ex_1')).status).toBe(409); // has marks
    });

    it('marks cross-school: g2_ex_1 / g2_stu_001 from sainik01 → 404 and the g2 mark is unchanged', async () => {
      const before = await prisma.examMark.findFirst({ where: { examId: 'g2_ex_1', studentId: 'g2_stu_001' } });
      expect((await as('admin').post('/api/exams/marks', { exam_id: 'g2_ex_1', subject_id: 'g2_sub_mat', marks: [{ student_id: 'g2_stu_001', score: 1 }] })).status).toBe(404);
      expect((await as('admin').post('/api/exams/marks', { exam_id: ids.a, subject_id: 'sub_mat', marks: [{ student_id: 'g2_stu_001', score: 1 }] })).status).toBe(404);
      expect((await as('admin').post('/api/exams/marks', { exam_id: ids.a, subject_id: 'g2_sub_mat', marks: [{ student_id: 'stu_001', score: 1 }] })).status).toBe(404);
      const after = await prisma.examMark.findFirst({ where: { examId: 'g2_ex_1', studentId: 'g2_stu_001' } });
      expect(after?.score).toBe(88);
      expect(after?.score).toBe(before?.score);
    });

    it('marks validation: score > maxMarks → 400, negative → 400, student not in exam class → 400, nothing written', async () => {
      const over = await as('admin').post('/api/exams/marks', { exam_id: ids.a, subject_id: 'sub_mat', marks: [{ student_id: 'stu_001', score: 40 }, { student_id: 'stu_002', score: 51 }] });
      expect(over.status).toBe(400);
      expect(String(over.body.message)).toMatch(/between 0 and 50/);
      expect((await as('admin').post('/api/exams/marks', { exam_id: ids.a, subject_id: 'sub_mat', marks: [{ student_id: 'stu_001', score: -1 }] })).status).toBe(400);
      const wrongClass = await as('admin').post('/api/exams/marks', { exam_id: ids.a, subject_id: 'sub_mat', marks: [{ student_id: 'stu_004', score: 10 }] });
      expect(wrongClass.status).toBe(400);
      expect(await prisma.examMark.count({ where: { examId: ids.a } })).toBe(0);
    });

    it('teacher scope: subject not taught to the class → 403; taught subject (English) → 201', async () => {
      const no = await as('teacher').post('/api/exams/marks', { exam_id: ids.a, subject_id: notTaught, marks: [{ student_id: 'stu_001', score: 10 }] });
      expect(no.status).toBe(403);
      const yes = await as('teacher').post('/api/exams/marks', { exam_id: ids.a, subject_id: 'sub_eng', marks: [{ student_id: 'stu_001', score: 45 }] });
      expect(yes.status).toBe(201);
      const scope = await as('teacher').get('/api/exams/my-teaching');
      expect(scope.body.all).toBe(false);
      expect(scope.body.pairs.some((p: { class_id: string; subject_id: string }) => p.class_id === 'cls_10a' && p.subject_id === 'sub_eng')).toBe(true);
      expect((await as('hod').get('/api/exams/my-teaching')).body.all).toBe(true);
    });

    it('bulk entry per exam+subject+class writes every row; grid reads them back', async () => {
      const a = await as('hod').post('/api/exams/marks', { exam_id: ids.a, subject_id: 'sub_mat', class_id: 'cls_10a', marks: [
        { student_id: 'stu_001', score: 40 }, { student_id: 'stu_002', score: 48 }, { student_id: 'stu_003', score: 20 },
      ] });
      expect(a.status).toBe(201);
      expect(a.body.recorded).toBe(3);
      const b = await as('hod').post('/api/exams/marks', { exam_id: ids.b, subject_id: 'sub_mat', marks: [
        { student_id: 'stu_001', score: 50 }, { student_id: 'stu_002', score: 90 },
      ] });
      expect(b.status).toBe(201);
      const grid = await as('hod').get(`/api/exams/marks?exam_id=${ids.a}&subject_id=sub_mat`);
      expect(grid.status).toBe(200);
      expect(grid.body.exam.max_marks).toBe(50);
      expect(grid.body.rows.find((r: { student_id: string }) => r.student_id === 'stu_001').score).toBe(40);
      expect((await as('teacher').get(`/api/exams/marks?exam_id=${ids.a}&subject_id=${notTaught}`)).status).toBe(403);
    });

    it('report card JSON: weighted subject %, band, overall, grade point, rank, attendance', async () => {
      const res = await as('admin').get('/api/exams/report-card/stu_001?term=E2E-T1&academic_year=2026-27');
      expect(res.status).toBe(200);
      const mat = res.body.subjects.find((s: { subject_id: string }) => s.subject_id === 'sub_mat');
      // (40/50*2 + 50/100*1) / 3 = 70% → B2 (61–70), GP 7
      expect(mat.weighted_pct).toBe(70);
      expect(mat.grade).toBe('B2');
      expect(mat.grade_point).toBe(7);
      const eng = res.body.subjects.find((s: { subject_id: string }) => s.subject_id === 'sub_eng');
      expect(eng.weighted_pct).toBe(90); // 45/50
      expect(res.body.overall_pct).toBe(80); // mean(70, 90)
      expect(res.body.overall_grade).toBe('B1');
      expect(res.body.grade_point).toBe(8); // mean(7, 9)
      // stu_002: (48/50*2 + 90/100)/3 = 94% > stu_001's 80% → stu_001 ranks 2nd
      expect(res.body.rank).toBe(2);
      expect(res.body.attendance).toHaveProperty('pct');
      expect(res.body.attendance.from).toBe('2026-04-01');
      expect(res.body.student.class_id).toBe('cls_10a');
    });

    it('report card PDF + other-school student 404', async () => {
      const pdf = await download('admin', '/api/exams/report-card/stu_001/pdf?term=E2E-T1&academic_year=2026-27');
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.headers['content-disposition']).toContain('attachment');
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      expect((await as('admin').get('/api/exams/report-card/g2_stu_001')).status).toBe(404);
    });

    it('portal: parent sees own child (200) but not another (403); student sees only self', async () => {
      // Parents only ever see a PUBLISHED (frozen) card: 404 until the term is published.
      expect((await as('parent').get('/api/exams/report-card/stu_001')).status).toBe(404);
      for (const class_id of ['cls_10a', 'cls_10b']) {
        const pub = await as('admin').post('/api/exams/report-cards/publish', { class_id, academic_year: '2026-27', term: 'E2E-T1' });
        expect(pub.status).toBeLessThan(300);
      }
      expect((await as('parent').get('/api/exams/report-card/stu_001')).status).toBe(200);
      expect((await as('parent').get('/api/exams/report-card/stu_004')).status).toBe(200);
      expect((await as('parent').get('/api/exams/report-card/stu_002')).status).toBe(403);
      expect((await download('parent', '/api/exams/report-card/stu_002/pdf')).status).toBe(403);
      expect((await as('student').get('/api/exams/report-card/stu_001')).status).toBe(200);
      expect((await as('student').get('/api/exams/report-card/stu_003')).status).toBe(403);
      expect((await as('parent').get('/api/exams/reports/stu_002')).status).toBe(403);
      expect((await as('parent').post('/api/exams/marks', { exam_id: ids.a, subject_id: 'sub_mat', marks: [{ student_id: 'stu_001', score: 50 }] })).status).toBe(403);
    });

    it('class report cards: per-student status + combined class PDF', async () => {
      const gen = await as('hod').post('/api/exams/report-cards/class/cls_10a?term=E2E-T1&academic_year=2026-27');
      expect(gen.status).toBe(201);
      expect(gen.body.total).toBeGreaterThanOrEqual(3);
      const s1 = gen.body.students.find((s: { student_id: string }) => s.student_id === 'stu_001');
      expect(s1).toMatchObject({ status: 'ready', rank: 2, overall_grade: 'B1' });
      expect(gen.body.students.some((s: { status: string }) => s.status === 'no_marks')).toBe(true);
      const pdf = await download('hod', gen.body.class_pdf_url);
      expect(pdf.status).toBe(200);
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      expect((await as('hod').post('/api/exams/report-cards/class/g2_cls_5a')).status).toBe(404);
    });

    it('grade bands: setup roles only; overlapping / gapped scales → 400; valid replace changes grades', async () => {
      expect((await as('teacher').put('/api/exams/grade-bands', { bands: [{ grade: 'P', min_percent: 0 }] })).status).toBe(403);
      expect((await as('admin').post('/api/exams/grade-bands', { grade: 'X', min_percent: 91, grade_point: 10 })).status).toBe(400);
      expect((await as('admin').put('/api/exams/grade-bands', { bands: [{ grade: 'A', min_percent: 50 }] })).status).toBe(400);
      const ok = await as('principal').put('/api/exams/grade-bands', { bands: [
        { grade: 'P', min_percent: 75, grade_point: 4, remark: 'Pass with merit' }, { grade: 'Q', min_percent: 0, grade_point: 0 },
      ] });
      expect(ok.status).toBe(200);
      const card = await as('admin').get('/api/exams/report-card/stu_001?term=E2E-T1&academic_year=2026-27');
      expect(card.body.overall_grade).toBe('P');
      // restore the seeded CBSE scale for the rest of the run
      const restore = await as('admin').put('/api/exams/grade-bands', { bands: CBSE.map((b) => ({ grade: b.grade, min_percent: b.minPercent, grade_point: b.gradePoint })) });
      expect(restore.status).toBe(200);
      expect(restore.body).toHaveLength(8);
    });
  });

  // ─── Reports ───────────────────────────────────────────────

  describe('reports', () => {
    it('teacher: 403 on payroll, fee and dashboard aggregates', async () => {
      for (const url of ['/api/reports/fees', '/api/reports/payroll', '/api/reports/dashboard', '/api/reports/summary', '/api/reports/performance', '/api/reports/defaulters']) {
        expect([url, (await as('teacher').get(url)).status]).toEqual([url, 403]);
      }
    });

    it('accounts gets fees; HOD gets performance but neither fees nor payroll; HR gets payroll but not fees', async () => {
      const fees = await as('accounts').get('/api/reports/fees');
      expect(fees.status).toBe(200);
      expect(fees.body.invoiced).toBeGreaterThan(0);
      expect(Array.isArray(fees.body.by_class)).toBe(true);
      expect((await as('hod').get('/api/reports/fees')).status).toBe(403);
      expect((await as('hod').get('/api/reports/payroll')).status).toBe(403);
      expect((await as('hod').get('/api/reports/performance')).status).toBe(200);
      const hodSummary = await as('hod').get('/api/reports/summary');
      expect(hodSummary.status).toBe(200);
      expect(hodSummary.body).not.toHaveProperty('payroll_total_net');
      const hodDash = await as('hod').get('/api/reports/dashboard');
      expect(hodDash.body.fees).toBeNull();
      expect((await as('hr').get('/api/reports/payroll')).status).toBe(200);
      expect((await as('hr').get('/api/reports/fees')).status).toBe(403);
      // R.PAYROLL (roles.ts) includes accounts, so accounts DOES see payroll totals.
      expect((await as('accounts').get('/api/reports/payroll')).status).toBe(200);
    });

    it('filters change results and are validated', async () => {
      const all = await as('principal').get('/api/reports/attendance');
      const one = await as('principal').get('/api/reports/attendance?class_id=cls_10a');
      expect(all.body.length).toBeGreaterThan(1);
      expect(one.body.map((r: { class_id: string }) => r.class_id)).toEqual(['cls_10a']);
      const secA = await as('principal').get('/api/reports/attendance?section=A');
      expect(secA.body.every((r: { section: string }) => r.section === 'A')).toBe(true);
      expect(secA.body.length).toBeLessThan(all.body.length);

      const feesAll = await as('accounts').get('/api/reports/fees');
      const fees10a = await as('accounts').get('/api/reports/fees?class_id=cls_10a');
      expect(fees10a.body.invoice_count).toBeLessThan(feesAll.body.invoice_count);
      const feesNone = await as('accounts').get('/api/reports/fees?from=2001-01-01&to=2001-12-31');
      expect(feesNone.body.invoice_count).toBe(0);

      const perf = await as('principal').get('/api/reports/performance?class_id=cls_10a');
      expect(perf.body.by_class).toHaveLength(1);
      expect(perf.body.by_class[0].avg_pct).not.toBeNull();

      expect((await as('principal').get('/api/reports/attendance?from=2026-13-01')).status).toBe(400);
      expect((await as('principal').get('/api/reports/attendance?from=2026-10-10&to=2026-10-01')).status).toBe(400);
      expect((await as('principal').get('/api/reports/attendance?class_id=g2_cls_5a')).status).toBe(404);
    });

    it('exports: csv / xlsx / pdf with correct content types and non-empty bodies; audited', async () => {
      const expected: Record<string, string> = { csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' };
      for (const report of ['performance', 'fees', 'attendance-summary', 'defaulters']) {
        for (const format of ['csv', 'xlsx', 'pdf']) {
          const res = await download('admin', `/api/reports/export/${report}?format=${format}&class_id=cls_10a`);
          expect([report, format, res.status]).toEqual([report, format, 200]);
          expect(res.headers['content-type']).toContain(expected[format]);
          expect(res.headers['content-disposition']).toMatch(new RegExp(`attachment; filename=".+\\.${format}"`));
          const body = res.body as Buffer;
          expect(body.length).toBeGreaterThan(20);
          if (format === 'pdf') expect(body.subarray(0, 4).toString()).toBe('%PDF');
          if (format === 'xlsx') expect(body.subarray(0, 2).toString()).toBe('PK');
        }
      }
      const csv = await download('admin', '/api/reports/export/performance?format=csv');
      expect(csv.body.toString('utf8')).toContain('class,subject,students,avg_pct,pass_rate');
      expect(await prisma.auditLog.count({ where: { action: 'EXPORT', entity: 'report', entityId: 'performance' } })).toBeGreaterThan(0);
    });

    it('exports: 401 without token, role-checked per report, bad report/format → 400', async () => {
      expect((await download(null, '/api/reports/export/fees?format=csv')).status).toBe(401);
      expect((await download('teacher', '/api/reports/export/students?format=csv')).status).toBe(403);
      expect((await download('hod', '/api/reports/export/students?format=csv')).status).toBe(403);
      expect((await download('hod', '/api/reports/export/fees?format=xlsx')).status).toBe(403);
      expect((await download('accounts', '/api/reports/export/fees?format=pdf')).status).toBe(200);
      expect((await download('admin', '/api/reports/export/nope')).status).toBe(400);
      expect((await download('admin', '/api/reports/export/fees?format=doc')).status).toBe(400);
    });

    it('cache: second call is a HIT with the same payload; ?fresh=1 recomputes', async () => {
      const url = '/api/reports/attendance?class_id=cls_10a&from=2020-01-01&to=2020-12-31';
      const first = await as('principal').get(url);
      expect(first.headers['x-cache']).toBe('MISS');
      expect(first.body[0].total_records).toBe(0);
      const second = await as('principal').get(url);
      expect(second.headers['x-cache']).toBe('HIT');
      expect(second.body).toEqual(first.body);

      await prisma.attendanceRecord.create({ data: { branchId: 'sainik01', studentId: 'stu_001', classId: 'cls_10a', date: '2020-06-15', status: 'Present' } });
      const stale = await as('principal').get(url);
      expect(stale.headers['x-cache']).toBe('HIT');
      expect(stale.body[0].total_records).toBe(0);
      const fresh = await as('principal').get(`${url}&fresh=1`);
      expect(fresh.headers['x-cache']).toBe('MISS');
      expect(fresh.body[0].total_records).toBe(1);
      expect(fresh.body[0].attendance_pct).toBe(100);
      // and the refreshed value is what the cache now serves
      expect((await as('principal').get(url)).body[0].total_records).toBe(1);
    });

    it('cache never crosses schools: g2 admin gets its own numbers', async () => {
      const g2 = await as('g2').get('/api/reports/attendance');
      expect(g2.status).toBe(200);
      expect(g2.body.map((r: { class_id: string }) => r.class_id)).toEqual(['g2_cls_5a']);
    });
  });
});
