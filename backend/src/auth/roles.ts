/**
 * Every role the system knows, and the groups controllers grant access to.
 *
 * Controllers should use the groups (`@Roles(...R.FEES_WRITE)`), not ad-hoc string
 * lists — the ad-hoc lists drifted until e.g. `principal` could approve leave but
 * not read a single student. Names follow the delivery plan's role list.
 */
export const ROLE = {
  SUPER_ADMIN: 'super_admin', // group / platform owner
  BRANCH_ADMIN: 'branch_admin', // school administrator
  ADMIN: 'admin', // legacy alias of branch_admin, kept so old tokens keep working
  PRINCIPAL: 'principal',
  VICE_PRINCIPAL: 'vice_principal',
  OFFICE_SUPERINTENDENT: 'office_superintendent', // "OS" in the plan
  ADMISSION_OFFICER: 'admission_officer', // "AO" / Admission Incharge
  ACCOUNTS: 'accounts',
  HR: 'hr',
  HOD: 'hod',
  TEACHER: 'teacher',
  WARDEN: 'warden',
  SECURITY: 'security', // gate / front desk
  DISCIPLINE_OFFICER: 'discipline_officer', // safeguarding lead
  PARENT: 'parent',
  STUDENT: 'student',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const ALL_ROLES = Object.values(ROLE) as Role[];

const { SUPER_ADMIN, BRANCH_ADMIN, ADMIN, PRINCIPAL, VICE_PRINCIPAL, OFFICE_SUPERINTENDENT,
  ADMISSION_OFFICER, ACCOUNTS, HR, HOD, TEACHER, WARDEN, SECURITY, DISCIPLINE_OFFICER,
  PARENT, STUDENT } = ROLE;

/** Portal roles: may only ever see their own / their child's records. */
export const PORTAL_ROLES: Role[] = [PARENT, STUDENT];

/** Every staff role (everyone except parents and students). */
export const STAFF_ROLES: Role[] = ALL_ROLES.filter((r) => !PORTAL_ROLES.includes(r));

const ADMINS: Role[] = [SUPER_ADMIN, BRANCH_ADMIN, ADMIN];
const LEADERSHIP: Role[] = [...ADMINS, PRINCIPAL, VICE_PRINCIPAL];

/**
 * Staff who work with classes and teaching. Warden and Security are deliberately left out
 * (school decision 2026-10-24): Warden = hostel + gate desk + pass records + student list;
 * Security = gate desk + visitors. Both keep staff self-service (own leave, own payslips)
 * and can still report a safeguarding incident.
 */
const ACADEMIC_STAFF: Role[] = STAFF_ROLES.filter((r) => r !== WARDEN && r !== SECURITY);

export const R = {
  ADMINS,
  LEADERSHIP,
  STAFF: STAFF_ROLES,
  ACADEMIC_STAFF,

  // Admissions workflow — one role per step, as in the plan's status table.
  ADMISSION_SETUP: [...ADMINS, ADMISSION_OFFICER], // field builder, send links, validate docs
  ADMISSION_OS: [...ADMINS, OFFICE_SUPERINTENDENT], // approve template, roll no + house
  ADMISSION_ACCOUNTS: [...ADMINS, ACCOUNTS], // verify payment + receipt
  ADMISSION_VP: [...ADMINS, VICE_PRINCIPAL],
  ADMISSION_PRINCIPAL: [...ADMINS, PRINCIPAL],
  ADMISSION_READ: [...LEADERSHIP, ADMISSION_OFFICER, OFFICE_SUPERINTENDENT, ACCOUNTS],

  // Student information
  STUDENT_READ: [...LEADERSHIP, OFFICE_SUPERINTENDENT, ADMISSION_OFFICER, ACCOUNTS, HOD, TEACHER, WARDEN, DISCIPLINE_OFFICER],
  STUDENT_WRITE: [...ADMINS, PRINCIPAL, OFFICE_SUPERINTENDENT],

  // Fees
  FEES_READ: [...LEADERSHIP, ACCOUNTS, OFFICE_SUPERINTENDENT],
  FEES_WRITE: [...ADMINS, ACCOUNTS],

  // Attendance / timetable / academics
  ATTENDANCE_MARK: [...LEADERSHIP, HOD, TEACHER],
  TIMETABLE_ADMIN: [...ADMINS, PRINCIPAL, VICE_PRINCIPAL, HOD],
  ACADEMIC_SETUP: [...ADMINS, PRINCIPAL, VICE_PRINCIPAL, HOD],
  TEACHING: [...LEADERSHIP, HOD, TEACHER],

  // Leave / gate pass
  LEAVE_APPROVE: [...LEADERSHIP, HOD, HR],
  STUDENT_LEAVE_APPROVE: [...LEADERSHIP, HOD, TEACHER, WARDEN],
  GATE_PASS_APPROVE: [...LEADERSHIP, WARDEN],
  GATE_DESK: [...LEADERSHIP, WARDEN, SECURITY],

  // Safeguarding: deliberately narrow (plan Phase 5).
  SAFEGUARDING: [SUPER_ADMIN, PRINCIPAL, DISCIPLINE_OFFICER],
  INCIDENT_REPORT: [...STAFF_ROLES],

  // Hostel
  HOSTEL_ADMIN: [...ADMINS, PRINCIPAL, WARDEN],
  HOSTEL_DESK: [...ADMINS, PRINCIPAL, WARDEN, SECURITY],

  // Staff & payroll
  STAFF_DIRECTORY: [...LEADERSHIP, HR, HOD, OFFICE_SUPERINTENDENT],
  STAFF_ADMIN: [...ADMINS, HR],
  PAYROLL: [...ADMINS, HR, ACCOUNTS],

  // Reports & notifications
  REPORTS: [...LEADERSHIP, ACCOUNTS, OFFICE_SUPERINTENDENT, HOD],
  BROADCAST: [...LEADERSHIP, OFFICE_SUPERINTENDENT, ADMISSION_OFFICER],
  NOTIFICATION_LOG: [...LEADERSHIP, OFFICE_SUPERINTENDENT, ADMISSION_OFFICER],

  // CBT
  CBT_AUTHOR: [...LEADERSHIP, HOD, TEACHER],
  CBT_TAKE: [STUDENT],
} satisfies Record<string, Role[]>;

export function isPortalRole(role: string): boolean {
  return (PORTAL_ROLES as string[]).includes(role);
}
