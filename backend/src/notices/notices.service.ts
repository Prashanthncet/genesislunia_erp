import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { R, ROLE } from '../auth/roles';
import { assertInBranch, audit, AuthUser, currentStaffId, portalStudentIds } from '../common/access';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoticeDto } from './notices.dto';

/** Roles that may address the whole school / any class / any student. */
const SCHOOL_WIDE: string[] = R.BROADCAST;
const LEADERSHIP: string[] = R.LEADERSHIP;

const className = (c: { name: string; section: string | null } | null | undefined) =>
  c ? `${c.name}${c.section ? ` ${c.section}` : ''}` : null;

export type StaffNoticeFilters = { audience?: string; class_id?: string; from?: string; to?: string };

/**
 * Student notices: an in-app notice board for students and their parents.
 *
 *  - Leadership / OS / AO (R.BROADCAST) may address all students, any class or any student.
 *  - Teachers and HODs may address only a class they teach (timetable) or are class teacher
 *    of, or a single student in such a class. "All students" is refused for them.
 *  - Students see notices for all students + their own class + themselves; parents see the
 *    same for each linked child, labelled per child. Expired notices are hidden.
 *  - Read state is per USER (a parent with two children reads a shared notice once).
 */
@Injectable()
export class NoticesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** Classes a teacher/HOD may address; null = no limit (school-wide roles). */
  async teachingClassIds(user: AuthUser): Promise<string[] | null> {
    if (SCHOOL_WIDE.includes(user.role)) return null;
    const staffId = await currentStaffId(this.prisma, user);
    if (!staffId) return [];
    const [own, slots] = await Promise.all([
      this.prisma.class.findMany({ where: { branchId: user.branch_id, classTeacherId: staffId }, select: { id: true } }),
      this.prisma.timetableSlot.findMany({
        where: { branchId: user.branch_id, teacherId: staffId }, select: { classId: true }, distinct: ['classId'],
      }),
    ]);
    return [...new Set([...own.map((c) => c.id), ...slots.map((s) => s.classId)])];
  }

  /** Classes the caller may address, with names (for the compose form). */
  async targets(user: AuthUser) {
    const scope = await this.teachingClassIds(user);
    const classes = await this.prisma.class.findMany({
      where: { branchId: user.branch_id, ...(scope ? { id: { in: scope } } : {}) },
      select: { id: true, name: true, section: true },
      orderBy: [{ name: 'asc' }, { section: 'asc' }],
    });
    return { school_wide: scope === null, classes: classes.map((c) => ({ id: c.id, name: className(c) })) };
  }

  async create(user: AuthUser, body: CreateNoticeDto) {
    const scope = await this.teachingClassIds(user);
    let classId: string | null = null;
    let studentId: string | null = null;

    if (body.audience === 'all_students') {
      if (scope) throw new ForbiddenException('Only school leadership and the office can notify all students');
    } else if (body.audience === 'class') {
      if (!body.class_id) throw new BadRequestException('class_id is required for a class notice');
      await assertInBranch(this.prisma, 'class', body.class_id, user.branch_id);
      if (scope && !scope.includes(body.class_id)) throw new ForbiddenException('You can only notify classes you teach or are the class teacher of');
      classId = body.class_id;
    } else {
      if (!body.student_id) throw new BadRequestException('student_id is required for a student notice');
      await assertInBranch(this.prisma, 'student', body.student_id, user.branch_id);
      if (scope) {
        const s = await this.prisma.student.findFirst({ where: { id: body.student_id, branchId: user.branch_id }, select: { classId: true } });
        if (!s?.classId || !scope.includes(s.classId)) throw new ForbiddenException('You can only notify students in classes you teach or are the class teacher of');
      }
      studentId = body.student_id;
    }

    let expiresAt: Date | null = null;
    if (body.expires_at) {
      expiresAt = new Date(body.expires_at);
      // A bare date means "until the end of that day".
      if (/^\d{4}-\d{2}-\d{2}$/.test(body.expires_at)) expiresAt = new Date(`${body.expires_at}T23:59:59.999`);
      if (expiresAt.getTime() <= Date.now()) throw new BadRequestException('expires_at must be in the future');
    }

    const notice = await this.prisma.notice.create({
      data: {
        branchId: user.branch_id, title: body.title, body: body.body, audience: body.audience,
        classId, studentId, priority: body.priority ?? 'normal', createdBy: user.sub, expiresAt,
      },
    });
    await audit(this.prisma, user, 'CREATE', 'notice', notice.id, `${body.audience}${classId ? ` ${classId}` : ''}${studentId ? ` ${studentId}` : ''}`);

    const delivery = body.also_send && body.also_send !== 'none'
      ? await this.dispatch(user.branch_id, notice, body.also_send)
      : null;
    return { id: notice.id, delivery };
  }

  /** also_send: one SMS/email per reachable contact of the targeted students and their linked parents. */
  private async dispatch(branchId: string, notice: { id: string; title: string; body: string; audience: string; classId: string | null; studentId: string | null; priority: string }, channel: 'sms' | 'email') {
    const students = await this.prisma.student.findMany({
      where: {
        branchId,
        ...(notice.audience === 'student' ? { id: notice.studentId! } : { status: 'Active' }),
        ...(notice.audience === 'class' ? { classId: notice.classId! } : {}),
      },
      select: { email: true, mobileNumber: true, parentLinks: { select: { user: { select: { email: true, isActive: true } } } } },
    });
    const recipients = new Set<string>();
    let skipped = 0;
    for (const s of students) {
      const own = channel === 'email' ? s.email : s.mobileNumber;
      const parents = channel === 'email'
        ? s.parentLinks.filter((l) => l.user.isActive && /@/.test(l.user.email)).map((l) => l.user.email)
        : []; // parent logins carry no phone number; the student's mobile is the guardian contact
      const found = [own, ...parents].filter((c): c is string => !!c && !!c.trim());
      if (!found.length) skipped += 1;
      for (const c of found) recipients.add(c.trim());
    }
    const subject = `${notice.priority === 'important' ? '[Important] ' : ''}${notice.title}`;
    const text = channel === 'sms' ? `${subject}: ${notice.body}`.slice(0, 480) : notice.body;
    const result = { channel, dispatched: 0, sent: 0, failed: 0, mocked: 0, skipped };
    for (const recipient of recipients) {
      const log = await this.notifications.notify({
        branch_id: branchId, channel, recipient, subject, body: text, ref_type: 'notice', ref_id: notice.id,
      });
      result.dispatched += 1;
      if (log.status === 'sent') result.sent += 1;
      else if (log.status === 'mocked') result.mocked += 1;
      else result.failed += 1;
    }
    return result;
  }

  /** Students a notice reaches (for read-rate context on the staff list). */
  private async audienceSizes(branchId: string, notices: { audience: string; classId: string | null }[]) {
    const classIds = [...new Set(notices.filter((n) => n.audience === 'class' && n.classId).map((n) => n.classId!))];
    const [all, byClass] = await Promise.all([
      notices.some((n) => n.audience === 'all_students') ? this.prisma.student.count({ where: { branchId, status: 'Active' } }) : Promise.resolve(0),
      classIds.length
        ? this.prisma.student.groupBy({ by: ['classId'], where: { branchId, status: 'Active', classId: { in: classIds } }, _count: { _all: true } })
        : Promise.resolve([] as { classId: string | null; _count: { _all: number } }[]),
    ]);
    const map = new Map(byClass.map((r) => [r.classId, r._count._all]));
    return (n: { audience: string; classId: string | null }) =>
      n.audience === 'all_students' ? all : n.audience === 'class' ? map.get(n.classId) ?? 0 : 1;
  }

  async listForStaff(user: AuthUser, f: StaffNoticeFilters) {
    const scope = await this.teachingClassIds(user);
    const where: Prisma.NoticeWhereInput = { branchId: user.branch_id };
    if (f.audience) where.audience = f.audience;
    if (f.class_id) {
      await assertInBranch(this.prisma, 'class', f.class_id, user.branch_id);
      where.classId = f.class_id;
    }
    const created: Prisma.DateTimeFilter = {};
    if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) created.gte = new Date(`${f.from}T00:00:00`);
    if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) created.lte = new Date(`${f.to}T23:59:59.999`);
    if (created.gte || created.lte) where.createdAt = created;
    if (scope) {
      // Teachers/HODs: what they posted, plus notices addressed to their classes / their students.
      where.OR = [
        { createdBy: user.sub },
        { audience: 'class', classId: { in: scope } },
        { audience: 'student', studentId: { in: (await this.prisma.student.findMany({ where: { branchId: user.branch_id, classId: { in: scope } }, select: { id: true } })).map((s) => s.id) } },
      ];
    }
    const rows = await this.prisma.notice.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 300,
      include: { _count: { select: { reads: true } } },
    });
    const classIds = [...new Set(rows.map((r) => r.classId).filter((c): c is string => !!c))];
    const studentIds = [...new Set(rows.map((r) => r.studentId).filter((s): s is string => !!s))];
    const userIds = [...new Set(rows.map((r) => r.createdBy).filter((u): u is string => !!u))];
    const [classes, students, users, size] = await Promise.all([
      this.prisma.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true, section: true } }),
      this.prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true, admissionNo: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, role: true } }),
      this.audienceSizes(user.branch_id, rows),
    ]);
    const cMap = new Map(classes.map((c) => [c.id, className(c)]));
    const sMap = new Map(students.map((s) => [s.id, s]));
    const uMap = new Map(users.map((u) => [u.id, u]));
    const now = Date.now();
    return rows.map((n) => {
      const author = n.createdBy ? uMap.get(n.createdBy) : undefined;
      const student = n.studentId ? sMap.get(n.studentId) : undefined;
      return {
        id: n.id, title: n.title, body: n.body, audience: n.audience, priority: n.priority,
        class_id: n.classId, class_name: n.classId ? cMap.get(n.classId) ?? null : null,
        student_id: n.studentId, student_name: student?.fullName ?? null, student_admission_no: student?.admissionNo ?? null,
        created_at: n.createdAt, expires_at: n.expiresAt, expired: !!n.expiresAt && n.expiresAt.getTime() <= now,
        created_by: author ? { name: author.name ?? author.email, role: author.role } : null,
        read_count: n._count.reads, audience_size: size(n),
        can_manage: n.createdBy === user.sub || LEADERSHIP.includes(user.role),
      };
    });
  }

  private async manageable(user: AuthUser, id: string) {
    const n = await this.prisma.notice.findFirst({ where: { id, branchId: user.branch_id } });
    if (!n) throw new NotFoundException('Notice not found');
    if (n.createdBy !== user.sub && !LEADERSHIP.includes(user.role)) throw new ForbiddenException('Only the author or school leadership can change this notice');
    return n;
  }

  async expire(user: AuthUser, id: string) {
    const n = await this.manageable(user, id);
    const now = new Date();
    if (!n.expiresAt || n.expiresAt > now) await this.prisma.notice.update({ where: { id }, data: { expiresAt: now } });
    await audit(this.prisma, user, 'UPDATE', 'notice', id, 'expired');
    return { id, expired: true };
  }

  async remove(user: AuthUser, id: string) {
    await this.manageable(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.noticeRead.deleteMany({ where: { noticeId: id } });
      await tx.notice.delete({ where: { id } });
    });
    await audit(this.prisma, user, 'DELETE', 'notice', id);
    return { success: true };
  }

  // ─── Portal ────────────────────────────────────────────────

  /** Children (or self) of a portal user with their classes. Staff → []. */
  private async portalStudents(user: AuthUser) {
    const ids = (await portalStudentIds(this.prisma, user)) ?? [];
    if (!ids.length) return [];
    return this.prisma.student.findMany({
      where: { id: { in: ids }, branchId: user.branch_id },
      select: { id: true, fullName: true, classId: true, class: { select: { name: true, section: true } } },
      orderBy: { fullName: 'asc' },
    });
  }

  private visibleWhere(branchId: string, students: { id: string; classId: string | null }[]): Prisma.NoticeWhereInput {
    const classIds = [...new Set(students.map((s) => s.classId).filter((c): c is string => !!c))];
    return {
      branchId,
      OR: [
        { audience: 'all_students' },
        ...(classIds.length ? [{ audience: 'class', classId: { in: classIds } }] : []),
        { audience: 'student', studentId: { in: students.map((s) => s.id) } },
      ],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    };
  }

  async mine(user: AuthUser) {
    const students = await this.portalStudents(user);
    if (!students.length) return [];
    const rows = await this.prisma.notice.findMany({
      where: this.visibleWhere(user.branch_id, students),
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const reads = await this.prisma.noticeRead.findMany({
      where: { userId: user.sub, noticeId: { in: rows.map((r) => r.id) } },
      select: { noticeId: true, readAt: true },
    });
    const readMap = new Map(reads.map((r) => [r.noticeId, r.readAt]));
    const authorIds = [...new Set(rows.map((r) => r.createdBy).filter((u): u is string => !!u))];
    const authors = await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, role: true } });
    const aMap = new Map(authors.map((a) => [a.id, a]));
    return rows.map((n) => {
      const forChildren = students.filter((s) =>
        n.audience === 'all_students' || (n.audience === 'class' && s.classId === n.classId) || (n.audience === 'student' && s.id === n.studentId));
      const author = n.createdBy ? aMap.get(n.createdBy) : undefined;
      const cls = n.audience === 'class' ? forChildren[0]?.class : null;
      return {
        id: n.id, title: n.title, body: n.body, audience: n.audience, priority: n.priority,
        audience_label: n.audience === 'all_students' ? 'All students' : n.audience === 'class' ? `Class ${className(cls) ?? ''}`.trim() : 'Personal',
        created_at: n.createdAt, expires_at: n.expiresAt,
        from: author ? { name: author.name ?? 'School office', role: author.role } : null,
        children: forChildren.map((s) => ({ id: s.id, name: s.fullName })),
        read: readMap.has(n.id), read_at: readMap.get(n.id) ?? null,
      };
    });
  }

  async markRead(user: AuthUser, id: string) {
    const students = await this.portalStudents(user);
    const n = students.length
      ? await this.prisma.notice.findFirst({ where: { id, ...this.visibleWhere(user.branch_id, students) }, select: { id: true } })
      : null;
    if (!n) throw new NotFoundException('Notice not found');
    try {
      await this.prisma.noticeRead.create({ data: { noticeId: id, userId: user.sub } });
    } catch (e) {
      // Already read (unique noticeId+userId) — idempotent.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    return { id, read: true };
  }

  async unreadCount(user: AuthUser) {
    if (user.role !== ROLE.PARENT && user.role !== ROLE.STUDENT) return { count: 0 };
    const students = await this.portalStudents(user);
    if (!students.length) return { count: 0 };
    const visible = await this.prisma.notice.findMany({ where: this.visibleWhere(user.branch_id, students), select: { id: true } });
    if (!visible.length) return { count: 0 };
    const read = await this.prisma.noticeRead.count({ where: { userId: user.sub, noticeId: { in: visible.map((v) => v.id) } } });
    return { count: Math.max(0, visible.length - read) };
  }
}
