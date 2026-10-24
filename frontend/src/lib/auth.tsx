"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Who is logged in, from GET /api/auth/me — NOT from localStorage, which the user can
 * edit. The backend re-checks every role on every request; this only decides what
 * the UI shows. Mirrors backend/src/auth/roles.ts — keep the two in sync.
 */

export const ROLE = {
  SUPER_ADMIN: "super_admin",
  BRANCH_ADMIN: "branch_admin",
  ADMIN: "admin",
  PRINCIPAL: "principal",
  VICE_PRINCIPAL: "vice_principal",
  OFFICE_SUPERINTENDENT: "office_superintendent",
  ADMISSION_OFFICER: "admission_officer",
  ACCOUNTS: "accounts",
  HR: "hr",
  HOD: "hod",
  TEACHER: "teacher",
  WARDEN: "warden",
  SECURITY: "security",
  DISCIPLINE_OFFICER: "discipline_officer",
  PARENT: "parent",
  STUDENT: "student",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  branch_admin: "School Admin",
  admin: "School Admin",
  principal: "Principal",
  vice_principal: "Vice Principal",
  office_superintendent: "Office Superintendent",
  admission_officer: "Admission Officer",
  accounts: "Accounts",
  hr: "HR",
  hod: "Head of Department",
  teacher: "Teacher",
  warden: "Warden",
  security: "Security Desk",
  discipline_officer: "Safeguarding Lead",
  parent: "Parent",
  student: "Student",
};

const ADMINS: string[] = [ROLE.SUPER_ADMIN, ROLE.BRANCH_ADMIN, ROLE.ADMIN];
const LEADERSHIP: string[] = [...ADMINS, ROLE.PRINCIPAL, ROLE.VICE_PRINCIPAL];
const PORTAL: string[] = [ROLE.PARENT, ROLE.STUDENT];
const STAFF: string[] = Object.values(ROLE).filter((r) => !PORTAL.includes(r));

/** Same groups as backend `R` (subset the UI needs). */
export const R = {
  ADMINS,
  LEADERSHIP,
  STAFF,
  /** Staff who work with classes/teaching — not Warden or Security (school decision 2026-10-24). */
  ACADEMIC_STAFF: STAFF.filter((r) => r !== ROLE.WARDEN && r !== ROLE.SECURITY),
  PORTAL,
  ADMISSION_SETUP: [...ADMINS, ROLE.ADMISSION_OFFICER],
  ADMISSION_OS: [...ADMINS, ROLE.OFFICE_SUPERINTENDENT],
  ADMISSION_ACCOUNTS: [...ADMINS, ROLE.ACCOUNTS],
  ADMISSION_VP: [...ADMINS, ROLE.VICE_PRINCIPAL],
  ADMISSION_PRINCIPAL: [...ADMINS, ROLE.PRINCIPAL],
  ADMISSION_READ: [...LEADERSHIP, ROLE.ADMISSION_OFFICER, ROLE.OFFICE_SUPERINTENDENT, ROLE.ACCOUNTS],
  STUDENT_READ: [...LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT, ROLE.ADMISSION_OFFICER, ROLE.ACCOUNTS, ROLE.HOD, ROLE.TEACHER, ROLE.WARDEN, ROLE.DISCIPLINE_OFFICER],
  STUDENT_WRITE: [...ADMINS, ROLE.PRINCIPAL, ROLE.OFFICE_SUPERINTENDENT],
  FEES_READ: [...LEADERSHIP, ROLE.ACCOUNTS, ROLE.OFFICE_SUPERINTENDENT],
  FEES_WRITE: [...ADMINS, ROLE.ACCOUNTS],
  ATTENDANCE_MARK: [...LEADERSHIP, ROLE.HOD, ROLE.TEACHER],
  TIMETABLE_ADMIN: [...ADMINS, ROLE.PRINCIPAL, ROLE.VICE_PRINCIPAL, ROLE.HOD],
  ACADEMIC_SETUP: [...ADMINS, ROLE.PRINCIPAL, ROLE.VICE_PRINCIPAL, ROLE.HOD],
  TEACHING: [...LEADERSHIP, ROLE.HOD, ROLE.TEACHER],
  LEAVE_APPROVE: [...LEADERSHIP, ROLE.HOD, ROLE.HR],
  STUDENT_LEAVE_APPROVE: [...LEADERSHIP, ROLE.HOD, ROLE.TEACHER, ROLE.WARDEN],
  GATE_PASS_APPROVE: [...LEADERSHIP, ROLE.WARDEN],
  GATE_DESK: [...LEADERSHIP, ROLE.WARDEN, ROLE.SECURITY],
  SAFEGUARDING: [ROLE.SUPER_ADMIN, ROLE.PRINCIPAL, ROLE.DISCIPLINE_OFFICER],
  HOSTEL_ADMIN: [...ADMINS, ROLE.PRINCIPAL, ROLE.WARDEN],
  HOSTEL_DESK: [...ADMINS, ROLE.PRINCIPAL, ROLE.WARDEN, ROLE.SECURITY],
  STAFF_DIRECTORY: [...LEADERSHIP, ROLE.HR, ROLE.HOD, ROLE.OFFICE_SUPERINTENDENT],
  STAFF_ADMIN: [...ADMINS, ROLE.HR],
  PAYROLL: [...ADMINS, ROLE.HR, ROLE.ACCOUNTS],
  REPORTS: [...LEADERSHIP, ROLE.ACCOUNTS, ROLE.OFFICE_SUPERINTENDENT, ROLE.HOD],
  BROADCAST: [...LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT, ROLE.ADMISSION_OFFICER],
  NOTIFICATION_LOG: [...LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT, ROLE.ADMISSION_OFFICER],
  CBT_AUTHOR: [...LEADERSHIP, ROLE.HOD, ROLE.TEACHER],
  CBT_TAKE: [ROLE.STUDENT],
  USER_ADMIN: [...ADMINS, ROLE.HR],
} as const;

export type Child = {
  id: string;
  fullName: string;
  admissionNo: string;
  rollNo: string | null;
  house: string | null;
  relation: string;
  class: { id: string; name: string; section: string | null } | null;
};

export type Me = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  branch_id: string;
  branch_name: string;
  must_change_password: boolean;
  staff: { id: string; name: string; role: string; department: string | null } | null;
  student: { id: string; fullName: string; classId: string | null; admissionNo: string } | null;
  children: Child[];
};

export function hasRole(me: Pick<Me, "role"> | null | undefined, roles: readonly string[]): boolean {
  return !!me && roles.includes(me.role);
}

export const isPortal = (me: Pick<Me, "role"> | null | undefined) => hasRole(me, R.PORTAL);

type MeState = { me: Me | null; loading: boolean; refresh: () => Promise<void> };
const MeContext = createContext<MeState>({ me: null, loading: true, refresh: async () => {} });

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try {
      setMe(await apiFetch<Me>("/api/auth/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);
  return <MeContext.Provider value={{ me, loading, refresh }}>{children}</MeContext.Provider>;
}

/** `const { me } = useMe(); hasRole(me, R.FEES_WRITE) && <Button …/>` */
export function useMe() {
  return useContext(MeContext);
}

export function clearSession() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("branch_id");
  } catch { /* storage blocked */ }
}
