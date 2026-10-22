export type IncidentRow = {
  id: string; studentId: string; incidentDate: string; description: string; actionTaken: string | null;
  demerits: number; status: string; severity: string; createdAt: string;
  confidentialNotes?: string | null; assignedTo?: string | null; escalatedAt?: string | null; escalatedBy?: string | null;
  student: { id: string; fullName: string; admissionNo: string; class: { name: string; section: string | null } | null };
  reporter: { id: string; name: string } | null;
};

export type IncidentDetail = IncidentRow & {
  restricted: boolean;
  assignedToName?: string | null;
  escalatedByName?: string | null;
  history?: { id: string; action: string; detail: string | null; createdAt: string; actorName: string }[];
};

export type AuditEntry = {
  id: string; actorId: string; actorName: string; action: string; entity: string; entityId: string; detail: string | null; createdAt: string;
};

export const STATUSES = ["Open", "Under Review", "Escalated", "Closed"] as const;
export const SEVERITIES = ["Low", "Medium", "High", "Critical"] as const;

/** Mirrors backend TRANSITIONS (Escalated is reached via the Escalate button). */
export const NEXT_STATUS: Record<string, string[]> = {
  Open: ["Under Review"],
  "Under Review": ["Closed"],
  Escalated: ["Under Review", "Closed"],
  Closed: ["Open"],
};

type Tone = "emerald" | "amber" | "rose" | "sky" | "slate" | "violet";
export const statusTone = (s: string): Tone =>
  s === "Closed" ? "emerald" : s === "Under Review" ? "amber" : s === "Escalated" ? "violet" : "rose";
export const severityTone = (s: string): Tone =>
  s === "Critical" ? "rose" : s === "High" ? "amber" : s === "Medium" ? "sky" : "slate";

export const errMsg = (e: unknown, fallback = "Failed") => (e instanceof Error ? e.message : fallback);
export const classLabel = (c: { name: string; section: string | null } | null | undefined) =>
  c ? [c.name, c.section].filter(Boolean).join(" ") : "";
