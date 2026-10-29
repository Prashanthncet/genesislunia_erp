import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser, currentStaffId } from '../common/access';

/**
 * Who performed an approval / desk action.
 *
 * Convention for this module:
 *  - `StaffLeave.approvedBy` / `StudentLeave.approvedBy` hold a **Staff id** or null. When the approver
 *    has no Staff row (super_admin / branch_admin accounts), approvedBy is null and the remarks get a
 *    "Decided by <name> (<role>)" prefix; the user id is always in the audit log.
 *  - Gate-pass actor columns (approvedByWarden / approvedByPrincipal / checkedOutBy / checkedInBy) have no
 *    FK, so they hold the Staff id, or `user:<userId>` when the actor has no Staff row.
 */
export async function resolveActor(prisma: PrismaService, user: AuthUser) {
  const staffId = await currentStaffId(prisma, user);
  const u = await prisma.user.findUnique({ where: { id: user.sub }, select: { name: true, email: true } });
  const name = u?.name || u?.email || user.sub;
  return { staffId, name, ref: staffId ?? `user:${user.sub}` };
}

/** Human-readable name for an actor ref written by resolveActor (staff id or `user:<id>`). */
export async function actorNames(prisma: PrismaService, refs: (string | null | undefined)[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const staffIds = refs.filter((r): r is string => !!r && !r.startsWith('user:'));
  const userIds = refs.filter((r): r is string => !!r && r.startsWith('user:')).map((r) => r.slice(5));
  if (staffIds.length) {
    for (const s of await prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })) out[s.id] = s.name;
  }
  if (userIds.length) {
    for (const u of await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })) {
      out[`user:${u.id}`] = u.name || u.email;
    }
  }
  return out;
}

/**
 * Tell a student's family: SMS to the guardian mobile on the student record, plus an email to every
 * linked parent login. `redact` secrets are delivered but masked in notification_logs.
 */
export async function notifyParents(
  prisma: PrismaService,
  notifications: NotificationsService,
  branchId: string,
  studentId: string,
  msg: { subject: string; body: string; ref_type: string; ref_id: string; redact?: string[] },
) {
  const student = await prisma.student.findFirst({ where: { id: studentId, branchId }, select: { mobileNumber: true } });
  if (student?.mobileNumber) {
    await notifications.notify({ branch_id: branchId, channel: 'sms', recipient: student.mobileNumber, ...msg });
  }
  const parents = await prisma.parentStudent.findMany({
    where: { studentId, branchId, user: { isActive: true } },
    select: { user: { select: { email: true } } },
  });
  for (const p of parents) {
    if (p.user.email) await notifications.notify({ branch_id: branchId, channel: 'email', recipient: p.user.email, ...msg });
  }
}

/** Inclusive day count between two YYYY-MM-DD strings, clipped to [from, to]. */
export function inclusiveDays(start: string, end: string, from: string, to: string): number {
  const s = new Date(start < from ? from : start);
  const e = new Date(end > to ? to : end);
  return Math.max(0, Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1);
}
