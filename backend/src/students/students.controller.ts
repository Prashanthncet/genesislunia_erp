import { ATTENDANCE_RULE, tally } from '../attendance/attendance-math';
import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import * as QRCode from 'qrcode';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { R, ROLE } from '../auth/roles';
import { assertCanSeeStudent, assertInBranch, audit, AuthUser, ReqWithUser, teacherClassIds } from '../common/access';
import { buildPdf, PdfBlock, sendPdf } from '../common/pdf';
import { studentFeeSummary } from '../fees/fee-summary';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStorage } from '../storage/document-storage.service';
import { BulkCreateStudentsDto, CreateStudentDto } from './dto/create-student.dto';
import { StudentStatusDto } from './dto/student-status.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { textContains } from '../common/search';

const PORTAL = [ROLE.PARENT, ROLE.STUDENT];
/** Profile readers: student-information staff + the parent/student portal (own child only). */
const PROFILE_READ = [...R.STUDENT_READ, ...PORTAL];

/**
 * Who sees parent contact numbers / emails. Office + leadership need them to run the
 * school; the warden (gate-pass OTPs, hostel emergencies) and the safeguarding lead
 * (incident follow-up) contact parents as part of their job. Teachers, HODs and the
 * security desk see the student but not the family's phone/email.
 */
const CONTACT_ROLES: string[] = [
  ...R.LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT, ROLE.ADMISSION_OFFICER, ROLE.ACCOUNTS,
  ROLE.WARDEN, ROLE.DISCIPLINE_OFFICER, ...PORTAL,
];
/** Archived admission documents (Aadhaar, birth certificate...): office/leadership + own family. */
const DOC_ROLES: string[] = [...R.LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT, ROLE.ADMISSION_OFFICER, ...PORTAL];
/** Fee summary in the profile follows the fees module's read rule. */
const FEE_ROLES: string[] = [...R.FEES_READ, ...PORTAL];

const canSeeContacts = (u: AuthUser) => CONTACT_ROLES.includes(u.role);

function stripContacts<T extends { mobileNumber?: string | null; email?: string | null }>(row: T, user: AuthUser): T {
  if (canSeeContacts(user)) return row;
  return { ...row, mobileNumber: null, email: null, contacts_hidden: true };
}

const classLabel = (c: { name: string; section: string | null } | null | undefined) =>
  c ? `${c.name}${c.section ? ` - ${c.section}` : ''}` : '';

@Controller('students')
@UseGuards(AuthGuard, RolesGuard)
export class StudentsController {
  constructor(
    private prisma: PrismaService,
    private docs: DocumentStorage,
  ) {}

  @Get()
  @Roles(...R.STUDENT_READ)
  async list(
    @Req() req: ReqWithUser,
    @Query('class_id') classId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('page_size') pageSize = '50',
  ) {
    if (classId) await assertInBranch(this.prisma, 'class', classId, req.user.branch_id);
    const where: Record<string, unknown> = { branchId: req.user.branch_id };
    const teacherScope = await teacherClassIds(this.prisma, req.user);
    if (classId && teacherScope !== null && !teacherScope.includes(classId)) {
      throw new ForbiddenException('You can only view students in classes assigned to you');
    }
    if (classId) where.classId = classId;
    else if (teacherScope !== null) where.classId = { in: teacherScope };
    if (status) where.status = status;
    if (q) where.OR = [{ fullName: textContains(q) }, { admissionNo: textContains(q) }];

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        include: { class: { select: { id: true, name: true, section: true } } },
        orderBy: { fullName: 'asc' },
        skip: (pageNum - 1) * size,
        take: size,
      }),
    ]);
    return { total, page: pageNum, page_size: size, contacts_hidden: !canSeeContacts(req.user), data: rows.map((r) => stripContacts(r, req.user)) };
  }

  /**
   * Bulk student upload (CSV / spreadsheet import).
   * Validates classes in the branch, skips duplicate admission numbers within the branch,
   * and returns created + skipped counts.
   */
  @Post('bulk')
  @Roles(...R.STUDENT_WRITE)
  async bulkCreate(@Req() req: ReqWithUser, @Body() body: BulkCreateStudentsDto) {
    const branchId = req.user.branch_id;
    const uniqueClassIds = Array.from(new Set(body.students.map((s) => s.class_id)));
    for (const cid of uniqueClassIds) {
      await assertInBranch(this.prisma, 'class', cid, branchId);
    }

    const createdIds: string[] = [];
    const skippedDuplicates: string[] = [];

    for (const row of body.students) {
      const admNo = row.admission_no.trim();
      const exists = await this.prisma.student.findFirst({
        where: { branchId, admissionNo: admNo },
        select: { id: true },
      });
      if (exists || createdIds.length > 0 && skippedDuplicates.includes(admNo)) {
        skippedDuplicates.push(admNo);
        continue;
      }
      try {
        const student = await this.prisma.student.create({
          data: {
            branchId,
            admissionNo: admNo,
            fullName: row.full_name.trim(),
            fatherName: row.father_name?.trim() || null,
            motherName: row.mother_name?.trim() || null,
            mobileNumber: row.mobile_number?.trim() || null,
            email: row.email?.trim() || null,
            gender: row.gender,
            classId: row.class_id,
            rollNo: row.roll_no?.trim() || null,
            house: row.house?.trim() || null,
            bloodGroup: row.blood_group?.trim() || null,
            dob: row.dob?.trim() || null,
            enrollmentDate: row.enrollment_date?.trim() || new Date().toISOString().slice(0, 10),
          },
        });
        createdIds.push(student.id);
      } catch {
        skippedDuplicates.push(admNo);
      }
    }

    await audit(
      this.prisma,
      req.user,
      'CREATE',
      'student_bulk',
      branchId,
      `created=${createdIds.length} skipped=${skippedDuplicates.length}`,
    );
    return {
      created: createdIds.length,
      skipped_duplicates: skippedDuplicates.length,
      skipped_admission_nos: skippedDuplicates,
      ids: createdIds,
    };
  }

  // ─── Read-only Student Master profile (literal sub-routes before :id) ──────

  /**
   * Everything the profile screen shows in one call. Sections the caller's role may not
   * see come back as null (fees for teachers, documents for non-office staff), with
   * `visibility` saying why, so the UI can hide the tab instead of erroring.
   */
  @Get(':id/profile')
  @Roles(...PROFILE_READ)
  async profile(@Req() req: ReqWithUser, @Param('id') id: string) {
    const branchId = req.user.branch_id;
    const s = await this.prisma.student.findFirst({
      where: { id, branchId },
      include: {
        class: { select: { id: true, name: true, section: true } },
        hostelAllocation: { include: { room: { include: { hostel: { select: { id: true, name: true } } } } } },
        parentLinks: { include: { user: { select: { name: true, email: true } } } },
      },
    });
    if (!s) throw new NotFoundException('Student not found');
    await assertCanSeeStudent(this.prisma, req.user, id);

    const [grouped, recent, marks] = await Promise.all([
      this.prisma.attendanceRecord.findMany({ where: { studentId: id }, select: { date: true, status: true } }),
      this.prisma.attendanceRecord.findMany({ where: { studentId: id }, orderBy: { date: 'desc' }, take: 60, select: { date: true, status: true, note: true } }),
      this.prisma.examMark.findMany({
        where: { studentId: id, branchId },
        include: { exam: { select: { id: true, name: true, date: true, term: true } }, subject: { select: { name: true, code: true } } },
      }),
    ]);
    // THE attendance rule (attendance/attendance-math.ts): (P + Late + OD) / (P + Late + OD + Absent).
    const att = tally(grouped);

    marks.sort((a, b) => b.exam.date.localeCompare(a.exam.date) || a.subject.name.localeCompare(b.subject.name));
    const contacts = canSeeContacts(req.user);
    const showFees = FEE_ROLES.includes(req.user.role);
    const showDocs = DOC_ROLES.includes(req.user.role);

    const documents = showDocs
      ? await this.prisma.admissionDocument.findMany({
        where: { studentId: id, branchId },
        select: { id: true, docType: true, fileName: true, sizeBytes: true, mimeType: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      })
      : null;
    const alloc = s.hostelAllocation;

    await audit(this.prisma, req.user, 'VIEW', 'student', id, 'profile');
    return {
      student: {
        id: s.id, student_id: s.id, admission_no: s.admissionNo, full_name: s.fullName, dob: s.dob,
        gender: s.gender, blood_group: s.bloodGroup, status: s.status, enrollment_date: s.enrollmentDate,
        class: s.class, class_label: classLabel(s.class), section: s.class?.section ?? null,
        roll_no: s.rollNo, house: s.house, admission_id: s.admissionId,
        height_cm: s.heightCm, weight_kg: s.weightKg, vision: s.vision,
      },
      parents: {
        father_name: s.fatherName,
        mother_name: s.motherName,
        mobile_number: contacts ? s.mobileNumber : null,
        email: contacts ? s.email : null,
        linked_accounts: s.parentLinks.map((l) => ({ name: l.user.name, relation: l.relation, email: contacts ? l.user.email : null })),
      },
      attendance: {
        percentage: att.percentage,
        records_counted: att.counted,
        present: att.present, absent: att.absent, late: att.late, od: att.od, leave: att.leave, attended: att.attended,
        rule: ATTENDANCE_RULE,
        recent,
      },
      fees: showFees ? await studentFeeSummary(this.prisma, branchId, id) : null,
      academics: {
        recent_marks: marks.slice(0, 40).map((m) => ({
          exam_id: m.exam.id, exam: m.exam.name, date: m.exam.date, term: m.exam.term,
          subject: m.subject.name, score: m.score, max_score: m.maxScore,
          percentage: m.maxScore > 0 ? Math.round((m.score / m.maxScore) * 1000) / 10 : null,
        })),
      },
      hostel: alloc ? { hostel: alloc.room.hostel.name, hostel_id: alloc.room.hostel.id, room: alloc.room.roomNumber, bed: alloc.bedLabel } : null,
      documents: documents?.map((d) => ({ id: d.id, doc_type: d.docType, file_name: d.fileName, mime_type: d.mimeType, size_bytes: d.sizeBytes, created_at: d.createdAt })) ?? null,
      visibility: { contacts, fees: showFees, documents: showDocs },
    };
  }

  private async studentDoc(req: ReqWithUser, id: string, docId: string) {
    await assertInBranch(this.prisma, 'student', id, req.user.branch_id);
    await assertCanSeeStudent(this.prisma, req.user, id);
    const doc = await this.prisma.admissionDocument.findFirst({ where: { id: docId, studentId: id, branchId: req.user.branch_id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /**
   * Short-lived signed URL for a document in this student's DMS folder:
   * `{ url, expires_at, file_name, mime_type }` (`data_url` only for legacy, unmigrated rows).
   */
  @Get(':id/documents/:docId/url')
  @Roles(...DOC_ROLES)
  async documentUrl(@Req() req: ReqWithUser, @Param('id') id: string, @Param('docId') docId: string) {
    const doc = await this.studentDoc(req, id, docId);
    await audit(this.prisma, req.user, 'EXPORT', 'student_document', doc.id, doc.docType);
    return this.docs.link(doc);
  }

  /** Authenticated proxy download of the same document (binary, original mime type). */
  @Get(':id/documents/:docId')
  @Roles(...DOC_ROLES)
  async downloadDocument(@Req() req: ReqWithUser, @Param('id') id: string, @Param('docId') docId: string, @Res() res: Response) {
    const doc = await this.studentDoc(req, id, docId);
    const file = await this.docs.read(doc);
    if (!file) throw new NotFoundException('Document content unavailable');
    await audit(this.prisma, req.user, 'EXPORT', 'student_document', doc.id, doc.docType);
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename="${doc.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Content-Length': String(file.bytes.length),
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(file.bytes);
  }

  // ─── Export hooks: TC / ID card / fee summary ─────────────────

  private async exportBase(req: ReqWithUser, id: string) {
    const s = await this.prisma.student.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: { class: { select: { id: true, name: true, section: true } }, branch: { select: { name: true, location: true, code: true } } },
    });
    if (!s) throw new NotFoundException('Student not found');
    return s;
  }

  /**
   * Transfer Certificate data. Shape:
   * { certificate_no, issue_date, school, student: { id, admission_no, full_name, dob, gender,
   *   father_name, mother_name, class, roll_no, house, enrollment_date, status },
   *   attendance: { records_counted, present, percentage }, fees_cleared, balance_due }
   * Only for students who have left (status not Active) — 409 otherwise.
   */
  @Get(':id/export/tc')
  @Roles(...R.STUDENT_WRITE)
  async tcData(@Req() req: ReqWithUser, @Param('id') id: string) {
    const s = await this.exportBase(req, id);
    if (s.status === 'Active') throw new ConflictException('A Transfer Certificate can only be issued once the student is marked Inactive / Left');
    const [records, fees] = await Promise.all([
      this.prisma.attendanceRecord.findMany({ where: { studentId: id }, select: { date: true, status: true } }),
      studentFeeSummary(this.prisma, req.user.branch_id, id),
    ]);
    const att = tally(records);
    return {
      certificate_no: `TC-${(s.branch.code ?? s.branchId).toUpperCase()}-${s.admissionNo}`,
      issue_date: new Date().toISOString().slice(0, 10),
      school: { name: s.branch.name, location: s.branch.location },
      student: {
        id: s.id, admission_no: s.admissionNo, full_name: s.fullName, dob: s.dob, gender: s.gender,
        father_name: s.fatherName, mother_name: s.motherName, class: classLabel(s.class), roll_no: s.rollNo,
        house: s.house, enrollment_date: s.enrollmentDate, status: s.status,
      },
      attendance: { records_counted: att.counted, present: att.attended, percentage: att.percentage },
      fees_cleared: fees.balance <= 0.001,
      balance_due: fees.balance,
    };
  }

  @Get(':id/export/tc.pdf')
  @Roles(...R.STUDENT_WRITE)
  async tcPdf(@Req() req: ReqWithUser, @Param('id') id: string, @Res() res: Response) {
    const tc = await this.tcData(req, id);
    const pdf = await buildPdf({
      school: tc.school.name,
      schoolLine: tc.school.location ?? undefined,
      title: 'Transfer Certificate',
      reference: tc.certificate_no,
      blocks: [
        { kind: 'fields', rows: [
          ['Name of student', tc.student.full_name], ['Admission No', tc.student.admission_no],
          ['Date of birth', tc.student.dob], ['Gender', tc.student.gender],
          ["Father's name", tc.student.father_name], ["Mother's name", tc.student.mother_name],
          ['Class last studied', tc.student.class], ['Roll No', tc.student.roll_no],
          ['House', tc.student.house], ['Date of admission', tc.student.enrollment_date],
          ['Status', tc.student.status], ['Date of issue', tc.issue_date],
          ['Attendance', tc.attendance.percentage === null ? '-' : `${tc.attendance.percentage}% of ${tc.attendance.records_counted} days`],
          ['School dues', tc.fees_cleared ? 'Cleared' : `Rs. ${tc.balance_due.toFixed(2)} outstanding`],
        ] },
        { kind: 'text', text: 'Certified that the particulars above are correct as per the school records.' },
        { kind: 'signature', name: 'Principal', title: tc.school.name },
      ],
    });
    await audit(this.prisma, req.user, 'EXPORT', 'student', id, 'tc.pdf');
    return sendPdf(res, pdf, `TC-${tc.student.admission_no}.pdf`);
  }

  /**
   * ID card data. Shape:
   * { card_no, valid_until, school, student: { id, admission_no, full_name, class, roll_no, house,
   *   blood_group, dob }, emergency_contact, qr_payload, templates }
   * Only for Active students — 409 otherwise.
   */
  @Get(':id/export/id-card')
  @Roles(...R.STUDENT_WRITE)
  async idCardData(@Req() req: ReqWithUser, @Param('id') id: string) {
    const s = await this.exportBase(req, id);
    if (s.status !== 'Active') throw new ConflictException('ID cards are only issued for Active students');
    const year = new Date().getFullYear();
    return {
      card_no: `ID-${(s.branch.code ?? s.branchId).toUpperCase()}-${s.admissionNo}`,
      valid_until: `${year + 1}-03-31`,
      school: { name: s.branch.name, location: s.branch.location },
      student: {
        id: s.id, admission_no: s.admissionNo, full_name: s.fullName, class: classLabel(s.class),
        roll_no: s.rollNo, house: s.house, blood_group: s.bloodGroup, dob: s.dob,
      },
      emergency_contact: s.mobileNumber,
      qr_payload: `GENESIS:STUDENT:${s.id}`,
      templates: [
        { id: 'classic', name: 'Classic Institutional (Navy)', description: 'Standard portrait layout with full student & guardian particulars' },
        { id: 'modern', name: 'Modern Split Grid', description: 'Two-column tabular badge layout with prominent house & roll number' },
        { id: 'compact', name: 'Compact Lanyard Card', description: 'Streamlined essential fields for quick gate & library scanning' },
        { id: 'crest', name: 'Royal Crest & Motto', description: 'Formal ceremonial layout with custom school motto banner' },
      ],
    };
  }

  @Get(':id/export/id-card.pdf')
  @Roles(...R.STUDENT_WRITE)
  async idCardPdf(
    @Req() req: ReqWithUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('template') template = 'classic',
    @Query('tagline') tagline?: string,
    @Query('fields') fieldsCsv?: string,
  ) {
    const card = await this.idCardData(req, id);
    const qr = await QRCode.toBuffer(card.qr_payload, { type: 'png', margin: 1, width: 240 });
    const photo = await this.prisma.admissionDocument.findFirst({
      where: {
        studentId: id, branchId: req.user.branch_id, docType: 'photo',
        OR: [{ mimeType: 'image/png' }, { storageKey: null, dataUrl: { startsWith: 'data:image/png;base64,' } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    const enabled = new Set(
      fieldsCsv
        ? fieldsCsv.split(',').map((f) => f.trim()).filter(Boolean)
        : ['roll_no', 'house', 'blood_group', 'dob', 'emergency_contact', 'valid_until'],
    );
    const tpl = ['classic', 'modern', 'compact', 'crest'].includes(template) ? template : 'classic';
    const blocks: PdfBlock[] = [];
    if (tagline?.trim() || tpl === 'crest') {
      blocks.push({ kind: 'heading', text: tagline?.trim() || 'DISCIPLINE · HONOUR · EXCELLENCE' });
    }
    if (photo) {
      try {
        const file = await this.docs.read(photo);
        if (file) blocks.push({ kind: 'image', png: file.bytes, width: tpl === 'compact' ? 80 : 96, height: tpl === 'compact' ? 100 : 120 });
      } catch { /* unreadable / missing photo — card still prints */ }
    }
    const rows: [string, string | number | null | undefined][] = [
      ['Name', card.student.full_name],
      ['Admission No', card.student.admission_no],
      ['Class', card.student.class],
    ];
    if (enabled.has('roll_no')) rows.push(['Roll No', card.student.roll_no]);
    if (enabled.has('house') && tpl !== 'compact') rows.push(['House', card.student.house]);
    if (enabled.has('blood_group')) rows.push(['Blood group', card.student.blood_group]);
    if (enabled.has('dob') && tpl !== 'compact') rows.push(['Date of birth', card.student.dob]);
    if (enabled.has('emergency_contact')) rows.push(['Emergency contact', card.emergency_contact]);
    rows.push(['Card No', card.card_no]);
    if (enabled.has('valid_until')) rows.push(['Valid until', card.valid_until]);

    if (tpl === 'modern') {
      blocks.push({
        kind: 'table',
        head: ['Student Name', 'Admission No', 'Class', 'House / Roll'],
        widths: [160, 110, 110, 119],
        rows: [[
          card.student.full_name,
          card.student.admission_no,
          card.student.class || '-',
          `${card.student.house || '-'} / ${card.student.roll_no || '-'}`,
        ]],
      });
    }
    blocks.push(
      { kind: 'fields', rows },
      { kind: 'image', png: qr, width: tpl === 'compact' ? 95 : 110, height: tpl === 'compact' ? 95 : 110 },
      { kind: 'signature', name: 'Principal', title: card.school.name },
    );
    const titleMap: Record<string, string> = {
      classic: 'Student Identity Card',
      modern: 'Student Identity Card — Modern Edition',
      compact: 'Student Quick-Pass ID Card',
      crest: 'Official Cadet / Student Identity Card',
    };
    const pdf = await buildPdf({
      school: card.school.name,
      schoolLine: tagline?.trim() ? `${card.school.location ?? ''} · ${tagline.trim()}`.replace(/^ · /, '') : (card.school.location ?? undefined),
      title: titleMap[tpl] ?? 'Student Identity Card',
      reference: card.card_no,
      blocks,
    });
    await audit(this.prisma, req.user, 'EXPORT', 'student', id, `id-card.pdf (${tpl})`);
    return sendPdf(res, pdf, `ID-${card.student.admission_no}.pdf`);
  }

  /** Fee summary hook for the fee module / portal. Shape: see studentFeeSummary() in fees/fee-summary.ts. */
  @Get(':id/export/fee-summary')
  @Roles(...FEE_ROLES)
  async feeSummary(@Req() req: ReqWithUser, @Param('id') id: string) {
    await assertInBranch(this.prisma, 'student', id, req.user.branch_id);
    await assertCanSeeStudent(this.prisma, req.user, id);
    return studentFeeSummary(this.prisma, req.user.branch_id, id);
  }

  // ─── Legacy detail + writes ───────────────────────────────────

  @Get(':id')
  @Roles(...R.STUDENT_READ)
  async get(@Req() req: ReqWithUser, @Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: {
        class: true,
        attendance: { orderBy: { date: 'desc' }, take: 30 },
        examMarks: { include: { subject: true, exam: true } },
        hostelAllocation: { include: { room: { include: { hostel: true } } } },
        ...(FEE_ROLES.includes(req.user.role) ? { feeInvoices: true } : {}),
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    await assertCanSeeStudent(this.prisma, req.user, id);

    // True aggregate over ALL attendance records (optional date range), not a window.
    const rangeWhere: Record<string, unknown> = { studentId: id };
    if (from || to) {
      rangeWhere.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }
    const att = tally(await this.prisma.attendanceRecord.findMany({ where: rangeWhere, select: { date: true, status: true } }));
    return {
      ...stripContacts(student, req.user),
      attendance_percentage: att.percentage,
      attendance_records_counted: att.counted,
    };
  }

  @Post()
  @Roles(...R.STUDENT_WRITE)
  async create(@Req() req: ReqWithUser, @Body() dto: CreateStudentDto) {
    await assertInBranch(this.prisma, 'class', dto.class_id, req.user.branch_id);
    try {
      const student = await this.prisma.student.create({
        data: {
          branchId: req.user.branch_id,
          admissionNo: dto.admission_no,
          fullName: dto.full_name,
          fatherName: dto.father_name ?? null,
          motherName: dto.mother_name ?? null,
          mobileNumber: dto.mobile_number ?? null,
          email: dto.email ?? null,
          gender: dto.gender,
          classId: dto.class_id,
          rollNo: dto.roll_no ?? null,
          enrollmentDate: dto.enrollment_date ?? null,
        },
      });
      await audit(this.prisma, req.user, 'CREATE', 'student', student.id, dto.admission_no);
      return { id: student.id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Unique constraint')) {
        throw new ConflictException('Admission number already exists in this branch');
      }
      throw err;
    }
  }

  @Put(':id')
  @Roles(...R.STUDENT_WRITE)
  async update(@Req() req: ReqWithUser, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    const existing = await this.prisma.student.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Student not found');
    if (dto.class_id) await assertInBranch(this.prisma, 'class', dto.class_id, req.user.branch_id);
    const student = await this.prisma.student.update({
      where: { id },
      data: {
        ...(dto.full_name !== undefined ? { fullName: dto.full_name } : {}),
        ...(dto.father_name !== undefined ? { fatherName: dto.father_name } : {}),
        ...(dto.mother_name !== undefined ? { motherName: dto.mother_name } : {}),
        ...(dto.mobile_number !== undefined ? { mobileNumber: dto.mobile_number } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.blood_group !== undefined ? { bloodGroup: dto.blood_group } : {}),
        ...(dto.class_id !== undefined ? { classId: dto.class_id } : {}),
        ...(dto.roll_no !== undefined ? { rollNo: dto.roll_no } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.enrollment_date !== undefined ? { enrollmentDate: dto.enrollment_date } : {}),
      },
    });
    await audit(this.prisma, req.user, 'UPDATE', 'student', id);
    return { id: student.id, success: true };
  }

  /**
   * Withdrawal is a status change (Inactive / Left / Transferred / Alumni) — the record,
   * its attendance, marks and fee history stay intact for TCs, audits and re-admission.
   */
  @Put(':id/status')
  @Roles(...R.STUDENT_WRITE)
  async setStatus(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: StudentStatusDto) {
    const existing = await this.prisma.student.findFirst({ where: { id, branchId: req.user.branch_id } });
    if (!existing) throw new NotFoundException('Student not found');
    if ((body.status === 'Left' || body.status === 'Transferred') && !body.reason?.trim()) {
      throw new BadRequestException('A reason is required when marking a student as leaving');
    }
    await this.prisma.student.update({ where: { id }, data: { status: body.status } });
    await audit(this.prisma, req.user, 'UPDATE', 'student', id, `status ${existing.status} -> ${body.status}${body.reason ? `: ${body.reason}` : ''}`);
    return { success: true, status: body.status };
  }

  /**
   * Hard delete exists only to remove a record created by mistake. A student with any
   * history (attendance, marks, invoices, passes, incidents, logins, documents...) is
   * refused with 409 — set status 'Left' via PUT /students/:id/status instead.
   */
  @Delete(':id')
  @Roles(...R.ADMINS)
  async remove(@Req() req: ReqWithUser, @Param('id') id: string) {
    const existing = await this.prisma.student.findFirst({
      where: { id, branchId: req.user.branch_id },
      include: {
        user: { select: { id: true } },
        hostelAllocation: { select: { id: true } },
        _count: { select: {
          attendance: true, examMarks: true, feeInvoices: true, gatePasses: true, incidents: true, studentLeaves: true,
          cbtAttempts: true, parentLinks: true, documents: true, hostelRollCalls: true,
        } },
      },
    });
    if (!existing) throw new NotFoundException('Student not found');
    const history = Object.entries(existing._count).filter(([, n]) => n > 0).map(([k]) => k);
    if (existing.user) history.push('login');
    if (existing.hostelAllocation) history.push('hostelAllocation');
    if (history.length > 0) {
      throw new ConflictException(`Student has history (${history.join(', ')}); mark them Inactive/Left instead of deleting`);
    }
    await this.prisma.student.delete({ where: { id } });
    await audit(this.prisma, req.user, 'DELETE', 'student', id, existing.admissionNo);
    return { success: true };
  }
}
