/**
 * Single source of truth for navigation AND for which role may open which screen.
 *
 * The sidebar, the command palette, the home quick actions and the route guard in
 * `DashboardShell` all read from here, so the menu and the guard can't drift apart:
 * a screen is reachable exactly when `canAccess(path, role)` says so.
 *
 * Every `href` here must have a matching route in `src/app/(dashboard)/`. The
 * `roles` lists mirror the backend `@Roles(...)` groups (`R` in `lib/auth.tsx`);
 * the server still enforces every request — this only decides what the UI offers.
 */

import { R, ROLE } from "@/lib/auth";

export type NavItem = {
  /** Label shown in the sidebar. */
  name: string;
  href: string;
  /** Key into the `Icon` set in `components/ui.tsx`. */
  icon: string;
  /** One-line description used by the command palette. */
  hint?: string;
  /** Roles that may open this screen. */
  roles: readonly string[];
};

export type NavGroup = { group: string; items: NavItem[] };

const STAFF = R.STAFF;
/** Staff who request gate passes from the Leaves screen (they have no Gate Desk). */
const TEACHING_PASS: readonly string[] = [ROLE.TEACHER, ROLE.HOD];
const uniq = (...lists: readonly (readonly string[])[]) => Array.from(new Set(lists.flat()));

/** Staff navigation. Portal roles never see any of it. */
export const NAV_GROUPS: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { name: "Dashboard", href: "/", icon: "home", hint: "Your role's overview and work queue", roles: STAFF },
    ],
  },
  {
    group: "Academics",
    items: [
      { name: "Students", href: "/students", icon: "students", hint: "Student master directory", roles: R.STUDENT_READ },
      { name: "Classes", href: "/classes", icon: "layers", hint: "Classes, sections and strength", roles: R.ACADEMIC_STAFF },
      { name: "Admissions", href: "/admissions", icon: "admissions", hint: "Admission pipeline and approvals", roles: R.ADMISSION_READ },
      { name: "Timetable", href: "/timetable", icon: "timetable", hint: "Period grid and substitutions", roles: R.ACADEMIC_STAFF },
      { name: "Academics", href: "/academics", icon: "book", hint: "Subjects, syllabus, lessons, assignments", roles: R.ACADEMIC_STAFF },
      { name: "Exams", href: "/exams", icon: "exams", hint: "Exam schedules and report cards", roles: R.ACADEMIC_STAFF },
      { name: "CBT Tests", href: "/cbt", icon: "cbt", hint: "Question bank and online tests", roles: uniq(R.CBT_AUTHOR, [ROLE.STUDENT]) },
    ],
  },
  {
    group: "Operations",
    items: [
      { name: "Attendance", href: "/attendance", icon: "attendance", hint: "Daily roll call and monthly register", roles: uniq(R.ATTENDANCE_MARK, R.LEADERSHIP) },
      { name: "Fees", href: "/fees", icon: "fees", hint: "Invoices, collections and receipts", roles: R.FEES_READ },
      // Teachers/HODs still request + track gate passes from /leaves; everyone with the
      // Gate Desk works passes there instead, so for them this screen is just "Leaves".
      { name: "Leaves & Passes", href: "/leaves", icon: "leaves", hint: "Leave requests, approvals and gate-pass requests", roles: TEACHING_PASS },
      { name: "Leaves", href: "/leaves", icon: "leaves", hint: "My leave, leave approvals and student leave", roles: STAFF.filter((r) => !TEACHING_PASS.includes(r)) },
      { name: "Gate Desk", href: "/gate", icon: "door", hint: "Issue passes, verify exit codes, check in, pass records, visitors", roles: R.GATE_DESK },
      { name: "Hostel", href: "/hostel", icon: "hostel", hint: "Rooms, beds, roll-call and visitors", roles: R.HOSTEL_ADMIN },
    ],
  },
  {
    group: "People & Safety",
    items: [
      { name: "Staff & Payroll", href: "/staff", icon: "staff", hint: "My payslips, staff records and payroll", roles: STAFF },
      { name: "Discipline", href: "/discipline", icon: "discipline", hint: "Report an incident; safeguarding case log", roles: STAFF },
    ],
  },
  {
    group: "Insights",
    items: [
      { name: "Reports", href: "/reports", icon: "reports", hint: "Analytics and CSV exports", roles: R.REPORTS },
      { name: "Notifications", href: "/notifications", icon: "bell", hint: "Outbound SMS and email log", roles: R.NOTIFICATION_LOG },
      // Security = gate desk + visitors + staff self-service only (school decision 2026-10-24);
      // their account screen (/account) is open to everyone.
      { name: "Settings", href: "/settings", icon: "settings", hint: "User management, this device, delivery status", roles: STAFF.filter((r) => r !== ROLE.SECURITY) },
    ],
  },
];

const PARENT_ONLY = [ROLE.PARENT];
const PORTAL = R.PORTAL;

/** Parent + student portal. Students get the subset that makes sense for them. */
export const PORTAL_NAV_GROUPS: NavGroup[] = [
  {
    group: "My school",
    items: [
      { name: "My children", href: "/portal", icon: "home", hint: "Attendance, fees, marks and messages at a glance", roles: PARENT_ONLY },
      { name: "My dashboard", href: "/portal", icon: "home", hint: "Today, attendance and results", roles: [ROLE.STUDENT] },
      { name: "Attendance", href: "/portal/attendance", icon: "attendance", hint: "Month calendar of attendance", roles: PORTAL },
      { name: "Timetable", href: "/portal/timetable", icon: "timetable", hint: "Weekly class timetable", roles: PORTAL },
      { name: "Report card", href: "/portal/results", icon: "exams", hint: "Exam marks and report card", roles: PARENT_ONLY },
      { name: "Results", href: "/portal/results", icon: "exams", hint: "Exam marks and report card", roles: [ROLE.STUDENT] },
      { name: "Tests", href: "/cbt", icon: "cbt", hint: "Online tests", roles: [ROLE.STUDENT] },
    ],
  },
  {
    group: "Requests & money",
    items: [
      { name: "Fees", href: "/portal/fees", icon: "fees", hint: "Invoices, payments and receipts", roles: PARENT_ONLY },
      { name: "Leave requests", href: "/portal/leaves", icon: "leaves", hint: "Ask for leave and track approvals", roles: PARENT_ONLY },
      { name: "Gate passes", href: "/portal/gate-passes", icon: "door", hint: "Gate pass history and status", roles: PARENT_ONLY },
      { name: "Notices & messages", href: "/portal/messages", icon: "bell", hint: "School notices plus the SMS and email sent to you", roles: PORTAL },
      { name: "Admission status", href: "/portal/admission", icon: "admissions", hint: "Your application and its progress", roles: PARENT_ONLY },
    ],
  },
];

/** Every staff nav item (flat). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
const PORTAL_ITEMS: NavItem[] = PORTAL_NAV_GROUPS.flatMap((g) => g.items);

/** Quick actions surfaced in the command palette and on the home dashboard. */
export const QUICK_ACTIONS: NavItem[] = [
  { name: "Take morning roll call", href: "/attendance", icon: "attendance", hint: "Mark today's attendance", roles: R.ATTENDANCE_MARK },
  { name: "Collect a fee payment", href: "/fees", icon: "receipt", hint: "Record an offline collection", roles: R.FEES_WRITE },
  { name: "Add a new student", href: "/students", icon: "students", hint: "Create a student record", roles: R.STUDENT_WRITE },
  { name: "Generate fee invoices", href: "/fees", icon: "wallet", hint: "Raise invoices for a class", roles: R.FEES_WRITE },
  { name: "Review admissions", href: "/admissions", icon: "admissions", hint: "Applications waiting at your step", roles: R.ADMISSION_READ },
  { name: "Publish an announcement", href: "/notifications", icon: "bell", hint: "Send SMS / email to parents", roles: R.BROADCAST.filter((r) => R.NOTIFICATION_LOG.includes(r)) },
  { name: "Report a discipline incident", href: "/discipline", icon: "shield", hint: "Record a safeguarding concern", roles: STAFF },
  { name: "Issue a gate pass", href: "/gate", icon: "door", hint: "Create a pass for a student", roles: R.GATE_PASS_APPROVE },
  { name: "Verify a gate pass", href: "/gate", icon: "key", hint: "Pass code + parent OTP at the gate", roles: R.GATE_DESK },
  { name: "Apply for leave", href: "/leaves", icon: "leaves", hint: "Request leave or check its status", roles: STAFF },
  { name: "My payslips", href: "/staff", icon: "wallet", hint: "Download your payslips", roles: STAFF },
  { name: "Export a report", href: "/reports", icon: "download", hint: "Download CSV analytics", roles: R.REPORTS },
  { name: "Run payroll", href: "/staff", icon: "wallet", hint: "Generate monthly payslips", roles: R.PAYROLL },
  { name: "Manage user logins", href: "/settings", icon: "key", hint: "Create users, reset passwords", roles: R.USER_ADMIN },
  { name: "Change my password", href: "/account/password", icon: "lock", hint: "Update your sign-in password", roles: [...STAFF, ...PORTAL] },
];

/** Screens every signed-in user may open, whatever their role. */
const EVERYONE = ["/account"];

const isPortalRole = (role: string) => (PORTAL as readonly string[]).includes(role);

function cleanPath(path: string): string {
  const p = path.split(/[?#]/)[0] || "/";
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

const matches = (path: string, href: string) =>
  href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

/** Longest-prefix match over a list, so `/students/123` resolves to "Students". */
function bestMatch(path: string, items: NavItem[]): NavItem[] {
  const hits = items.filter((i) => matches(path, i.href));
  if (!hits.length) return [];
  const longest = Math.max(...hits.map((i) => i.href.length));
  return hits.filter((i) => i.href.length === longest);
}

/**
 * May `role` open `path`? The ONE rule used by the sidebar, palette, quick actions
 * and the route guard. Unknown staff paths are allowed (Next renders its 404), but
 * portal users may only open portal screens, `/account` and what their nav lists.
 */
export function canAccess(path: string, role: string | null | undefined): boolean {
  if (!role) return false;
  const p = cleanPath(path);
  if (EVERYONE.some((h) => matches(p, h))) return true;

  if (isPortalRole(role)) {
    const hits = bestMatch(p, PORTAL_ITEMS);
    return hits.some((i) => i.roles.includes(role));
  }

  if (p === "/portal" || p.startsWith("/portal/")) return false;
  const hits = bestMatch(p, NAV_ITEMS);
  if (!hits.length) return (STAFF as readonly string[]).includes(role);
  return hits.some((i) => i.roles.includes(role));
}

/** Navigation groups for a role, with forbidden items (and empty groups) removed. */
export function navFor(role: string | null | undefined): NavGroup[] {
  if (!role) return [];
  const source = isPortalRole(role) ? PORTAL_NAV_GROUPS : NAV_GROUPS;
  return source
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);
}

export function quickActionsFor(role: string | null | undefined): NavItem[] {
  if (!role) return [];
  return QUICK_ACTIONS.filter((a) => a.roles.includes(role) && canAccess(a.href, role));
}

/** Where a role lands after sign-in (and where a portal user is sent from staff URLs). */
export function homeFor(role: string | null | undefined): string {
  return role && isPortalRole(role) ? "/portal" : "/";
}

/** Longest-prefix match within the role's own nav, so `/students/123` still highlights "Students". */
export function findNavItem(pathname: string, role?: string | null): NavItem | undefined {
  const items = role ? navFor(role).flatMap((g) => g.items) : NAV_ITEMS;
  return bestMatch(cleanPath(pathname), items)[0];
}
