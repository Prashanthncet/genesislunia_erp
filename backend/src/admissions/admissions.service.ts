import * as crypto from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Admission, AdmissionField } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildPdf } from '../common/pdf';
import { DocumentStorage } from '../storage/document-storage.service';
import {
  ADM,
  Actor,
  academicYearOf,
  fieldKey,
  parseDynamic,
  studentFieldsFromForm,
  systemActor,
  transitionAdmission,
} from './workflow';

export const LINK_DAYS = 15;
const DAY = 86_400_000;

export function formLink(token: string): string {
  return `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/admission-form?token=${token}`;
}

/** 10 chars, always upper + lower + digit (passes the change-password strength rule). */
function generatePassword(): string {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const L = 'abcdefghijkmnpqrstuvwxyz';
  const D = '23456789';
  const all = U + L + D;
  const pick = (s: string) => s[crypto.randomInt(s.length)];
  const chars = [pick(U), pick(L), pick(D), ...Array.from({ length: 7 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export type PublicField = {
  id: string;
  key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  validation_rule: string | null;
  sort_order: number;
};

export function toPublicField(f: AdmissionField): PublicField {
  return {
    id: f.id,
    key: fieldKey(f.label),
    label: f.label,
    field_type: f.fieldType,
    is_required: f.isRequired,
    validation_rule: f.validationRule,
    sort_order: f.sortOrder,
  };
}

@Injectable()
export class AdmissionsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private docs: DocumentStorage,
  ) {}

  publishedTemplate(branchId: string, academicYear: string) {
    return this.prisma.admissionField.findMany({
      where: { branchId, academicYear, status: 'Published' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Validates parent-submitted data against the PUBLISHED template for the year.
   * Returns only the template keys (unknown keys are dropped) plus class_id.
   */
  async validateSubmission(app: Admission, body: Record<string, unknown>, strict: boolean) {
    const year = app.academicYear ?? academicYearOf();
    const fields = await this.publishedTemplate(app.branchId, year);
    if (fields.length === 0) throw new ConflictException(`No published admission form for ${year}`);
    const out: Record<string, string> = {};
    const errors: string[] = [];
    for (const f of fields) {
      const key = fieldKey(f.label);
      const raw = body[key] ?? body[f.id];
      const value = raw === undefined || raw === null ? '' : String(raw).trim();
      if (value.length > 500) errors.push(`${f.label} is too long`);
      if (!value) {
        if (strict && f.isRequired) errors.push(`${f.label} is required`);
        continue;
      }
      if (strict) {
        if (f.fieldType === 'date' && Number.isNaN(Date.parse(value))) errors.push(`${f.label} must be a date`);
        if (f.fieldType === 'number' && !/^-?\d+(\.\d+)?$/.test(value)) errors.push(`${f.label} must be a number`);
        if (f.fieldType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(`${f.label} must be an email`);
        if (f.validationRule) {
          let re: RegExp | null = null;
          try {
            re = new RegExp(f.validationRule);
          } catch {
            re = null;
          }
          if (re && !re.test(value)) errors.push(`${f.label} is not in the expected format`);
        }
      }
      out[key] = value;
    }
    const classId = typeof body['class_id'] === 'string' ? body['class_id'] : undefined;
    if (classId) {
      const cls = await this.prisma.class.findFirst({ where: { id: classId, branchId: app.branchId }, select: { id: true } });
      if (!cls) errors.push('Selected class does not exist');
      else out['class_id'] = classId;
    }
    if (errors.length) throw new BadRequestException(errors);
    const fallbackName = typeof body['student_name'] === 'string' ? body['student_name'].trim().slice(0, 120) : '';
    const sf = studentFieldsFromForm(out);
    if (strict && !sf.name && !fallbackName) throw new BadRequestException(['Student name is required']);
    return { data: out, studentName: sf.name ?? (fallbackName || null), dob: sf.dob, classId: out['class_id'] };
  }

  async notifyParent(app: Pick<Admission, 'id' | 'branchId' | 'parentEmail' | 'parentContact'>, subject: string, body: string, redact?: string[]) {
    const targets: { channel: 'email' | 'sms'; to: string }[] = [];
    if (app.parentEmail) targets.push({ channel: 'email', to: app.parentEmail });
    if (app.parentContact) targets.push({ channel: 'sms', to: app.parentContact });
    for (const t of targets) {
      await this.notifications.notify({
        branch_id: app.branchId,
        channel: t.channel,
        recipient: t.to,
        subject,
        body,
        ref_type: 'admission',
        ref_id: app.id,
        redact,
      });
    }
  }

  /** Unique lowercase login id p + 6 digits. */
  async newLoginId(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const id = `p${crypto.randomInt(100000, 1000000)}`;
      const clash = await this.prisma.user.findUnique({ where: { email: id }, select: { id: true } });
      if (!clash) return id;
    }
    throw new ConflictException('Could not allocate a login id, retry');
  }

  async createParentInvite(
    branchId: string,
    actor: Actor,
    p: { parent_name: string; parent_email?: string; parent_contact?: string },
    academicYear: string,
    feeAmount: number | null,
  ) {
    const loginId = await this.newLoginId();
    const password = generatePassword();
    const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
    const hash = await bcrypt.hash(password, 10);
    const linkExpiresAt = new Date(Date.now() + LINK_DAYS * DAY);

    const app = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { branchId, email: loginId, password: hash, role: 'parent', name: p.parent_name, mustChangePassword: true },
      });
      const created = await tx.admission.create({
        data: {
          branchId,
          parentName: p.parent_name,
          parentEmail: p.parent_email?.toLowerCase() ?? null,
          parentContact: p.parent_contact ?? null,
          status: ADM.LINKS_SENT,
          loginId,
          token,
          academicYear,
          parentUserId: user.id,
          linkExpiresAt,
          feeAmount,
        },
      });
      await tx.admissionStep.create({
        data: {
          branchId,
          admissionId: created.id,
          fromStatus: null,
          toStatus: ADM.LINKS_SENT,
          action: 'create_form',
          actorId: actor.id,
          actorRole: actor.role,
        },
      });
      return created;
    });

    const link = formLink(token);
    await this.notifyParent(
      app,
      'Admission form link',
      `Dear ${p.parent_name}, please complete the admission form for ${academicYear}: ${link} ` +
        `(valid until ${linkExpiresAt.toISOString().slice(0, 10)}). Parent portal login ID: ${loginId}, password: ${password}`,
      [password],
    );
    return { id: app.id, parent_name: p.parent_name, login_id: loginId, password, token, form_link: link, link_expires_at: linkExpiresAt };
  }

  /**
   * Principal's digital sign + the system "Admission Complete" step, in ONE transaction:
   * Student master row, documents archived to the student, parent login linked.
   * Student.admissionId is unique, so even a racing duplicate cannot create a second student.
   */
  async confirmAndComplete(branchId: string, id: string, actor: Actor, signatureName: string, remarks?: string) {
    const result = await this.confirmTx(branchId, id, actor, signatureName, remarks);
    // Object storage is not part of the DB transaction: move the files into the student's
    // DMS folder once the rows are committed. Failures are logged and leave the file readable
    // on its admission key; scripts/migrate-documents-to-storage.js re-runs the move.
    const dms = await this.docs.archiveToStudent(branchId, result.student_id);
    return { ...result, documents_moved: dms.moved, documents_move_failed: dms.failed.length };
  }

  private confirmTx(branchId: string, id: string, actor: Actor, signatureName: string, remarks?: string) {
    return this.prisma.$transaction(async (tx) => {
      const signedAt = new Date();
      await transitionAdmission(tx, {
        admissionId: id,
        branchId,
        action: 'principal_confirm',
        actor,
        remarks,
        data: { signatureName: signatureName.trim(), signedBy: actor.id, signedAt },
      });
      const app = await tx.admission.findUniqueOrThrow({ where: { id } });
      const dyn = parseDynamic(app.dynamicData);
      const sf = studentFieldsFromForm(dyn as Record<string, unknown>);
      const student = await tx.student.create({
        data: {
          branchId,
          admissionNo: app.rollNo ?? `ADM-${app.id.slice(0, 8).toUpperCase()}`,
          fullName: app.studentName ?? sf.name ?? 'Unknown',
          dob: app.dob ?? sf.dob,
          fatherName: sf.father ?? app.parentName,
          motherName: sf.mother,
          gender: sf.gender,
          bloodGroup: sf.bloodGroup,
          mobileNumber: app.parentContact,
          email: app.parentEmail,
          classId: app.classId,
          rollNo: app.rollNo,
          house: app.house,
          enrollmentDate: signedAt.toISOString().slice(0, 10),
          status: 'Active',
          admissionId: app.id,
        },
      });
      const archived = await tx.admissionDocument.updateMany({
        where: { admissionId: app.id, branchId },
        data: { studentId: student.id },
      });
      if (app.parentUserId) {
        const parent = await tx.user.findFirst({ where: { id: app.parentUserId, branchId, role: 'parent' }, select: { id: true } });
        if (parent) {
          await tx.parentStudent.upsert({
            where: { userId_studentId: { userId: parent.id, studentId: student.id } },
            create: { branchId, userId: parent.id, studentId: student.id },
            update: {},
          });
        }
      }
      await transitionAdmission(tx, {
        admissionId: id,
        branchId,
        action: 'complete',
        actor: systemActor,
        data: { studentId: student.id },
      });
      return { student_id: student.id, admission_no: student.admissionNo, documents_archived: archived.count, signed_at: signedAt };
    });
  }

  async letterPdf(app: Admission & { class?: { name: string; section: string | null } | null }) {
    const branch = await this.prisma.branch.findUnique({ where: { id: app.branchId }, select: { name: true, location: true } });
    const student = app.studentId
      ? await this.prisma.student.findUnique({ where: { id: app.studentId }, select: { admissionNo: true } })
      : null;
    const cls = app.class ? `${app.class.name}${app.class.section ? ` - ${app.class.section}` : ''}` : '—';
    return buildPdf({
      school: branch?.name ?? 'School',
      schoolLine: branch?.location ?? undefined,
      title: 'Letter of Admission',
      reference: `Ref: ${student?.admissionNo ?? app.rollNo ?? app.id.slice(0, 8)}`,
      blocks: [
        { kind: 'text', text: `Dear ${app.parentName ?? 'Parent'},` },
        {
          kind: 'text',
          text: `We are pleased to confirm the admission of ${app.studentName ?? 'your ward'} for the academic year ${app.academicYear ?? academicYearOf()}. The details of the admission are given below.`,
        },
        { kind: 'heading', text: 'Admission details' },
        {
          kind: 'fields',
          rows: [
            ['Student name', app.studentName],
            ['Date of birth', app.dob],
            ['Class', cls],
            ['Roll number', app.rollNo],
            ['House', app.house],
            ['Admission number', student?.admissionNo ?? app.rollNo],
            ['Fee receipt', app.receiptNo],
            ['Status', app.status],
          ],
        },
        { kind: 'text', text: 'Please report to the school office with original documents on the first working day of the session.' },
        { kind: 'spacer', size: 10 },
        {
          kind: 'signature',
          name: app.signatureName ?? '—',
          title: 'Principal',
          signedAt: app.signedAt ? app.signedAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : undefined,
        },
      ],
    });
  }

  async timeline(branchId: string, id: string) {
    const [steps, notifications] = await Promise.all([
      this.prisma.admissionStep.findMany({ where: { branchId, admissionId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.notificationLog.findMany({
        where: { branchId, refType: 'admission', refId: id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, channel: true, recipient: true, subject: true, body: true, status: true, createdAt: true },
      }),
    ]);
    return { steps, notifications };
  }

  /**
   * Day-7 / Day-13 reminders for unopened links and expiry of links past 15 days.
   * Called by the daily cron and by POST /admissions/reminders/run.
   */
  async runReminders(now = new Date(), branchId?: string) {
    const pending = await this.prisma.admission.findMany({
      where: { status: { in: [ADM.LINKS_SENT, ADM.RESUBMIT] }, linkExpiresAt: { not: null }, ...(branchId ? { branchId } : {}) },
    });
    const result = { checked: pending.length, reminded_day7: 0, reminded_day13: 0, expired: 0 };
    for (const app of pending) {
      const expires = app.linkExpiresAt as Date;
      if (expires.getTime() <= now.getTime()) {
        try {
          await this.prisma.$transaction((tx) =>
            transitionAdmission(tx, { admissionId: app.id, branchId: app.branchId, action: 'expire_link', actor: systemActor }),
          );
          result.expired += 1;
          await this.notifyParent(app, 'Admission link expired', 'Your admission form link has expired. Please contact the admission office to have it re-issued.');
        } catch {
          /* changed concurrently — next run handles it */
        }
        continue;
      }
      if (app.status !== ADM.LINKS_SENT) continue; // reminders only for never-submitted forms
      const sentAt = expires.getTime() - LINK_DAYS * DAY;
      const day = Math.floor((now.getTime() - sentAt) / DAY);
      let next: 1 | 2 | null = null;
      if (day >= 13 && app.remindersSent < 2) next = 2;
      else if (day >= 7 && app.remindersSent < 1) next = 1;
      if (!next) continue;
      const upd = await this.prisma.admission.updateMany({
        where: { id: app.id, remindersSent: app.remindersSent },
        data: { remindersSent: next, lastReminderAt: now },
      });
      if (upd.count !== 1) continue;
      const left = Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / DAY));
      await this.notifyParent(
        app,
        `Reminder: admission form pending (${left} day${left === 1 ? '' : 's'} left)`,
        `Reminder: your admission form is not yet submitted. Link: ${formLink(app.token ?? '')} (expires ${expires.toISOString().slice(0, 10)}). Login ID: ${app.loginId ?? '-'}`,
      );
      if (next === 1) result.reminded_day7 += 1;
      else result.reminded_day13 += 1;
    }
    return result;
  }

  async getInBranch(branchId: string, id: string) {
    const app = await this.prisma.admission.findFirst({
      where: { id, branchId },
      include: { class: { select: { id: true, name: true, section: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }
}
