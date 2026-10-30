"use client";

/**
 * Monthly register: Student ID and Student Name displayed as separate columns,
 * days across, with a per-student summary block on the right (P / A, %, mini bar).
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { EmptyState, IconButton, Input, Skeleton } from "@/components/ui";
import { CardBody, CardGrid, CardEmpty, CardTitle, Chip, Meter, RecordCard, Ring } from "@/components/RecordCard";
import { TableView } from "@/components/TableView";
import { ClassSectionSelect, resolveClass, selFor, type ClassOpt, type ClassSel } from "./ClassSectionSelect";
import { AttendanceLegend, CountTile, STATUS_LONG, STATUS_META, normStatus, pctTone, shiftMonth, thisMonthLocal, type Tally } from "./status";

type RegStudent = Tally & {
  id: string; fullName: string; rollNo: string | null; admissionNo: string;
  days: Record<string, string>; notes: Record<string, string>; marked: number;
};
type Register = { month: string; class_id: string; class_name: string | null; dates: string[]; totals: Tally; students: RegStudent[] };

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const BAR: Record<string, string> = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", slate: "bg-line-strong" };

export function MonthlyRegister({
  classes, onMessage, onOpenStudent,
}: {
  classes: ClassOpt[];
  onMessage: (m: string) => void;
  onOpenStudent: (s: { id: string; name: string }) => void;
}) {
  const [sel, setSel] = useState<ClassSel>(() => selFor(classes[0]));
  const [month, setMonth] = useState(thisMonthLocal);
  const [reg, setReg] = useState<Register | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!sel.className && classes[0]) setSel(selFor(classes[0])); }, [classes, sel.className]);
  const cls = resolveClass(classes, sel);

  const load = useCallback(async () => {
    if (!cls) { setReg(null); return; }
    setLoading(true);
    try {
      setReg(await apiFetch<Register>(`/api/attendance/register?class_id=${cls.id}&month=${month}`));
    } catch (e) {
      setReg(null);
      onMessage(e instanceof Error ? e.message : "Register load failed");
    } finally {
      setLoading(false);
    }
  }, [cls, month, onMessage]);
  useEffect(() => { load(); }, [load]);

  const [y, m] = month.split("-").map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const allDays = Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const dow = (d: string) => new Date(`${d}T00:00:00`).getDay();
  const marked = new Set(reg?.dates ?? []);
  const students = reg?.students ?? [];
  const t = reg?.totals;
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const cards = (
    <CardGrid min="16rem" empty={<CardEmpty title="No students in this register" icon="calendar" />}>
      {students.map((s) => (
        <RecordCard key={s.id} rail={pctTone(s.percentage)}>
          <CardBody>
            <CardTitle
              lead={<Ring value={s.percentage ?? 0} tone={pctTone(s.percentage)} size={52} label={`${s.fullName}: ${s.percentage ?? "no"}%`}>{s.percentage == null ? "—" : `${Math.round(s.percentage)}%`}</Ring>}
              title={s.fullName}
              subtitle={<span className="tnum"><span className="font-mono">{s.admissionNo}</span> · Roll {s.rollNo ?? "—"} · {s.attended}/{s.counted} days</span>}
            />
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="ok">{s.present} P</Chip>
              <Chip tone="danger">{s.absent} A</Chip>
            </div>
          </CardBody>
        </RecordCard>
      ))}
    </CardGrid>
  );

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <ClassSectionSelect classes={classes} value={sel} onChange={setSel} />
        <label className="flex flex-col gap-1 max-md:w-full">
          <span className="text-[11.5px] font-semibold text-ink-3">Month</span>
          <span className="flex items-center gap-1.5 max-md:w-full">
            <IconButton name="chevronLeft" label="Previous month" onClick={() => setMonth((v) => shiftMonth(v, -1))} />
            <Input type="month" aria-label="Register month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto max-md:min-w-0 max-md:flex-1" />
            <IconButton name="chevronRight" label="Next month" onClick={() => setMonth((v) => shiftMonth(v, 1))} disabled={month >= thisMonthLocal()} />
          </span>
        </label>
        <p className="ml-auto text-[12.5px] text-ink-3 max-md:ml-0">
          {reg ? `${students.length} students · ${reg.dates.length} days marked · ${monthLabel}` : loading ? "Loading…" : ""}
        </p>
      </div>

      {t && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2">
            <span className="text-[12px] text-ink-2">Class attendance</span>
            <span className="tnum ml-auto text-[15px] font-bold text-brand-700">{t.percentage == null ? "—" : `${t.percentage}%`}</span>
          </div>
          <CountTile status="Present" value={t.present} />
          <CountTile status="Absent" value={t.absent} />
        </div>
      )}

      <div className="card overflow-hidden">
        {!cls ? (
          <EmptyState icon="calendar" title="Choose a class and section" />
        ) : loading && !reg ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : students.length === 0 ? (
          <EmptyState icon="calendar" title="No students in this class" hint="Active students appear here; mark daily attendance and the register fills in." />
        ) : (
          <TableView id="att-register" cards={cards}>
            <div className="scroll-slim max-h-[70vh] overflow-auto overscroll-contain">
              <table className="w-max min-w-full border-separate border-spacing-0 text-[12.5px]" aria-label={`Attendance register ${monthLabel}`}>
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 top-0 z-30 min-w-[6.5rem] border-b border-r border-line bg-surface-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      Student ID
                    </th>
                    <th scope="col" className="sticky left-[6.5rem] top-0 z-30 min-w-[11rem] max-md:static max-md:min-w-[9.5rem] border-b border-r border-line bg-surface-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      Student Name
                    </th>
                    {allDays.map((d) => {
                      const sun = dow(d) === 0;
                      return (
                        <th key={d} scope="col" className={`sticky top-0 z-20 w-8 min-w-8 border-b border-line px-0.5 py-1.5 text-center font-semibold ${sun ? "bg-surface-2 text-ink-3/60" : marked.has(d) ? "bg-surface-2 text-ink" : "bg-surface-2 text-ink-3"}`}>
                          <span className="block text-[9.5px] font-medium uppercase">{DOW[dow(d)]}</span>
                          <span className="tnum block">{Number(d.slice(8))}</span>
                        </th>
                      );
                    })}
                    {(["P", "A"] as const).map((h, i) => (
                      <th key={h} scope="col" className={`sticky top-0 z-20 w-10 border-b border-line bg-surface-2 px-1.5 py-2 text-right text-[11px] font-semibold uppercase text-ink-3 ${i === 0 ? "border-l" : ""}`}>{h}</th>
                    ))}
                    <th scope="col" className="sticky right-0 top-0 z-30 min-w-[7.5rem] max-md:static border-b border-l border-line bg-surface-2 px-3 py-2 text-right text-[11px] font-semibold uppercase text-ink-3">
                      Attendance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} className="group">
                      <td className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-ink-2 group-hover:bg-brand-50">
                        <span className="block font-semibold text-ink">{s.admissionNo}</span>
                        {s.rollNo && <span className="tnum block text-[10.5px] text-ink-3">Roll {s.rollNo}</span>}
                      </td>
                      <th scope="row" className="sticky left-[6.5rem] z-10 max-md:static border-b border-r border-line bg-surface px-3 py-1.5 text-left font-medium group-hover:bg-brand-50">
                        <button
                          type="button"
                          onClick={() => onOpenStudent({ id: s.id, name: s.fullName })}
                          className="max-w-[11rem] truncate align-middle font-semibold text-ink hover:text-brand-700 hover:underline"
                          title="Open attendance calendar"
                        >
                          {s.fullName}
                        </button>
                      </th>
                      {allDays.map((d) => {
                        const raw = s.days[d];
                        const mapped = raw === "Absent" ? "Absent" : raw ? "Present" : null;
                        const meta = mapped ? STATUS_META[mapped] : null;
                        const sun = dow(d) === 0;
                        const note = s.notes[d];
                        const text = `${formatDate(d)}: ${mapped ? STATUS_LONG[mapped] : sun ? "Sunday" : "not marked"}${note ? ` — ${note}` : ""}`;
                        return (
                          <td key={d} className={`border-b border-line p-0.5 text-center ${sun ? "bg-surface-2/70" : "group-hover:bg-brand-50/50"}`}>
                            {meta ? (
                              <span title={text} aria-label={text} className={`relative mx-auto grid h-6 w-7 place-items-center rounded text-[10px] font-bold ring-1 ${meta.cell}`}>
                                {meta.short}
                              </span>
                            ) : (
                              <span title={text} aria-label={text} className="text-ink-3/50">·</span>
                            )}
                          </td>
                        );
                      })}
                      {([[s.present, "text-ok-ink"], [s.absent, "text-danger-ink"]] as const).map(([v, c], i) => (
                        <td key={i} className={`tnum border-b border-line bg-surface px-1.5 text-right font-semibold ${v ? c : "text-ink-3/60"} ${i === 0 ? "border-l" : ""}`}>{v}</td>
                      ))}
                      <td className="sticky right-0 z-10 border-b border-l border-line bg-surface px-3 py-1.5 group-hover:bg-brand-50 max-md:static">
                        <div className="flex items-center justify-end gap-2">
                          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-line" aria-hidden>
                            <span className={`block h-full rounded-full ${BAR[pctTone(s.percentage)]}`} style={{ width: `${s.percentage ?? 0}%` }} />
                          </span>
                          <span className={`tnum w-12 text-right font-bold ${s.percentage == null ? "text-ink-3" : pctTone(s.percentage) === "ok" ? "text-ok-ink" : pctTone(s.percentage) === "warn" ? "text-warn-ink" : "text-danger-ink"}`}>
                            {s.percentage == null ? "—" : `${s.percentage}%`}
                          </span>
                        </div>
                        <p className="tnum text-right text-[10.5px] text-ink-3">{s.attended}/{s.counted} days</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableView>
        )}
      </div>

      {t && <Meter value={t.percentage ?? 0} tone={pctTone(t.percentage)} label={`Class attendance, ${monthLabel}`} caption={`${t.attended}/${t.counted} counted student-days`} />}
      <AttendanceLegend />
    </div>
  );
}
