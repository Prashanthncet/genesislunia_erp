"use client";

/**
 * Week view of a timetable: days across, periods down, one cell per
 * slot. Subjects keep a stable colour (toneFor), so a week reads at a glance
 * and the same subject looks the same on every screen.
 *
 * Used for the class Master Grid, the generator preview and the per-teacher
 * week (where a cell can also be a cover the teacher takes, or one of their own
 * lessons handed to a substitute). Break periods render as a full-width band.
 */

import { toneClasses, toneFor, initials } from "@/components/RecordCard";
import { Icon } from "@/components/ui";

export type WeekSlot = {
  day_of_week: string;
  period_number: number;
  subject: string;
  /** Second line of the cell: teacher name on a class grid, class name on a teacher grid. */
  teacher_name?: string;
  secondary?: string;
  /** regular lesson (default), a cover this teacher takes, or a lesson handed to a substitute. */
  variant?: "regular" | "cover" | "relieved";
  note?: string;
};
export type WeekPeriod = { periodNumber: number; startTime: string; endTime: string; isBreak: boolean; breakName: string | null };

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Bell schedule in the order the day runs: by start time ("9:30" = "09:30"), then period number. */
export function orderPeriods<T extends WeekPeriod>(periods: T[]): T[] {
  const key = (t: string) => (/^\d:\d{2}$/.test(t) ? `0${t}` : t);
  return [...periods].sort((a, b) => key(a.startTime).localeCompare(key(b.startTime)) || a.periodNumber - b.periodNumber);
}

export function WeekGrid({
  slots, periods = [], days, emptyText = "No timetable yet for this class. Run the Auto-Generator to create one.",
}: { slots: WeekSlot[]; periods?: WeekPeriod[]; days?: string[]; emptyText?: string }) {
  const byKey = new Map<string, WeekSlot[]>();
  for (const s of slots) {
    const k = `${s.day_of_week}|${s.period_number}`;
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }

  // Columns: the requested days, else every day that has a slot, in week order.
  const cols = (days?.length ? days : Array.from(new Set(slots.map((s) => s.day_of_week))))
    .slice()
    .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

  // Rows: the bell schedule in time order (breaks in place), then any unconfigured period numbers.
  const ordered = orderPeriods(periods);
  const configured = new Set(ordered.map((p) => p.periodNumber));
  const extra = [...new Set(slots.map((s) => s.period_number))].filter((n) => !configured.has(n)).sort((a, b) => a - b);
  const rows = [...ordered.map((p) => p.periodNumber), ...extra];
  const configOf = (n: number) => periods.find((p) => p.periodNumber === n);
  const hasSlots = (n: number) => slots.some((s) => s.period_number === n);

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-[13px] text-ink-3">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <div
        className="grid min-w-[44rem]"
        style={{ gridTemplateColumns: `6.5rem repeat(${cols.length}, minmax(7.5rem, 1fr))` }}
        role="table"
        aria-label="Weekly timetable"
      >
        {/* Header row */}
        <div className="sticky left-0 z-10 border-b border-line bg-surface-2 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3" role="columnheader">
          Period
        </div>
        {cols.map((d) => (
          <div key={d} className="border-b border-l border-line bg-surface-2 px-3 py-2.5 text-center text-[12px] font-semibold text-ink" role="columnheader">
            {d}
          </div>
        ))}

        {rows.map((n) => {
          const t = configOf(n);
          // A configured break with nothing scheduled is a full-width band.
          if (t?.isBreak && !hasSlots(n)) {
            return (
              <div
                key={n}
                className="flex items-center justify-center gap-2 border-b border-line bg-surface-2 px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-2"
                style={{ gridColumn: "1 / -1", backgroundImage: "repeating-linear-gradient(135deg, transparent 0 8px, color-mix(in srgb, var(--color-line) 55%, transparent) 8px 9px)" }}
                role="row"
                aria-label={`${t.breakName ?? "Break"}, ${t.startTime} to ${t.endTime}`}
              >
                <Icon name="clock" className="h-3.5 w-3.5 text-ink-3" />
                {t.breakName ?? "Break"}
                <span className="tnum font-mono font-medium normal-case tracking-normal text-ink-3">{t.startTime}–{t.endTime}</span>
              </div>
            );
          }
          return (
            <div key={n} className="contents" role="row">
              <div className="sticky left-0 z-10 border-b border-line bg-surface px-3 py-2" role="rowheader">
                <p className="text-[13px] font-bold text-brand-700">P{n}</p>
                {t && <p className="tnum text-[11px] text-ink-3">{t.startTime}–{t.endTime}</p>}
                {/* Lessons landed in a slot configured as a break — show it, don't hide it. */}
                {t?.isBreak && (
                  <p className="mt-0.5 text-[10.5px] font-semibold text-warn-ink" title={`${t.breakName ?? "Break"} is configured for this period`}>
                    <Icon name="alert" className="mr-0.5 inline h-3 w-3" />{t.breakName ?? "Break"} slot
                  </p>
                )}
              </div>
              {cols.map((d) => {
                const items = byKey.get(`${d}|${n}`) ?? [];
                if (items.length === 0) {
                  return (
                    <div key={d} className="border-b border-l border-line p-1.5" role="cell">
                      <div className="grid h-full min-h-[3.25rem] place-items-center rounded-md border border-dashed border-line text-[11px] text-ink-3">
                        Free
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={d} className="flex flex-col gap-1 border-b border-l border-line p-1.5" role="cell">
                    {items.map((s, i) => <SlotTile key={i} s={s} />)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlotTile({ s }: { s: WeekSlot }) {
  const tone = toneClasses(s.variant === "cover" ? "warn" : s.variant === "relieved" ? "slate" : toneFor(s.subject));
  const second = s.secondary ?? s.teacher_name ?? "";
  const title = [s.subject, second, s.note].filter(Boolean).join(" · ");
  return (
    <div
      className={`relative min-h-[3.25rem] flex-1 overflow-hidden rounded-md ${tone.soft} py-1.5 pl-3 pr-2 before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${tone.rail} ${
        s.variant === "relieved" ? "opacity-60" : ""
      }`}
      title={title}
    >
      <p className={`truncate text-[12.5px] font-semibold ${tone.text} ${s.variant === "relieved" ? "line-through" : ""}`}>
        {s.variant === "cover" && <span className="mr-1 text-[10px] font-bold uppercase">Cover</span>}
        {s.subject}
      </p>
      {second && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-ink-2">
          {s.teacher_name && !s.secondary && <span className="font-semibold text-ink-3">{initials(s.teacher_name)}</span>}
          <span className="truncate">{second}</span>
        </p>
      )}
      {s.note && <p className="truncate text-[10.5px] text-ink-3">{s.note}</p>}
    </div>
  );
}
