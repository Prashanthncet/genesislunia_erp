"use client";

/**
 * One day at a time: Mon–Sat picker (today selected by default), then every bell-schedule
 * row in time order — lessons with time, subject, teacher/class and room; breaks (Short
 * Break, Lunch Break…) as labelled break rows; unfilled periods as "Free".
 * Used by the portal timetable and the staff class / teacher timetables.
 */

import { useState, type ReactNode } from "react";
import { Badge, EmptyState, Icon, Tabs } from "@/components/ui";
import { toneClasses, toneFor } from "@/components/RecordCard";
import { orderPeriods, type WeekPeriod } from "@/components/WeekGrid";

export type DayEntry = {
  day_of_week: string;
  period_number: number;
  subject: string;
  /** teacher on a class view, class on a teacher view */
  secondary?: string | null;
  room_name?: string | null;
  note?: string | null;
  badge?: { label: string; tone: "amber" | "sky" | "slate" | "emerald" | "rose" };
  strike?: boolean;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function todayDay(): string {
  const d = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
  return (DAYS as readonly string[]).includes(d) ? d : "Mon";
}

export function DayView({
  periods, entries, title, actions, secondaryLabel = "Teacher", emptyText = "No timetable yet.",
}: {
  periods: WeekPeriod[];
  entries: DayEntry[];
  title?: ReactNode;
  actions?: ReactNode;
  secondaryLabel?: string;
  emptyText?: string;
}) {
  const [day, setDay] = useState<string>(todayDay);
  const today = todayDay();
  const ordered = orderPeriods(periods);
  const forDay = entries.filter((e) => e.day_of_week === day);
  const configured = new Set(ordered.map((p) => p.periodNumber));
  const extra = [...new Set(forDay.map((e) => e.period_number))].filter((n) => !configured.has(n)).sort((a, b) => a - b);
  const rows: { n: number; p?: WeekPeriod }[] = [...ordered.map((p) => ({ n: p.periodNumber, p })), ...extra.map((n) => ({ n }))];
  const lessons = forDay.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {title && <div className="min-w-0">{title}</div>}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="overflow-x-auto pb-1">
        <Tabs
          tabs={DAYS.map((d) => ({ id: d, label: d === today ? `${d} · today` : d }))}
          value={day as (typeof DAYS)[number]}
          onChange={setDay}
        />
      </div>
      {rows.length === 0 && entries.length === 0 ? (
        <EmptyState icon="timetable" title={emptyText} />
      ) : (
        <ol className="overflow-hidden rounded-xl border border-line bg-surface" aria-label={`${day} timetable`}>
          {rows.map(({ n, p }) => {
            const time = p ? `${p.startTime}–${p.endTime}` : "";
            if (p?.isBreak) {
              return (
                <li key={`b${n}`} className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-2 last:border-0">
                  <span className="tnum w-24 shrink-0 font-mono text-[12px] text-ink-3">{time}</span>
                  <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">
                    <Icon name="clock" className="h-3.5 w-3.5" /> {p.breakName ?? "Break"}
                  </span>
                </li>
              );
            }
            const items = forDay.filter((e) => e.period_number === n);
            return (
              <li key={n} className="flex flex-col gap-1 border-b border-line px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-3">
                <span className="flex w-24 shrink-0 items-baseline gap-2 sm:block">
                  <span className="block text-[13px] font-bold text-brand-700">P{n}</span>
                  <span className="tnum block font-mono text-[11.5px] text-ink-3">{time || "--:--"}</span>
                </span>
                {items.length === 0 ? (
                  <span className="text-[13px] text-ink-3">Free</span>
                ) : (
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {items.map((e, i) => {
                      const t = toneClasses(toneFor(e.subject));
                      return (
                        <div key={i} className={`relative flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg ${t.soft} py-2 pl-3.5 pr-3 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-lg ${t.rail} ${e.strike ? "opacity-60" : ""}`}>
                          <span className={`min-w-0 truncate text-[13.5px] font-semibold ${t.text} ${e.strike ? "line-through" : ""}`}>{e.subject}</span>
                          {e.secondary && <span className="min-w-0 truncate text-[12.5px] text-ink-2"><span className="sr-only">{secondaryLabel}: </span>{e.secondary}</span>}
                          {e.room_name && <span className="text-[12px] text-ink-3"><Icon name="door" className="mr-1 inline h-3.5 w-3.5" />{e.room_name}</span>}
                          {e.badge && <Badge tone={e.badge.tone} className="ml-auto">{e.badge.label}</Badge>}
                          {e.note && <span className="w-full truncate text-[11.5px] text-ink-3">{e.note}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-[12px] text-ink-3">{lessons} lesson{lessons === 1 ? "" : "s"} on {day}.</p>
    </div>
  );
}
