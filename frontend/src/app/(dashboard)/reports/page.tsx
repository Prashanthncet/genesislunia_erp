"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, Reveal, Skeleton } from "@/components/ui";

type Dashboard = {
  students_active: number; staff_active: number; classes: number; incidents_open: number;
  staff_leaves_pending: number; gate_passes_pending: number; admissions_in_progress: number;
  fees: { invoiced: number; collected: number; collection_pct: number | null };
};
type AttendanceRow = { class_id: string; class_name: string; section: string | null; attendance_pct: number | null; total_records: number };
type FeesReport = { invoiced: number; collected: number; collection_pct: number | null; outstanding: number; invoice_count: number; by_status?: Record<string, number> };
type AcademicsRow = { exam_id: string; exam_name: string; exam_date: string; marks_count: number; avg_score_pct: number | null };
type Summary = { hostel: { capacity: number; allocated: number; occupancy_pct: number | null }; payroll_total_net: number; payslip_count: number };

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

export default function ReportsPage() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [fees, setFees] = useState<FeesReport | null>(null);
  const [academics, setAcademics] = useState<AcademicsRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<Dashboard>("/api/reports/dashboard"),
      apiFetch<AttendanceRow[]>("/api/reports/attendance"),
      apiFetch<FeesReport>("/api/reports/fees"),
      apiFetch<AcademicsRow[]>("/api/reports/academics"),
      apiFetch<Summary>("/api/reports/summary"),
    ])
      .then(([d, a, f, ac, s]) => {
        setDash(d); setAttendance(a ?? []); setFees(f); setAcademics(ac ?? []); setSummary(s);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load reports"));
  }, []);

  const downloadCsv = async (type: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/reports/export/${type}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `genesis-erp-${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-7 pb-4">
      <Reveal>
        <PageHeader
          icon="reports"
          title="Reports & Dashboards"
          subtitle="Cross-module numbers for the school office — everything updates live from the database."
          actions={
            <>
              {["students", "fees", "attendance"].map((t) => (
                <button key={t} onClick={() => downloadCsv(t)} className="btn-soft !px-3 !py-2 text-xs">
                  ⬇ {t} CSV
                </button>
              ))}
            </>
          }
        />
      </Reveal>

      {error && (
        <div className="card flex items-center gap-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {!dash ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />) : (
          <>
            {([
              { label: "Active Students", value: dash.students_active, tone: "brand" as const, icon: "students" },
              { label: "Active Staff", value: dash.staff_active, tone: "violet" as const, icon: "staff" },
              { label: "Open Incidents", value: dash.incidents_open, tone: "rose" as const, icon: "discipline" },
              { label: "Pending Leaves", value: dash.staff_leaves_pending, tone: "amber" as const, icon: "leaves" },
              { label: "Gate Passes", value: dash.gate_passes_pending, tone: "amber" as const, icon: "leaves" },
              { label: "Admissions Live", value: dash.admissions_in_progress, tone: "sky" as const, icon: "admissions" },
            ]).map((k, i) => (
              <Reveal key={k.label} delay={i * 50}>
                <div className="card card-hover p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{k.value}</p>
                </div>
              </Reveal>
            ))}
          </>
        )}
      </div>

      {/* Money row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card hover delay={0} className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Invoiced</p>
          <p className="mt-1.5 text-xl font-bold text-slate-900">{fees ? inr(fees.invoiced) : "—"}</p>
        </Card>
        <Card hover delay={60} className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Collected</p>
          <p className="mt-1.5 text-xl font-bold text-emerald-600">{fees ? inr(fees.collected) : "—"}</p>
        </Card>
        <Card hover delay={120} className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Outstanding</p>
          <p className="mt-1.5 text-xl font-bold text-rose-600">{fees ? inr(fees.outstanding) : "—"}</p>
        </Card>
        <Card hover delay={180} className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Collection</p>
          <div className="mt-1.5 flex items-center gap-2">
            <p className="text-xl font-bold text-slate-900">{fees ? pct(fees.collection_pct) : "—"}</p>
            <Badge tone={fees && fees.collection_pct !== null && fees.collection_pct < 70 ? "rose" : "emerald"}>
              {fees ? `${fees.invoice_count} invoices` : ""}
            </Badge>
          </div>
          <ProgressBar className="mt-2.5" value={fees?.collection_pct ?? 0}
            tone={fees && fees.collection_pct !== null && fees.collection_pct < 70 ? "rose" : "emerald"} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card hover className="p-5">
          <h3 className="font-bold text-slate-800">Attendance % by class</h3>
          <p className="text-xs text-slate-400">Present share of all marked records</p>
          <div className="mt-4 space-y-3">
            {attendance.length === 0 && <EmptyState title="No attendance data" icon="attendance" />}
            {attendance.map((r) => (
              <div key={r.class_id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-sm font-semibold text-slate-700">
                  {r.class_name} {r.section ?? ""}
                </span>
                <ProgressBar className="flex-1" value={r.attendance_pct ?? 0}
                  tone={(r.attendance_pct ?? 100) >= 75 ? "emerald" : (r.attendance_pct ?? 100) >= 60 ? "amber" : "rose"} />
                <span className="w-12 text-right text-xs font-bold text-slate-500 tnum">{pct(r.attendance_pct)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card hover delay={100} className="p-5">
          <h3 className="font-bold text-slate-800">Exam averages</h3>
          <p className="text-xs text-slate-400">Mean score across all recorded marks</p>
          <div className="mt-4 space-y-3">
            {academics.length === 0 && <EmptyState title="No exam data yet" icon="exams" />}
            {academics.map((a) => (
              <div key={a.exam_id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{a.exam_name}</span>
                <span className="text-xs text-slate-400">{a.marks_count} marks</span>
                <span className="w-14 text-right text-sm font-bold text-slate-900 tnum">{pct(a.avg_score_pct)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card hover className="p-5">
          <h3 className="font-bold text-slate-800">Hostel occupancy</h3>
          <p className="text-xs text-slate-400">Beds filled across all rooms</p>
          <div className="mt-4 flex items-end gap-6">
            <div>
              <p className="text-3xl font-bold text-slate-900 tnum">
                {summary ? summary.hostel.allocated : "—"}
                <span className="text-lg font-semibold text-slate-400">/{summary ? summary.hostel.capacity : "—"}</span>
              </p>
              <Badge tone="teal" className="mt-1">{summary ? pct(summary.hostel.occupancy_pct) : "—"} occupied</Badge>
            </div>
            <div className="flex-1"><ProgressBar value={summary?.hostel.occupancy_pct ?? 0} tone="brand" /></div>
          </div>
        </Card>

        <Card hover delay={100} className="p-5">
          <h3 className="font-bold text-slate-800">Payroll cost</h3>
          <p className="text-xs text-slate-400">Net salary generated so far</p>
          <p className="mt-4 text-3xl font-bold text-slate-900 tnum">{summary ? inr(summary.payroll_total_net) : "—"}</p>
          <p className="mt-1 text-xs text-slate-400">{summary ? `${summary.payslip_count} payslips processed` : ""}</p>
        </Card>
      </div>
    </div>
  );
}