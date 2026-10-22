import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { R, ROLE } from '../auth/roles';
import { EXT_MIME, mimeLabel, sniffMime } from '../storage/mime';

/**
 * Admission status machine (plan appendix). Every status change in the module goes
 * through `transitionAdmission`, which:
 *   1. checks the action is legal from the current status (409 otherwise),
 *   2. checks the actor's role is allowed to perform that step (403 otherwise),
 *   3. updates the row with a compare-and-set on the old status (a concurrent
 *      second request loses the race and gets 409 — no double transitions),
 *   4. writes an AdmissionStep audit row (from, to, action, actor, remarks).
 */
export const ADM = {
  LINKS_SENT: 'Links Sent',
  LINK_EXPIRED: 'Link Expired',
  SUBMITTED: 'Submitted by Parent',
  RESUBMIT: 'Re-submit',
  VALIDATED: 'Document Validated',
  PAYMENT_RECEIVED: 'Payment Received',
  FEE_APPROVED: 'Fee Approved',
  ROLL_ASSIGNED: 'Roll No Assigned',
  VP_APPROVED: 'VP Approved',
  CONFIRMED: 'Admission Confirmed',
  COMPLETE: 'Admission Complete',
  REJECTED: 'Rejected',
} as const;

export const ADMISSION_STATUSES = Object.values(ADM);

/** Statuses in which the parent may edit the form / upload documents. */
export const EDITABLE_STATUSES: string[] = [ADM.LINKS_SENT, ADM.RESUBMIT];
export const TERMINAL_STATUSES: string[] = [ADM.COMPLETE, ADM.REJECTED];

/** Pseudo-roles for actors that are not logged-in users. */
export const SYSTEM = 'system';
export const PARENT_LINK = 'parent_link'; // unauthenticated parent holding the form token

export type Actor = { id: string | null; role: string };
export const systemActor: Actor = { id: null, role: SYSTEM };

type Rule = { from: string[]; to: string; roles: string[]; remarksRequired?: boolean };

const NON_TERMINAL = ADMISSION_STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s));

export const TRANSITIONS = {
  submit: { from: [ADM.LINKS_SENT, ADM.RESUBMIT], to: ADM.SUBMITTED, roles: [PARENT_LINK, ROLE.PARENT] },
  validate: { from: [ADM.SUBMITTED], to: ADM.VALIDATED, roles: R.ADMISSION_SETUP },
  request_resubmit: { from: [ADM.SUBMITTED], to: ADM.RESUBMIT, roles: R.ADMISSION_SETUP, remarksRequired: true },
  payment_received: { from: [ADM.VALIDATED], to: ADM.PAYMENT_RECEIVED, roles: [SYSTEM] },
  record_offline_payment: { from: [ADM.VALIDATED], to: ADM.PAYMENT_RECEIVED, roles: R.ADMISSION_ACCOUNTS },
  fee_approve: { from: [ADM.PAYMENT_RECEIVED], to: ADM.FEE_APPROVED, roles: R.ADMISSION_ACCOUNTS },
  assign_roll: { from: [ADM.FEE_APPROVED], to: ADM.ROLL_ASSIGNED, roles: R.ADMISSION_OS },
  vp_approve: { from: [ADM.ROLL_ASSIGNED], to: ADM.VP_APPROVED, roles: R.ADMISSION_VP },
  vp_send_back: { from: [ADM.ROLL_ASSIGNED], to: ADM.FEE_APPROVED, roles: R.ADMISSION_VP, remarksRequired: true },
  principal_confirm: { from: [ADM.VP_APPROVED], to: ADM.CONFIRMED, roles: R.ADMISSION_PRINCIPAL },
  principal_send_back: { from: [ADM.VP_APPROVED], to: ADM.ROLL_ASSIGNED, roles: R.ADMISSION_PRINCIPAL, remarksRequired: true },
  complete: { from: [ADM.CONFIRMED], to: ADM.COMPLETE, roles: [SYSTEM] },
  reject: {
    from: NON_TERMINAL,
    to: ADM.REJECTED,
    roles: [...new Set([...R.ADMISSION_VP, ...R.ADMISSION_PRINCIPAL])],
    remarksRequired: true,
  },
  expire_link: { from: [ADM.LINKS_SENT, ADM.RESUBMIT], to: ADM.LINK_EXPIRED, roles: [SYSTEM] },
  reissue_link: { from: [ADM.LINK_EXPIRED], to: ADM.LINKS_SENT, roles: R.ADMISSION_SETUP },
} satisfies Record<string, Rule>;

export type AdmissionAction = keyof typeof TRANSITIONS;

type Tx = Prisma.TransactionClient;

/**
 * Moves one admission along the state machine inside the caller's transaction.
 * `data` carries the step's own column updates (receipt no, roll no, signature...).
 */
export async function transitionAdmission(
  tx: Tx,
  opts: {
    admissionId: string;
    branchId: string;
    action: AdmissionAction;
    actor: Actor;
    remarks?: string | null;
    data?: Prisma.AdmissionUncheckedUpdateManyInput;
  },
) {
  const rule: Rule = TRANSITIONS[opts.action];
  const app = await tx.admission.findFirst({
    where: { id: opts.admissionId, branchId: opts.branchId },
    select: { id: true, status: true },
  });
  if (!app) throw new NotFoundException('Application not found');

  if (!rule.from.includes(app.status)) {
    throw new ConflictException(`Cannot ${opts.action.replace(/_/g, ' ')} an application in status "${app.status}"`);
  }
  if (!rule.roles.includes(opts.actor.role)) {
    throw new ForbiddenException(`Role ${opts.actor.role} cannot perform "${opts.action.replace(/_/g, ' ')}"`);
  }
  const remarks = opts.remarks?.trim() || null;
  if (rule.remarksRequired && !remarks) throw new BadRequestException('remarks are required for this step');

  const res = await tx.admission.updateMany({
    where: { id: app.id, status: app.status },
    data: {
      ...(opts.data ?? {}),
      status: rule.to,
      ...(remarks ? { remarks } : {}),
    },
  });
  if (res.count !== 1) throw new ConflictException('Application changed concurrently; reload and retry');

  await tx.admissionStep.create({
    data: {
      branchId: opts.branchId,
      admissionId: app.id,
      fromStatus: app.status,
      toStatus: rule.to,
      action: opts.action,
      actorId: opts.actor.id,
      actorRole: opts.actor.role,
      remarks,
    },
  });
  return { from: app.status, to: rule.to };
}

/** Academic year label for a date, April-to-March session: Oct 2026 → "2026-27". */
export function academicYearOf(d = new Date()): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

export const YEAR_RE = /^\d{4}-\d{2}$/;

/** Stable form key for a template field label: "Father's Name" → "fathers_name". */
export function fieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'field';
}

export function parseDynamic(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Pulls the well-known student-master fields out of the parent's form data. */
export function studentFieldsFromForm(dyn: Record<string, unknown>) {
  const pick = (re: RegExp) => {
    for (const [k, v] of Object.entries(dyn)) if (re.test(k) && typeof v === 'string' && v.trim()) return v.trim();
    return null;
  };
  return {
    name: pick(/^(student_)?(full_)?name$|^name_of_(the_)?student$/),
    dob: pick(/^dob$|date_of_birth|birth_date/),
    father: pick(/father/),
    mother: pick(/mother/),
    gender: pick(/^gender$/),
    bloodGroup: pick(/blood/),
  };
}

// ─── Document upload validation (shared by staff + public upload) ─────────

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
export const MAX_DOC_BYTES = 5 * 1024 * 1024;

/**
 * Validates an uploaded data URL and returns the decoded bytes. Declared MIME, file
 * extension AND the file's magic bytes must all agree on one of PDF/PNG/JPEG/WebP —
 * an HTML page renamed to photo.png and declared image/png is rejected (400).
 */
export function validateUpload(fileName: string, dataUrl: string) {
  const m = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new BadRequestException('Invalid document data URL format');
  const mime = m[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}. Allowed types: JPEG, PNG, WebP, PDF`);
  const clean = fileName.replace(/[/\\?%*:|"<>]/g, '_').replace(/\.\./g, '_').trim();
  if (!clean || clean.length > 120) throw new BadRequestException('Invalid file name length');
  const dot = clean.lastIndexOf('.');
  const ext = dot !== -1 ? clean.slice(dot).toLowerCase() : '';
  if (!ALLOWED_EXT.has(ext)) throw new BadRequestException(`File extension ${ext || 'none'} is not permitted`);
  if (Math.floor((m[2].length * 3) / 4) > MAX_DOC_BYTES) throw new BadRequestException('File too large (max 5 MB)');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_DOC_BYTES) throw new BadRequestException('File too large (max 5 MB)');
  const actual = sniffMime(bytes);
  if (!actual) throw new BadRequestException('File content is not a valid PDF, PNG, JPEG or WebP file');
  if (actual !== mime || EXT_MIME[ext] !== actual) {
    throw new BadRequestException(`File content is ${mimeLabel(actual)} but it was uploaded as ${ext} (${mime})`);
  }
  return { fileName: clean, sizeBytes: bytes.length, mime: actual, bytes };
}

export type ValidatedUpload = ReturnType<typeof validateUpload>;

export const DOC_TYPES = ['aadhaar', 'photo', 'marksheet', 'birth_certificate', 'transfer_certificate', 'other'];
