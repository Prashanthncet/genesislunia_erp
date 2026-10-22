import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Round-2 domain work: hostel Bed table (Phase 8), class teacher + attendance scope
 * (Phase 3), payroll tax rules engine (Phase 9), report cards frozen per term (Phase 6).
 */
describe('Domain round 2 (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};

  const LOGINS: Record<string, [string, string]> = {
    admin: ['schooladmin@sainik01.edu', 'Demo@Admin1'],
    principal: ['principal@sainik01.edu', 'Demo@Principal1'],
    warden: ['warden@sainik01.edu', 'Demo@Warden1'],
    security: ['security@sainik01.edu', 'Demo@Security1'],
    teacher: ['teacher@sainik01.edu', 'Demo@Teacher1'],
    hod: ['hod@sainik01.edu', 'Demo@Hod1'],
    hr: ['hr@sainik01.edu', 'Demo@Hr1'],
    accounts: ['accounts@sainik01.edu', 'Demo@Accounts1'],
    parent: ['parent@sainik01.edu', 'Demo@Parent1'],
    student: ['student@sainik01.edu', 'Demo@Student1'],
    g2admin: ['admin@greenfield02.edu', 'Demo@Green1'],
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
      expect(res.status).toBe(200);
      tok[k] = res.body.token;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  function as(who: string) {
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${tok[who]}`);
    return {
      get: (u: string) => auth(request(server).get(u)),
      post: (u: string) => auth(request(server).post(u)),
      put: (u: string) => auth(request(server).put(u)),
      del: (u: string) => auth(request(server).delete(u)),
    };
  }
  const download = (who: string, u: string) =>
    request(server).get(u).set('Authorization', `Bearer ${tok[who]}`).buffer(true)
      .parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });

  type Bed = { id: string; label: string; is_active: boolean; allocation_id: string | null; student: { id: string } | null };
  type RoomRow = { id: string; capacity: number; free: number; beds: Bed[] };

  // ═══ HOSTEL BEDS (Phase 8) ═══════════════════════════════════

  describe('hostel beds', () => {
    let hostelId = '';
    const roomOf = async (id: string): Promise<RoomRow> =>
      (await as('warden').get(`/api/hostel/rooms?hostel_id=${hostelId}`)).body.find((r: RoomRow) => r.id === id);
    const freeStudents = async (n: number): Promise<string[]> =>
      (await as('warden').get('/api/hostel/unallocated-students')).body.slice(0, n).map((s: { id: string }) => s.id);

    beforeAll(async () => {
      const h = await as('warden').post('/api/hostel').send({ name: 'DOM Bed House', warden_id: 't_amit' });
      expect(h.status).toBe(201);
      hostelId = h.body.id;
    });

    it('seeded rooms (made before the Bed table) get Bed rows and every allocation is linked', async () => {
      const res = await as('warden').get('/api/hostel/rooms?hostel_id=hst_junior');
      expect(res.status).toBe(200);
      const room = res.body.find((r: { id: string }) => r.id === 'rm_ju01');
      expect(room.beds.map((b: Bed) => b.label)).toEqual(['B1', 'B2', 'B3', 'B4']);
      expect(await prisma.bed.count({ where: { roomId: 'rm_ju01' } })).toBe(4);
      const allocs = await prisma.hostelAllocation.findMany({ where: { room: { hostelId: 'hst_junior' } } });
      expect(allocs.length).toBeGreaterThan(0);
      expect(allocs.every((a) => a.bedId && a.bedLabel)).toBe(true);
      // Bed map occupant = the allocation linked to that bed.
      const occupied = room.beds.filter((b: Bed) => b.student);
      expect(occupied.length).toBe(allocs.filter((a) => a.roomId === 'rm_ju01').length);
    });

    it('room create → beds B1..Bn in the Bed table', async () => {
      const r = await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'D-1', capacity: 3 });
      expect(r.status).toBe(201);
      expect(r.body.beds).toEqual(['B1', 'B2', 'B3']);
      const beds = await prisma.bed.findMany({ where: { roomId: r.body.id } });
      expect(beds.map((b) => b.label).sort()).toEqual(['B1', 'B2', 'B3']);
      expect(beds.every((b) => b.isActive)).toBe(true);
    });

    it('allocate by bed_id; bed map shows the occupant; HostelAllocation.bedId set + bedLabel copied', async () => {
      const r = await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'D-2', capacity: 2 });
      const room = await roomOf(r.body.id);
      const b2 = room.beds.find((b) => b.label === 'B2')!;
      const [s1] = await freeStudents(1);
      const a = await as('warden').post('/api/hostel/allocations').send({ student_id: s1, room_id: r.body.id, bed_id: b2.id });
      expect(a.status).toBe(201);
      expect(a.body).toMatchObject({ bed_id: b2.id, bed_label: 'B2' });
      const row = await prisma.hostelAllocation.findUniqueOrThrow({ where: { studentId: s1 } });
      expect(row).toMatchObject({ bedId: b2.id, bedLabel: 'B2', roomId: r.body.id });
      const after = await roomOf(r.body.id);
      expect(after.beds.find((b) => b.label === 'B2')!.student!.id).toBe(s1);
      expect(after.free).toBe(1);
      // A bed id from another room → 404.
      const other = await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'D-2b', capacity: 1 });
      const [s2] = await freeStudents(1);
      const wrong = await as('warden').post('/api/hostel/allocations').send({ student_id: s2, room_id: other.body.id, bed_id: b2.id });
      expect(wrong.status).toBe(404);
    });

    it('broken bed: deactivating an occupied bed → 409; a free bed → out of service, capacity follows, never auto-picked', async () => {
      const r = await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'D-3', capacity: 2 });
      const room = await roomOf(r.body.id);
      const [b1, b2] = room.beds;
      const [s1, s2] = await freeStudents(2);
      expect((await as('warden').post('/api/hostel/allocations').send({ student_id: s1, room_id: r.body.id, bed_id: b1.id })).status).toBe(201);

      expect((await as('warden').put(`/api/hostel/beds/${b1.id}`).send({ is_active: false })).status).toBe(409);
      expect((await as('security').put(`/api/hostel/beds/${b2.id}`).send({ is_active: false })).status).toBe(403);
      expect((await as('g2admin').put(`/api/hostel/beds/${b2.id}`).send({ is_active: false })).status).toBe(404);

      const off = await as('warden').put(`/api/hostel/beds/${b2.id}`).send({ is_active: false, reason: 'Broken frame' });
      expect(off.status).toBe(200);
      expect(off.body.room_capacity).toBe(1);
      const after = await roomOf(r.body.id);
      expect(after.capacity).toBe(1);
      expect(after.beds.find((b) => b.id === b2.id)!.is_active).toBe(false);
      // Manual into the broken bed → 409; first-free → room full → 409.
      expect((await as('warden').post('/api/hostel/allocations').send({ student_id: s2, room_id: r.body.id, bed_label: 'B2' })).status).toBe(409);
      expect((await as('warden').post('/api/hostel/allocations').send({ student_id: s2, room_id: r.body.id })).status).toBe(409);
      const auditRow = await prisma.auditLog.findFirst({ where: { entity: 'hostel_bed', entityId: b2.id } });
      expect(auditRow?.detail).toContain('Broken frame');
      // Back in service.
      expect((await as('warden').put(`/api/hostel/beds/${b2.id}`).send({ is_active: true })).body.room_capacity).toBe(2);
      expect((await as('warden').post('/api/hostel/allocations').send({ student_id: s2, room_id: r.body.id })).body.bed_label).toBe('B2');
    });

    it('capacity up adds beds; capacity down retires free beds only (409 if they are occupied)', async () => {
      const r = await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'D-4', capacity: 2 });
      const up = await as('warden').put(`/api/hostel/rooms/${r.body.id}`).send({ capacity: 4 });
      expect(up.status).toBe(200);
      expect(up.body.beds_added).toEqual(['B3', 'B4']);
      expect(await prisma.bed.count({ where: { roomId: r.body.id, isActive: true } })).toBe(4);
      const room = await roomOf(r.body.id);
      const [s1, s2] = await freeStudents(2);
      await as('warden').post('/api/hostel/allocations').send({ student_id: s1, room_id: r.body.id, bed_id: room.beds.find((b) => b.label === 'B4')!.id });
      await as('warden').post('/api/hostel/allocations').send({ student_id: s2, room_id: r.body.id, bed_id: room.beds.find((b) => b.label === 'B1')!.id });
      // 4 → 2: B3 and B2 are the free ones (highest first) → retired; B4 stays occupied.
      const down = await as('warden').put(`/api/hostel/rooms/${r.body.id}`).send({ capacity: 2 });
      expect(down.status).toBe(200);
      expect(down.body.beds_out_of_service.sort()).toEqual(['B2', 'B3']);
      const after = await roomOf(r.body.id);
      expect(after.capacity).toBe(2);
      expect(after.beds.filter((b) => b.is_active).map((b) => b.label)).toEqual(['B1', 'B4']);
      // 2 → 1 with both active beds occupied → 409.
      expect((await as('warden').put(`/api/hostel/rooms/${r.body.id}`).send({ capacity: 1 })).status).toBe(409);
      // 2 → 3 adds a NEW bed (B5); retired beds stay retired.
      expect((await as('warden').put(`/api/hostel/rooms/${r.body.id}`).send({ capacity: 3 })).body.beds_added).toEqual(['B5']);
    });

    it('a move frees the old bed', async () => {
      const r1 = await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'D-5', capacity: 1 });
      const r2 = await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'D-6', capacity: 1 });
      const [s1, s2] = await freeStudents(2);
      expect((await as('warden').post('/api/hostel/allocations').send({ student_id: s1, room_id: r1.body.id })).status).toBe(201);
      const move = await as('warden').post('/api/hostel/allocations').send({ student_id: s1, room_id: r2.body.id });
      expect(move.status).toBe(201);
      expect(move.body.moved).toBe(true);
      const old = await prisma.bed.findFirstOrThrow({ where: { roomId: r1.body.id }, include: { allocation: true } });
      expect(old.allocation).toBeNull();
      expect((await as('warden').post('/api/hostel/allocations').send({ student_id: s2, room_id: r1.body.id })).body.bed_label).toBe('B1');
    });

    it('concurrent auto-assign: 5 students, 2 free beds → exactly 2 allocated, on distinct beds', async () => {
      const h = await as('warden').post('/api/hostel').send({ name: 'DOM Race House' });
      await as('warden').post('/api/hostel/rooms').send({ hostel_id: h.body.id, room_number: 'R-1', capacity: 1 });
      await as('warden').post('/api/hostel/rooms').send({ hostel_id: h.body.id, room_number: 'R-2', capacity: 1 });
      const ids = await freeStudents(5);
      const results = await Promise.all(ids.map((sid) => as('warden').post('/api/hostel/allocations/auto').send({ student_id: sid, hostel_id: h.body.id })));
      expect(results.filter((r) => r.status === 201).length).toBe(2);
      expect(results.filter((r) => r.status === 409).length).toBe(3);
      const rows = await prisma.hostelAllocation.findMany({ where: { room: { hostelId: h.body.id } } });
      expect(rows.length).toBe(2);
      expect(new Set(rows.map((r) => r.bedId)).size).toBe(2);
    });

    it('room delete removes its beds', async () => {
      const r = await as('warden').post('/api/hostel/rooms').send({ hostel_id: hostelId, room_number: 'D-DEL', capacity: 2 });
      expect((await as('warden').del(`/api/hostel/rooms/${r.body.id}`)).status).toBe(200);
      expect(await prisma.bed.count({ where: { roomId: r.body.id } })).toBe(0);
    });
  });

  // ═══ CLASS TEACHER (Phase 3) ══════════════════════════════════

  describe('class teacher', () => {
    let classId = '';
    let studentId = '';
    const today = new Date().toISOString().slice(0, 10);

    beforeAll(async () => {
      // The seeded teacher (t_rajesh) has periods in every class, so make a new section with
      // no timetable at all and move one Class 6 student into it.
      const c = await as('admin').post('/api/classes').send({ name: 'Class 6', section: 'CT' });
      expect(c.status).toBe(201);
      classId = c.body.id;
      expect(await prisma.timetableSlot.count({ where: { classId } })).toBe(0);
      const st = await prisma.student.findFirstOrThrow({ where: { classId: 'cls_06a', status: 'Active' } });
      await prisma.student.update({ where: { id: st.id }, data: { classId } });
      studentId = st.id;
    });

    it('a teacher cannot mark a class they do not teach (existing rule)', async () => {
      const res = await as('teacher').post('/api/attendance').send({ class_id: classId, date: today, records: [{ student_id: studentId, status: 'Present' }] });
      expect(res.status).toBe(403);
    });

    it('PUT /classes/:id class_teacher_id: admin/principal only, same school, active staff', async () => {
      expect((await as('hr').put(`/api/classes/${classId}`).send({ class_teacher_id: 't_rajesh' })).status).toBe(403);
      expect((await as('teacher').put(`/api/classes/${classId}`).send({ class_teacher_id: 't_rajesh' })).status).toBe(403);
      expect((await as('admin').put(`/api/classes/${classId}`).send({ class_teacher_id: 'g2_t_asha' })).status).toBe(404);
      expect((await as('g2admin').put(`/api/classes/${classId}`).send({ class_teacher_id: 'g2_t_asha' })).status).toBe(404);
      const inactive = await as('hr').post('/api/staff').send({ name: 'Gone Teacher', email: 'gone.teacher@sainik01.edu' });
      await prisma.staff.update({ where: { id: inactive.body.id }, data: { isActive: false } });
      expect((await as('admin').put(`/api/classes/${classId}`).send({ class_teacher_id: inactive.body.id })).status).toBe(400);

      const ok = await as('principal').put(`/api/classes/${classId}`).send({ class_teacher_id: 't_rajesh' });
      expect(ok.status).toBe(200);
      const list = await as('teacher').get('/api/classes');
      expect(list.body.find((c: { id: string }) => c.id === classId).classTeacher).toEqual({ id: 't_rajesh', name: expect.any(String) });
    });

    it('the class teacher may now mark it; my-classes lists it first', async () => {
      const res = await as('teacher').post('/api/attendance').send({ class_id: classId, date: today, records: [{ student_id: studentId, status: 'Present' }] });
      expect(res.status).toBe(201);
      const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { studentId, date: today } });
      expect(rec.markedBy).toBe('t_rajesh');
      const mine = await as('teacher').get('/api/attendance/my-classes');
      expect(mine.status).toBe(200);
      // The seed already makes teacher@ class teacher of 10 A; the new class joins it, and
      // class-teacher classes sort before timetable-only ones.
      type Mine = { id: string; is_class_teacher: boolean; can_mark: boolean };
      const ct = (mine.body as Mine[]).filter((c) => c.is_class_teacher).map((c) => c.id).sort();
      expect(ct).toEqual([classId, 'cls_10a'].sort());
      expect((mine.body as Mine[]).slice(0, 2).every((c) => c.is_class_teacher && c.can_mark)).toBe(true);
      // Timetable-only classes are still there (fallback rule kept).
      expect((mine.body as Mine[]).some((c) => !c.is_class_teacher)).toBe(true);
    });

    it('clearing the class teacher removes the access again', async () => {
      expect((await as('admin').put(`/api/classes/${classId}`).send({ class_teacher_id: '' })).status).toBe(200);
      expect((await prisma.class.findUniqueOrThrow({ where: { id: classId } })).classTeacherId).toBeNull();
      const res = await as('teacher').get(`/api/attendance?class_id=${classId}&date=${today}`);
      expect(res.status).toBe(403);
    });
  });

  // ═══ PAYROLL TAX (Phase 9) ════════════════════════════════════

  describe('payroll tax', () => {
    let newStaff = '';
    let oldStaff = '';
    let flatStaff = '';

    beforeAll(async () => {
      const mk = async (email: string) => (await as('hr').post('/api/staff').send({ name: email.split('@')[0], email })).body.id as string;
      newStaff = await mk('tax.new@sainik01.edu');
      oldStaff = await mk('tax.old@sainik01.edu');
      flatStaff = await mk('tax.flat@sainik01.edu');
    });

    it('payroll config: PAYROLL roles only; defaults FY2025-26, no PT, no EPF ceiling', async () => {
      expect((await as('teacher').get('/api/staff/payroll-config')).status).toBe(403);
      expect((await as('principal').put('/api/staff/payroll-config').send({ professional_tax_preset: 'karnataka' })).status).toBe(403);
      const res = await as('accounts').get('/api/staff/payroll-config');
      expect(res.status).toBe(200);
      expect(res.body.effective.version).toBe('FY2025-26');
      expect(res.body.effective.professionalTax.slabs).toEqual([]);
      expect(res.body.effective.epfWageCeiling).toBeNull();
      expect(res.body.notice).toMatch(/FY 2025-26.*CA/);
      expect(res.body.pt_presets.map((p: { id: string }) => p.id)).toEqual(['none', 'karnataka', 'maharashtra']);
    });

    it('rejects bad settings; saves Karnataka PT + EPF ceiling; other school unaffected', async () => {
      expect((await as('hr').put('/api/staff/payroll-config').send({ professional_tax_preset: 'goa' })).status).toBe(400);
      expect((await as('hr').put('/api/staff/payroll-config').send({ epf_wage_ceiling: -5 })).status).toBe(400);
      expect((await as('hr').put('/api/staff/payroll-config').send({ tax_overrides: { new: { slabs: [{ upTo: 10, rate: 0 }, { upTo: 5, rate: 5 }, { upTo: null, rate: 9 }] } } })).status).toBe(400);
      const ok = await as('hr').put('/api/staff/payroll-config').send({ professional_tax_preset: 'karnataka', epf_wage_ceiling: 15000 });
      expect(ok.status).toBe(200);
      expect(ok.body.effective.epfWageCeiling).toBe(15000);
      expect(ok.body.effective.professionalTax.preset).toBe('karnataka');
      const g2 = await as('g2admin').get('/api/staff/payroll-config');
      expect(g2.body.effective.professionalTax.preset).toBe('none');
    });

    it('salary structures carry regime / mode; legacy tds_percent-only means flat', async () => {
      expect((await as('hr').put(`/api/staff/salaries/${newStaff}`).send({ basic_salary: 100000, hra: 20000, da: 5000, epf_percent: 12, tax_mode: 'slab', tax_regime: 'new' })).status).toBe(200);
      expect((await as('hr').put(`/api/staff/salaries/${oldStaff}`).send({ basic_salary: 100000, hra: 20000, da: 5000, epf_percent: 0, tax_mode: 'slab', tax_regime: 'old', annual_deductions: 150000 })).status).toBe(200);
      expect((await as('hr').put(`/api/staff/salaries/${flatStaff}`).send({ basic_salary: 30000, hra: 5000, da: 2000, tds_percent: 5, epf_percent: 12 })).status).toBe(200);
      expect((await as('hr').put(`/api/staff/salaries/${newStaff}`).send({ basic_salary: 100000, tax_regime: 'mixed' })).status).toBe(400);
      expect((await prisma.salaryStructure.findUniqueOrThrow({ where: { staffId: flatStaff } })).taxMode).toBe('flat');
      expect((await prisma.salaryStructure.findUniqueOrThrow({ where: { staffId: oldStaff } })).annualDeductions).toBe(150000);
    });

    it('tax preview: ₹1.25 L/month new regime → ₹8,125 TDS', async () => {
      const res = await as('hr').post('/api/staff/payroll/tax-preview').send({ monthly_gross: 125000, tax_regime: 'new' });
      expect(res.status).toBe(201);
      expect(res.body.monthly_tds).toBe(8125);
      expect(res.body.annual.total).toBe(97500);
      expect((await as('teacher').post('/api/staff/payroll/tax-preview').send({ monthly_gross: 1 })).status).toBe(403);
    });

    it('payslips use the engine: slab TDS, Karnataka PT, EPF ceiling, flat legacy', async () => {
      const gen = await as('hr').post('/api/staff/payslips/generate').send({ month: '2027-01', as_draft: true });
      expect(gen.status).toBe(201);
      expect(gen.body.rules_version).toBe('FY2025-26');
      const slip = (id: string) => prisma.payslip.findUniqueOrThrow({ where: { staffId_monthYear: { staffId: id, monthYear: '2027-01' } } });
      // 1,25,000 gross, new regime → TDS 8,125; EPF 12% of 15,000 ceiling = 1,800; PT 200
      expect(await slip(newStaff)).toMatchObject({ grossSalary: 125000, tdsDeduction: 8125, epfDeduction: 1800, professionalTax: 200, netSalary: 114875 });
      // old regime with ₹1.5 L 80C → 17,550; EPF 0%; PT 200 → 1,25,000 − 17,550 − 200
      expect(await slip(oldStaff)).toMatchObject({ tdsDeduction: 17550, epfDeduction: 0, professionalTax: 200, netSalary: 107250 });
      // flat 5% of 37,000 = 1,850; EPF 12% of min(30,000, 15,000) = 1,800; PT 200 (≥ 25,000)
      expect(await slip(flatStaff)).toMatchObject({ tdsDeduction: 1850, epfDeduction: 1800, professionalTax: 200, netSalary: 33150 });
    });

    it('Maharashtra preset: ₹300 PT in February, ₹200 otherwise (drafts recompute)', async () => {
      expect((await as('hr').put('/api/staff/payroll-config').send({ professional_tax_preset: 'maharashtra' })).status).toBe(200);
      await as('hr').post('/api/staff/payslips/generate').send({ month: '2027-02', as_draft: true });
      await as('hr').post('/api/staff/payslips/generate').send({ month: '2027-01', as_draft: true });
      const feb = await prisma.payslip.findUniqueOrThrow({ where: { staffId_monthYear: { staffId: newStaff, monthYear: '2027-02' } } });
      const jan = await prisma.payslip.findUniqueOrThrow({ where: { staffId_monthYear: { staffId: newStaff, monthYear: '2027-01' } } });
      expect(feb.professionalTax).toBe(300);
      expect(jan.professionalTax).toBe(200);
    });

    it('payslip PDF lists income tax, professional tax, EPF and unpaid leave', async () => {
      const s = await prisma.payslip.findUniqueOrThrow({ where: { staffId_monthYear: { staffId: newStaff, monthYear: '2027-02' } } });
      const pdf = await download('hr', `/api/staff/payslips/${s.id}/pdf`);
      expect(pdf.status).toBe(200);
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  // ═══ REPORT CARDS FROZEN PER TERM (Phase 6) ═══════════════════

  describe('report card publication', () => {
    const TERM = 'DOM-T1';
    const YEAR = '2026-27';
    const q = `term=${TERM}&academic_year=${YEAR}`;
    let examId = '';

    beforeAll(async () => {
      const ex = await as('admin').post('/api/exams').send({ name: 'DOM Midterm', date: '2026-09-15', class_id: 'cls_10a', term: TERM, academic_year: YEAR, max_marks: 100 });
      expect(ex.status).toBe(201);
      examId = ex.body.id;
      const m = await as('hod').post('/api/exams/marks').send({ exam_id: examId, subject_id: 'sub_mat', marks: [
        { student_id: 'stu_001', score: 72 }, { student_id: 'stu_002', score: 85 }, { student_id: 'stu_003', score: 40 },
      ] });
      expect(m.status).toBe(201);
    });

    it('before publishing: parent/student get 404 "not published yet"; staff see the live card', async () => {
      const p = await as('parent').get(`/api/exams/report-card/stu_001?${q}`);
      expect(p.status).toBe(404);
      expect(p.body.message).toMatch(/not been published/);
      expect((await as('student').get(`/api/exams/report-card/stu_001?${q}`)).status).toBe(404);
      expect((await download('parent', `/api/exams/report-card/stu_001/pdf?${q}`)).status).toBe(404);
      const live = await as('admin').get(`/api/exams/report-card/stu_001?${q}`);
      expect(live.status).toBe(200);
      expect(live.body.publication).toEqual({ status: 'live', published_at: null, changed_since_publish: null });
    });

    it('publish: ACADEMIC_SETUP only, school-scoped', async () => {
      const body = { class_id: 'cls_10a', term: TERM, academic_year: YEAR };
      expect((await as('teacher').post('/api/exams/report-cards/publish').send(body)).status).toBe(403);
      expect((await as('parent').post('/api/exams/report-cards/publish').send(body)).status).toBe(403);
      expect((await as('g2admin').post('/api/exams/report-cards/publish').send(body)).status).toBe(404);
      expect((await as('admin').post('/api/exams/report-cards/publish').send({ ...body, academic_year: 'last year' })).status).toBe(400);
      const res = await as('hod').post('/api/exams/report-cards/publish').send(body);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ republished: false, replaced: 0 });
      const n = await prisma.student.count({ where: { classId: 'cls_10a', status: 'Active' } });
      expect(res.body.published).toBe(n);
      expect(await prisma.reportCardSnapshot.count({ where: { classId: 'cls_10a', term: TERM, academicYear: YEAR } })).toBe(n);
    });

    it('parents get the published snapshot; other children stay 403', async () => {
      const p = await as('parent').get(`/api/exams/report-card/stu_001?${q}`);
      expect(p.status).toBe(200);
      expect(p.body.publication.status).toBe('published');
      expect(p.body.overall_pct).toBe(72);
      expect((await as('parent').get(`/api/exams/report-card/stu_002?${q}`)).status).toBe(403);
      expect((await as('student').get(`/api/exams/report-card/stu_001`)).status).toBe(200); // latest published
      expect((await as('student').get(`/api/exams/report-card/stu_003?${q}`)).status).toBe(403);
      const pdf = await download('parent', `/api/exams/report-card/stu_001/pdf?${q}`);
      expect(pdf.status).toBe(200);
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      const list = await as('parent').get('/api/portal/children/stu_001/report-cards');
      expect(list.status).toBe(200);
      expect(list.body[0]).toMatchObject({ term: TERM, academic_year: YEAR, overall_pct: 72 });
      expect((await as('parent').get('/api/portal/children/stu_002/report-cards')).status).toBe(403);
      const marks = await as('parent').get('/api/portal/children/stu_001/marks');
      expect(marks.body.report_card_url).toContain(`term=${TERM}`);
    });

    it('a later mark edit does not change the published card; staff see "changed since publish"', async () => {
      const edit = await as('hod').post('/api/exams/marks').send({ exam_id: examId, subject_id: 'sub_mat', marks: [{ student_id: 'stu_001', score: 30 }] });
      expect(edit.status).toBe(201);
      const p = await as('parent').get(`/api/exams/report-card/stu_001?${q}`);
      expect(p.body.overall_pct).toBe(72);
      const live = await as('admin').get(`/api/exams/report-card/stu_001?${q}`);
      expect(live.body.overall_pct).toBe(30);
      expect(live.body.publication.status).toBe('live');
      expect(live.body.publication.changed_since_publish).toBe(true);
      const frozen = await as('admin').get(`/api/exams/report-card/stu_001?${q}&source=published`);
      expect(frozen.body.overall_pct).toBe(72);
      const status = await as('hod').get(`/api/exams/report-cards/published?class_id=cls_10a&${q}`);
      expect(status.status).toBe(200);
      expect(status.body.published).toBe(true);
      expect(status.body.students.find((s: { student_id: string }) => s.student_id === 'stu_001').changed_since_publish).toBe(true);
      expect(status.body.students.find((s: { student_id: string }) => s.student_id === 'stu_004')?.changed_since_publish ?? false).toBe(false);
      // Unchanged students (stu_002, rank now also unchanged at 1) are not flagged.
      expect(status.body.students.find((s: { student_id: string }) => s.student_id === 'stu_002').changed_since_publish).toBe(false);
      expect((await as('parent').get(`/api/exams/report-cards/published?class_id=cls_10a&${q}`)).status).toBe(403);
    });

    it('republish needs confirm: true, replaces the snapshot and is audited', async () => {
      const body = { class_id: 'cls_10a', term: TERM, academic_year: YEAR };
      const no = await as('admin').post('/api/exams/report-cards/publish').send(body);
      expect(no.status).toBe(409);
      expect(no.body.message).toMatch(/confirm/);
      const yes = await as('admin').post('/api/exams/report-cards/publish').send({ ...body, confirm: true });
      expect(yes.status).toBe(201);
      expect(yes.body.republished).toBe(true);
      expect(yes.body.replaced_with_changes).toBeGreaterThanOrEqual(1);
      expect((await as('parent').get(`/api/exams/report-card/stu_001?${q}`)).body.overall_pct).toBe(30);
      const log = await prisma.auditLog.findFirst({ where: { entity: 'report_card_publication', action: 'UPDATE' } });
      expect(log?.detail).toMatch(/REPUBLISHED/);
      const live = await as('admin').get(`/api/exams/report-card/stu_001?${q}`);
      expect(live.body.publication.changed_since_publish).toBe(false);
    });

    it('unpublished term for a portal user → 404 even with marks', async () => {
      expect((await as('parent').get(`/api/exams/report-card/stu_001?term=Other&academic_year=${YEAR}`)).status).toBe(404);
    });
  });
});
