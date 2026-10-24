"use client";

/**
 * One student's attendance month: % ring + counts, a Monday-first calendar (Sundays
 * greyed — never counted), OD reasons / remarks listed under it, and the legend with
 * the % rule. Mobile-first: the grid is 7 equal columns that shrink with the screen.
 * Used by the staff attendance page, the student profile and the parent/student portal.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { IconButton, Input, Skeleton } from "@/components/ui";
import { Meter, Ring } from "@/components/RecordCard";
import {
  AttendanceLegend, CountTile, STATUS_LONG, metaOf, normStatus, pctTone, shiftMonth, thisMonthLocal, todayLocal, type Tally,
} from "./status";

export type CalendarResponse = {
  student: { id: string; full_name: string; roll_no: string | null; admission_no: string; class_name: string | null };
  month: string;
  rule: string;
  days: { date: string; status: string | null; note: string | null; is_sunday: boolean }[];
  summary: Tally & { marked: number };
  overall: Tally & { marked: number };
};

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function StudentCalendar({ studentId, showName = true, allowFuture = false }: { studentId: string; showName?: boolean; allowFuture?: boolean }) {
  const [month, setMonth] = useState(thisMonthLocal);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    apiFetch<CalendarResponse>(`/api/attendance/student/${studentId}/calendar?month=${month}`)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) { setData(null); setError(e instanceof Error ? e.message : "Could not load attendance"); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [studentId, month]);

  const [y, m] = month.split("-").map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday-first
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const today = todayLocal();
  const s = data?.summary;
  const notes = (data?.days ?? []).filter((d) => d.note);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showName ? (
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{data?.student.full_name ?? "Student"}</p>
            <p className="text-xs text-ink-3">
              {[data?.student.class_name, data?.student.roll_no ? `Roll ${data.student.roll_no}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        ) : <p className="font-display text-[15px] font-semibold text-ink">{monthLabel}</p>}
        <div className="flex items-center gap-1.5">
          <IconButton name="chevronLeft" label="Previous month" onClick={() => setMonth((v) => shiftMonth(v, -1))} />
          <Input type="month" aria-label="Month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto" />
          <IconButton name="chevronRight" label="Next month" onClick={() => setMonth((v) => shiftMonth(v, 1))} disabled={!allowFuture && month >= thisMonthLocal()} />
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>
      ) : loading && !data ? (
        <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></div>
      ) : data && s ? (
        <>
          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
              <Ring value={s.percentage ?? 0} tone={pctTone(s.percentage)} size={64} label={`Attendance ${s.percentage ?? "-"}% for ${monthLabel}`}>
                {s.percentage == null ? "—" : `${s.percentage}%`}
              </Ring>
              <div className="min-w-0 text-[12px] text-ink-3">
                <p className="text-[13px] font-semibold text-ink">{monthLabel}</p>
                <p className="tnum">{s.attended} of {s.counted} counted days</p>
                {data.overall.percentage != null && (
                  <p className="tnum">Overall {data.overall.percentage}% ({data.overall.attended}/{data.overall.counted})</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <CountTile status="Present" value={s.present} />
              <CountTile status="Absent" value={s.absent} />
              <CountTile status="Late" value={s.late} />
              <CountTile status="OD" value={s.od} />
              <CountTile status="Leave" value={s.leave} />
            </div>
          </div>
          <Meter value={s.percentage ?? 0} tone={pctTone(s.percentage)} label="Month attendance" caption={s.percentage == null ? "No counted days" : `${s.percentage}%`} />

          <div className="rounded-xl bg-surface-2 p-2 sm:p-3">
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5" aria-hidden>
              {WEEK.map((w) => (
                <span key={w} className="py-1 text-center text-[10.5px] max-md:text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
                  <span className="sm:hidden">{w[0]}</span><span className="hidden sm:inline">{w}</span>
                </span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5" role="list" aria-label={`Daily attendance, ${monthLabel}`}>
              {Array.from({ length: lead }, (_, i) => <span key={`p${i}`} aria-hidden />)}
              {data.days.map((d) => {
                const meta = metaOf(d.status);
                const st = normStatus(d.status);
                const text = `${formatDate(d.date)}: ${st ? STATUS_LONG[st] : d.is_sunday ? "Sunday (not counted)" : "not marked"}${d.note ? ` — ${d.note}` : ""}`;
                return (
                  <span
                    key={d.date}
                    role="listitem"
                    title={text}
                    aria-label={text}
                    className={`tnum relative flex aspect-square min-h-9 flex-col items-center justify-center rounded-md text-[12px] font-semibold ring-1 ${
                      meta ? meta.cell : d.is_sunday ? "bg-transparent text-ink-3/60 ring-transparent" : "bg-surface text-ink-3 ring-line"
                    } ${d.date === today ? "outline outline-2 outline-offset-1 outline-brand-500" : ""}`}
                  >
                    {Number(d.date.slice(8))}
                    {meta && <span className="text-[9px] font-bold leading-none">{meta.short}</span>}
                    {d.note && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />}
                  </span>
                );
              })}
            </div>
          </div>

          {notes.length > 0 && (
            <div className="rounded-xl border border-line p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Reasons &amp; remarks</p>
              <ul className="space-y-1.5 text-[12.5px]">
                {notes.map((d) => (
                  <li key={d.date} className="flex flex-wrap items-baseline gap-2">
                    <span className="tnum w-24 shrink-0 text-ink-3">{formatDate(d.date)}</span>
                    <span className={`rounded px-1.5 text-[10.5px] max-md:text-[11px] font-bold ring-1 ${metaOf(d.status)?.cell ?? "ring-line"}`}>{metaOf(d.status)?.short ?? d.status}</span>
                    <span className="min-w-0 flex-1 text-ink-2">{d.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <AttendanceLegend extra={<li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />has a reason / remark</li>} />
        </>
      ) : null}
    </div>
  );
}
