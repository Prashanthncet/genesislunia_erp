import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE, isPortalRole } from '../auth/roles';

export type AuthUser = { sub: string; role: string; branch_id: string };
export type ReqWithUser = { user: AuthUser };

/** Models that carry a branchId column and can be ownership-checked by id. */
type BranchModel =
  | 'student' | 'class' | 'staff' | 'subject' | 'exam' | 'hostel' | 'academicRoom'
  | 'feeInvoice' | 'admission' | 'cbtTest' | 'cbtQuestion' | 'syllabus' | 'incident'
  | 'gatePass' | 'studentLeave' | 'staffLeave' | 'assignment' | 'lessonPlan' | 'payslip';

/**
 * Throws 404 unless `id` exists in the caller's school. Use for EVERY id that arrives
 * in a request body or query — upserts keyed on global unique keys (studentId+date,
 * examId+studentId+subjectId, ...) will otherwise happily write into another school.
 * 404 rather than 403 so a caller can't probe which ids exist elsewhere.
 */
export async function assertInBranch(
  prisma: PrismaService,
  model: BranchModel,
  id: string | null | undefined,
  branchId: string,
  label = model,
): Promise<void> {
  if (!id) return;
  // Every model in BranchModel has a branchId column, so this dynamic call is safe.
  const delegate = (prisma as unknown as Record<string, { findFirst: (a: object) => Promise<unknown> }>)[model];
  const row = await delegate.findFirst({ where: { id, branchId }, select: { id: true } });
  if (!row) throw new NotFoundException(`${label} not found`);
}

/** Room belongs to a hostel in this branch (rooms have no branchId of their own). */
export async function assertRoomInBranch(prisma: PrismaService, roomId: string, branchId: string) {
  const room = await prisma.room.findFirst({ where: { id: roomId, hostel: { branchId } }, select: { id: true } });
  if (!room) throw new NotFoundException('room not found');
}

/** The Staff row linked to the logged-in user, or null (admins may have none). */
export async function currentStaffId(prisma: PrismaService, user: AuthUser): Promise<string | null> {
  const staff = await prisma.staff.findFirst({
    where: { branchId: user.branch_id, user: { id: user.sub } },
    select: { id: true },
  });
  return staff?.id ?? null;
}

/**
 * Students a portal user may see: a parent's linked children, or a student's own
 * record. Returns null for staff (no portal restriction — role guards apply instead).
 */
export async function portalStudentIds(prisma: PrismaService, user: AuthUser): Promise<string[] | null> {
  if (!isPortalRole(user.role)) return null;
  if (user.role === ROLE.STUDENT) {
    const u = await prisma.user.findUnique({ where: { id: user.sub }, select: { studentId: true } });
    return u?.studentId ? [u.studentId] : [];
  }
  const links = await prisma.parentStudent.findMany({ where: { userId: user.sub }, select: { studentId: true } });
  return links.map((l) => l.studentId);
}

/**
 * For a teacher, returns the class IDs assigned to them (as class teacher, via timetable slots,
 * or via an active substitution cover). Returns `null` for non-teacher roles.
 */
export async function teacherClassIds(prisma: PrismaService, user: AuthUser): Promise<string[] | null> {
  if (user.role !== ROLE.TEACHER) return null;
  const staffId = await currentStaffId(prisma, user);
  if (!staffId) return [];
  const [own, slots, subs] = await Promise.all([
    prisma.class.findMany({ where: { branchId: user.branch_id, classTeacherId: staffId }, select: { id: true } }),
    prisma.timetableSlot.findMany({ where: { branchId: user.branch_id, teacherId: staffId }, select: { classId: true }, distinct: ['classId'] }),
    prisma.substitution.findMany({ where: { branchId: user.branch_id, substituteTeacherId: staffId, status: 'Assigned' }, select: { classId: true }, distinct: ['classId'] }),
  ]);
  return [...new Set([...own.map((c) => c.id), ...slots.map((s) => s.classId), ...subs.map((s) => s.classId)])];
}

/**
 * 403 unless a portal user is allowed to see this student, or a teacher is assigned to
 * the student's class/section. Other staff roles pass through.
 */
export async function assertCanSeeStudent(prisma: PrismaService, user: AuthUser, studentId: string) {
  const allowed = await portalStudentIds(prisma, user);
  if (allowed && !allowed.includes(studentId)) {
    throw new ForbiddenException('You can only view your own child');
  }
  const teacherScope = await teacherClassIds(prisma, user);
  if (teacherScope !== null) {
    const stu = await prisma.student.findFirst({ where: { id: studentId, branchId: user.branch_id }, select: { classId: true } });
    if (!stu?.classId || !teacherScope.includes(stu.classId)) {
      throw new ForbiddenException('You can only view students in classes assigned to you');
    }
  }
}

export async function audit(
  prisma: PrismaService,
  user: AuthUser,
  action: 'VIEW' | 'LIST' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'ESCALATE' | 'EXPORT',
  entity: string,
  entityId: string,
  detail?: string,
) {
  await prisma.auditLog.create({
    data: { branchId: user.branch_id, actorId: user.sub, action, entity, entityId, detail: detail ?? null },
  });
}
