"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, R, ROLE, useMe } from "@/lib/auth";
import { Badge, Button, CardHead, EmptyState, Field, Icon, Input, PageHeader, ProgressBar, Reveal, Select, StatCard, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { ExportBar, ExportButtons, type ExportSpec } from "@/components/reports/ExportButtons";
import { formatDate, inr, inrCompact } from "@/lib/format";
import { MobileFilters } from "@/components/mobile/MobileFilters";

type ClassItem = { id: string; name: string; section: string | null };
type Dashboard = {
  students_active: number; staff_active: number; classes: number; incidents_open: number;
  staff_leaves_pending: number; gate_passes_pending: number; admissions_in_progress: number;
  fees: { invoiced: number; collected: number; collection_pct: number | null } | null;
};
type AttendanceRow = { class_id: string; class_name: string; section: string | null; attendance_pct: number | null; present: number; absent: number; total_records: number };
type AttendanceTrend = { granularity: "day" | "month"; overall_pct: number | null; present: number; total: number; points: { period: string; present: number; absent: number; total: number; pct: number | null }[] };
type FeeRow = { invoiced: number; collected: number; outstanding: number; invoices: number; collection_pct: number | null };
type Fees = {
  invoiced: number; collected: number; collection_pct: number | null; outstanding: number; overdue: number; invoice_count: number; defaulter_count: number;
  by_class: (FeeRow & { class_id: string | null; class_name: string })[]; by_term: (FeeRow & { term: string })[];
};
type Defaulter = { student_id: string; full_name: string; admission_no: string; class_name: string; mobile: string | null; overdue_invoices: number; overdue_amount: number; oldest_due: string };
type SubjectPerf = { subject_id: string; subject_name: string; entries: number; avg_pct: number | null; pass_rate: number | null };
type Performance = {
  pass_mark: number;
  overall: { students: number; students_with_marks: number; avg_pct: number | null; pass_rate: number | null; grade_distribution: Record<string, number> };
  by_class: { class_id: string; class_name: string; students: number; students_with_marks: number; avg_pct: number | null; pass_rate: number | null; subjects: SubjectPerf[] }[];
  by_subject: SubjectPerf[];
};
type Payroll = { payroll_total_net: number; payroll_total_gross: number; payslip_count: number; by_month: { month: string; payslips: number; paid: number; gross: number; net: number }[] };
type Summary = { hostel: { capacity: number; allocated: number; occupancy_pct: number | null } };

type Filters = { class_id: string; section: string; from: string; to: string };
const EMPTY: Filters = { class_id: "", section: "", from: "", to: "" };
const pctText = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);
const tone = (v: number | null, good = 85, ok = 70) => (v === null ? "slate" : v >= good ? "emerald" : v >= ok ? "amber" : "rose") as "slate" | "emerald" | "amber" | "rose";

/**
 * One report card: head, export strip (same place on every card), body. `min-w-0`
 * so a wide table scrolls inside its card instead of widening the page.
 */
function Section({ title, subtitle, icon, exports, query, children }: {
  title: string; subtitle?: string; icon: string; exports?: ExportSpec[]; query?: string; children: ReactNode;
}) {
  return (
    <Reveal className="min-w-0">
      <div className="card flex h-full min-w-0 flex-col overflow-hidden">
        <CardHead title={title} subtitle={subtitle} icon={icon} />
        {exports && <ExportBar exports={exports} query={query} />}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Reveal>
  );
}

/** Empty row spanning the whole table. */
const NoRows = ({ cols, text }: { cols: number; text: string }) => (
  <tr><td colSpan={cols} className="!py-10 text-center text-ink-3">{text}</td></tr>
);

/** Labelled figure for the fee summary strip — equal height, label top, value bottom. */
function Figure({ label, value, hint, tone: t }: { label: string; value: string; hint?: string; tone?: "ok" | "danger" | "warn" }) {
  const color = t === "ok" ? "text-ok-ink" : t === "danger" ? "text-danger-ink" : t === "warn" ? "text-warn-ink" : "text-ink";
  return (
    <div className="flex h-full min-w-0 flex-col justify-between rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</p>
      <div className="mt-1.5">
        <p className={`tnum truncate text-[18px] font-bold leading-tight ${color} max-md:whitespace-normal max-md:text-[17px] max-md:[overflow-wrap:anywhere]`}>{value}</p>
        {hint && <p className="mt-0.5 truncate text-[11.5px] text-ink-3 max-md:mt-1 max-md:whitespace-normal max-md:[overflow-wrap:anywhere]">{hint}</p>}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { me } = useMe();
  const toast = useToast();
  const canReports = hasRole(me, R.REPORTS);
  const canFees = hasRole(me, R.FEES_READ);
  const canPayroll = hasRole(me, R.PAYROLL);
  const canStudentExport = hasRole(me, [...R.LEADERSHIP, ROLE.OFFICE_SUPERINTENDENT]);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [att, setAtt] = useState<AttendanceRow[]>([]);
  const [trend, setTrend] = useState<AttendanceTrend | null>(null);
  const [fees, setFees] = useState<Fees | null>(null);
  const [defaulters, setDefaulters] = useState<Defaulter[]>([]);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cacheNote, setCacheNote] = useState("");

  const sections = useMemo(() => [...new Set(classes.map((c) => c.section).filter((s): s is string => !!s))].sort(), [classes]);
  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(applied)) if (v) q.set(k, v);
    return q.toString();
  }, [applied]);

  useEffect(() => {
    if (!me || !canReports) return;
    apiFetch<ClassItem[]>("/api/classes").then(setClasses).catch(() => setClasses([]));
  }, [me, canReports]);

  const load = useCallback(async (fresh = false) => {
    if (!me || (!canReports && !canPayroll)) return;
    setLoading(true);
    const q = new URLSearchParams(query);
    if (fresh) q.set("fresh", "1");
    const s = q.toString() ? `?${q.toString()}` : "";
    const opt = <T,>(on: boolean, path: string, set: (v: T) => void, empty: T) =>
      on ? apiFetch<T>(`${path}${s}`).then(set) : Promise.resolve(set(empty));
    try {
      await Promise.all([
        opt<Dashboard | null>(canReports, "/api/reports/dashboard", setDash, null),
        opt<AttendanceRow[]>(canReports, "/api/reports/attendance", setAtt, []),
        opt<AttendanceTrend | null>(canReports, "/api/reports/attendance-trend", setTrend, null),
        opt<Performance | null>(canReports, "/api/reports/performance", setPerf, null),
        opt<Summary | null>(canReports, "/api/reports/summary", setSummary, null),
        opt<Fees | null>(canFees, "/api/reports/fees", setFees, null),
        opt<Defaulter[]>(canFees, "/api/reports/defaulters", setDefaulters, []),
        opt<Payroll | null>(canPayroll, "/api/reports/payroll", setPayroll, null),
      ]);
      setCacheNote(fresh ? "Recomputed just now" : "Aggregates are cached for up to a minute — Refresh recomputes");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed to load reports", "error");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, canReports, canFees, canPayroll, query]);
  useEffect(() => { load(); }, [load]);

  const apply = () => {
    if (draft.from && draft.to && draft.from > draft.to) return toast.push("The start date must be on or before the end date", "error");
    setApplied(draft);
  };

  if (me && !canReports && !canPayroll) {
    return <EmptyState icon="lock" title="You don't have access to this page" hint="Reports are available to leadership, accounts, the office superintendent, HODs and HR (payroll)." />;
  }


  const filtersActive = Object.values(applied).some(Boolean);
  const rateTone = (v: number | null) => (v === null ? "brand" : v >= 85 ? "emerald" : v >= 70 ? "amber" : "rose") as "brand" | "emerald" | "amber" | "rose";

  return (
    <div className="min-w-0 space-y-6 max-md:space-y-4">
      <Reveal>
        <PageHeader
          icon="reports" title="Reports & Analytics"
          subtitle="Live aggregates from attendance, fees, marks and payroll — filter, then export any view."
          actions={<Button type="button" variant="primary" onClick={() => load(true)} loading={loading}><Icon name="refresh" className="h-4 w-4" /> Refresh</Button>}
        />
      </Reveal>

      {canReports && (
        <Reveal delay={40}>
          <form
            className="card p-4"
            role="search"
            aria-label="Report filters"
            onSubmit={(e) => { e.preventDefault(); apply(); }}
          >
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_minmax(0,10rem)_minmax(0,10rem)_auto]">
              <MobileFilters active={Object.values(applied).filter(Boolean).length} onClear={() => { setDraft(EMPTY); setApplied(EMPTY); }}>
              <div className="min-w-0">
                <Field label="Class">
                  <Select aria-label="Class filter" value={draft.class_id} onChange={(e) => setDraft({ ...draft, class_id: e.target.value })}>
                    <option value="">All classes</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? ` ${c.section}` : ""}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="min-w-0">
                <Field label="Section">
                  <Select aria-label="Section filter" value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })}>
                    <option value="">All sections</option>
                    {sections.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="min-w-0"><Field label="From"><Input type="date" aria-label="From date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field></div>
              <div className="min-w-0"><Field label="To"><Input type="date" aria-label="To date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field></div>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
                <Button type="submit" variant="primary" className="flex-1 lg:flex-none"><Icon name="filter" className="h-4 w-4" /> Apply</Button>
                <Button type="button" variant="ghost" className="flex-1 lg:flex-none" disabled={!filtersActive && draft === EMPTY} onClick={() => { setDraft(EMPTY); setApplied(EMPTY); }}>Clear</Button>
              </div>
              </MobileFilters>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[11.5px] text-ink-3">
              <p className="min-w-0">Dates filter attendance by day, fees by invoice due date, marks by exam date and payroll by payslip month.</p>
              <p className="flex items-center gap-2">
                {filtersActive && <Badge tone="brand">Filtered</Badge>}
                <span>{cacheNote}</span>
              </p>
            </div>
          </form>
        </Reveal>
      )}

      {dash && (
        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4 max-sm:grid-cols-2 max-sm:gap-3 max-sm:[&_p]:[overflow-wrap:anywhere]">
          <StatCard className="h-full" label="Active students" value={dash.students_active} icon="students" hint={`${dash.classes} classes in view`} />
          <StatCard className="h-full" label="Attendance" value={trend?.overall_pct ?? null} suffix="%" decimals={1} icon="attendance" tone="emerald" hint={trend ? `${trend.present} of ${trend.total} marks present` : "No attendance in view"} />
          <StatCard className="h-full" label="Average score" value={perf?.overall.avg_pct ?? null} suffix="%" decimals={1} icon="exams" tone="sky" hint={perf ? `Pass rate ${pctText(perf.overall.pass_rate)} (pass mark ${perf.pass_mark}%)` : "No marks in view"} />
          {dash.fees
            ? <StatCard className="h-full" label="Fees collected" value={dash.fees.collection_pct} suffix="%" decimals={1} icon="wallet" tone="amber" hint={`${inrCompact(dash.fees.collected)} of ${inrCompact(dash.fees.invoiced)}`} />
            : <StatCard className="h-full" label="Open incidents" value={dash.incidents_open} icon="discipline" tone="rose" hint={`${dash.staff_leaves_pending} staff leaves pending`} />}
        </div>
      )}

      {canStudentExport && (
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon name="students" className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">Student list</p>
              <p className="text-[12.5px] text-ink-3">Names, classes and contact numbers for the selected classes (audited).</p>
            </div>
          </div>
          <ExportButtons report="students" query={query} label="Student list" />
        </div>
      )}

      {canReports && (
        <div className={`grid grid-cols-1 items-stretch gap-6 max-md:gap-4 ${trend ? "xl:grid-cols-2" : ""}`}>
          <Section title="Attendance by class" subtitle="Present ÷ marked, per class" icon="attendance" query={query} exports={[{ report: "attendance-summary", label: "Attendance by class" }]}>
            <TableView id="attendance" title="Class" mobileHide={["Records"]}>
              <div className="table-wrap max-h-[28rem]">
                <table className="data-table min-w-[34rem]">
                  <thead><tr><th>Class</th><th className="th-end">Present</th><th className="th-end">Absent</th><th className="th-end">Records</th><th className="th-end">Rate</th></tr></thead>
                  <tbody>
                    {att.map((r) => (
                      <tr key={r.class_id}>
                        <td className="whitespace-nowrap font-semibold">{r.class_name} {r.section ?? ""}</td>
                        <td className="td-end tnum">{r.present}</td>
                        <td className="td-end tnum">{r.absent}</td>
                        <td className="td-end tnum">{r.total_records}</td>
                        <td className="td-end">
                          <div className="flex items-center justify-end gap-2">
                            <ProgressBar value={r.attendance_pct ?? 0} tone={rateTone(r.attendance_pct)} className="w-20" label={`${r.class_name} attendance`} />
                            <span className="tnum w-14 text-right text-xs font-semibold">{r.attendance_pct === null ? "No data" : `${r.attendance_pct}%`}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {att.length === 0 && <NoRows cols={5} text="No classes match these filters" />}
                  </tbody>
                </table>
              </div>
            </TableView>
          </Section>

          {trend && (
            <Section
              title="Attendance trend" subtitle={`Share of marks present, by ${trend.granularity}`} icon="activity" query={query}
              exports={[{ report: "attendance-trend", label: "Trend" }, { report: "attendance", label: "Records" }]}
            >
              <div className="max-h-[28rem] space-y-2 overflow-y-auto p-5 max-md:p-4">
                {trend.points.length === 0 && <p className="py-6 text-center text-sm text-ink-3">No attendance marked in this window</p>}
                {trend.points.map((p) => (
                  <div key={p.period} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-xs sm:grid-cols-[6.5rem_minmax(0,1fr)_4rem]">
                    <span className="tnum truncate text-ink-2">{p.period}</span>
                    <div className="h-2.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${p.period}: ${p.pct ?? 0}% of ${p.total}`}>
                      <div className="h-full rounded-full bg-ok" style={{ width: `${p.pct ?? 0}%` }} />
                    </div>
                    <span className="tnum text-right font-semibold">{pctText(p.pct)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {canFees && fees && (
        <Section
          title="Fee collection" subtitle={`${fees.invoice_count} invoices · collected vs due by class and term`} icon="fees" query={query}
          exports={[{ report: "fee-summary", label: "Fee summary" }, { report: "fees", label: "Fee invoices" }]}
        >
          <div className="grid grid-cols-1 items-stretch gap-3 border-b border-line p-5 sm:grid-cols-2 lg:grid-cols-4 max-md:p-4">
            <Figure label="Invoiced" value={inr(fees.invoiced)} hint={`${fees.invoice_count} invoices`} />
            <Figure label="Collected" value={inr(fees.collected)} hint={`${pctText(fees.collection_pct)} of invoiced`} tone="ok" />
            <Figure label="Outstanding" value={inr(fees.outstanding)} tone="warn" />
            <Figure label="Overdue" value={inr(fees.overdue)} hint={`${fees.defaulter_count} students`} tone="danger" />
          </div>
          <TableView id="fees-class" title="Class / term">
            <div className="table-wrap max-h-[32rem]">
              <table className="data-table min-w-[44rem]">
                <thead><tr><th>Class / term</th><th className="th-end">Invoices</th><th className="th-end">Billed</th><th className="th-end">Collected</th><th className="th-end">Pending</th><th className="th-end">Rate</th></tr></thead>
                <tbody>
                  {[...fees.by_class.map((r) => ({ key: `c${r.class_id}`, label: r.class_name, r })), ...fees.by_term.map((r) => ({ key: `t${r.term}`, label: `Term: ${r.term}`, r }))].map(({ key, label, r }) => (
                    <tr key={key}>
                      <td className="whitespace-nowrap font-medium">{label}</td>
                      <td className="td-end tnum">{r.invoices}</td>
                      <td className="td-end tnum whitespace-nowrap">{inr(r.invoiced)}</td>
                      <td className="td-end tnum whitespace-nowrap text-ok-ink">{inr(r.collected)}</td>
                      <td className="td-end tnum whitespace-nowrap text-danger-ink">{inr(r.outstanding)}</td>
                      <td className="td-end"><Badge tone={tone(r.collection_pct, 90, 70)}>{pctText(r.collection_pct)}</Badge></td>
                    </tr>
                  ))}
                  {fees.invoice_count === 0 && <NoRows cols={6} text="No invoices match these filters" />}
                </tbody>
              </table>
            </div>
          </TableView>
        </Section>
      )}

      {canFees && (
        <Section title="Fee defaulters" subtitle="Unpaid balance on an invoice past its due date" icon="alert" query={query} exports={[{ report: "defaulters", label: "Defaulters" }]}>
          <TableView id="defaulters" title="Student" mobileHide={["Overdue invoices"]}>
            <div className="table-wrap max-h-[32rem]">
              <table className="data-table min-w-[40rem]">
                <thead><tr><th>Student</th><th>Class</th><th className="th-end">Overdue invoices</th><th className="th-end">Amount</th><th className="th-end">Oldest due</th></tr></thead>
                <tbody>
                  {defaulters.slice(0, 50).map((d) => (
                    <tr key={d.student_id}>
                      <td><span className="font-semibold">{d.full_name}</span><span className="block font-mono text-xs text-ink-3">{d.admission_no}</span></td>
                      <td className="whitespace-nowrap">{d.class_name || "—"}</td>
                      <td className="td-end tnum">{d.overdue_invoices}</td>
                      <td className="td-end tnum whitespace-nowrap font-semibold text-danger-ink">{inr(d.overdue_amount)}</td>
                      <td className="td-end tnum whitespace-nowrap text-xs">{formatDate(d.oldest_due)}</td>
                    </tr>
                  ))}
                  {defaulters.length === 0 && <NoRows cols={5} text="No defaulters for these filters" />}
                  {defaulters.length > 50 && <tr><td colSpan={5} className="text-center text-xs text-ink-3">Showing 50 of {defaulters.length} — export for the full list</td></tr>}
                </tbody>
              </table>
            </div>
          </TableView>
        </Section>
      )}

      {canReports && perf && (
        <Section
          title="Academic performance" subtitle={`Weighted averages from the grade engine · pass mark ${perf.pass_mark}%`} icon="exams" query={query}
          exports={[{ report: "performance", label: "Performance" }, { report: "exams", label: "Exam averages" }]}
        >
          {Object.keys(perf.overall.grade_distribution).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 text-xs max-md:px-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Grades</span>
              {Object.entries(perf.overall.grade_distribution).map(([g, n]) => <Badge key={g} tone="slate"><span className="tnum">{g}: {n}</span></Badge>)}
            </div>
          )}
          <TableView id="performance" title="Class">
            <div className="table-wrap max-h-[32rem]">
              <table className="data-table min-w-[48rem]">
                <thead><tr><th>Class</th><th className="th-end">Students graded</th><th className="th-end">Average</th><th className="th-end">Pass rate</th><th>By subject</th></tr></thead>
                <tbody>
                  {perf.by_class.map((c) => (
                    <tr key={c.class_id} className="align-top">
                      <td className="whitespace-nowrap font-semibold">{c.class_name}</td>
                      <td className="td-end tnum whitespace-nowrap">{c.students_with_marks} / {c.students}</td>
                      <td className="td-end tnum">{pctText(c.avg_pct)}</td>
                      <td className="td-end"><Badge tone={tone(c.pass_rate, 90, 75)}>{pctText(c.pass_rate)}</Badge></td>
                      <td className="text-xs text-ink-2">
                        {c.subjects.length
                          ? <div className="flex flex-wrap gap-1">{c.subjects.map((s) => <span key={s.subject_id} className="tnum whitespace-nowrap rounded-md bg-surface-2 px-1.5 py-0.5">{s.subject_name} {pctText(s.avg_pct)}</span>)}</div>
                          : "No marks"}
                      </td>
                    </tr>
                  ))}
                  {perf.by_class.length === 0 && <NoRows cols={5} text="No classes match these filters" />}
                </tbody>
              </table>
            </div>
          </TableView>
        </Section>
      )}

      {((canPayroll && payroll) || (canReports && summary)) && (
        <div className={`grid grid-cols-1 items-stretch gap-6 max-md:gap-4 ${canPayroll && payroll && canReports && summary ? "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
          {canPayroll && payroll && (
            <Section title="Payroll" subtitle={`${payroll.payslip_count} payslips · net ${inr(payroll.payroll_total_net)}`} icon="wallet" query={query} exports={[{ report: "payroll", label: "Payroll" }]}>
              <TableView id="payroll" title="Month">
                <div className="table-wrap max-h-[28rem]">
                  <table className="data-table min-w-[34rem]">
                    <thead><tr><th>Month</th><th className="th-end">Payslips</th><th className="th-end">Paid</th><th className="th-end">Gross</th><th className="th-end">Net</th></tr></thead>
                    <tbody>
                      {payroll.by_month.map((m) => (
                        <tr key={m.month}>
                          <td className="tnum whitespace-nowrap font-medium">{m.month}</td>
                          <td className="td-end tnum">{m.payslips}</td>
                          <td className="td-end tnum">{m.paid}</td>
                          <td className="td-end tnum whitespace-nowrap">{inr(m.gross)}</td>
                          <td className="td-end tnum whitespace-nowrap font-semibold">{inr(m.net)}</td>
                        </tr>
                      ))}
                      {payroll.by_month.length === 0 && <NoRows cols={5} text="No payslips in this window" />}
                    </tbody>
                  </table>
                </div>
              </TableView>
            </Section>
          )}

          {canReports && summary && (
            <Section title="Hostel occupancy" subtitle="Beds allocated across all hostels" icon="hostel">
              <div className="flex h-full flex-col justify-center gap-3 p-5 max-md:h-auto max-md:justify-start max-md:p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 max-md:flex-col max-md:items-start max-md:gap-1">
                  <span className="tnum font-display text-[28px] font-bold leading-none text-ink max-md:text-[24px] max-md:leading-tight">{pctText(summary.hostel.occupancy_pct)}</span>
                  <span className="tnum text-sm text-ink-2">{summary.hostel.allocated} / {summary.hostel.capacity} beds</span>
                </div>
                <ProgressBar value={summary.hostel.occupancy_pct ?? 0} label="Hostel occupancy" />
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
