import { ROLE, R } from "@/lib/auth";

export type StaffLeave = {
  id: string; staffId: string; leaveType: string; startDate: string; endDate: string; reason: string | null;
  status: string; remarks: string | null; createdAt: string; can_decide: boolean;
  staff: { id: string; name: string; role: string; department: string | null };
  approver: { id: string; name: string } | null;
};

export type StudentLeave = {
  id: string; studentId: string; leaveType: string; startDate: string; endDate: string; reason: string | null;
  status: string; remarks: string | null; requestedBy: string | null;
  student: { id: string; fullName: string; admissionNo: string; class: { name: string; section: string | null } | null };
};

export type GatePass = {
  id: string; studentId: string; type: string; reason: string; outTime: string; expectedInTime: string | null;
  actualOutTime: string | null; actualInTime: string | null; rejectedReason: string | null; passCode: string | null;
  status: string; otpVerified: boolean; late: boolean; createdAt: string;
  approvedByWardenName: string | null; approvedByPrincipalName: string | null;
  checkedOutByName: string | null; checkedInByName: string | null;
  student: { id: string; fullName: string; admissionNo: string; class: { name: string; section: string | null } | null };
};

export type Balance = {
  staff_id: string; name: string; role: string; department: string | null;
  leaves: Record<string, { used: number; quota: number; remaining: number }>;
};

export type StudentOption = { id: string; fullName: string; admissionNo: string };

/** Mirrors the backend's leaves/gate-pass role lists (backend enforces; these only hide controls). */
export const LEAVE_ON_BEHALF: string[] = [...R.ADMINS, ROLE.HR];
export const LEAVE_VIEW_ALL: string[] = [...R.LEADERSHIP, ROLE.HR];
export const STUDENT_LEAVE_FILE: string[] = [...R.STUDENT_LEAVE_APPROVE, ROLE.OFFICE_SUPERINTENDENT].filter((r) => r !== ROLE.TEACHER);
export const STUDENT_LEAVE_READ: string[] = [...new Set([...R.STUDENT_READ, ...R.STUDENT_LEAVE_APPROVE])].filter((r) => r !== ROLE.TEACHER);
export const GATE_REQUEST: string[] = [...R.LEADERSHIP, ROLE.WARDEN, ROLE.HOD];
export const GATE_READ: string[] = [...new Set([...R.GATE_DESK, ...R.GATE_PASS_APPROVE, ROLE.HOD])];
export const GATE_WARDEN_STEP: string[] = [...R.ADMINS, ROLE.WARDEN];
export const GATE_PRINCIPAL_STEP: string[] = [...R.ADMINS, ROLE.PRINCIPAL];
export const GATE_PRINT: string[] = [...new Set([...R.GATE_DESK, ...R.GATE_PASS_APPROVE])];

export const STAFF_LEAVE_TYPES = ["Casual", "Sick", "Earned", "Duty", "Unpaid"];
export const STUDENT_LEAVE_TYPES = ["Medical", "Family", "Home Visit", "Competition", "Other"];
export const GATE_TYPES = ["Local Outing", "Home Visit", "Medical", "Term Leave", "Competition", "Other"];

export type BadgeTone = "emerald" | "sky" | "rose" | "amber" | "slate";
export function statusBadge(s: string): BadgeTone {
  if (s === "Approved" || s === "Returned") return "emerald";
  if (s.startsWith("Warden") || s === "Checked Out") return "sky";
  if (s === "Rejected") return "rose";
  if (s === "Withdrawn" || s === "Cancelled") return "slate";
  return "amber";
}

export const fmtTime = (s: string | null | undefined) => (s ? s.slice(0, 16).replace("T", " ") : "—");
export const fmtStamp = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const errMsg = (e: unknown, fallback = "Failed") => (e instanceof Error ? e.message : fallback);
export const classLabel = (c: { name: string; section: string | null } | null | undefined) =>
  c ? [c.name, c.section].filter(Boolean).join(" ") : "";
