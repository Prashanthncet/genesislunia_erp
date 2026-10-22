"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, R, ROLE, useMe } from "@/lib/auth";
import { Badge, Button, CardHead, EmptyState, Field, Icon, Input, PageHeader, ProgressBar, Reveal, Select, StatCard, useToast } from "@/components/ui";
import { TableView } from "@/components/TableView";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { inr, inrCompact } from "@/lib/format";

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

function Section({ title, subtitle, icon, actions, children }: { title: string; subtitle?: string; icon: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Reveal>
      <div className="card overflow-hidden">
        <CardHead title={title} subtitle={subtitle} icon={icon} actions={actions} />
        {children}
      </div>
    </Reveal>
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


  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon="reports" title="Reports & Analytics"
          subtitle="Live aggregates from attendance, fees, marks and payroll — filter, then export any view."
          actions={<Button variant="primary" onClick={() => load(true)} loading={loading}><Icon name="refresh" className="h-4 w-4" /> Refresh</Button>}
        />
      </Reveal>

      {canReports && (
        <Reveal delay={40}>
          <div className="card grid grid-cols-1 items-end gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_10rem_10rem_auto]">
            <Field label="Class">
              <Select aria-label="Class filter" value={draft.class_id} onChange={(e) => setDraft({ ...draft, class_id: e.target.value })}>
                <option value="">All classes</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? ` ${c.section}` : ""}</option>)}
              </Select>
            </Field>
            <Field label="Section">
              <Select aria-label="Section filter" value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })}>
                <option value="">All sections</option>
                {sections.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="From"><Input type="date" aria-label="From date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
            <Field label="To"><Input type="date" aria-label="To date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
            <div className="flex gap-2">
              <Button variant="primary" onClick={apply}><Icon name="filter" className="h-4 w-4" /> Apply</Button>
              <Button variant="ghost" onClick={() => { setDraft(EMPTY); setApplied(EMPTY); }}>Clear</Button>
            </div>
            <p className="text-[11.5px] text-ink-3 sm:col-span-2 lg:col-span-5">
              Dates filter attendance by day, fees by invoice due date, marks by exam date and payroll by payslip month. {cacheNote}
            </p>
          </div>
        </Reveal>
      )}

      {dash && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Active students" value={dash.students_active} icon="students" hint={`${dash.classes} classes in view`} />
          <StatCard label="Attendance" value={trend?.overall_pct ?? null} suffix="%" decimals={1} icon="attendance" tone="emerald" hint={trend ? `${trend.present} of ${trend.total} marks present` : undefined} />
          <StatCard label="Average score" value={perf?.overall.avg_pct ?? null} suffix="%" decimals={1} icon="exams" tone="sky" hint={perf ? `Pass rate ${pctText(perf.overall.pass_rate)} (pass mark ${perf.pass_mark}%)` : undefined} />
          {dash.fees
            ? <StatCard label="Fees collected" value={dash.fees.collection_pct} suffix="%" decimals={1} icon="wallet" tone="amber" hint={`${inrCompact(dash.fees.collected)} of ${inrCompact(dash.fees.invoiced)}`} />
            : <StatCard label="Open incidents" value={dash.incidents_open} icon="discipline" tone="rose" hint={`${dash.staff_leaves_pending} staff leaves pending`} />}
        </div>
      )}

      {canStudentExport && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="font-semibold text-ink">Student list</p><p className="text-[12.5px] text-ink-3">Names, classes and contact numbers for the selected classes (audited).</p></div>
          <ExportButtons report="students" query={query} label="Student list" />
        </div>
      )}

      {canReports && (
        <Section title="Attendance by class" subtitle="Present ÷ marked, per class" icon="attendance" actions={<ExportButtons report="attendance-summary" query={query} label="Attendance by class" />}>
          <TableView id="attendance" title="Class">
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="px-4 py-3">Class</th><th className="px-4 py-3">Present</th><th className="px-4 py-3">Absent</th><th className="px-4 py-3">Records</th><th className="px-4 py-3">Rate</th></tr></thead>
              <tbody>
                {att.map((r) => (
                  <tr key={r.class_id} className="row-hover border-t border-line">
                    <td className="px-4 py-3 font-semibold">{r.class_name} {r.section ?? ""}</td>
                    <td className="tnum px-4 py-3">{r.present}</td>
                    <td className="tnum px-4 py-3">{r.absent}</td>
                    <td className="tnum px-4 py-3">{r.total_records}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><ProgressBar value={r.attendance_pct ?? 0} tone={r.attendance_pct === null ? "brand" : r.attendance_pct >= 85 ? "emerald" : r.attendance_pct >= 70 ? "amber" : "rose"} className="w-24" label={`${r.class_name} attendance`} /><span className="tnum text-xs">{r.attendance_pct === null ? "No data" : `${r.attendance_pct}%`}</span></div></td>
                  </tr>
                ))}
                {att.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-3">No classes match these filters</td></tr>}
              </tbody>
            </table>
          </TableView>
        </Section>
      )}

      {canReports && trend && (
        <Section title="Attendance trend" subtitle={`By ${trend.granularity}`} icon="activity" actions={<div className="flex flex-wrap gap-2"><ExportButtons report="attendance-trend" query={query} label="Attendance trend" /><ExportButtons report="attendance" query={query} label="Attendance records" /></div>}>
          <div className="space-y-1.5 p-5">
            {trend.points.length === 0 && <p className="py-6 text-center text-sm text-ink-3">No attendance marked in this window</p>}
            {trend.points.map((p) => (
              <div key={p.period} className="grid grid-cols-[6.5rem_1fr_4rem] items-center gap-3 text-xs">
                <span className="tnum text-ink-2">{p.period}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${p.period}: ${p.pct ?? 0}% of ${p.total}`}>
                  <div className="h-full rounded-full bg-ok" style={{ width: `${p.pct ?? 0}%` }} />
                </div>
                <span className="tnum text-right font-semibold">{pctText(p.pct)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {canFees && fees && (
        <Section title="Fee collection" subtitle={`${fees.invoice_count} invoices · collected vs due by class and term`} icon="fees" actions={<div className="flex flex-wrap gap-2"><ExportButtons report="fee-summary" query={query} label="Fee summary" /><ExportButtons report="fees" query={query} label="Fee invoices" /></div>}>
          <div className="grid grid-cols-2 gap-3 border-b border-line p-5 md:grid-cols-4">
            {[["Invoiced", inr(fees.invoiced)], ["Collected", `${inr(fees.collected)} (${pctText(fees.collection_pct)})`], ["Outstanding", inr(fees.outstanding)], ["Overdue", `${inr(fees.overdue)} · ${fees.defaulter_count} students`]].map(([k, v]) => (
              <div key={k}><p className="text-[11.5px] uppercase tracking-wide text-ink-3">{k}</p><p className="tnum font-semibold text-ink">{v}</p></div>
            ))}
          </div>
          <TableView id="fees-class" title="Class">
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="px-4 py-3">Class / term</th><th className="px-4 py-3 text-right">Invoices</th><th className="px-4 py-3 text-right">Billed</th><th className="px-4 py-3 text-right">Collected</th><th className="px-4 py-3 text-right">Pending</th><th className="px-4 py-3">Rate</th></tr></thead>
              <tbody>
                {[...fees.by_class.map((r) => ({ key: `c${r.class_id}`, label: r.class_name, r })), ...fees.by_term.map((r) => ({ key: `t${r.term}`, label: `Term: ${r.term}`, r }))].map(({ key, label, r }) => (
                  <tr key={key} className="row-hover border-t border-line">
                    <td className="px-4 py-3 font-medium">{label}</td>
                    <td className="tnum px-4 py-3 text-right">{r.invoices}</td>
                    <td className="tnum px-4 py-3 text-right">{inr(r.invoiced)}</td>
                    <td className="tnum px-4 py-3 text-right text-ok">{inr(r.collected)}</td>
                    <td className="tnum px-4 py-3 text-right text-danger">{inr(r.outstanding)}</td>
                    <td className="px-4 py-3"><Badge tone={tone(r.collection_pct, 90, 70)}>{pctText(r.collection_pct)}</Badge></td>
                  </tr>
                ))}
                {fees.invoice_count === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-3">No invoices match these filters</td></tr>}
              </tbody>
            </table>
          </TableView>
        </Section>
      )}

      {canFees && (
        <Section title="Fee defaulters" subtitle="Unpaid balance on an invoice past its due date" icon="alert" actions={<ExportButtons report="defaulters" query={query} label="Defaulters" />}>
          <TableView id="defaulters" title="Student">
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Class</th><th className="px-4 py-3 text-right">Overdue invoices</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Oldest due</th></tr></thead>
              <tbody>
                {defaulters.slice(0, 50).map((d) => (
                  <tr key={d.student_id} className="row-hover border-t border-line">
                    <td className="px-4 py-3"><span className="font-semibold">{d.full_name}</span><span className="block text-xs text-ink-3">{d.admission_no}</span></td>
                    <td className="px-4 py-3">{d.class_name || "—"}</td>
                    <td className="tnum px-4 py-3 text-right">{d.overdue_invoices}</td>
                    <td className="tnum px-4 py-3 text-right text-danger">{inr(d.overdue_amount)}</td>
                    <td className="px-4 py-3 text-xs">{d.oldest_due}</td>
                  </tr>
                ))}
                {defaulters.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-3">No defaulters for these filters</td></tr>}
                {defaulters.length > 50 && <tr><td colSpan={5} className="px-4 py-3 text-center text-xs text-ink-3">Showing 50 of {defaulters.length} — export for the full list</td></tr>}
              </tbody>
            </table>
          </TableView>
        </Section>
      )}

      {canReports && perf && (
        <Section title="Academic performance" subtitle={`Weighted averages from the grade engine · pass mark ${perf.pass_mark}%`} icon="exams" actions={<div className="flex flex-wrap gap-2"><ExportButtons report="performance" query={query} label="Performance" /><ExportButtons report="exams" query={query} label="Exam averages" /></div>}>
          <div className="flex flex-wrap gap-2 border-b border-line p-4 text-xs">
            {Object.entries(perf.overall.grade_distribution).map(([g, n]) => <Badge key={g} tone="slate">{g}: {n}</Badge>)}
          </div>
          <TableView id="performance" title="Class">
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="px-4 py-3">Class</th><th className="px-4 py-3">Students graded</th><th className="px-4 py-3">Average</th><th className="px-4 py-3">Pass rate</th><th className="px-4 py-3">By subject</th></tr></thead>
              <tbody>
                {perf.by_class.map((c) => (
                  <tr key={c.class_id} className="row-hover border-t border-line align-top">
                    <td className="px-4 py-3 font-semibold">{c.class_name}</td>
                    <td className="tnum px-4 py-3">{c.students_with_marks} / {c.students}</td>
                    <td className="tnum px-4 py-3">{pctText(c.avg_pct)}</td>
                    <td className="px-4 py-3"><Badge tone={tone(c.pass_rate, 90, 75)}>{pctText(c.pass_rate)}</Badge></td>
                    <td className="px-4 py-3 text-xs text-ink-2">{c.subjects.length ? c.subjects.map((s) => `${s.subject_name} ${pctText(s.avg_pct)}`).join(" · ") : "No marks"}</td>
                  </tr>
                ))}
                {perf.by_class.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-3">No classes match these filters</td></tr>}
              </tbody>
            </table>
          </TableView>
        </Section>
      )}

      {canPayroll && payroll && (
        <Section title="Payroll" subtitle={`${payroll.payslip_count} payslips · net ${inr(payroll.payroll_total_net)}`} icon="wallet" actions={<ExportButtons report="payroll" query={query} label="Payroll" />}>
          <TableView id="payroll" title="Month">
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="px-4 py-3">Month</th><th className="px-4 py-3 text-right">Payslips</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Gross</th><th className="px-4 py-3 text-right">Net</th></tr></thead>
              <tbody>
                {payroll.by_month.map((m) => (
                  <tr key={m.month} className="row-hover border-t border-line">
                    <td className="px-4 py-3 font-medium">{m.month}</td>
                    <td className="tnum px-4 py-3 text-right">{m.payslips}</td>
                    <td className="tnum px-4 py-3 text-right">{m.paid}</td>
                    <td className="tnum px-4 py-3 text-right">{inr(m.gross)}</td>
                    <td className="tnum px-4 py-3 text-right">{inr(m.net)}</td>
                  </tr>
                ))}
                {payroll.by_month.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-3">No payslips in this window</td></tr>}
              </tbody>
            </table>
          </TableView>
        </Section>
      )}

      {canReports && summary && (
        <Section title="Hostel occupancy" icon="hostel">
          <div className="flex items-center gap-4 p-5">
            <ProgressBar value={summary.hostel.occupancy_pct ?? 0} className="flex-1" label="Hostel occupancy" />
            <span className="tnum text-sm font-semibold">{summary.hostel.allocated} / {summary.hostel.capacity} beds · {pctText(summary.hostel.occupancy_pct)}</span>
          </div>
        </Section>
      )}
    </div>
  );
}
