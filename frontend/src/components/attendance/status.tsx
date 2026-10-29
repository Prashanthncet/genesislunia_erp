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
import { Icon } from "@/components/ui";

export type AttStatus = "Present" | "Absent" | "Late" | "OD" | "Leave";
export const ATT_STATUSES: AttStatus[] = ["Present", "Absent", "Late", "OD", "Leave"];

/**
 * What the mark sheet puts in front of a teacher: Present or Absent, nothing else.
 * The other three are still recorded and displayed everywhere (Late/OD rows from earlier
 * terms, approved leave pre-filled from the leave register), so ATT_STATUSES stays the
 * full set for rendering, tallies and filters.
 */
export const MARK_STATUSES: AttStatus[] = ["Present", "Absent"];

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

/** Legend: colour + code + meaning, and the % rule. Phones get the card design. */
export function AttendanceLegend({ showRule = true, extra }: { showRule?: boolean; extra?: ReactNode }) {
  return (
    <>
      {/* Phones: "Attendance Legend & Calculation" card. */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft md:hidden">
        <div className="flex items-center gap-3.5 p-4 pb-2">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            <Icon name="book" className="h-7 w-7" />
          </span>
          <h2 className="text-[20px] font-bold leading-tight text-brand-900 max-md:!text-[16px]">Attendance Legend &amp; Calculation</h2>
        </div>
        <ul className="px-4" aria-label="Attendance legend">
          {ATT_STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[15px] max-md:!text-[13.5px] font-bold ${STATUS_META[s].cell} ring-1 ring-inset`} aria-hidden>
                {STATUS_META[s].short}
              </span>
              <span className="min-w-0 text-[15px] max-md:!text-[13.5px] text-ink">{STATUS_LONG[s]}</span>
            </li>
          ))}
          {extra}
        </ul>
        {showRule && (
          <div className="m-3 rounded-2xl bg-brand-50/70 p-3">
            <p className="flex items-center gap-2 text-[15px] max-md:!text-[13.5px] font-bold text-ink">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-brand-700"><Icon name="reports" className="h-4 w-4" /></span>
              Attendance %
            </p>
            <p className="mt-2 rounded-xl bg-white px-3 py-3 text-center text-[14.5px] font-semibold leading-relaxed text-ink">
              Attendance % = (Present + Late + OD)<br />÷ (Present + Late + OD + Absent)
            </p>
          </div>
        )}
        <div className="mx-3 mb-3 flex items-start gap-2.5 rounded-2xl bg-info-soft/60 px-3 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/70 text-info-ink"><Icon name="info" className="h-4 w-4" /></span>
          <p className="border-l-2 border-info-line pl-2.5 text-[14px] leading-relaxed text-ink-2">Approved leave and Sundays are not counted.</p>
        </div>
      </section>

      {/* Tablets / desktop: the compact inline legend (unchanged). */}
      <div className="hidden space-y-1.5 text-[12px] text-ink-2 md:block">
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
    </>
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
