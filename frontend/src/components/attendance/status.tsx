"use client";

/**
 * One look for attendance status everywhere (mark sheet, register, calendars, student
 * profile, portal): Present = ok (green), Absent = danger (red), Late = warn (amber),
 * OD = info (blue, "OD" label), Leave = neutral. Colour is always paired with text.
 *
 * The % rule mirrors backend/src/attendance/attendance-math.ts — keep them in sync.
 */

import type { ReactNode } from "react";
import { R, ROLE } from "@/lib/auth";

export type AttStatus = "Present" | "Absent" | "Late" | "OD" | "Leave";
export const ATT_STATUSES: AttStatus[] = ["Present", "Absent", "Late", "OD", "Leave"];

type Meta = {
  label: string;
  /** one/two-letter code for dense grids */
  short: string;
  /** keyboard shortcut on the mark sheet */
  key: string;
  /** soft cell (calendar day / register cell) */
  cell: string;
  /** solid dot */
  dot: string;
  /** active segment on the status control */
  on: string;
  /** Badge tone in @/components/ui */
  badge: "emerald" | "rose" | "amber" | "sky" | "slate";
  /** text colour for counts */
  text: string;
};

export const STATUS_META: Record<AttStatus, Meta> = {
  Present: { label: "Present", short: "P", key: "p", cell: "bg-ok-soft text-ok-ink ring-ok-line", dot: "bg-ok", on: "bg-ok text-white", badge: "emerald", text: "text-ok-ink" },
  Absent: { label: "Absent", short: "A", key: "a", cell: "bg-danger-soft text-danger-ink ring-danger-line", dot: "bg-danger", on: "bg-danger text-white", badge: "rose", text: "text-danger-ink" },
  Late: { label: "Late", short: "L", key: "l", cell: "bg-warn-soft text-warn-ink ring-warn-line", dot: "bg-warn", on: "bg-warn text-white", badge: "amber", text: "text-warn-ink" },
  OD: { label: "OD", short: "OD", key: "o", cell: "bg-info-soft text-info-ink ring-info-line", dot: "bg-info", on: "bg-info text-white", badge: "sky", text: "text-info-ink" },
  Leave: { label: "Leave", short: "Lv", key: "v", cell: "bg-surface-2 text-ink-2 ring-line-strong", dot: "bg-ink-3", on: "bg-ink-2 text-white", badge: "slate", text: "text-ink-2" },
};

/** Long names for tooltips / screen readers. */
export const STATUS_LONG: Record<AttStatus, string> = {
  Present: "Present", Absent: "Absent", Late: "Late (counts as present)", OD: "On Duty (counts as present)", Leave: "Approved leave (not counted)",
};

/** Normalises legacy values ('On Leave') onto the five statuses. */
export function normStatus(s: string | null | undefined): AttStatus | null {
  if (!s) return null;
  if (s === "On Leave") return "Leave";
  return (ATT_STATUSES as string[]).includes(s) ? (s as AttStatus) : null;
}

export const metaOf = (s: string | null | undefined) => {
  const n = normStatus(s);
  return n ? STATUS_META[n] : null;
};

export const ATTENDANCE_RULE_TEXT =
  "Attendance % = (Present + Late + OD) ÷ (Present + Late + OD + Absent). Approved leave and Sundays are not counted.";

/** Who can open a student's attendance calendar (mirrors the backend CALENDAR_READ). */
export const ATTENDANCE_READ: string[] = [
  ...R.LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT, ROLE.HOD, ROLE.TEACHER, ROLE.DISCIPLINE_OFFICER,
];

/** % → tone for rings/meters: ≥ 90 ok, ≥ 75 warn, below danger. */
export function pctTone(p: number | null | undefined): "ok" | "warn" | "danger" | "slate" {
  if (p == null) return "slate";
  return p >= 90 ? "ok" : p >= 75 ? "warn" : "danger";
}

export function StatusTag({ status, title }: { status: string; title?: string }) {
  const m = metaOf(status);
  const label = m?.label ?? status;
  return (
    <span
      title={title ?? (m ? STATUS_LONG[normStatus(status)!] : status)}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${m?.cell ?? "bg-surface-2 text-ink-2 ring-line"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m?.dot ?? "bg-ink-3"}`} aria-hidden />
      {label}
    </span>
  );
}

/** Legend: colour + code + meaning, and the % rule. */
export function AttendanceLegend({ showRule = true, extra }: { showRule?: boolean; extra?: ReactNode }) {
  return (
    <div className="space-y-1.5 text-[12px] text-ink-2">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Attendance legend">
        {ATT_STATUSES.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={`grid h-5 min-w-5 place-items-center rounded px-1 text-[10px] font-bold ring-1 ${STATUS_META[s].cell}`} aria-hidden>
              {STATUS_META[s].short}
            </span>
            {STATUS_LONG[s]}
          </li>
        ))}
        {extra}
      </ul>
      {showRule && <p className="text-[11.5px] text-ink-3">{ATTENDANCE_RULE_TEXT}</p>}
    </div>
  );
}

/** Small count tile (Present 12, Absent 1…) — colour + label + number. */
export function CountTile({ status, value, label }: { status: AttStatus; value: number; label?: string }) {
  const m = STATUS_META[status];
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.dot}`} aria-hidden />
      <span className="min-w-0 truncate text-[12px] text-ink-2">{label ?? m.label}</span>
      <span className={`tnum ml-auto text-[14px] font-bold ${m.text}`}>{value}</span>
    </div>
  );
}

/** Today in local time (YYYY-MM-DD). */
export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const thisMonthLocal = () => todayLocal().slice(0, 7);

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Shared tally shape returned by the attendance APIs. */
export type Tally = {
  present: number; late: number; od: number; absent: number; leave: number;
  attended: number; counted: number; percentage: number | null;
};
