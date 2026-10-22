"use client";

import { useState } from "react";
import { Card, CardHead, IconButton, PageHeader } from "@/components/ui";
import { PortalPage, type PortalChild } from "@/components/portal/PortalContext";
import { useChildData } from "@/components/portal/useChildData";
import { PanelState } from "@/components/portal/bits";

type Attendance = {
  month: string;
  days: { date: string; status: string }[];
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  attendance_pct: number | null;
};

const STATUS_STYLE: Record<string, { cell: string; label: string }> = {
  Present: { cell: "bg-ok-soft text-ok-ink ring-ok-line", label: "Present" },
  Absent: { cell: "bg-danger-soft text-danger-ink ring-danger-line", label: "Absent" },
  Late: { cell: "bg-warn-soft text-warn-ink ring-warn-line", label: "Late" },
  Leave: { cell: "bg-info-soft text-info-ink ring-info-line", label: "Leave" },
  "On Leave": { cell: "bg-info-soft text-info-ink ring-info-line", label: "Leave" },
  Holiday: { cell: "bg-surface-2 text-ink-3 ring-line", label: "Holiday" },
};

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function Calendar({ child }: { child: PortalChild }) {
  const [month, setMonth] = useState(thisMonth);
  const { data, error, loading, reload } = useChildData<Attendance>(child.id, `attendance?month=${month}`);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysIn = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first grid
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d.status]));
  const todayIso = new Date().toISOString().slice(0, 10);
  const label = first.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <Card>
      <CardHead
        icon="calendar"
        title={label}
        subtitle={data?.attendance_pct != null ? `${data.attendance_pct.toFixed(1)}% present (${data.present}/${data.total} days)` : "No attendance recorded this month"}
        actions={
          <>
            <IconButton name="chevronLeft" label="Previous month" onClick={() => setMonth((v) => shiftMonth(v, -1))} />
            <IconButton
              name="chevronRight"
              label="Next month"
              onClick={() => setMonth((v) => shiftMonth(v, 1))}
              disabled={month >= thisMonth()}
            />
          </>
        }
      />
      <PanelState loading={loading} error={error} reload={reload} rows={5} />
      {data && (
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] font-semibold uppercase tracking-wide text-ink-3 sm:gap-1.5">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d} className="py-1">{d}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={`Attendance for ${label}`}>
            {Array.from({ length: lead }).map((_, i) => <span key={`b${i}`} aria-hidden />)}
            {Array.from({ length: daysIn }).map((_, i) => {
              const day = i + 1;
              const iso = `${month}-${String(day).padStart(2, "0")}`;
              const status = byDate.get(iso);
              const style = status ? STATUS_STYLE[status] ?? { cell: "bg-surface-2 text-ink-2 ring-line", label: status } : null;
              return (
                <div
                  key={iso}
                  role="gridcell"
                  aria-label={`${day}: ${style?.label ?? "no record"}`}
                  title={style?.label ?? "No record"}
                  className={`flex aspect-square flex-col items-center justify-center rounded-lg text-[12.5px] font-semibold tnum ring-1 ${
                    style ? style.cell : "bg-surface text-ink-3 ring-line"
                  } ${iso === todayIso ? "outline outline-2 outline-offset-1 outline-brand-500" : ""}`}
                >
                  {day}
                  {style && <span className="hidden text-[9px] font-medium sm:block">{style.label}</span>}
                </div>
              );
            })}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { k: "Present", v: data.present, c: "bg-ok" },
              { k: "Absent", v: data.absent, c: "bg-danger" },
              { k: "Late", v: data.late, c: "bg-warn" },
              { k: "Leave", v: data.leave, c: "bg-info" },
            ].map((s) => (
              <div key={s.k} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
                <span className={`h-2.5 w-2.5 rounded-full ${s.c}`} aria-hidden />
                <dt className="text-[12px] text-ink-2">{s.k}</dt>
                <dd className="ml-auto text-[13px] font-bold tnum text-ink">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Card>
  );
}

export default function PortalAttendancePage() {
  return (
    <div className="space-y-4">
      <PageHeader icon="attendance" title="Attendance" subtitle="Day-by-day attendance, month by month." />
      <PortalPage>{(child) => <Calendar key={child.id} child={child} />}</PortalPage>
    </div>
  );
}
