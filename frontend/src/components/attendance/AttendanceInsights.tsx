"use client";

/**
 * Attendance analytics + low-attendance list. Both are driven by the same filter bar
 * (class, section, from, to, threshold) with an explicit Apply / Clear, and every number
 * comes from the API under the one attendance rule.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Button, Card, CardHead, EmptyState, Icon, IconButton, Input, Skeleton, SkeletonRows } from "@/components/ui";
import { BarList } from "@/components/charts/BarList";
import { DonutRing } from "@/components/charts/DonutRing";
import { KpiCard } from "@/components/charts/KpiCard";
import { SparkArea } from "@/components/charts/SparkArea";
import { TableView } from "@/components/TableView";
import { MobileFilters } from "@/components/mobile/MobileFilters";
import { ClassSectionSelect, classQuery, type ClassOpt, type ClassSel } from "./ClassSectionSelect";
import { AttendanceLegend, pctTone, type Tally } from "./status";

type Filters = { cls: ClassSel; from: string; to: string; threshold: number };
const blank = (): Filters => ({ cls: { className: "", section: "" }, from: "", to: "", threshold: 75 });

function FilterBar({ classes, value, onApply, busy }: { classes: ClassOpt[]; value: Filters; onApply: (f: Filters) => void; busy: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const clear = () => { const f = blank(); setDraft(f); onApply(f); };
  // Phones: applied filters that differ from the defaults (all classes, all dates, 75%).
  const active = (value.cls.className ? 1 : 0) + (value.cls.section ? 1 : 0) + (value.from ? 1 : 0) + (value.to ? 1 : 0) + (value.threshold !== 75 ? 1 : 0);
  const bad = (!!draft.from && !!draft.to && draft.from > draft.to) || !(draft.threshold >= 0 && draft.threshold <= 100);
  return (
    <form className="card flex flex-wrap items-end gap-3 p-4 max-md:!border-0 max-md:!bg-transparent max-md:!p-0 max-md:!shadow-none" onSubmit={(e) => { e.preventDefault(); if (!bad) onApply(draft); }}>
      <MobileFilters active={active} onClear={clear}>
      <ClassSectionSelect classes={classes} value={draft.cls} onChange={(cls) => setDraft({ ...draft, cls })} allowAll />
      <label className="flex flex-col gap-1 max-md:min-w-[8.5rem] max-md:flex-1">
        <span className="text-[11.5px] font-semibold text-ink-3">From</span>
        <Input type="date" aria-label="From date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="w-auto max-md:!w-full" />
      </label>
      <label className="flex flex-col gap-1 max-md:min-w-[8.5rem] max-md:flex-1">
        <span className="text-[11.5px] font-semibold text-ink-3">To</span>
        <Input type="date" aria-label="To date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="w-auto max-md:!w-full" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold text-ink-3">Threshold %</span>
        <Input type="number" min={0} max={100} aria-label="Threshold percent" value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value) })} className="w-24" />
      </label>
      <div className="flex gap-2 max-md:w-full">
        <Button type="submit" variant="primary" disabled={bad} loading={busy} className="max-md:flex-1"><Icon name="filter" className="h-4 w-4" /> Filter</Button>
        <Button type="button" variant="ghost" className="max-md:flex-1" onClick={clear}>Clear</Button>
      </div>
      {bad && <p className="w-full text-[12px] text-danger">Check the dates (from on or before to) and a threshold between 0 and 100.</p>}
      </MobileFilters>
    </form>
  );
}

function qs(classes: ClassOpt[], f: Filters) {
  const q = new URLSearchParams(classQuery(classes, f.cls));
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  q.set("threshold", String(f.threshold));
  return q.toString();
}

const scope = (f: Filters) =>
  [f.cls.className || "All classes", f.cls.section ? `Section ${f.cls.section}` : null,
    f.from || f.to ? `${f.from ? formatDate(f.from) : "start"} – ${f.to ? formatDate(f.to) : "today"}` : "All dates"].filter(Boolean).join(" · ");

type Analytics = {
  overall: Tally; days_marked: number; students_rated: number; below_threshold: number;
  by_class: (Tally & { class_id: string; label: string | null; students: number })[];
  trend: { granularity: "day" | "month"; points: (Tally & { period: string })[] };
};

export function AnalyticsView({ classes, onMessage }: { classes: ClassOpt[]; onMessage: (m: string) => void }) {
  const [filters, setFilters] = useState<Filters>(blank);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<Analytics>(`/api/attendance/analytics?${qs(classes, filters)}`));
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Analytics failed");
    } finally {
      setLoading(false);
    }
  }, [classes, filters, onMessage]);
  useEffect(() => { load(); }, [load]);

  const o = data?.overall;
  const pts = data?.trend.points ?? [];
  return (
    <div className="space-y-4">
      <FilterBar classes={classes} value={filters} onApply={setFilters} busy={loading} />
      <p className="text-[12.5px] text-ink-3">Showing: {scope(filters)}</p>
      {!data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 max-md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 max-md:grid-cols-2">
            <KpiCard label="Attendance" value={o?.percentage == null ? "—" : `${o.percentage}%`} hint={`${o?.attended ?? 0} of ${o?.counted ?? 0} counted student-days`} icon="attendance" tone="emerald"
              spark={pts.map((p) => p.percentage ?? NaN)} />
            <KpiCard label="Days marked" value={String(data.days_marked)} hint="Sundays excluded" icon="calendar" tone="brand" />
            <KpiCard label={`Below ${filters.threshold}%`} value={String(data.below_threshold)} hint={`of ${data.students_rated} students with counted days`} icon="alert" tone="rose" />
            <KpiCard label="On duty (OD)" value={String(o?.od ?? 0)} hint="Counted as present" icon="flag" tone="sky" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <Card>
              <CardHead title="Status mix" icon="activity" subtitle="Every record in range (Leave is shown but not counted)." />
              <div className="p-4">
                <DonutRing
                  layout="column"
                  currency=""
                  showShare
                  centerLabel="Attendance"
                  centerValue={o?.percentage == null ? "—" : `${o.percentage}%`}
                  segments={[
                    { label: "Present", value: o?.present ?? 0, color: "var(--color-ok)" },
                    { label: "Late", value: o?.late ?? 0, color: "var(--color-warn)" },
                    { label: "OD", value: o?.od ?? 0, color: "var(--color-info)" },
                    { label: "Absent", value: o?.absent ?? 0, color: "var(--color-danger)" },
                    { label: "Leave", value: o?.leave ?? 0, color: "var(--color-line-strong)" },
                  ]}
                />
              </div>
            </Card>
            <Card>
              <CardHead title="By class" icon="layers" subtitle="Attendance % per section under the same rule." />
              <div className="p-2">
                <BarList
                  data={data.by_class.map((c) => ({
                    id: c.class_id, label: c.label ?? c.class_id, value: c.percentage, scaleTo: 100,
                    meta: `${c.students} students · ${c.absent} absent${c.od ? ` · ${c.od} OD` : ""}`,
                  }))}
                  formatValue={(v) => `${v}%`}
                  emptyMessage="No classes match these filters."
                />
              </div>
            </Card>
          </div>

          <Card>
            <CardHead title={`Trend by ${data.trend.granularity}`} icon="trendUp" subtitle={pts.length ? `${pts[0].period} → ${pts[pts.length - 1].period}` : "No records in range"} />
            <div className="space-y-3 p-4">
              <SparkArea points={pts.map((p) => p.percentage ?? NaN)} height={90} label="Attendance % over time" />
              {pts.length > 0 && (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Period</th><th className="th-end">Present</th><th className="th-end">Late</th><th className="th-end">OD</th><th className="th-end">Absent</th><th className="th-end">Leave</th><th className="th-end">%</th></tr></thead>
                    <tbody>
                      {pts.slice(-31).map((p) => (
                        <tr key={p.period}>
                          <td className="tnum">{p.period.length === 10 ? formatDate(p.period) : p.period}</td>
                          <td className="td-end tnum">{p.present}</td>
                          <td className="td-end tnum">{p.late}</td>
                          <td className="td-end tnum">{p.od}</td>
                          <td className="td-end tnum">{p.absent}</td>
                          <td className="td-end tnum">{p.leave}</td>
                          <td className="td-end tnum font-semibold">{p.percentage == null ? "—" : `${p.percentage}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
          <AttendanceLegend />
        </>
      )}
    </div>
  );
}

type LowRow = Tally & {
  student_id: string; full_name: string; roll_no: string | null; admission_no: string; class_name: string | null; percentage: number;
};

export function LowAttendanceView({
  classes, onMessage, onOpenStudent,
}: {
  classes: ClassOpt[];
  onMessage: (m: string) => void;
  onOpenStudent: (s: { id: string; name: string }) => void;
}) {
  const [filters, setFilters] = useState<Filters>(blank);
  const [rows, setRows] = useState<LowRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ students: LowRow[] }>(`/api/attendance/low?${qs(classes, filters)}`);
      setRows(r.students);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Low-attendance report failed");
    } finally {
      setLoading(false);
    }
  }, [classes, filters, onMessage]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <FilterBar classes={classes} value={filters} onApply={setFilters} busy={loading} />
      <div className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3 text-[13px] text-ink-2">
          <span className="font-semibold text-ink">{rows ? rows.length : "…"} students below {filters.threshold}%</span> · {scope(filters)}
        </div>
        <div className="table-wrap">
          <TableView id="att-low" mobileHide={["OD", "Leave"]}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th><th>Class</th>
                  <th className="th-end">Attended / Counted</th><th className="th-end">Absent</th><th className="th-end">OD</th><th className="th-end">Leave</th>
                  <th className="th-end">%</th><th className="th-end">Actions</th>
                </tr>
              </thead>
              {loading && !rows ? <SkeletonRows rows={6} cols={8} /> : (
                <tbody>
                  {(rows ?? []).length === 0 ? (
                    <tr><td colSpan={8}><EmptyState icon="check" title="Nobody below the threshold" hint="Every student in range is at or above the chosen percentage." /></td></tr>
                  ) : (rows ?? []).map((s) => (
                    <tr key={s.student_id}>
                      <td><span className="font-semibold text-ink">{s.full_name}</span><span className="ml-2 font-mono text-[11px] text-ink-3">{s.admission_no}</span></td>
                      <td className="whitespace-nowrap">{s.class_name ?? "—"}</td>
                      <td className="td-end tnum">{s.attended} / {s.counted}</td>
                      <td className="td-end tnum">{s.absent}</td>
                      <td className="td-end tnum">{s.od}</td>
                      <td className="td-end tnum">{s.leave}</td>
                      <td className={`td-end tnum font-bold ${pctTone(s.percentage) === "danger" ? "text-danger-ink" : "text-warn-ink"}`}>{s.percentage}%</td>
                      <td className="td-end"><IconButton name="calendar" variant="ghost" label={`Attendance calendar for ${s.full_name}`} onClick={() => onOpenStudent({ id: s.student_id, name: s.full_name })} /></td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </TableView>
        </div>
      </div>
      <AttendanceLegend />
    </div>
  );
}
