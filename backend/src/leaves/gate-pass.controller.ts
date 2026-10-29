import {
  BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Req, Res, StreamableFile, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { Prisma } from '@prisma/client';
import { AuthGuard, Roles, RolesGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { R, ROLE } from '../auth/roles';
import { ReqWithUser, assertCanSeeStudent, assertInBranch, audit, portalStudentIds } from '../common/access';
import { buildPdf, sendPdf } from '../common/pdf';
import { textContains } from '../common/search';
import { csvEscape } from '../reports/report-utils';
import { CreateGatePassDto, GatePassOtpDto, GatePassRecordsQueryDto, RejectGatePassDto } from './dto/leaves.dto';
import { actorNames, notifyParents, resolveActor } from './leave-helpers';

/**
 * Gate pass lifecycle:
 *   Pending ──warden──▶ Warden Approved ──principal──▶ Approved ──desk+OTP──▶ Checked Out ──desk──▶ Returned
 *      └──────────── Rejected (with reason, at either approval step) ◀──────────┘
 * On final approval a 6-digit OTP (crypto.randomInt) goes to the parent; only its sha256 is stored.
 * The pass carries a random `passCode` (printed + QR) the security desk looks up.
 * `parentOtp` is NEVER selected into a response.
 */

const REQUEST_ROLES: string[] = [...R.LEADERSHIP, ROLE.WARDEN, ROLE.TEACHER, ROLE.HOD, ROLE.PARENT];
const READ_ROLES: string[] = [...new Set([...R.GATE_DESK, ...R.GATE_PASS_APPROVE, ROLE.TEACHER, ROLE.HOD, ROLE.PARENT, ROLE.STUDENT])];
const WARDEN_STEP: string[] = [...R.ADMINS, ROLE.WARDEN];
const PRINCIPAL_STEP: string[] = [...R.ADMINS, ROLE.PRINCIPAL];
const PRINT_ROLES: string[] = [...new Set([...R.GATE_DESK, ...R.GATE_PASS_APPROVE, ROLE.PARENT])];
const ISSUED = ['Approved', 'Checked Out', 'Returned'];
/** Gate Desk "Issue pass" tab: warden + leadership (same people who approve passes). */
const ISSUE_ROLES: string[] = [...R.GATE_PASS_APPROVE];
const RECORDS_CAP = 2000;
const MAX_OTP_FAILURES = 5;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — read aloud / typed at the desk

/** Explicit allow-list: parentOtp is deliberately absent. */
const PASS_SELECT = {
  id: true,
  studentId: true,
  type: true,
  reason: true,
  outTime: true,
  expectedInTime: true,
  actualOutTime: true,
  actualInTime: true,
  checkedOutBy: true,
  checkedInBy: true,
  rejectedReason: true,
  passCode: true,
  status: true,
  approvedByWarden: true,
  approvedByPrincipal: true,
  otpVerified: true,
  createdAt: true,
  student: { select: { id: true, fullName: true, admissionNo: true, class: { select: { id: true, name: true, section: true } } } },
} satisfies Prisma.GatePassSelect;

type PassRow = Prisma.GatePassGetPayload<{ select: typeof PASS_SELECT }>;

/** Pass records (Gate Desk register / CSV): no passCode, no parentOtp — a register is not a key ring. */
const RECORD_SELECT = {
  id: true,
  studentId: true,
  type: true,
  reason: true,
  outTime: true,
  expectedInTime: true,
  actualOutTime: true,
  actualInTime: true,
  checkedOutBy: true,
  checkedInBy: true,
  rejectedReason: true,
  status: true,
  approvedByWarden: true,
  approvedByPrincipal: true,
  createdAt: true,
  student: {
    select: {
      id: true, fullName: true, admissionNo: true,
      class: { select: { id: true, name: true, section: true } },
      hostelAllocation: { select: { room: { select: { roomNumber: true, hostel: { select: { id: true, name: true } } } } } },
    },
  },
} satisfies Prisma.GatePassSelect;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function isLate(p: { status: string; expectedInTime: string | null; actualInTime: string | null }, now = new Date()) {
  if (!p.expectedInTime) return false;
  const due = new Date(p.expectedInTime);
  if (Number.isNaN(due.getTime())) return false;
  if (p.status === 'Checked Out') return now > due;
  if (p.status === 'Returned' && p.actualInTime) return new Date(p.actualInTime) > due;
  return false;
}

@Controller('gate-passes')
@UseGuards(AuthGuard, RolesGuard)
export class GatePassController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  private async decorate(rows: PassRow[]) {
    const names = await actorNames(this.prisma, rows.flatMap((r) => [r.approvedByWarden, r.approvedByPrincipal, r.checkedOutBy, r.checkedInBy]));
    return rows.map((r) => ({
      ...r,
      late: isLate(r),
      approvedByWardenName: r.approvedByWarden ? names[r.approvedByWarden] ?? null : null,
      approvedByPrincipalName: r.approvedByPrincipal ? names[r.approvedByPrincipal] ?? null : null,
      checkedOutByName: r.checkedOutBy ? names[r.checkedOutBy] ?? null : null,
      checkedInByName: r.checkedInBy ? names[r.checkedInBy] ?? null : null,
    }));
  }

  private async load(req: ReqWithUser, id: string) {
    const pass = await this.prisma.gatePass.findFirst({ where: { id, branchId: req.user.branch_id }, select: PASS_SELECT });
    if (!pass) throw new NotFoundException('Gate pass not found');
    await assertCanSeeStudent(this.prisma, req.user, pass.studentId);
    return pass;
  }

  // ─── reads (literal routes before :id) ──────────────────────

  @Get()
  @Roles(...READ_ROLES)
  async list(@Req() req: ReqWithUser, @Query('student_id') studentId?: string, @Query('status') status?: string) {
    const portal = await portalStudentIds(this.prisma, req.user);
    if (portal && studentId && !portal.includes(studentId)) throw new ForbiddenException('You can only view your own child');
    const rows = await this.prisma.gatePass.findMany({
      where: {
        branchId: req.user.branch_id,
        ...(studentId ? { studentId } : portal ? { studentId: { in: portal } } : {}),
        ...(status ? { status } : {}),
      },
      select: PASS_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return this.decorate(rows);
  }

  /** Students currently off campus (security desk live board). */
  @Get('out')
  @Roles(...R.GATE_DESK)
  async currentlyOut(@Req() req: ReqWithUser) {
    const rows = await this.prisma.gatePass.findMany({
      where: { branchId: req.user.branch_id, status: 'Checked Out' },
      select: PASS_SELECT,
      orderBy: { actualOutTime: 'asc' },
    });
    return this.decorate(rows);
  }

  /**
   * Gate Desk pass register: every pass in the school with filters. JSON `{ total, truncated, rows }`,
   * or `?format=csv` for a download (audited EXPORT). Never carries passCode or the OTP hash.
   * Dates filter on the planned out time (local "YYYY-MM-DDTHH:mm" strings, so string compare is exact).
   */
  @Get('records')
  @Roles(...R.GATE_DESK)
  async records(@Req() req: ReqWithUser, @Query() q: GatePassRecordsQueryDto, @Res({ passthrough: true }) res: Response) {
    const branchId = req.user.branch_id;
    if (q.class_id) await assertInBranch(this.prisma, 'class', q.class_id, branchId);
    if (q.hostel_id) await assertInBranch(this.prisma, 'hostel', q.hostel_id, branchId);
    if (q.student_id) await assertInBranch(this.prisma, 'student', q.student_id, branchId);
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('from must be on or before to');
    const search = q.q?.trim();
    const where: Prisma.GatePassWhereInput = {
      branchId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to ? { outTime: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: `${q.to}T23:59:59` } : {}) } } : {}),
      ...(q.student_id ? { studentId: q.student_id } : {}),
      student: {
        ...(q.class_id ? { classId: q.class_id } : {}),
        ...(q.hostel_id ? { hostelAllocation: { room: { hostelId: q.hostel_id } } } : {}),
        ...(search ? { OR: [{ fullName: textContains(search) }, { admissionNo: textContains(search) }] } : {}),
      },
    };
    const found = await this.prisma.gatePass.findMany({
      where,
      select: RECORD_SELECT,
      orderBy: [{ outTime: q.sort === 'asc' ? 'asc' : 'desc' }, { createdAt: 'desc' }],
      take: RECORDS_CAP + 1,
    });
    const truncated = found.length > RECORDS_CAP;
    const names = await actorNames(this.prisma, found.flatMap((r) => [r.approvedByWarden, r.approvedByPrincipal, r.checkedOutBy, r.checkedInBy]));
    const name = (ref: string | null) => (ref ? names[ref] ?? null : null);
    let rows = found.slice(0, RECORDS_CAP).map((r) => {
      const alloc = r.student.hostelAllocation;
      return {
        id: r.id,
        studentId: r.studentId,
        type: r.type,
        reason: r.reason,
        outTime: r.outTime,
        expectedInTime: r.expectedInTime,
        actualOutTime: r.actualOutTime,
        actualInTime: r.actualInTime,
        status: r.status,
        rejectedReason: r.rejectedReason,
        createdAt: r.createdAt,
        late: isLate(r),
        approvedByWardenName: name(r.approvedByWarden),
        approvedByPrincipalName: name(r.approvedByPrincipal),
        checkedOutByName: name(r.checkedOutBy),
        checkedInByName: name(r.checkedInBy),
        student: { id: r.student.id, fullName: r.student.fullName, admissionNo: r.student.admissionNo, class: r.student.class },
        hostel: alloc ? { id: alloc.room.hostel.id, name: alloc.room.hostel.name, room: alloc.room.roomNumber } : null,
      };
    });
    if (q.late === '1' || q.late === 'true') rows = rows.filter((r) => r.late);

    if (q.format === 'csv') {
      const head = ['Student', 'Admission No', 'Class', 'Hostel', 'Type', 'Reason', 'Out (planned)', 'Expected in',
        'Actual out', 'Actual in', 'Status', 'Late', 'Warden approval', 'Principal approval', 'Checked out by', 'Checked in by'];
      const cls = (c: { name: string; section: string | null } | null) => (c ? [c.name, c.section].filter(Boolean).join(' ') : '');
      const lines = [head, ...rows.map((r) => [
        r.student.fullName, r.student.admissionNo, cls(r.student.class), r.hostel ? `${r.hostel.name} ${r.hostel.room}` : '',
        r.type, r.reason, r.outTime.replace('T', ' '), r.expectedInTime?.replace('T', ' ') ?? '',
        r.actualOutTime ?? '', r.actualInTime ?? '', r.status, r.late ? 'Yes' : 'No',
        r.approvedByWardenName ?? '', r.approvedByPrincipalName ?? '', r.checkedOutByName ?? '', r.checkedInByName ?? '',
      ])].map((line) => line.map(csvEscape).join(','));
      const filters = Object.entries(q).filter(([k, v]) => v && k !== 'format').map(([k, v]) => `${k}=${String(v)}`).join('&');
      await audit(this.prisma, req.user, 'EXPORT', 'gate_pass', 'records', `pass records csv (${rows.length} rows)${filters ? ` ${filters}` : ''}`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="gate-pass-records-${new Date().toISOString().slice(0, 10)}.csv"`);
      // BOM so Excel opens UTF-8 names correctly; CRLF like every other CSV export.
      return new StreamableFile(Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8'));
    }
    return { total: rows.length, truncated, rows };
  }

  /**
   * Options for the pass-register filter bar (class + hostel pickers). Warden and Security
   * can't read /api/classes or hostel rooms, so the Gate Desk gets just the names it needs.
   */
  @Get('filters')
  @Roles(...R.GATE_DESK)
  async filterOptions(@Req() req: ReqWithUser) {
    const [classes, hostels] = await Promise.all([
      this.prisma.class.findMany({ where: { branchId: req.user.branch_id }, select: { id: true, name: true, section: true }, orderBy: [{ name: 'asc' }, { section: 'asc' }] }),
      this.prisma.hostel.findMany({ where: { branchId: req.user.branch_id }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return { classes, hostels };
  }

  /**
   * Student picker for the Gate Desk "Issue pass" form: active students of this school,
   * hostel residents first, matched on name or admission number.
   */
  @Get('students')
  @Roles(...ISSUE_ROLES)
  async pickStudents(@Req() req: ReqWithUser, @Query('q') q?: string) {
    const search = (q ?? '').trim().slice(0, 60);
    const rows = await this.prisma.student.findMany({
      where: {
        branchId: req.user.branch_id,
        status: 'Active',
        ...(search ? { OR: [{ fullName: textContains(search) }, { admissionNo: textContains(search) }] } : {}),
      },
      select: {
        id: true, fullName: true, admissionNo: true,
        class: { select: { id: true, name: true, section: true } },
        hostelAllocation: { select: { bedLabel: true, room: { select: { roomNumber: true, hostel: { select: { name: true } } } } } },
      },
      orderBy: { fullName: 'asc' },
      take: 300,
    });
    return rows
      .map((s) => ({
        id: s.id, fullName: s.fullName, admissionNo: s.admissionNo, class: s.class,
        hostel: s.hostelAllocation
          ? { name: s.hostelAllocation.room.hostel.name, room: s.hostelAllocation.room.roomNumber, bed: s.hostelAllocation.bedLabel }
          : null,
      }))
      .sort((a, b) => Number(!!b.hostel) - Number(!!a.hostel))
      .slice(0, 30);
  }

  @Get('by-code/:code')
  @Roles(...R.GATE_DESK)
  async byCode(@Req() req: ReqWithUser, @Param('code') code: string) {
    const normalized = (code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6,16}$/.test(normalized)) throw new BadRequestException('Invalid pass code');
    const pass = await this.prisma.gatePass.findFirst({ where: { passCode: normalized, branchId: req.user.branch_id }, select: PASS_SELECT });
    if (!pass) throw new NotFoundException('No pass with that code');
    await audit(this.prisma, req.user, 'VIEW', 'gate_pass', pass.id, 'looked up by pass code');
    return (await this.decorate([pass]))[0];
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  async get(@Req() req: ReqWithUser, @Param('id') id: string) {
    return (await this.decorate([await this.load(req, id)]))[0];
  }

  /** Printable pass with a QR of the pass code. Only once issued (Approved or later). */
  @Get(':id/pass.pdf')
  @Roles(...PRINT_ROLES)
  async pdf(@Req() req: ReqWithUser, @Param('id') id: string, @Res() res: Response) {
    const pass = await this.load(req, id);
    if (!ISSUED.includes(pass.status) || !pass.passCode) throw new BadRequestException('The pass is printable only after final approval');
    const [row] = await this.decorate([pass]);
    const branch = await this.prisma.branch.findUnique({ where: { id: req.user.branch_id }, select: { name: true, location: true } });
    const png = await QRCode.toBuffer(pass.passCode, { type: 'png', margin: 1, width: 160, errorCorrectionLevel: 'M' });
    const cls = pass.student.class ? `${pass.student.class.name}${pass.student.class.section ? ` ${pass.student.class.section}` : ''}` : '—';
    const buf = await buildPdf({
      school: branch?.name ?? 'School',
      schoolLine: branch?.location ?? undefined,
      title: 'Student Gate Pass',
      reference: `Pass ${pass.passCode}`,
      blocks: [
        { kind: 'fields', rows: [
          ['Student', pass.student.fullName], ['Admission No', pass.student.admissionNo],
          ['Class', cls], ['Pass type', pass.type],
          ['Out time', pass.outTime.replace('T', ' ')], ['Expected back', pass.expectedInTime?.replace('T', ' ') ?? '—'],
          ['Warden approval', row.approvedByWardenName ?? '—'], ['Principal approval', row.approvedByPrincipalName ?? '—'],
          ['Status', pass.status], ['Pass code', pass.passCode],
        ] },
        { kind: 'heading', text: 'Reason' },
        { kind: 'text', text: pass.reason },
        { kind: 'heading', text: 'Security desk' },
        { kind: 'image', png: new Uint8Array(png), width: 120, height: 120 },
        { kind: 'text', text: `Scan the QR or type code ${pass.passCode} at the gate. Exit requires the one-time code sent to the parent's registered phone/email.` },
      ],
    });
    await audit(this.prisma, req.user, 'EXPORT', 'gate_pass', pass.id, 'pass pdf');
    return sendPdf(res, buf, `gate-pass-${pass.passCode}.pdf`);
  }

  // ─── writes ─────────────────────────────────────────────────

  @Post()
  @Roles(...REQUEST_ROLES)
  async create(@Req() req: ReqWithUser, @Body() body: CreateGatePassDto) {
    await assertInBranch(this.prisma, 'student', body.student_id, req.user.branch_id);
    await assertCanSeeStudent(this.prisma, req.user, body.student_id);
    if (body.expected_in_time && body.expected_in_time < body.out_time) {
      throw new BadRequestException('expected_in_time must be after out_time');
    }
    // Gate Desk "Issue pass" (`issue: true`) by the warden-approval step (warden, or an admin standing
    // in) records the warden approval in the same action — they ARE that step. The Principal's approval
    // (which generates the pass code + parent OTP) still follows. Without `issue` it is a plain request.
    if (body.issue && !WARDEN_STEP.includes(req.user.role)) {
      throw new ForbiddenException('Only the warden can issue a pass directly — request it instead');
    }
    const wardenIssued = !!body.issue;
    const actor = wardenIssued ? await resolveActor(this.prisma, req.user) : null;
    // No parent notification here: the parent hears when the pass is ISSUED, not when it is requested.
    const pass = await this.prisma.gatePass.create({
      data: {
        branchId: req.user.branch_id,
        studentId: body.student_id,
        type: body.type,
        reason: body.reason,
        outTime: body.out_time,
        expectedInTime: body.expected_in_time ?? null,
        status: wardenIssued ? 'Warden Approved' : 'Pending',
        approvedByWarden: actor?.ref ?? null,
      },
      select: { id: true, status: true },
    });
    await audit(this.prisma, req.user, 'CREATE', 'gate_pass', pass.id, wardenIssued ? 'issued at the gate desk (warden step)' : undefined);
    if (wardenIssued) await audit(this.prisma, req.user, 'APPROVE', 'gate_pass', pass.id, 'warden');
    return { ...pass, next_step: wardenIssued ? 'principal_approval' : 'warden_approval' };
  }

  @Put(':id/approve-warden')
  @Roles(...WARDEN_STEP)
  async approveWarden(@Req() req: ReqWithUser, @Param('id') id: string) {
    const pass = await this.load(req, id);
    if (pass.status !== 'Pending') throw new BadRequestException('Pass is not pending warden approval');
    const actor = await resolveActor(this.prisma, req.user);
    await this.prisma.gatePass.update({ where: { id }, data: { status: 'Warden Approved', approvedByWarden: actor.ref } });
    await audit(this.prisma, req.user, 'APPROVE', 'gate_pass', id, 'warden');
    return { success: true, status: 'Warden Approved' };
  }

  @Put(':id/approve-principal')
  @Roles(...PRINCIPAL_STEP)
  async approvePrincipal(@Req() req: ReqWithUser, @Param('id') id: string) {
    const pass = await this.load(req, id);
    if (pass.status !== 'Warden Approved') throw new BadRequestException('Pass must be warden-approved first');
    const actor = await resolveActor(this.prisma, req.user);

    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    let passCode = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      passCode = Array.from({ length: 10 }, () => CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)]).join('');
      const clash = await this.prisma.gatePass.findFirst({ where: { passCode }, select: { id: true } });
      if (!clash) break;
    }
    await this.prisma.gatePass.update({
      where: { id },
      data: { status: 'Approved', approvedByPrincipal: actor.ref, parentOtp: sha256(otp), passCode, otpVerified: false },
    });
    await audit(this.prisma, req.user, 'APPROVE', 'gate_pass', id, 'principal; pass issued');
    await notifyParents(this.prisma, this.notifications, req.user.branch_id, pass.studentId, {
      subject: 'Gate pass issued',
      body: `Gate pass ${passCode} issued for ${pass.student.fullName} (${pass.type}), out ${pass.outTime.replace('T', ' ')}. Share this one-time code with the security desk at exit: ${otp}`,
      ref_type: 'gate_pass',
      ref_id: id,
      redact: [otp],
    });
    return { success: true, status: 'Approved', passCode };
  }

  /** Reject at either approval step: warden while Pending, principal once Warden Approved. */
  @Put(':id/reject')
  @Roles(...new Set([...WARDEN_STEP, ...PRINCIPAL_STEP]))
  async reject(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: RejectGatePassDto) {
    const pass = await this.load(req, id);
    const stage = pass.status === 'Pending' ? WARDEN_STEP : pass.status === 'Warden Approved' ? PRINCIPAL_STEP : null;
    if (!stage) throw new BadRequestException('Only a pass awaiting approval can be rejected');
    if (!stage.includes(req.user.role)) throw new ForbiddenException('This approval step is not yours to reject');
    await this.prisma.gatePass.update({ where: { id }, data: { status: 'Rejected', rejectedReason: body.reason.trim() } });
    await audit(this.prisma, req.user, 'REJECT', 'gate_pass', id, body.reason.trim());
    return { success: true, status: 'Rejected' };
  }

  /** Security desk: OTP from the parent is required to let the student out. */
  @Put(':id/checkout')
  @Roles(...R.GATE_DESK)
  async checkout(@Req() req: ReqWithUser, @Param('id') id: string, @Body() body: GatePassOtpDto) {
    const pass = await this.prisma.gatePass.findFirst({
      where: { id, branchId: req.user.branch_id },
      select: { id: true, status: true, parentOtp: true, studentId: true, student: { select: { fullName: true } } },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status !== 'Approved') throw new BadRequestException('Pass must be fully approved before checkout');
    if (!pass.parentOtp) throw new BadRequestException('Pass has no OTP on record — re-issue it');
    const failures = await this.prisma.auditLog.count({
      where: { branchId: req.user.branch_id, entity: 'gate_pass', entityId: id, action: 'REJECT', detail: 'otp mismatch' },
    });
    if (failures >= MAX_OTP_FAILURES) throw new ForbiddenException('Too many wrong OTP attempts — contact the warden');
    const expected = Buffer.from(pass.parentOtp, 'hex');
    const given = Buffer.from(sha256(body.otp), 'hex');
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      await audit(this.prisma, req.user, 'REJECT', 'gate_pass', id, 'otp mismatch');
      throw new BadRequestException('Invalid parent OTP');
    }
    const actor = await resolveActor(this.prisma, req.user);
    const now = new Date().toISOString();
    await this.prisma.gatePass.update({
      where: { id },
      data: { status: 'Checked Out', actualOutTime: now, checkedOutBy: actor.ref, otpVerified: true },
    });
    await audit(this.prisma, req.user, 'UPDATE', 'gate_pass', id, 'checked out');
    await notifyParents(this.prisma, this.notifications, req.user.branch_id, pass.studentId, {
      subject: 'Student left campus',
      body: `${pass.student.fullName} checked out at the school gate at ${now.slice(0, 16).replace('T', ' ')} UTC.`,
      ref_type: 'gate_pass',
      ref_id: id,
    });
    return { success: true, status: 'Checked Out', actualOutTime: now };
  }

  @Put(':id/checkin')
  @Roles(...R.GATE_DESK)
  async checkin(@Req() req: ReqWithUser, @Param('id') id: string) {
    const pass = await this.prisma.gatePass.findFirst({
      where: { id, branchId: req.user.branch_id },
      select: { id: true, status: true, expectedInTime: true, studentId: true, student: { select: { fullName: true } } },
    });
    if (!pass) throw new NotFoundException('Gate pass not found');
    if (pass.status !== 'Checked Out') throw new BadRequestException('Student has not checked out yet');
    const actor = await resolveActor(this.prisma, req.user);
    const now = new Date().toISOString();
    await this.prisma.gatePass.update({ where: { id }, data: { status: 'Returned', actualInTime: now, checkedInBy: actor.ref } });
    const late = isLate({ status: 'Returned', expectedInTime: pass.expectedInTime, actualInTime: now });
    await audit(this.prisma, req.user, 'UPDATE', 'gate_pass', id, late ? 'checked in (late)' : 'checked in');
    await notifyParents(this.prisma, this.notifications, req.user.branch_id, pass.studentId, {
      subject: 'Student returned to campus',
      body: `${pass.student.fullName} checked back in at the school gate at ${now.slice(0, 16).replace('T', ' ')} UTC${late ? ' (after the expected return time)' : ''}.`,
      ref_type: 'gate_pass',
      ref_id: id,
    });
    return { success: true, status: 'Returned', actualInTime: now, late };
  }
}
