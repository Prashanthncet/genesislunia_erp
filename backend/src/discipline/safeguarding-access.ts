import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { R } from '../auth/roles';
import { AuthUser, audit, currentStaffId } from '../common/access';

/**
 * Explicit access layer for safeguarding / discipline records (plan Phase 5).
 *
 * This is deliberately NOT the general role system: every incident read or write in the
 * discipline module goes through this class, which
 *   1. decides row-level visibility (case team sees everything; a reporter sees only incidents
 *      they reported, without confidential fields; nobody else sees anything),
 *   2. strips restricted fields for non-case-team callers, and
 *   3. writes an AuditLog row for every LIST / VIEW / CREATE / UPDATE / ESCALATE / DELETE.
 *
 * Case team = R.SAFEGUARDING (super_admin, principal, discipline_officer). `branch_admin` is
 * intentionally NOT in it: running the school's IT/admin does not entitle anyone to read
 * safeguarding files. Soft-deleted rows (deletedAt) are invisible to everyone.
 */

export const INCIDENT_ENTITY = 'incident';

const STUDENT = { select: { id: true, fullName: true, admissionNo: true, class: { select: { name: true, section: true } } } } as const;
const REPORTER = { select: { id: true, name: true } } as const;

/** Full case view — case team only. */
const CASE_SELECT = {
  id: true, studentId: true, reportedBy: true, incidentDate: true, description: true, actionTaken: true,
  demerits: true, status: true, severity: true, confidentialNotes: true, assignedTo: true,
  escalatedAt: true, escalatedBy: true, createdAt: true,
  student: STUDENT, reporter: REPORTER,
} satisfies Prisma.IncidentSelect;

/** Reporter view — what a member of staff who filed the report may see again. */
const REPORTER_SELECT = {
  id: true, studentId: true, incidentDate: true, description: true, actionTaken: true, demerits: true,
  status: true, severity: true, createdAt: true, student: STUDENT, reporter: REPORTER,
} satisfies Prisma.IncidentSelect;

export type AuditAction = 'LIST' | 'VIEW' | 'CREATE' | 'UPDATE' | 'ESCALATE' | 'DELETE';

@Injectable()
export class SafeguardingAccess {
  constructor(private prisma: PrismaService) {}

  isCaseTeam(user: AuthUser): boolean {
    return (R.SAFEGUARDING as string[]).includes(user.role);
  }

  canReport(user: AuthUser): boolean {
    return (R.INCIDENT_REPORT as string[]).includes(user.role);
  }

  assertCaseTeam(user: AuthUser): void {
    if (!this.isCaseTeam(user)) {
      throw new ForbiddenException('Safeguarding records are restricted to the Principal and the Discipline/Safeguarding team');
    }
  }

  async log(user: AuthUser, action: AuditAction, entityId: string, detail?: string) {
    await audit(this.prisma, user, action, INCIDENT_ENTITY, entityId, detail);
  }

  /** Case list (case team only). Audited as one LIST row naming the record ids returned. */
  async listCases(user: AuthUser, filter: { status?: string; severity?: string; studentId?: string }) {
    this.assertCaseTeam(user);
    const rows = await this.prisma.incident.findMany({
      where: {
        branchId: user.branch_id,
        deletedAt: null,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.severity ? { severity: filter.severity } : {}),
        ...(filter.studentId ? { studentId: filter.studentId } : {}),
      },
      select: CASE_SELECT,
      orderBy: [{ incidentDate: 'desc' }, { createdAt: 'desc' }],
    });
    await this.log(user, 'LIST', '*', this.listDetail('cases', rows.map((r) => r.id)));
    return rows;
  }

  /** A reporter's own reports, restricted fields stripped. Audited. */
  async listOwnReports(user: AuthUser) {
    if (!this.canReport(user)) throw new ForbiddenException('Only staff can report incidents');
    const ownership = await this.ownershipFilter(user);
    const rows = await this.prisma.incident.findMany({
      where: { branchId: user.branch_id, deletedAt: null, OR: ownership },
      select: REPORTER_SELECT,
      orderBy: [{ incidentDate: 'desc' }, { createdAt: 'desc' }],
    });
    await this.log(user, 'LIST', '*', this.listDetail('own reports', rows.map((r) => r.id)));
    return rows;
  }

  /**
   * One record. Case team → full record + its access history. Reporter → reporter view.
   * Anyone else (or another school, or a deleted record) → 404 so ids can't be probed;
   * the denied attempt is still audited when the record exists in this school.
   */
  async view(user: AuthUser, id: string) {
    if (this.isCaseTeam(user)) {
      const row = await this.prisma.incident.findFirst({ where: { id, branchId: user.branch_id, deletedAt: null }, select: CASE_SELECT });
      if (!row) throw new NotFoundException('Incident not found');
      await this.log(user, 'VIEW', id);
      const [names, history] = await Promise.all([
        this.userNames([row.assignedTo, row.escalatedBy]),
        this.history(user, id),
      ]);
      return {
        ...row,
        assignedToName: row.assignedTo ? names[row.assignedTo] ?? null : null,
        escalatedByName: row.escalatedBy ? names[row.escalatedBy] ?? null : null,
        history,
        restricted: true,
      };
    }
    const ownership = await this.ownershipFilter(user);
    const row = await this.prisma.incident.findFirst({
      where: { id, branchId: user.branch_id, deletedAt: null, OR: ownership },
      select: REPORTER_SELECT,
    });
    if (!row) {
      const exists = await this.prisma.incident.findFirst({ where: { id, branchId: user.branch_id }, select: { id: true } });
      if (exists) await this.log(user, 'VIEW', id, 'denied: not case team or reporter');
      throw new NotFoundException('Incident not found');
    }
    await this.log(user, 'VIEW', id, 'reporter view');
    return { ...row, restricted: false };
  }

  /** Load a live record for a case-team write. */
  async loadForWrite(user: AuthUser, id: string) {
    this.assertCaseTeam(user);
    const row = await this.prisma.incident.findFirst({ where: { id, branchId: user.branch_id, deletedAt: null } });
    if (!row) throw new NotFoundException('Incident not found');
    return row;
  }

  /** Who reported it: the reporter's Staff row, or (for accounts without one) the CREATE audit row. */
  private async ownershipFilter(user: AuthUser): Promise<Prisma.IncidentWhereInput[]> {
    const staffId = await currentStaffId(this.prisma, user);
    const created = await this.prisma.auditLog.findMany({
      where: { branchId: user.branch_id, actorId: user.sub, entity: INCIDENT_ENTITY, action: 'CREATE' },
      select: { entityId: true },
    });
    const or: Prisma.IncidentWhereInput[] = [{ id: { in: created.map((c) => c.entityId) } }];
    if (staffId) or.push({ reportedBy: staffId });
    return or;
  }

  private async history(user: AuthUser, id: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { branchId: user.branch_id, entity: INCIDENT_ENTITY, entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const names = await this.userNames(rows.map((r) => r.actorId));
    return rows.map((r) => ({ id: r.id, action: r.action, detail: r.detail, createdAt: r.createdAt, actorId: r.actorId, actorName: names[r.actorId] ?? r.actorId }));
  }

  async userNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
    const clean = [...new Set(ids.filter((x): x is string => !!x))];
    if (!clean.length) return {};
    const users = await this.prisma.user.findMany({ where: { id: { in: clean } }, select: { id: true, name: true, email: true, role: true } });
    return Object.fromEntries(users.map((u) => [u.id, `${u.name || u.email} (${u.role})`]));
  }

  private listDetail(what: string, ids: string[]) {
    const s = `${what}: ${ids.length} record(s)${ids.length ? ` [${ids.join(',')}]` : ''}`;
    return s.length > 1900 ? `${s.slice(0, 1890)}…]` : s;
  }
}
