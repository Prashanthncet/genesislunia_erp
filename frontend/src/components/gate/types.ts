import { ROLE, R } from "@/lib/auth";

/** One row of GET /api/gate-passes/records — never carries the pass code or OTP. */
export type PassRecord = {
  id: string;
  studentId: string;
  type: string;
  reason: string;
  outTime: string;
  expectedInTime: string | null;
  actualOutTime: string | null;
  actualInTime: string | null;
  status: string;
  rejectedReason: string | null;
  createdAt: string;
  late: boolean;
  approvedByWardenName: string | null;
  approvedByPrincipalName: string | null;
  checkedOutByName: string | null;
  checkedInByName: string | null;
  student: { id: string; fullName: string; admissionNo: string; class: { id: string; name: string; section: string | null } | null };
  hostel: { id: string; name: string; room: string } | null;
};

export type RecordsResponse = { total: number; truncated: boolean; rows: PassRecord[] };

/** GET /api/gate-passes/students — issue-form picker (hostel residents first). */
export type PickStudent = {
  id: string;
  fullName: string;
  admissionNo: string;
  class: { id: string; name: string; section: string | null } | null;
  hostel: { name: string; room: string; bed: string | null } | null;
};

export type FilterOptions = {
  classes: { id: string; name: string; section: string | null }[];
  hostels: { id: string; name: string }[];
};

export const PASS_STATUSES = ["Pending", "Warden Approved", "Approved", "Checked Out", "Returned", "Rejected"] as const;

/**
 * Who sees which Gate Desk tab (backend enforces every call; this only decides what shows).
 * Issue + approvals: the approval chain (warden + leadership). Verify: the people at the gate.
 * Records: everyone on the desk. Visitors: warden + security.
 */
export const GATE_TAB_ROLES = {
  issue: [...R.GATE_PASS_APPROVE],
  approvals: [...R.GATE_PASS_APPROVE],
  desk: [ROLE.WARDEN, ROLE.SECURITY],
  records: [...R.GATE_DESK],
  visitors: [ROLE.WARDEN, ROLE.SECURITY],
} as const;

/** Roles whose create call records the warden approval in the same action (backend WARDEN_STEP). */
export const ISSUE_DIRECT: string[] = [...R.ADMINS, ROLE.WARDEN];
